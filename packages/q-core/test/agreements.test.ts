/* Agreements (ADR-Q-025): agree first — the contract point — then settle, which is the accounting. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sealWith, checkReceipt } from '../src/seal';
import {
	AGREEMENT_SCHEMA,
	AGREEMENT_SOURCE,
	committedBy,
	effectOf,
	entriesFor,
	problemsWithTerms,
	remainingOf,
	sayStep,
	standingOf,
	stockLeft,
	isStandingOffer,
	takingId,
	type AgreementReceipt,
	type AgreementStep,
	type Terms
} from '../src/agreements';

const seed = (n: number) => new Uint8Array(32).fill(n);
let clock = Date.parse('2026-10-03T09:00:00Z');
const tick = () => new Date((clock += 60_000)).toISOString();
const step = (s: Partial<AgreementStep> & Pick<AgreementStep, 'step' | 'parent'>): AgreementStep => ({
	schema: AGREEMENT_SCHEMA,
	source: AGREEMENT_SOURCE,
	agreement: 'grass-1',
	at: tick(),
	...s
});
type Who = Awaited<ReturnType<typeof identityFromSeed>>;
const sign = (who: Who, s: AgreementStep) => sealWith(who, s) as Promise<AgreementReceipt>;

async function people() {
	return { ana: await identityFromSeed(seed(31)), ben: await identityFromSeed(seed(32)), cat: await identityFromSeed(seed(33)) };
}
const grass = (a: string, b: string, credits = 3): Terms => ({ kind: 'swap', a, b, aGives: { credits, mode: 'test' }, bGives: { thing: 'Cut the grass' } });

test('the grass, start to finish: proposed, agreed (the contract point), done, settled by both (the accounting), complete', async () => {
	const { ana, ben } = await people();
	const proposed = await sign(ana, step({ step: 'proposed', parent: null, terms: grass(ana.did, ben.did) }));
	assert.equal((await checkReceipt(proposed)).ok, true);
	const agreed = await sign(ben, step({ step: 'agreed', parent: proposed.contentHash }));
	const done = await sign(ben, step({ step: 'done', parent: agreed.contentHash, evidence: ['bafy-photo-1'] }));
	const entries = entriesFor(grass(ana.did, ben.did));
	const settleBen = await sign(ben, step({ step: 'settled', parent: done.contentHash, entries }));
	const settleAna = await sign(ana, step({ step: 'settled', parent: settleBen.contentHash, entries: [...entries].reverse() }));

	let s = standingOf([proposed]);
	assert.equal(s.phase, 'agreeing');
	assert.equal(s.waitingFor, ben.did, 'Ben is asked');
	assert.equal(committedBy(s, ana.did, 'test'), 3, 'an open offer commits the proposer’s credits');

	s = standingOf([proposed, agreed, done]);
	assert.equal(s.phase, 'agreed', 'the contract point');
	assert.deepEqual(s.evidence, ['bafy-photo-1']);
	assert.equal(committedBy(s, ana.did, 'test'), 3);

	s = standingOf([proposed, agreed, done, settleBen]);
	assert.equal(s.phase, 'agreed', 'one signature doesn’t settle anything');
	assert.equal(s.settled.length, 0);
	assert.equal(s.waitingFor, ana.did);

	s = standingOf([settleAna, done, proposed, settleBen, agreed, agreed]);
	assert.equal(s.phase, 'complete', 'any order, copies fine');
	assert.equal(s.problems.length, 0, s.problems.join('\n'));
	assert.equal(committedBy(s, ana.did, 'test'), 0);
	const forAna = effectOf(s.settled.flat(), ana.did);
	const forBen = effectOf(s.settled.flat(), ben.did);
	assert.equal(forAna.credits.test, -3);
	assert.equal(forBen.credits.test, 3);
	assert.equal(forAna.credits.test + forBen.credits.test, 0, 'double entry: credits balance across the two');
	assert.deepEqual(forAna.received, ['Cut the grass']);
	assert.deepEqual(forBen.given, ['Cut the grass']);

	const name = (d: string) => (d === ana.did ? 'Ana' : 'Ben');
	assert.equal(sayStep(proposed, ana.did, name), 'You proposed an offer to Ben of 3 test credits in exchange for Cut the grass.');
	assert.equal(sayStep(proposed, ben.did, name), 'Ana proposed an offer to you of 3 test credits in exchange for Cut the grass.');
	assert.match(sayStep(agreed, ana.did, name, s.terms), /^Ben accepted\. You and Ben agreed/);
	assert.equal(sayStep(done, ana.did, name), 'Ben said it’s done, with 1 picture or file.');
});

test('a counteroffer replaces the terms, and only the other side can agree', async () => {
	const { ana, ben } = await people();
	const proposed = await sign(ana, step({ agreement: 'grass-2', step: 'proposed', parent: null, terms: grass(ana.did, ben.did, 3) }));
	const ownAgree = await sign(ana, step({ agreement: 'grass-2', step: 'agreed', parent: proposed.contentHash }));
	assert.equal(standingOf([proposed, ownAgree]).phase, 'agreeing', 'you can’t agree to your own offer');
	const counter = await sign(ben, step({ agreement: 'grass-2', step: 'countered', parent: proposed.contentHash, terms: grass(ana.did, ben.did, 5) }));
	const stale = await sign(ben, step({ agreement: 'grass-2', step: 'agreed', parent: proposed.contentHash }));
	const agreed = await sign(ana, step({ agreement: 'grass-2', step: 'agreed', parent: counter.contentHash }));
	const s = standingOf([proposed, ownAgree, counter, stale, agreed]);
	assert.equal(s.phase, 'agreed');
	assert.equal(s.terms && 'credits' in s.terms.aGives ? s.terms.aGives.credits : 0, 5, 'the counter’s terms stand');
	assert.equal(s.problems.length, 2, 'own agreement and the stale one are named, not used');
});

test('a settlement that doesn’t match what was agreed, or isn’t confirmed in full, doesn’t count', async () => {
	const { ana, ben, cat } = await people();
	const id = 'grass-3';
	const proposed = await sign(ana, step({ agreement: id, step: 'proposed', parent: null, terms: grass(ana.did, ben.did, 3) }));
	const agreed = await sign(ben, step({ agreement: id, step: 'agreed', parent: proposed.contentHash }));
	const tooMuch = await sign(ben, step({ agreement: id, step: 'settled', parent: agreed.contentHash, entries: [{ from: ana.did, to: ben.did, value: { credits: 4, mode: 'test' } }] }));
	const toCat = await sign(ben, step({ agreement: id, step: 'settled', parent: agreed.contentHash, entries: [{ from: ana.did, to: cat.did, value: { credits: 3, mode: 'test' } }] }));
	let s = standingOf([proposed, agreed, tooMuch, toCat]);
	assert.equal(s.pending, undefined);
	assert.equal(s.problems.length, 2);

	const fair = entriesFor(grass(ana.did, ben.did, 3));
	const first = await sign(ben, step({ agreement: id, step: 'settled', parent: agreed.contentHash, entries: fair }));
	const different = await sign(ana, step({ agreement: id, step: 'settled', parent: first.contentHash, entries: [fair[0]] }));
	const selfConfirm = await sign(ben, step({ agreement: id, step: 'settled', parent: first.contentHash, entries: fair }));
	s = standingOf([proposed, agreed, first, different, selfConfirm]);
	assert.equal(s.phase, 'agreed', 'the confirmation must be the other person, with the same entries');
	assert.equal(s.settled.length, 0);
	assert.ok(s.pending);
});

test('an ended agreement never settles; a job can settle in stages; same kind both ways isn’t an agreement', async () => {
	const { ana, ben } = await people();
	const p = await sign(ana, step({ agreement: 'grass-4', step: 'proposed', parent: null, terms: grass(ana.did, ben.did) }));
	const declined = await sign(ben, step({ agreement: 'grass-4', step: 'declined', parent: p.contentHash }));
	const late = await sign(ben, step({ agreement: 'grass-4', step: 'agreed', parent: p.contentHash }));
	const s = standingOf([p, declined, late]);
	assert.equal(s.phase, 'ended');
	assert.equal(s.ended, 'declined');
	assert.equal(committedBy(s, ana.did, 'test'), 0, 'ending releases what was committed');

	const expiring = await sign(ana, step({ agreement: 'grass-5', step: 'proposed', parent: null, terms: grass(ana.did, ben.did), until: '2026-10-03T09:30:00Z' }));
	assert.equal(standingOf([expiring], Date.parse('2026-10-04T00:00:00Z')).ended, 'expired');

	const job: Terms = { kind: 'job', a: ana.did, b: ben.did, aGives: { pence: 40000 }, bGives: { thing: 'Rewire the kitchen' }, where: 'The site', business: true };
	const jp = await sign(ben, step({ agreement: 'job-1', step: 'proposed', parent: null, terms: job }));
	const ja = await sign(ana, step({ agreement: 'job-1', step: 'agreed', parent: jp.contentHash }));
	const half = [{ from: ana.did, to: ben.did, value: { pence: 20000 } }];
	const s1 = await sign(ben, step({ agreement: 'job-1', step: 'settled', parent: ja.contentHash, entries: half }));
	const c1 = await sign(ana, step({ agreement: 'job-1', step: 'settled', parent: s1.contentHash, entries: half }));
	const rest = [{ from: ana.did, to: ben.did, value: { pence: 20000 } }, { from: ben.did, to: ana.did, value: { thing: 'Rewire the kitchen' } }];
	const s2 = await sign(ben, step({ agreement: 'job-1', step: 'settled', parent: c1.contentHash, entries: rest }));
	const c2 = await sign(ana, step({ agreement: 'job-1', step: 'settled', parent: s2.contentHash, entries: rest }));
	const halfway = standingOf([jp, ja, s1, c1]);
	assert.equal(halfway.phase, 'agreed', 'half settled is still agreed');
	assert.deepEqual(remainingOf(halfway).map((e) => e.value), [{ pence: 20000 }, { thing: 'Rewire the kitchen' }], 'what’s left: the other half, and the work');
	const done = standingOf([jp, ja, s1, c1, s2, c2]);
	assert.equal(done.phase, 'complete', done.problems.join('\n'));
	assert.equal(effectOf(done.settled.flat(), ana.did).pence, -40000);
	assert.equal(effectOf(done.settled.flat(), ben.did).pence, 40000);

	assert.ok(problemsWithTerms({ kind: 'swap', a: ana.did, b: ben.did, aGives: { credits: 2, mode: 'test' }, bGives: { credits: 2, mode: 'test' } }).length, 'credits for credits is a gift');
	assert.ok(problemsWithTerms({ kind: 'swap', a: ana.did, b: ben.did, aGives: { pence: 500 }, bGives: { thing: 'Tea' } }).length, 'pounds only on business agreements');
	assert.deepEqual(problemsWithTerms(grass(ana.did, ben.did)), []);
});

test('a variation after agreeing: agreed again on new terms; turned down, the original stands', async () => {
	const { ana, ben } = await people();
	const id = 'grass-6';
	const p = await sign(ana, step({ agreement: id, step: 'proposed', parent: null, terms: grass(ana.did, ben.did, 3) }));
	const a = await sign(ben, step({ agreement: id, step: 'agreed', parent: p.contentHash }));
	const v = await sign(ben, step({ agreement: id, step: 'countered', parent: a.contentHash, terms: { ...grass(ana.did, ben.did, 4), doneWhen: 'Edges trimmed too' } }));
	const no = await sign(ana, step({ agreement: id, step: 'declined', parent: v.contentHash }));
	const kept = standingOf([p, a, v, no]);
	assert.equal(kept.phase, 'agreed');
	assert.equal(kept.terms && 'credits' in kept.terms.aGives ? kept.terms.aGives.credits : 0, 3, 'the original agreement stands');

	const yes = await sign(ana, step({ agreement: id, step: 'agreed', parent: v.contentHash }));
	const varied = standingOf([p, a, v, yes]);
	assert.equal(varied.phase, 'agreed');
	assert.equal(varied.terms && 'credits' in varied.terms.aGives ? varied.terms.aGives.credits : 0, 4, 'the variation, agreed by both, is the agreement now');
	assert.equal(varied.terms?.doneWhen, 'Edges trimmed too');
});

test('an open offer, shared by link: the first to answer becomes the other side, and nobody else can step in', async () => {
	const { ana, ben, cat } = await people();
	const id = 'open-1';
	const open: Terms = { kind: 'swap', a: ana.did, b: '', aGives: { credits: 2, mode: 'test' }, bGives: { thing: 'Walk the dog' } };
	assert.deepEqual(problemsWithTerms(open), [], 'an open offer is fine');
	const p = await sign(ana, step({ agreement: id, step: 'proposed', parent: null, terms: open }));
	let s = standingOf([p]);
	assert.equal(s.phase, 'agreeing');
	assert.equal(s.waitingFor, undefined, 'waiting for whoever opens the link');
	const benYes = await sign(ben, step({ agreement: id, step: 'agreed', parent: p.contentHash }));
	const catYes = await sign(cat, step({ agreement: id, step: 'agreed', parent: p.contentHash }));
	s = standingOf([p, benYes, catYes]);
	assert.equal(s.phase, 'agreed');
	assert.equal(s.terms?.b, ben.did, 'Ben answered first, so it’s with Ben');
	assert.equal(s.problems.length, 1, 'Cat’s comes too late');
	assert.equal(sayStep(p, ben.did, (d) => (d === ana.did ? 'Ana' : 'Ben')), 'Ana made an open offer of 2 test credits in exchange for Walk the dog, shared by link.');

	const p2 = await sign(ana, step({ agreement: 'open-2', step: 'proposed', parent: null, terms: open }));
	const counter = await sign(cat, step({ agreement: 'open-2', step: 'countered', parent: p2.contentHash, terms: { ...open, b: cat.did, aGives: { credits: 3, mode: 'test' } } }));
	s = standingOf([p2, counter]);
	assert.equal(s.terms?.b, cat.did, 'a counteroffer from the link names the person making it');
	assert.equal(s.waitingFor, ana.did);
});

test('a shop: a standing offer anyone can take, each taking its own agreement, up to the stock', async () => {
	const { ana, ben, cat } = await people();
	const jam: Terms = { kind: 'swap', a: ana.did, b: '', aGives: { thing: 'A jar of jam' }, bGives: { credits: 4, mode: 'test' } };
	const listing = await sign(ana, step({ agreement: 'shop-jam', step: 'proposed', parent: null, terms: jam, limit: 2 }));
	const shop = standingOf([listing]);
	assert.equal(isStandingOffer(shop), true);
	assert.equal(shop.limit, 2);
	assert.match(sayStep(listing, ben.did, () => 'Ana'), /in their shop for 4 test credits, 2 available/);

	/* Someone answering the listing itself is turned away: it's taken, not agreed. */
	const wrong = await sign(ben, step({ agreement: 'shop-jam', step: 'agreed', parent: listing.contentHash }));
	assert.equal(standingOf([listing, wrong]).phase, 'agreeing');

	const benId = takingId('shop-jam', 'b1');
	const benTakes = await sign(ben, step({ agreement: benId, step: 'taken', parent: listing.contentHash, terms: { ...jam, b: ben.did } }));
	const b = standingOf([listing, benTakes]);
	assert.equal(b.agreement, benId);
	assert.equal(b.phase, 'agreed', 'buying is the contract point');
	assert.equal(b.terms?.b, ben.did);
	assert.deepEqual(b.takenFrom, { agreement: 'shop-jam', hash: listing.contentHash });
	assert.deepEqual(b.problems, []);

	/* A taking must be on the listing's terms, by the taker, and not by the seller. */
	const cheap = await sign(cat, step({ agreement: takingId('shop-jam', 'c0'), step: 'taken', parent: listing.contentHash, terms: { ...jam, b: cat.did, bGives: { credits: 1, mode: 'test' } } }));
	assert.equal(standingOf([listing, cheap]).phase, 'agreeing');
	const own = await sign(ana, step({ agreement: takingId('shop-jam', 'a0'), step: 'taken', parent: listing.contentHash, terms: { ...jam, b: ana.did } }));
	assert.equal(standingOf([listing, own]).phase, 'agreeing');

	const catTakes = await sign(cat, step({ agreement: takingId('shop-jam', 'c1'), step: 'taken', parent: listing.contentHash, terms: { ...jam, b: cat.did } }));
	const c = standingOf([listing, catTakes]);
	assert.equal(stockLeft(shop, [b, c]), 0, 'two taken, none left');

	/* Sold out: Ana cancels Cat's before anything is settled, and the jar is back in stock. */
	const soldOut = await sign(ana, step({ agreement: takingId('shop-jam', 'c1'), step: 'declined', parent: catTakes.contentHash, note: 'Sold out' }));
	const c2 = standingOf([listing, catTakes, soldOut]);
	assert.equal(c2.phase, 'ended');
	assert.equal(c2.ended, 'sold-out');
	assert.equal(stockLeft(shop, [b, c2]), 1);

	/* Ben's settles like any agreement; once settling starts, it can't be cancelled. */
	const entries = entriesFor(b.terms!);
	const s1 = await sign(ben, step({ agreement: benId, step: 'settled', parent: benTakes.contentHash, entries }));
	const late = await sign(ana, step({ agreement: benId, step: 'declined', parent: s1.contentHash }));
	const s2 = await sign(ana, step({ agreement: benId, step: 'settled', parent: s1.contentHash, entries }));
	const done = standingOf([listing, benTakes, s1, late, s2]);
	assert.equal(done.phase, 'complete');
	assert.equal(done.problems.length, 1);

	/* Ana closes the shop listing by withdrawing it. */
	const shut = await sign(ana, step({ agreement: 'shop-jam', step: 'withdrawn', parent: listing.contentHash }));
	assert.equal(standingOf([listing, shut]).ended, 'withdrawn');
});

test('what you can do now: decided in one place, from where it stands', async () => {
	const { agreementNow, needsMe } = await import('../src/agreements');
	const { ana, ben } = await people();
	const name = (d: string) => (d === ana.did ? 'Ana' : 'Ben');
	const p = await sign(ana, step({ agreement: 'now-1', step: 'proposed', parent: null, terms: grass(ana.did, ben.did) }));
	const ids = (n: ReturnType<typeof agreementNow>) => n.actions.map((a) => a.id);

	assert.deepEqual(ids(agreementNow(standingOf([p]), ben.did, 'now-1', name)), ['agree', 'counter', 'decline']);
	assert.equal(needsMe(standingOf([p]), ben.did), true);
	assert.deepEqual(ids(agreementNow(standingOf([p]), ana.did, 'now-1', name)), ['withdraw']);
	assert.match(agreementNow(standingOf([p]), ana.did, 'now-1', name).says, /Waiting for Ben/);

	const a = await sign(ben, step({ agreement: 'now-1', step: 'agreed', parent: p.contentHash }));
	const agreed = agreementNow(standingOf([p, a]), ana.did, 'now-1', name);
	assert.equal(agreed.panel, 'settle');
	assert.deepEqual(ids(agreed), ['done', 'change']);
	assert.equal(agreed.actions[0].step?.parent, a.contentHash);

	const entries = entriesFor(grass(ana.did, ben.did));
	const s1 = await sign(ben, step({ agreement: 'now-1', step: 'settled', parent: a.contentHash, entries }));
	const confirm = agreementNow(standingOf([p, a, s1]), ana.did, 'now-1', name);
	assert.deepEqual(ids(confirm), ['confirm']);
	assert.match(confirm.says, /Ben has settled: 3 test credits from you to Ben/);
	assert.equal(confirm.actions[0].step?.parent, s1.contentHash);
	const s2 = await sign(ana, step({ agreement: 'now-1', step: 'settled', parent: s1.contentHash, entries }));
	assert.equal(agreementNow(standingOf([p, a, s1, s2]), ben.did, 'now-1', name).finished, 'settled');

	/* A shop: the seller's listing, someone else's listing, and a sale that can be cancelled. */
	const jam: Terms = { kind: 'swap', a: ana.did, b: '', aGives: { thing: 'Jam' }, bGives: { credits: 2, mode: 'test' } };
	const listing = await sign(ana, step({ agreement: 'jam', step: 'proposed', parent: null, terms: jam, limit: 2 }));
	const mine = agreementNow(standingOf([listing]), ana.did, 'jam', name);
	assert.equal(mine.panel, 'shop');
	assert.deepEqual(mine.actions.map((x) => [x.id, x.tellShop]), [['withdraw', true]]);
	assert.equal(agreementNow(standingOf([listing]), ben.did, 'jam', name).actions[0].href, `/shop/${encodeURIComponent(ana.did)}`);
	const bought = await sign(ben, step({ agreement: 'jam.b', step: 'taken', parent: listing.contentHash, terms: { ...jam, b: ben.did } }));
	const sale = agreementNow(standingOf([listing, bought]), ana.did, 'jam.b', name);
	assert.deepEqual(ids(sale), ['done', 'change', 'sold-out']);
	assert.ok(sale.after);
	assert.equal(needsMe(standingOf([listing, bought]), ben.did), true, 'the buyer pays next');
});

test('a pass-through hired by the hour: described properly, paid in credits, owed from the gigabyte-hours', async () => {
	const { passThroughOwed } = await import('../src/agreements');
	const { ana } = await people();
	const svc = { kind: 'pass-through' as const, relay: 'https://storage.example.org', where: 'relay:did:key:z6MkguuUVNj72BEqpY3qHikwFtSCiUWgDGbwiX8pqu5uh3gK', perGBHour: 1 };
	const t: Terms = { kind: 'job', a: ana.did, b: '', aGives: { thing: 'Pass-through, open 12–18' }, bGives: { credits: 50, mode: 'test' }, service: svc };
	assert.deepEqual(problemsWithTerms(t), []);
	assert.ok(problemsWithTerms({ ...t, service: { ...svc, relay: 'http://insecure' } }).length);
	assert.ok(problemsWithTerms({ ...t, bGives: { thing: 'a cake' } }).some((p) => /paid in credits/.test(p)));
	const GB = 1024 ** 3;
	assert.equal(passThroughOwed(0, 1), 0);
	assert.equal(passThroughOwed(GB * 2.2, 1), 3, 'rounded up to a whole credit');
	assert.equal(passThroughOwed(GB * 10, 0.5), 5);
});

test('a hire settled from its use: owed from the gigabyte-hours, capped at the most agreed, partly at a time', async () => {
	const { hireDue } = await import('../src/agreements');
	const { ana, ben } = await people();
	const GB = 1024 ** 3;
	const svc = { kind: 'pass-through' as const, relay: 'https://storage.example.org', where: 'relay:did:key:z6MkguuUVNj72BEqpY3qHikwFtSCiUWgDGbwiX8pqu5uh3gK', perGBHour: 2 };
	const hire: Terms = { kind: 'job', a: ana.did, b: '', aGives: { thing: 'Pass-through' }, bGives: { credits: 10, mode: 'test' }, service: svc };
	const listing = await sign(ana, step({ agreement: 'relay', step: 'proposed', parent: null, terms: hire, limit: 5 }));
	const taken = await sign(ben, step({ agreement: 'relay.b', step: 'taken', parent: listing.contentHash, terms: { ...hire, b: ben.did } }));
	let s = standingOf([listing, taken]);
	assert.equal(s.phase, 'agreed');
	assert.equal(hireDue(s, 0)?.due, 0, 'nothing used, nothing due');
	const first = hireDue(s, GB * 1.5)!;
	assert.equal(first.due, 3);
	assert.deepEqual(first.entries, [{ from: ben.did, to: ana.did, value: { credits: 3, mode: 'test' } }]);
	const paid = await sign(ben, step({ agreement: 'relay.b', step: 'settled', parent: taken.contentHash, entries: first.entries }));
	assert.equal(hireDue(standingOf([listing, taken, paid]), GB * 4)?.due, 0, 'nothing more while one waits to be confirmed');
	const ok = await sign(ana, step({ agreement: 'relay.b', step: 'settled', parent: paid.contentHash, entries: first.entries }));
	s = standingOf([listing, taken, paid, ok]);
	assert.deepEqual(s.problems, []);
	assert.equal(s.phase, 'agreed', 'still running: more use can be settled');
	const more = hireDue(s, GB * 4)!;
	assert.equal(more.paid, 3);
	assert.equal(more.due, 5);
	assert.equal(hireDue(s, GB * 100)?.due, 7, 'never more than the most agreed');
	assert.equal(hireDue(standingOf([listing]), GB), null, 'only a hire that someone has taken');
});

test('a hire, now: no "done", just settling for what was used', async () => {
	const { agreementNow } = await import('../src/agreements');
	const { ana, ben } = await people();
	const svc = { kind: 'pass-through' as const, relay: 'https://storage.example.org', where: 'relay:did:key:z6MkguuUVNj72BEqpY3qHikwFtSCiUWgDGbwiX8pqu5uh3gK', perGBHour: 2 };
	const hire: Terms = { kind: 'job', a: ana.did, b: '', aGives: { thing: 'Pass-through' }, bGives: { credits: 10, mode: 'test' }, service: svc };
	const listing = await sign(ana, step({ agreement: 'relay', step: 'proposed', parent: null, terms: hire, limit: 5 }));
	const taken = await sign(ben, step({ agreement: 'relay.b', step: 'taken', parent: listing.contentHash, terms: { ...hire, b: ben.did } }));
	const s = standingOf([listing, taken]);
	const name = (d: string) => (d === ben.did ? 'Ben' : 'Ana');
	assert.equal(agreementNow(s, ben.did, 'relay.b', name).panel, 'hire');
	assert.deepEqual(agreementNow(s, ben.did, 'relay.b', name).actions, []);
	const op = agreementNow(s, ana.did, 'relay.b', name);
	assert.match(op.says, /^Ben has hired/);
	assert.deepEqual(op.actions.map((a) => a.id), ['sold-out']);
});

test('a hire reads as a hire, not a purchase', async () => {
	const { ana, ben } = await people();
	const svc = { kind: 'pass-through' as const, relay: 'https://storage.example.org', where: 'relay:did:key:z6MkguuUVNj72BEqpY3qHikwFtSCiUWgDGbwiX8pqu5uh3gK', perGBHour: 0.2 };
	const hire: Terms = { kind: 'job', a: ana.did, b: '', aGives: { thing: 'Pass-through' }, bGives: { credits: 50, mode: 'test' }, service: svc };
	const listing = await sign(ana, step({ agreement: 'r', step: 'proposed', parent: null, terms: hire, limit: 10 }));
	const taken = await sign(ben, step({ agreement: 'r.b', step: 'taken', parent: listing.contentHash, terms: { ...hire, b: ben.did } }));
	const name = (d: string) => (d === ana.did ? 'Ana' : 'Ben');
	assert.match(sayStep(listing, ben.did, name), /Ana put Pass-through in their shop to hire, at 0.2 credits a GB held an hour, up to 50 test credits each, for 10 hirers\./);
	assert.match(sayStep(taken, ben.did, name), /^You hired from Ana’s shop: Pass-through, at 0.2 credits/);
});

test('kept storage by the month: described properly, reads as storage, settled as agreed', async () => {
	const { agreementNow, storeEnds, hireDue } = await import('../src/agreements');
	const { ana, ben } = await people();
	const svc = { kind: 'store' as const, store: 'https://storage.example.org', where: 'relay:did:key:z6MkguuUVNj72BEqpY3qHikwFtSCiUWgDGbwiX8pqu5uh3gK', gb: 10, months: 1 };
	const t: Terms = { kind: 'job', a: ana.did, b: '', aGives: { thing: 'Storage kept for you' }, bGives: { credits: 5, mode: 'test' }, service: svc };
	assert.deepEqual(problemsWithTerms(t), []);
	assert.ok(problemsWithTerms({ ...t, service: { ...svc, gb: 1.5 } }).length);
	assert.ok(problemsWithTerms({ ...t, service: { ...svc, months: 13 } }).length);
	const listing = await sign(ana, step({ agreement: 'st', step: 'proposed', parent: null, terms: t, limit: 3 }));
	const taken = await sign(ben, step({ agreement: 'st.b', step: 'taken', parent: listing.contentHash, terms: { ...t, b: ben.did } }));
	const name = (d: string) => (d === ana.did ? 'Ana' : 'Ben');
	assert.match(sayStep(listing, ben.did, name), /Ana put 10 GB of kept storage for 1 month in their shop, for 5 test credits, 3 available\./);
	assert.match(sayStep(taken, ben.did, name), /^You took 10 GB of kept storage for 1 month from Ana’s shop/);
	const s = standingOf([listing, taken]);
	assert.equal(s.phase, 'agreed');
	const now = agreementNow(s, ben.did, 'st.b', name);
	assert.equal(now.panel, 'settle');
	assert.deepEqual(now.actions, []);
	assert.equal(hireDue(s, 1e12), null, 'not paid by the hour');
	assert.equal(storeEnds('2026-10-04T00:00:00.000Z', 1), '2026-11-03T00:00:00.000Z');
});
