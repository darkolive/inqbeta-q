/* Vouchers (ADR-Q-044): the four kinds, editions, terms, the chain, redeeming. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { acceptRedeem, askRedeem, editionOf, issueCopy, makeVoucher, nextNumber, passOn, receive, redeemProblem, redemptionSigned, voucherProblem, type Voucher } from '../src/vouchers';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 73 + n) % 251);
const NOW = new Date('2026-10-07T12:00:00Z');
const PIC = { hash: 'a'.repeat(64), type: 'image/webp', alt: 'An olive t-shirt, front.' };
const shirt: Omit<Voucher, 'schema' | 'source' | 'issuer' | 'at'> = {
	title: 'Olive t-shirt, medium',
	words: 'Organic cotton, printed in Leeds.',
	pictures: [PIC],
	medium: 'physical',
	kind: 'edition',
	of: 50,
	price: { paid: true, credits: 10, mint: 'did:key:zMint', currency: 'GBP' },
	moves: 'sellable',
	resaleUpTo: 15,
	realm: { kinds: 'itself', accepted: [] }
};

test('what can and can’t be vouched for', () => {
	assert.equal(voucherProblem(shirt), null);
	assert.match(voucherProblem({ ...shirt, medium: 'digital', kind: 'original', of: 1 })!, /can’t be title-owned/);
	assert.match(voucherProblem({ ...shirt, kind: 'original', of: 2 })!, /one of one/);
	assert.match(voucherProblem({ ...shirt, medium: 'digital', kind: 'copyable', of: null })!, /licence/);
	assert.equal(voucherProblem({ ...shirt, medium: 'digital', kind: 'copyable', of: null, licence: 'Play it at home; don’t share it.' }), null);
	assert.match(voucherProblem({ ...shirt, ends: { at: '2027-01-01T00:00:00Z', then: 'lapse' } })!, /can’t simply lapse/);
	assert.match(voucherProblem({ ...shirt, pictures: [{ ...PIC, alt: '' }] })!, /screen reader/);
	/* A grant: given from credits, bound, a realm; unspent returns. */
	const grant = { ...shirt, title: 'Training grant', medium: 'service' as const, kind: 'consumable' as const, of: null, price: { paid: false as const, from: 'credits' as const, worth: 400, mint: 'did:key:zFoundation', currency: 'GBP' }, moves: 'bound' as const, resaleUpTo: undefined, realm: { kinds: ['training', 'storage', 'office space'], accepted: [] }, ends: { at: '2027-03-14T00:00:00Z', then: 'return' as const }, eligibleUnder: 'foundation-under-25' };
	assert.equal(voucherProblem(grant), null);
	assert.match(voucherProblem({ ...grant, moves: 'sellable' })!, /can’t be sold/);
	/* A capacity gift: from capacity, bound, consumable, lapses. */
	const gift = { ...grant, title: '1 GB passing through, a week', medium: 'capacity' as const, price: { paid: false as const, from: 'capacity' as const, worth: 1, unit: 'GB' }, realm: { kinds: 'itself' as const, accepted: [] }, ends: { at: '2026-10-14T00:00:00Z', then: 'lapse' as const }, capacity: { what: 'storage', held: 'passing' as const } };
	assert.match(voucherProblem({ ...gift, capacity: { what: 'storage', held: 'held' } })!, /notice/);
	assert.equal(voucherProblem(gift), null);
	assert.match(voucherProblem({ ...gift, moves: 'giftable' })!, /bound/);
	assert.match(voucherProblem({ ...gift, ends: { ...gift.ends, then: 'return' } })!, /lapses/);
});

test('an edition of 50: numbered copies, chained; the 51st refused; sold on within the limit', async () => {
	const shop = await identityFromSeed(seed(1));
	const ana = await identityFromSeed(seed(2));
	const ben = await identityFromSeed(seed(3));
	const v = await makeVoucher(shop, shirt, NOW);
	const one = await receive(await issueCopy(signerFor(shop), v, { number: 12, holder: ana.did, via: 'trade-1' }, NOW), signerFor(ana));
	await assert.rejects(issueCopy(signerFor(shop), v, { number: 51, holder: ana.did }), /only 50/);
	await assert.rejects(issueCopy(signerFor(ana), v, { number: 13, holder: ana.did }), /Only the issuer/);
	await assert.rejects(passOn(one, v, signerFor(ana), { to: ben.did, how: 'sold', price: 20 }), /most it can be sold on for/);
	const sold = await receive(await passOn(one, v, signerFor(ana), { to: ben.did, how: 'sold', price: 12 }, NOW), signerFor(ben));
	const e = await editionOf(v, [one, sold]);
	assert.deepEqual(e.problems, []);
	assert.equal(e.issued, 1);
	assert.equal(e.left, 49);
	assert.equal(e.holdings[0].holder, ben.did, 'the latest holder');
	assert.equal(e.holdings[0].chain.length, 2, 'the chain back to the issuer');
	assert.equal(e.holdings[0].latest.title, false, 'an edition passes your copy, not title');
	assert.equal(nextNumber(e), 1);

	/* Issued twice, or passed on twice: refused in the reading. */
	const twice = await receive(await issueCopy(signerFor(shop), v, { number: 12, holder: ben.did }, new Date('2026-10-08T00:00:00Z')), signerFor(ben));
	const again = await receive(await passOn(one, v, signerFor(ana), { to: ana.did, how: 'given' }, NOW), signerFor(ana));
	const bad = await editionOf(v, [one, sold, twice, again]);
	assert.ok(bad.problems.some((p) => p.includes('issued twice')));
	assert.ok(bad.problems.some((p) => p.includes('passed on twice')));
	/* Not received yet: not counted. */
	const pending = await issueCopy(signerFor(shop), v, { number: 2, holder: ana.did });
	assert.ok((await editionOf(v, [pending])).problems.some((p) => p.includes('not received')));
});

test('an original passes title; a bound grant can’t move; redeemed in its realm, by an accepted provider', async () => {
	const artist = await identityFromSeed(seed(4));
	const ana = await identityFromSeed(seed(5));
	const foundation = await identityFromSeed(seed(6));
	const trainer = await identityFromSeed(seed(7));
	const painting = await makeVoucher(artist, { ...shirt, title: 'Hill Farm at dusk', kind: 'original', of: 1, moves: 'sellable', resaleUpTo: undefined }, NOW);
	const p = await receive(await issueCopy(signerFor(artist), painting, { number: 1, holder: ana.did }, NOW), signerFor(ana));
	assert.equal(p.title, true, 'title passes with an original');
	await assert.rejects(issueCopy(signerFor(artist), painting, { number: 2, holder: ana.did }), /only 1/);

	const grant = await makeVoucher(foundation, { title: 'Training grant', words: 'Up to 400 credits of training, storage or office space.', pictures: [], medium: 'service', kind: 'consumable', of: null, price: { paid: false, from: 'credits', worth: 400, mint: foundation.did, currency: 'GBP' }, moves: 'bound', realm: { kinds: ['training', 'storage', 'office space'], accepted: [trainer.did] }, ends: { at: '2027-03-14T00:00:00Z', then: 'return' }, eligibleUnder: 'foundation-under-25' }, NOW);
	const held = await receive(await issueCopy(signerFor(foundation), grant, { number: 1, holder: ana.did }, NOW), signerFor(ana));
	await assert.rejects(passOn(held, grant, signerFor(ana), { to: artist.did, how: 'given' }), /bound/);

	assert.equal(redeemProblem(grant.content, { redeemer: trainer.did, forKind: 'training', now: NOW }), null);
	assert.match(redeemProblem(grant.content, { redeemer: trainer.did, forKind: 'a holiday', now: NOW })!, /not a holiday/);
	assert.match(redeemProblem(grant.content, { redeemer: artist.did, forKind: 'training', now: NOW })!, /isn’t accepted/);
	assert.equal(redeemProblem(grant.content, { redeemer: artist.did, forKind: 'training', inTreaty: true, now: NOW }), null, 'a provider in treaty is accepted');
	assert.match(redeemProblem(grant.content, { redeemer: trainer.did, forKind: 'training', now: new Date('2027-04-01T00:00:00Z') })!, /ended/);

	const e = await editionOf(grant, [held]);
	const r = await acceptRedeem(await askRedeem(e.holdings[0], signerFor(ana), { redeemer: trainer.did, forKind: 'training' }, NOW), signerFor(trainer));
	assert.ok(await redemptionSigned(r));
	const after = await editionOf(grant, [held], [r]);
	assert.equal(after.holdings[0].redeemed, true);
	await assert.rejects(askRedeem(after.holdings[0], signerFor(ana), { redeemer: trainer.did, forKind: 'training' }), /already been redeemed/);
});
