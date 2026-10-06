/* The mint (ADR-Q-027): every step decided by the real Cedar, on facts read from the mint's books. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { createEngine, type CedarModule } from '../src/engine';
import { MINT_ACTIONS, mintFacts } from '../src/core/mint';
import { identityFromSeed } from '@inqbeta/q-core/passkey';
import { sealWith } from '@inqbeta/q-core/seal';
import { MINT_SCHEMA, MINT_SOURCE, booksOf, type MintEvent, type MintReceipt } from '@inqbeta/q-core/mint';

const engine = createEngine(cedar as unknown as CedarModule);
const loaded = Promise.all(MINT_ACTIONS.map(async (a) => [a.id, await engine.load([a])] as const)).then((l) => new Map(l));
const seed = (n: number) => new Uint8Array(32).fill(n);
type Who = Awaited<ReturnType<typeof identityFromSeed>>;
let clock = Date.parse('2026-10-03T13:00:00Z');
const tick = () => new Date((clock += 60_000)).toISOString();
const CURRENCY = 'GBP'; /* one credit = £1 */
const ev = (who: Who, e: Partial<MintEvent> & Pick<MintEvent, 'kind' | 'credits' | 'mint'>) =>
	sealWith(who, { schema: MINT_SCHEMA, source: MINT_SOURCE, mode: 'test', at: tick(), ...e } as MintEvent) as Promise<MintReceipt>;

async function decide(prior: MintReceipt[], next: MintReceipt, o: { moneyConfirmed?: boolean; approvedByAI?: boolean } = {}) {
	const { action, facts } = mintFacts(prior.map((json) => ({ json })), next, CURRENCY, o);
	const d = engine.decide((await loaded).get(action)!, { principal: { type: 'Person', id: next.did }, resource: { type: 'Mint', id: next.content.mint }, facts });
	return { action, ...d };
}
async function world() {
	return { club: await identityFromSeed(seed(61)), ana: await identityFromSeed(seed(62)), ben: await identityFromSeed(seed(63)) };
}

test('mint, ask, burn: each allowed, and the books agree with the engine', async () => {
	const { club, ana } = await world();
	const chain: MintReceipt[] = [];
	const add = async (r: MintReceipt, action: string) => {
		const d = await decide(chain, r);
		assert.equal(d.action, action);
		assert.equal(d.holds, true, `${action}: ${d.rules.join(', ')}`);
		chain.push(r);
	};
	await add(await ev(club, { kind: 'mint', mint: club.did, credits: 100, to: ana.did, pence: 10_000, cites: ['test-payment'] }), 'credits.mint');
	const ask = await ev(ana, { kind: 'cashout', mint: club.did, credits: 40, from: ana.did });
	await add(ask, 'credits.cashout');
	await add(await ev(club, { kind: 'burn', mint: club.did, credits: 40, from: ana.did, pence: 4_000, asks: ask.contentHash, payout: 'test-payout' }), 'credits.burn');
	const b = booksOf(chain.map((json) => ({ json })), club.did, 'test', CURRENCY);
	assert.deepEqual([b.circulation, b.cashReserve, b.holders.get(ana.did)], [60, 6_000, 60]);
	assert.ok(b.reconciled && b.backed && !b.problems.length);
});

test('mint cannots: without value in, beyond the value, real money unconfirmed, not the mint, an AI', async () => {
	const { club, ana } = await world();
	assert.deepEqual((await decide([], await ev(club, { kind: 'mint', mint: club.did, credits: 10, to: ana.did }))).rules, ['credits.mint/must/value-in']);
	assert.deepEqual((await decide([], await ev(club, { kind: 'mint', mint: club.did, credits: 200, to: ana.did, pence: 10_000, cites: ['p'] }))).rules, ['credits.mint/cannot/beyond-value']);
	const live = await ev(club, { kind: 'mint', mint: club.did, credits: 10, to: ana.did, pence: 1_000, cites: ['p'], mode: 'live' });
	assert.deepEqual((await decide([], live)).rules, ['credits.mint/cannot/live-unconfirmed']);
	assert.equal((await decide([], live, { moneyConfirmed: true })).holds, true);
	assert.equal((await decide([], await ev(ana, { kind: 'mint', mint: club.did, credits: 10, to: ana.did, pence: 1_000, cites: ['p'] }))).holds, false, 'only the mint makes its credits');
	assert.deepEqual((await decide([], await ev(club, { kind: 'mint', mint: club.did, credits: 10, to: ana.did, pence: 1_000, cites: ['p'] }), { approvedByAI: true })).rules, ['credits.mint/cannot/ai-approval']);
});

test('cash-out and burn cannots: beyond what’s held, no ask, twice, not matching, short payout, beyond the reserve', async () => {
	const { club, ana, ben } = await world();
	const bought = await ev(club, { kind: 'mint', mint: club.did, credits: 10, to: ana.did, pence: 1_000, cites: ['p'] });
	assert.deepEqual((await decide([bought], await ev(ana, { kind: 'cashout', mint: club.did, credits: 11, from: ana.did }))).rules, ['credits.cashout/cannot/beyond-held']);
	assert.equal((await decide([bought], await ev(ben, { kind: 'cashout', mint: club.did, credits: 5, from: ana.did }))).holds, false, 'only the holder asks');

	const ask = await ev(ana, { kind: 'cashout', mint: club.did, credits: 5, from: ana.did });
	assert.deepEqual((await decide([bought, ask], await ev(ana, { kind: 'cashout', mint: club.did, credits: 6, from: ana.did }))).rules, ['credits.cashout/cannot/beyond-held'], 'what’s already asked for is held back');

	const burn = (e: Partial<MintEvent>) => ev(club, { kind: 'burn', mint: club.did, credits: 5, from: ana.did, pence: 500, asks: ask.contentHash, payout: 'ref', ...e });
	assert.ok((await decide([bought, ask], await burn({ asks: undefined }))).rules.includes('credits.burn/must/answer-ask'));
	assert.ok((await decide([bought, ask], await burn({ credits: 4, pence: 400 }))).rules.includes('credits.burn/must/match-ask'));
	assert.deepEqual((await decide([bought, ask], await burn({ pence: 300 }))).rules, ['credits.burn/must/record-payout']);
	assert.deepEqual((await decide([bought, ask], await burn({ payout: undefined }))).rules, ['credits.burn/must/record-payout']);
	const done = await burn({});
	assert.equal((await decide([bought, ask], done)).holds, true);
	assert.deepEqual((await decide([bought, ask, done], await burn({ payout: 'ref-2' }))).rules, ['credits.burn/cannot/pay-twice']);

	/* Capital-backed credits can be cashed out only as far as there is cash. */
	const hall = await ev(club, { kind: 'mint', mint: club.did, credits: 50, to: ben.did, capital: { pence: 5_000, ref: 'hall' }, cites: ['valuation'] });
	const benAsk = await ev(ben, { kind: 'cashout', mint: club.did, credits: 50, from: ben.did });
	const benBurn = await ev(club, { kind: 'burn', mint: club.did, credits: 50, from: ben.did, pence: 5_000, asks: benAsk.contentHash, payout: 'r' });
	assert.deepEqual((await decide([hall, benAsk], benBurn)).rules, ['credits.burn/cannot/beyond-reserve']);
});
