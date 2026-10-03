/* Minting against reserves (ADR-Q-027): made when value comes in, destroyed when cashed out; the books always reconcile. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sealWith } from '../src/seal';
import { MINT_SCHEMA, MINT_SOURCE, booksOf, spendable, type MintEvent, type MintReceipt } from '../src/mint';
import { AGREEMENT_SCHEMA, AGREEMENT_SOURCE, type AgreementReceipt, type AgreementStep, type Entry } from '../src/agreements';

const seed = (n: number) => new Uint8Array(32).fill(n);
type Who = Awaited<ReturnType<typeof identityFromSeed>>;
let clock = Date.parse('2026-10-03T12:00:00Z');
const tick = () => new Date((clock += 60_000)).toISOString();
const PENCE = 100; /* one credit = £1 */

async function world() {
	return { club: await identityFromSeed(seed(51)), ana: await identityFromSeed(seed(52)), ben: await identityFromSeed(seed(53)) };
}
const ev = (who: Who, e: Partial<MintEvent> & Pick<MintEvent, 'kind' | 'credits' | 'mint'>) =>
	sealWith(who, { schema: MINT_SCHEMA, source: MINT_SOURCE, mode: 'test', at: tick(), ...e } as MintEvent) as Promise<MintReceipt>;
const step = (who: Who, s: Partial<AgreementStep> & Pick<AgreementStep, 'step' | 'parent' | 'agreement'>) =>
	sealWith(who, { schema: AGREEMENT_SCHEMA, source: AGREEMENT_SOURCE, at: tick(), ...s } as AgreementStep) as Promise<AgreementReceipt>;
const vault = (...r: unknown[]) => r.map((json) => ({ json }));

/* Ana gives Ben 30 of the club's credits for a bike repair, agreed and settled by both. */
async function trade(w: Awaited<ReturnType<typeof world>>, credits: number, id = 'bike') {
	const terms = { kind: 'swap' as const, a: w.ana.did, b: w.ben.did, aGives: { credits, mode: 'test' as const, mint: w.club.did }, bGives: { thing: 'Fix the bike' } };
	const p = await step(w.ana, { agreement: id, step: 'proposed', parent: null, terms });
	const a = await step(w.ben, { agreement: id, step: 'agreed', parent: p.contentHash });
	const entries: Entry[] = [{ from: w.ana.did, to: w.ben.did, value: terms.aGives }, { from: w.ben.did, to: w.ana.did, value: terms.bGives }];
	const s1 = await step(w.ben, { agreement: id, step: 'settled', parent: a.contentHash, entries });
	const s2 = await step(w.ana, { agreement: id, step: 'settled', parent: s1.contentHash, entries });
	return [p, a, s1, s2];
}

test('a new mint is at nothing, and stays at nothing', async () => {
	const { club } = await world();
	const b = booksOf([], club.did, 'test', PENCE);
	assert.equal(b.circulation, 0);
	assert.equal(b.cashReserve, 0);
	assert.equal(b.reconciled, true);
	assert.equal(b.backed, true);
});

test('£100 in, 100 minted; trading moves credits but never the totals; cashing out destroys them, and the books reconcile at every step', async () => {
	const w = await world();
	const bought = await ev(w.club, { kind: 'mint', mint: w.club.did, credits: 100, to: w.ana.did, pence: 10_000, cites: ['test-payment-1'] });
	let b = booksOf(vault(bought), w.club.did, 'test', PENCE);
	assert.deepEqual([b.minted, b.circulation, b.cashReserve, b.holders.get(w.ana.did)], [100, 100, 10_000, 100]);
	assert.ok(b.reconciled && b.backed);

	const swap = await trade(w, 30);
	b = booksOf(vault(bought, ...swap), w.club.did, 'test', PENCE);
	assert.deepEqual([b.circulation, b.cashReserve, b.holders.get(w.ana.did), b.holders.get(w.ben.did)], [100, 10_000, 70, 30], 'trading changes who holds, not how many');
	assert.ok(b.reconciled && b.backed);

	const ask = await ev(w.ben, { kind: 'cashout', mint: w.club.did, credits: 20, from: w.ben.did });
	b = booksOf(vault(bought, ...swap, ask), w.club.did, 'test', PENCE);
	assert.equal(b.circulation, 100, 'an ask alone destroys nothing');
	assert.equal(spendable(b, w.ben.did), 10, 'but what’s asked for can’t be spent meanwhile');

	const burn = await ev(w.club, { kind: 'burn', mint: w.club.did, credits: 20, from: w.ben.did, pence: 2_000, asks: ask.contentHash, payout: 'test-payout-1' });
	b = booksOf(vault(burn, ask, ...swap, bought, burn), w.club.did, 'test', PENCE);
	assert.deepEqual([b.minted, b.destroyed, b.circulation, b.cashIn, b.cashOut, b.cashReserve], [100, 20, 80, 10_000, 2_000, 8_000]);
	assert.equal(b.holders.get(w.ben.did), 10);
	assert.equal(spendable(b, w.ben.did), 10);
	assert.ok(b.reconciled, b.problems.join('\n'));
	assert.ok(b.backed);
	assert.deepEqual(b.problems, []);
});

test('no credit without value in, and no more than the value', async () => {
	const w = await world();
	const free = await ev(w.club, { kind: 'mint', mint: w.club.did, credits: 50, to: w.ana.did });
	const greedy = await ev(w.club, { kind: 'mint', mint: w.club.did, credits: 200, to: w.ana.did, pence: 10_000, cites: ['p'] });
	const forged = await ev(w.ana, { kind: 'mint', mint: w.club.did, credits: 10, to: w.ana.did, pence: 1_000, cites: ['p'] });
	const b = booksOf(vault(free, greedy, forged), w.club.did, 'test', PENCE);
	assert.equal(b.circulation, 0);
	assert.equal(b.problems.length, 3);

	const building = await ev(w.club, { kind: 'mint', mint: w.club.did, credits: 500, to: w.club.did, capital: { pence: 50_000, ref: 'the-workshop' }, cites: ['valuation-2026'] });
	const c = booksOf(vault(building), w.club.did, 'test', PENCE);
	assert.deepEqual([c.circulation, c.capitalReserve, c.cashReserve], [500, 50_000, 0], 'capital can stand behind credits');
	assert.ok(c.backed);
});

test('a burn holds only with its ask, once, for what’s held, paying the published value, from cash that’s there', async () => {
	const w = await world();
	const bought = await ev(w.club, { kind: 'mint', mint: w.club.did, credits: 10, to: w.ana.did, pence: 1_000, cites: ['p'] });
	const ask = await ev(w.ana, { kind: 'cashout', mint: w.club.did, credits: 5, from: w.ana.did });
	const noAsk = await ev(w.club, { kind: 'burn', mint: w.club.did, credits: 5, from: w.ana.did, pence: 500, payout: 'x' });
	const forged = await ev(w.ben, { kind: 'burn', mint: w.club.did, credits: 5, from: w.ana.did, pence: 500, asks: ask.contentHash, payout: 'x' });
	const short = await ev(w.club, { kind: 'burn', mint: w.club.did, credits: 5, from: w.ana.did, pence: 400, asks: ask.contentHash, payout: 'x' });
	const noRef = await ev(w.club, { kind: 'burn', mint: w.club.did, credits: 5, from: w.ana.did, pence: 500, asks: ask.contentHash });
	let b = booksOf(vault(bought, ask, noAsk, forged, short, noRef), w.club.did, 'test', PENCE);
	assert.equal(b.destroyed, 0);
	assert.equal(b.problems.length, 4);

	const good = await ev(w.club, { kind: 'burn', mint: w.club.did, credits: 5, from: w.ana.did, pence: 500, asks: ask.contentHash, payout: 'ref-1' });
	const again = await ev(w.club, { kind: 'burn', mint: w.club.did, credits: 5, from: w.ana.did, pence: 500, asks: ask.contentHash, payout: 'ref-2' });
	b = booksOf(vault(bought, ask, good, again), w.club.did, 'test', PENCE);
	assert.equal(b.destroyed, 5, 'paid once');
	assert.equal(b.cashReserve, 500);
	assert.ok(b.reconciled);

	const greedyAsk = await ev(w.ana, { kind: 'cashout', mint: w.club.did, credits: 50, from: w.ana.did });
	const greedyBurn = await ev(w.club, { kind: 'burn', mint: w.club.did, credits: 50, from: w.ana.did, pence: 5_000, asks: greedyAsk.contentHash, payout: 'r' });
	b = booksOf(vault(bought, greedyAsk, greedyBurn), w.club.did, 'test', PENCE);
	assert.equal(b.destroyed, 0, 'never more than is held');
});

test('test and real never mix, and other mints’ credits are other credits', async () => {
	const w = await world();
	const other = await identityFromSeed(seed(59));
	const t = await ev(w.club, { kind: 'mint', mint: w.club.did, credits: 10, to: w.ana.did, pence: 1_000, cites: ['p'] });
	const elsewhere = await ev(other, { kind: 'mint', mint: other.did, credits: 10, to: w.ana.did, pence: 1_000, cites: ['p'] });
	assert.equal(booksOf(vault(t, elsewhere), w.club.did, 'test', PENCE).circulation, 10);
	assert.equal(booksOf(vault(t, elsewhere), w.club.did, 'live', PENCE).circulation, 0);
	assert.equal(booksOf(vault(t, elsewhere), other.did, 'test', PENCE).circulation, 10);
});
