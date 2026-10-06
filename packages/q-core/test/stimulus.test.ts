/* The stimulus valve (ADR-Q-043): the worked examples, the queues, and the gift that is never a coin. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { allocate, giftUsable, giveCapacity, nextQueue, valveRelease } from '../src/stimulus';

const near = (a: number, b: number, d = 0.05) => assert.ok(Math.abs(a - b) < d, `${a} ≉ ${b}`);

test('the 30 GB drive: the valve opens as use falls and closes at the target', () => {
	near(valveRelease(30, 1).release, 20.7, 0.1);
	near(valveRelease(30, 15).release, 5.34);
	assert.equal(valveRelease(30, 24).release, 0, 'shut at the target');
	assert.equal(valveRelease(30, 29).release, 0, 'over the target, nothing');
	const r = valveRelease(30, 10);
	near(r.valve, 0.753, 0.002);
	near(r.release, 10.5, 0.05);
	/* Smooth: a little less use opens it a little more, never a jump. */
	assert.ok(valveRelease(30, 9.9).release - valveRelease(30, 10).release < 0.2);
	assert.throws(() => valveRelease(0, 0));
});

test('a release shared: the grant by its budget, the open programme takes the rest; one each before two', () => {
	const people = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);
	const out = allocate(100, [{ id: 'grant', funder: 'did:key:zFunder', budget: 200, gift: 1, queue: people(80, 'g') }, { id: 'open', funder: 'did:key:zFed', budget: null, gift: 1, queue: people(200, 'o') }], 5);
	assert.deepEqual(out.map((a) => [a.programme, a.served.length, a.costs]), [['grant', 40, 200], ['open', 60, 300]]);
	assert.deepEqual(nextQueue(['a', 'b', 'c'], ['a']), ['b', 'c', 'a']);
	/* Good causes: 10.5 GB safe, gifts of 5 GB: two places, never twenty. */
	const causes = allocate(valveRelease(30, 10).release, [{ id: 'good-causes', funder: 'did:key:zFed', budget: null, gift: 5, queue: ['scouts', 'toddlers', 'job-centre'] }], 5);
	assert.deepEqual(causes[0].served, ['scouts', 'toddlers']);
});

test('a capacity gift: for its person, its capacity, its federation, its window', async () => {
	const fed = await identityFromSeed(new Uint8Array(32).fill(5));
	const g = await giveCapacity(fed, { capacity: 'storage', kind: 'passing', amount: 1, unit: 'GB', recipient: 'did:key:zAna', programme: 'open', eligibleUnder: 'open', from: '2026-10-06T00:00:00Z', to: '2026-10-13T00:00:00Z', valve: { ...valveRelease(30, 10), target: 0.8, k: 3, slackShare: 0.2 } });
	const when = new Date('2026-10-07T00:00:00Z');
	const use = (o: Partial<Parameters<typeof giftUsable>[1]>) => giftUsable(g, { by: 'did:key:zAna', federation: fed.did, capacity: 'storage', now: when, ...o });
	assert.ok((await use({})).ok);
	assert.match(((await use({ by: 'did:key:zBen' })) as { says: string }).says, /handed on/);
	assert.match(((await use({ federation: 'did:key:zOther' })) as { says: string }).says, /another federation/);
	assert.match(((await use({ capacity: 'rooms' })) as { says: string }).says, /storage only/);
	assert.match(((await use({ now: new Date('2026-10-14T00:00:00Z') })) as { says: string }).says, /window has passed/);
	await assert.rejects(giveCapacity(fed, { ...g.content, kind: 'held' }), /notice/);
});
