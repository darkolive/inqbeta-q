/* Agreements (ADR-Q-025): every step decided by the real Cedar, on facts read from the chain. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { createEngine, type CedarModule } from '../src/engine';
import { AGREEMENT_ACTIONS, agreementFacts, type Wallets } from '../src/core/agreements';
import { identityFromSeed } from '@inqbeta/q-core/passkey';
import { sealWith } from '@inqbeta/q-core/seal';
import { AGREEMENT_SCHEMA, AGREEMENT_SOURCE, entriesFor, standingOf, type AgreementReceipt, type AgreementStep, type Terms } from '@inqbeta/q-core/agreements';

const engine = createEngine(cedar as unknown as CedarModule);
const loaded = Promise.all(AGREEMENT_ACTIONS.map(async (a) => [a.id, await engine.load([a])] as const)).then((l) => new Map(l));
const seed = (n: number) => new Uint8Array(32).fill(n);

let clock = Date.parse('2026-10-03T10:00:00Z');
const tick = () => new Date((clock += 60_000)).toISOString();
type Who = Awaited<ReturnType<typeof identityFromSeed>>;
const sign = (who: Who, s: Partial<AgreementStep> & Pick<AgreementStep, 'step' | 'parent'>, id = 'grass') =>
	sealWith(who, { schema: AGREEMENT_SCHEMA, source: AGREEMENT_SOURCE, agreement: id, at: tick(), ...s }) as Promise<AgreementReceipt>;

/* Ana has 10 test credits; nobody has anything committed elsewhere. */
const wallets = (held: Record<string, number>): Wallets => ({ available: (d) => held[d] ?? 0, balance: (d) => held[d] ?? 0 });

async function decide(prior: AgreementReceipt[], next: AgreementReceipt, w: Wallets) {
	const { action, facts } = agreementFacts(prior, next, w);
	const hash = (await loaded).get(action)!;
	const d = engine.decide(hash, { principal: { type: 'Person', id: next.did }, resource: { type: 'Agreement', id: next.content.agreement }, facts });
	return { action, ...d };
}

async function people() {
	return { ana: await identityFromSeed(seed(41)), ben: await identityFromSeed(seed(42)), cat: await identityFromSeed(seed(43)) };
}
const grass = (a: string, b: string, credits = 3): Terms => ({ kind: 'swap', a, b, aGives: { credits, mode: 'test' }, bGives: { thing: 'Cut the grass' } });

test('the grass, every step allowed by the rules — and the engine and the chain agree', async () => {
	const { ana, ben } = await people();
	const w = wallets({ [ana.did]: 10 });
	const chain: AgreementReceipt[] = [];
	const add = async (r: AgreementReceipt, action: string) => {
		const d = await decide(chain, r, w);
		assert.equal(d.action, action);
		assert.equal(d.holds, true, `${action}: ${d.rules.join(', ')}`);
		chain.push(r);
	};
	const p = await sign(ana, { step: 'proposed', parent: null, terms: grass(ana.did, ben.did) });
	await add(p, 'agreement.propose');
	const a = await sign(ben, { step: 'agreed', parent: p.contentHash });
	await add(a, 'agreement.agree');
	const done = await sign(ben, { step: 'done', parent: a.contentHash, evidence: ['bafy-photo'] });
	await add(done, 'agreement.done');
	const entries = entriesFor(grass(ana.did, ben.did));
	const s1 = await sign(ben, { step: 'settled', parent: done.contentHash, entries });
	await add(s1, 'agreement.settle');
	const s2 = await sign(ana, { step: 'settled', parent: s1.contentHash, entries });
	await add(s2, 'agreement.settle');
	assert.equal(standingOf(chain).phase, 'complete');
	assert.deepEqual(standingOf(chain).problems, []);
});

test('the cannots: own offer, over-promising, same kind both ways, pounds on a personal swap', async () => {
	const { ana, ben } = await people();
	const p = await sign(ana, { step: 'proposed', parent: null, terms: grass(ana.did, ben.did, 3) }, 'g2');
	const w = wallets({ [ana.did]: 10, [ben.did]: 1 });
	assert.deepEqual((await decide([p], await sign(ana, { step: 'agreed', parent: p.contentHash }, 'g2'), w)).rules, ['agreement.agree/cannot/own-offer']);
	assert.deepEqual((await decide([], await sign(ana, { step: 'proposed', parent: null, terms: grass(ana.did, ben.did, 30) }, 'g3'), w)).rules, ['agreement.propose/cannot/over-promise']);
	const gift: Terms = { kind: 'swap', a: ana.did, b: ben.did, aGives: { credits: 2, mode: 'test' }, bGives: { credits: 2, mode: 'test' } };
	assert.ok((await decide([], await sign(ana, { step: 'proposed', parent: null, terms: gift }, 'g4'), w)).rules.includes('agreement.propose/cannot/same-kind'));
	const tea: Terms = { kind: 'swap', a: ana.did, b: ben.did, aGives: { pence: 300 }, bGives: { thing: 'Tea' } };
	assert.deepEqual((await decide([], await sign(ana, { step: 'proposed', parent: null, terms: tea }, 'g5'), w)).rules, ['agreement.propose/cannot/pounds-personal']);
	/* Ben counters asking HIM to give credits he doesn't have. */
	const reverse: Terms = { kind: 'swap', a: ana.did, b: ben.did, aGives: { thing: 'Lend the mower' }, bGives: { credits: 5, mode: 'test' } };
	assert.deepEqual((await decide([p], await sign(ben, { step: 'countered', parent: p.contentHash, terms: reverse }, 'g2'), w)).rules, ['agreement.counter/cannot/over-promise']);
	assert.deepEqual((await decide([p], await sign(ana, { step: 'countered', parent: p.contentHash, terms: grass(ana.did, ben.did, 4) }, 'g2'), w)).rules, ['agreement.counter/cannot/own-offer']);
});

test('ending: only the other side declines, only the offerer withdraws; nothing settles after an end', async () => {
	const { ana, ben } = await people();
	const w = wallets({ [ana.did]: 10 });
	const p = await sign(ana, { step: 'proposed', parent: null, terms: grass(ana.did, ben.did) }, 'g6');
	assert.deepEqual((await decide([p], await sign(ben, { step: 'withdrawn', parent: p.contentHash }, 'g6'), w)).rules, ['agreement.end/cannot/withdraw-others']);
	assert.deepEqual((await decide([p], await sign(ana, { step: 'declined', parent: p.contentHash }, 'g6'), w)).rules, ['agreement.end/cannot/decline-own']);
	const no = await sign(ben, { step: 'declined', parent: p.contentHash }, 'g6');
	assert.equal((await decide([p], no, w)).holds, true);
	const late = await sign(ben, { step: 'settled', parent: no.contentHash, entries: entriesFor(grass(ana.did, ben.did)) }, 'g6');
	assert.ok((await decide([p, no], late, w)).rules.includes('agreement.settle/must/agreed'));
});

test('settling: within what was agreed, confirmed by the other person with the same entries, never more than the payer holds', async () => {
	const { ana, ben, cat } = await people();
	const id = 'g7';
	const p = await sign(ana, { step: 'proposed', parent: null, terms: grass(ana.did, ben.did, 3) }, id);
	const a = await sign(ben, { step: 'agreed', parent: p.contentHash }, id);
	const rich = wallets({ [ana.did]: 10 });

	const tooMuch = await sign(ben, { step: 'settled', parent: a.contentHash, entries: [{ from: ana.did, to: ben.did, value: { credits: 4, mode: 'test' } }] }, id);
	assert.deepEqual((await decide([p, a], tooMuch, rich)).rules, ['agreement.settle/cannot/within-agreed']);
	const toCat = await sign(ben, { step: 'settled', parent: a.contentHash, entries: [{ from: ana.did, to: cat.did, value: { credits: 3, mode: 'test' } }] }, id);
	assert.deepEqual((await decide([p, a], toCat, rich)).rules, ['agreement.settle/cannot/within-agreed']);

	const fair = entriesFor(grass(ana.did, ben.did, 3));
	const s1 = await sign(ben, { step: 'settled', parent: a.contentHash, entries: fair }, id);
	assert.equal((await decide([p, a], s1, rich)).holds, true);
	assert.deepEqual((await decide([p, a, s1], await sign(ben, { step: 'settled', parent: s1.contentHash, entries: fair }, id), rich)).rules, ['agreement.settle/cannot/confirm-own']);
	assert.deepEqual((await decide([p, a, s1], await sign(ana, { step: 'settled', parent: s1.contentHash, entries: [fair[0]] }, id), rich)).rules, ['agreement.settle/must/same-entries']);
	assert.deepEqual((await decide([p, a, s1], await sign(ana, { step: 'settled', parent: a.contentHash, entries: fair }, id), rich)).rules, ['agreement.settle/cannot/one-at-a-time']);

	const broke = wallets({ [ana.did]: 1 });
	assert.deepEqual((await decide([p, a, s1], await sign(ana, { step: 'settled', parent: s1.contentHash, entries: fair }, id), broke)).rules, ['agreement.settle/cannot/overdraw']);

	const back = await sign(ana, { step: 'settled', parent: s1.contentHash, entries: fair, at: '2026-10-01T00:00:00Z' }, id);
	assert.deepEqual((await decide([p, a, s1], back, rich)).rules, ['agreement.settle/cannot/backdate']);
});

test('across federations, only under a treaty', async () => {
	const { ana, ben } = await people();
	const p = await sign(ana, { step: 'proposed', parent: null, terms: grass(ana.did, ben.did) }, 'g8');
	const w = { ...wallets({ [ana.did]: 10 }), crossFederation: true };
	assert.deepEqual((await decide([], p, w)).rules, ['agreement.propose/cannot/outside-treaty']);
	assert.equal((await decide([], p, { ...w, underTreaty: true })).holds, true);
});

test('an open offer by link: anyone may answer first; after that, only the two of them', async () => {
	const { ana, ben, cat } = await people();
	const w = wallets({ [ana.did]: 10 });
	const open: Terms = { kind: 'swap', a: ana.did, b: '', aGives: { credits: 2, mode: 'test' }, bGives: { thing: 'Walk the dog' } };
	const p = await sign(ana, { step: 'proposed', parent: null, terms: open }, 'open-a');
	assert.equal((await decide([], p, w)).holds, true, 'an open offer may be made');
	const benYes = await sign(ben, { step: 'agreed', parent: p.contentHash }, 'open-a');
	assert.equal((await decide([p], benYes, w)).holds, true, 'whoever opens it may agree');
	const late = await sign(cat, { step: 'done', parent: benYes.contentHash }, 'open-a');
	assert.equal((await decide([p, benYes], late, w)).holds, false, 'once it’s Ben’s, Cat isn’t in it');
	const p2 = await sign(ana, { step: 'proposed', parent: null, terms: open }, 'open-b');
	const counter = await sign(cat, { step: 'countered', parent: p2.contentHash, terms: { ...open, b: cat.did } }, 'open-b');
	assert.equal((await decide([p2], counter, w)).holds, true, 'a counteroffer from the link, naming themselves');
});
