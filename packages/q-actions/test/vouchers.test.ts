/* voucher.issue / .move / .redeem: real vouchers from q-core, decided by real Cedar (ADR-Q-044, step 2). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { identityFromSeed, signerFor } from '@inqbeta/q-core/passkey';
import { acceptRedeem, askRedeem, editionOf, hashHeld, issueCopy, makeVoucher, passOn, receive, type Voucher, type VoucherReceipt } from '@inqbeta/q-core/vouchers';
import { giveCapacity, valveRelease, VALVE_DEFAULTS } from '@inqbeta/q-core/stimulus';
import { checkActionDefinition, type ActionDefinition } from '../src/actions';
import { createEngine, type CedarModule } from '../src/engine';
import { VOUCHER_ACTIONS, VOUCHER_ISSUE, VOUCHER_MOVE, VOUCHER_REDEEM, voucherIssueFacts, voucherMoveFacts, voucherRedeemFacts } from '../src/core/vouchers';
import { CORE_ACTIONS } from '../src/index';

const engine = createEngine(cedar as unknown as CedarModule);
const NOW = new Date('2026-10-07T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 41 + n) % 251);
const shirt: Omit<Voucher, 'schema' | 'source' | 'issuer' | 'at'> = {
	title: 'Olive t-shirt, medium',
	words: 'Organic cotton.',
	pictures: [{ hash: 'b'.repeat(64), type: 'image/webp', alt: 'An olive t-shirt.' }],
	medium: 'physical',
	kind: 'edition',
	of: 2,
	price: { paid: true, credits: 10, mint: 'did:key:zMint', currency: 'GBP' },
	moves: 'sellable',
	resaleUpTo: 15,
	realm: { kinds: 'itself', accepted: [] }
};
async function decide(action: ActionDefinition, did: string, v: VoucherReceipt, facts: Record<string, unknown>) {
	const h = await engine.load([action]);
	return engine.decide(h, { principal: { type: 'Person', id: did }, resource: { type: 'Voucher', id: v.contentHash }, facts });
}
const broke = (d: { rules: string[] }, slug: string) => d.rules.some((r) => r.endsWith(slug));

test('the voucher actions are well formed, and loaded with the core', () => {
	for (const a of VOUCHER_ACTIONS) assert.deepEqual(checkActionDefinition(a), { ok: true, problems: [] }, a.id);
	for (const a of VOUCHER_ACTIONS) assert.ok(CORE_ACTIONS.includes(a), a.id);
});

test('issue: within the edition holds; the third of two, a number twice, someone else’s, refused', async () => {
	const shop = await identityFromSeed(seed(1));
	const ana = await identityFromSeed(seed(2));
	const v = await makeVoucher(shop, shirt, NOW);
	const one = await issueCopy(signerFor(shop), v, { number: 1, holder: ana.did }, NOW);
	const ok = await decide(VOUCHER_ISSUE, shop.did, v, await voucherIssueFacts(v, one, [], { by: shop.did, now: NOW }));
	assert.equal(ok.holds, true, ok.because.join(' '));
	assert.ok(ok.declared.some((x) => x.includes('AI')));
	const had = [await receive(one, signerFor(ana))];
	const again = await decide(VOUCHER_ISSUE, shop.did, v, await voucherIssueFacts(v, one, had, { by: shop.did, now: NOW }));
	assert.equal(again.holds, false);
	assert.ok(broke(again, 'cannot/twice'));
	/* A third of two: forged past issueCopy's own check, refused by the rule. */
	const third = { ...one, number: 3 };
	const past = await decide(VOUCHER_ISSUE, shop.did, v, await voucherIssueFacts(v, third, had, { by: shop.did, now: NOW }));
	assert.equal(past.holds, false);
	assert.ok(broke(past, 'cannot/past-edition'));
	const titled = await decide(VOUCHER_ISSUE, shop.did, v, await voucherIssueFacts(v, { ...one, title: true }, [], { by: shop.did, now: NOW }));
	assert.ok(broke(titled, 'cannot/title'));
	const notMine = await decide(VOUCHER_ISSUE, ana.did, v, await voucherIssueFacts(v, one, [], { by: ana.did, now: NOW }));
	assert.equal(notMine.holds, false, 'only the issuer issues');
});

test('move: sold on within the limit holds; over it, or a bound voucher, refused', async () => {
	const shop = await identityFromSeed(seed(3));
	const ana = await identityFromSeed(seed(4));
	const ben = await identityFromSeed(seed(5));
	const v = await makeVoucher(shop, shirt, NOW);
	const one = await receive(await issueCopy(signerFor(shop), v, { number: 1, holder: ana.did }, NOW), signerFor(ana));
	const sold = await passOn(one, v, signerFor(ana), { to: ben.did, how: 'sold', price: 12 }, NOW);
	const ok = await decide(VOUCHER_MOVE, ana.did, v, await voucherMoveFacts(v, sold, [one], [], { by: ana.did, now: NOW }));
	assert.equal(ok.holds, true, ok.because.join(' '));
	const over = await decide(VOUCHER_MOVE, ana.did, v, await voucherMoveFacts(v, { ...sold, price: 40 }, [one], [], { by: ana.did, now: NOW }));
	assert.ok(broke(over, 'cannot/over-resale'));
	const byBen = await decide(VOUCHER_MOVE, ben.did, v, await voucherMoveFacts(v, sold, [one], [], { by: ben.did, now: NOW }));
	assert.equal(byBen.holds, false, 'only its holder passes it on');

	const grant = await makeVoucher(shop, { ...shirt, title: 'Grant', medium: 'service', kind: 'consumable', of: null, price: { paid: false, from: 'credits', worth: 100, mint: shop.did, currency: 'GBP' }, moves: 'bound', resaleUpTo: undefined, realm: { kinds: ['training'], accepted: [] }, ends: { at: '2027-01-01T00:00:00Z', then: 'return' }, eligibleUnder: 'open' }, NOW);
	const g = await receive(await issueCopy(signerFor(shop), grant, { number: 1, holder: ana.did }, NOW), signerFor(ana));
	/* passOn refuses it outright; a hand-made move is refused by the rule too. */
	await assert.rejects(passOn(g, grant, signerFor(ana), { to: ben.did, how: 'given' }), /bound/);
	const forged = { ...sold, voucher: grant.contentHash, previous: await hashHeld(g), how: 'given' as const };
	const bound = await decide(VOUCHER_MOVE, ana.did, grant, await voucherMoveFacts(grant, forged, [g], [], { by: ana.did, now: NOW }));
	assert.equal(bound.holds, false);
	assert.ok(broke(bound, 'cannot/bound'));
});

test('redeem: in its realm by an accepted provider holds; twice, outside it, or by a stranger, refused; a given voucher needs eligibility', async () => {
	const fdn = await identityFromSeed(seed(6));
	const ana = await identityFromSeed(seed(7));
	const trainer = await identityFromSeed(seed(8));
	const stranger = await identityFromSeed(seed(9));
	const grant = await makeVoucher(fdn, { ...shirt, title: 'Training grant', medium: 'service', kind: 'consumable', of: null, price: { paid: false, from: 'credits', worth: 400, mint: fdn.did, currency: 'GBP' }, moves: 'bound', resaleUpTo: undefined, realm: { kinds: ['training', 'storage'], accepted: [trainer.did] }, ends: { at: '2027-03-14T00:00:00Z', then: 'return' }, eligibleUnder: 'under-25' }, NOW);
	const copy = await issueCopy(signerFor(fdn), grant, { number: 1, holder: ana.did }, NOW);
	assert.equal((await decide(VOUCHER_ISSUE, fdn.did, grant, await voucherIssueFacts(grant, copy, [], { by: fdn.did, now: NOW }))).holds, false, 'no attestation, no grant');
	assert.equal((await decide(VOUCHER_ISSUE, fdn.did, grant, await voucherIssueFacts(grant, copy, [], { by: fdn.did, eligible: true, now: NOW }))).holds, true);
	const held = [await receive(copy, signerFor(ana))];
	const holding = (await editionOf(grant, held)).holdings[0];
	const redeem = async (who: typeof trainer, forKind: string) => acceptRedeem(await askRedeem(holding, signerFor(ana), { redeemer: who.did, forKind }, NOW), signerFor(who));
	const r = await redeem(trainer, 'training');
	const ok = await decide(VOUCHER_REDEEM, ana.did, grant, await voucherRedeemFacts(grant, r, held, [], { by: ana.did, now: NOW }));
	assert.equal(ok.holds, true, ok.because.join(' '));
	assert.ok(broke(await decide(VOUCHER_REDEEM, ana.did, grant, await voucherRedeemFacts(grant, r, held, [r], { by: ana.did, now: NOW })), 'cannot/twice'));
	assert.ok(broke(await decide(VOUCHER_REDEEM, ana.did, grant, await voucherRedeemFacts(grant, await redeem(trainer, 'a holiday'), held, [], { by: ana.did, now: NOW })), 'cannot/realm'));
	const s = await redeem(stranger, 'training');
	assert.ok(broke(await decide(VOUCHER_REDEEM, ana.did, grant, await voucherRedeemFacts(grant, s, held, [], { by: ana.did, now: NOW })), 'cannot/provider'));
	assert.equal((await decide(VOUCHER_REDEEM, ana.did, grant, await voucherRedeemFacts(grant, s, held, [], { by: ana.did, inTreaty: true, now: NOW }))).holds, true, 'a provider in treaty is accepted');
	assert.ok(broke(await decide(VOUCHER_REDEEM, ana.did, grant, await voucherRedeemFacts(grant, r, held, [], { by: ana.did, now: new Date('2027-04-01T00:00:00Z') })), 'cannot/ended'));
});

test('a capacity gift is a voucher the same rules read: issued, never moved, used only at home', async () => {
	const fed = await identityFromSeed(seed(10));
	const ana = await identityFromSeed(seed(11));
	const gift = await giveCapacity(fed, { capacity: 'storage', kind: 'passing', amount: 1, unit: 'GB', recipient: ana.did, programme: 'open', eligibleUnder: 'open', from: NOW.toISOString(), to: '2026-10-14T00:00:00Z', valve: { ...valveRelease(30, 10), ...VALVE_DEFAULTS } }, NOW);
	const v = gift.voucher;
	assert.equal((await decide(VOUCHER_ISSUE, fed.did, v, await voucherIssueFacts(v, gift.held, [], { by: fed.did, eligible: true, now: NOW }))).holds, true);
	const held = [await receive(gift.held, signerFor(ana))];
	const holding = (await editionOf(v, held)).holdings[0];
	const atHome = await acceptRedeem(await askRedeem(holding, signerFor(ana), { redeemer: fed.did, forKind: 'itself' }, NOW), signerFor(fed));
	assert.equal((await decide(VOUCHER_REDEEM, ana.did, v, await voucherRedeemFacts(v, atHome, held, [], { by: ana.did, now: NOW }))).holds, true);
	const other = await identityFromSeed(seed(12));
	const away = await acceptRedeem(await askRedeem(holding, signerFor(ana), { redeemer: other.did, forKind: 'itself' }, NOW), signerFor(other));
	assert.equal((await decide(VOUCHER_REDEEM, ana.did, v, await voucherRedeemFacts(v, away, held, [], { by: ana.did, inTreaty: true, now: NOW }))).holds, false, 'never across a treaty');
});
