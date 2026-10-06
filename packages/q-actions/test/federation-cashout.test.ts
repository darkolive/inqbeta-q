/*
 * The federation's own cash-out, end to end through the books (ADR-Q-038 §8, C4):
 * its banking card, a minuted decision, one holder asks, a second signs; the
 * rules (federation.spend), the mint's agreed record, the burn (credits.burn),
 * and the books afterwards. The same steps the mint's server takes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { identityFromSeed, signerFor } from '@inqbeta/q-core/passkey';
import { b64url } from '@inqbeta/q-core/canonical';
import { sealWith } from '@inqbeta/q-core/seal';
import { foundFederation, newDraft } from '@inqbeta/q-core/federations';
import { appoint } from '@inqbeta/q-core/offices';
import { takeUp, type Acting, type InRoleReceipt } from '@inqbeta/q-core/inrole';
import { askSecond, signSecond } from '@inqbeta/q-core/cosign';
import { minuteDecision } from '@inqbeta/q-core/decisions';
import { makeBankingCard } from '@inqbeta/q-core/treaties';
import { federationAccount } from '@inqbeta/q-core/federation-money';
import { booksOf, FED_MONEY_SCHEMA, MINT_SCHEMA, MINT_SOURCE, type FedMoneyEntry, type MintEvent, type MintReceipt } from '@inqbeta/q-core/mint';
import { createEngine, type CedarModule } from '../src/engine';
import { FEDERATION_SPEND, spendFacts } from '../src/core/federation-money';
import { CREDITS_BURN, mintFacts } from '../src/core/mint';

const engine = createEngine(cedar as unknown as CedarModule);
const NOW = new Date('2026-10-06T12:00:00Z');
const at = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 59 + n) % 251);

test('two holders cash out the federation’s credits to its own account; the books follow', async () => {
	const mintKey = await identityFromSeed(seed(9));
	const darren = await identityFromSeed(seed(1));
	const sam = await identityFromSeed(seed(2));
	const tess = await identityFromSeed(seed(3));
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Green Space', purpose: 'Gardening.' }, { now: NOW });
	const fed = f.founding.federation;
	const grant = b64url(f.grant.bytes);
	const tre = await appoint(signerFor(f.key), signerFor(darren), { federation: fed, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen.', grant }, NOW);
	const sec = await appoint(signerFor(f.key), signerFor(darren), { federation: fed, office: 'secretary', holder: tess.did, months: 12, says: 'Chosen.', grant }, NOW);
	const acting = async (who: typeof darren, office: string, mandates: string[]): Promise<Acting> => ({ federation: fed, office, mandates, takenUp: (await takeUp(who, { federation: fed, name: 'Green Space', office, declaration: { kind: 'none' } }, NOW)) as InRoleReceipt });
	const mint = mintKey.did;
	const ledger: unknown[] = [];
	const file = async (kind: FedMoneyEntry['kind'], record: unknown, extra: Partial<FedMoneyEntry> = {}, when = at(ledger.length + 1)) => {
		const r = await sealWith(mintKey, { schema: FED_MONEY_SCHEMA, source: MINT_SOURCE, mint, mode: 'test', kind, federation: fed, record, ...extra, at: when } satisfies FedMoneyEntry);
		ledger.push(r);
		return r;
	};

	/* The federation holds 500 credits (bought in test). */
	ledger.push(await sealWith(mintKey, { schema: MINT_SCHEMA, source: MINT_SOURCE, mint, kind: 'mint', credits: 500, mode: 'test', to: fed, pence: 50_000, cites: ['test-payment'], at: at(0) } satisfies MintEvent));
	const card = await makeBankingCard(f.key, { name: 'Green Space', sortCode: '112233', account: '44556677' }, { currency: 'GBP' }, NOW);
	await file('bank-card', card);
	const decision = await minuteDecision(tess, await acting(tess, 'secretary', sec.tokens), { says: 'Pay the hall hire.', how: 'meeting', decidedOn: '2026-10-01', upTo: 300 }, NOW);
	await file('decision', decision);

	const asked = await askSecond(signerFor(sam), await acting(sam, 'treasurer', tre.tokens), { cmd: '/fed/money/cash-out', action: { credits: 120, to: card.contentHash, decision: decision.contentHash }, says: 'The hall, October.' }, NOW);
	await file('asked', asked, { credits: 120, decision: decision.contentHash });
	let acct = await federationAccount(ledger, booksOf(ledger.map((json) => ({ json })), mint, 'test', 'GBP'), { mint, mode: 'test', federation: fed });
	assert.equal(acct.waiting.length, 1);
	assert.equal(acct.spendable, 380, 'what’s asked is held back');

	/* The second holder signs; the rules hold. */
	const both = await signSecond(asked, signerFor(darren), await acting(darren, 'caretaker', [grant]));
	const facts = await spendFacts(both, decision, { federation: fed, account: acct.card!.hash, spentSoFar: 0, now: NOW });
	const d = engine.decide(await engine.load([FEDERATION_SPEND]), { principal: { type: 'Person', id: darren.did }, resource: { type: 'Federation', id: fed }, facts });
	assert.equal(d.holds, true, d.because.join(' '));

	/* The mint files it agreed, and burns against it. */
	const agreed = await file('agreed', both, { credits: 120, decision: decision.contentHash });
	const burn: MintEvent = { schema: MINT_SCHEMA, source: MINT_SOURCE, mint, kind: 'burn', credits: 120, mode: 'test', from: fed, pence: 12_000, asks: agreed.contentHash, account: { receipt: card.contentHash, ends: '6677' }, payout: 'test-standing-order', at: at(20) };
	const { facts: bf } = mintFacts(ledger.map((json) => ({ json })), { did: mint, content: burn, contentHash: '' } as MintReceipt, 'GBP');
	const bd = engine.decide(await engine.load([CREDITS_BURN]), { principal: { type: 'Person', id: mint }, resource: { type: 'Mint', id: mint }, facts: bf });
	assert.equal(bd.holds, true, bd.because.join(' '));
	ledger.push(await sealWith(mintKey, burn));

	const b = booksOf(ledger.map((json) => ({ json })), mint, 'test', 'GBP');
	assert.deepEqual(b.problems, []);
	assert.equal(b.destroyed, 120);
	assert.equal(b.holders.get(fed), 380);
	acct = await federationAccount(ledger, b, { mint, mode: 'test', federation: fed });
	assert.equal(acct.waiting.length, 0);
	assert.equal(acct.done.length, 1);
	assert.equal(acct.decisions[0].spent, 120);

	/* Paying the same agreed record twice is refused by the books. */
	const again = await sealWith(mintKey, { ...burn, at: at(30) });
	const b2 = booksOf([...ledger, again].map((json) => ({ json })), mint, 'test', 'GBP');
	assert.ok(b2.problems.some((p) => p.includes('already been paid')));
});
