/*
 * Where a thing should be, and where it is.
 *
 * Four things are being held to: bands are destinations rather than a number,
 * warming is instant while cooling is one step, a bundle is never unpacked,
 * and a blocked move is reported rather than failed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	BANDS,
	BUNDLE_AT_LEAST,
	DWELL,
	bandNumber,
	bundles,
	gapOf,
	oneStep,
	reconcile,
	shouldBe,
	shouldBundle,
	type Thing,
} from '../src/bands';
import { TIERS } from '../src/lifecycle';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 20);
const ago = (days: number) => NOW - days * DAY;
const ALL = BANDS;

test('there are as many bands as there are kinds of place, and they are the same four', () => {
	assert.deepEqual(BANDS, TIERS.map((t) => t.tier), 'a band that lands nowhere new does nothing');
	assert.equal(BANDS.length, 4, 'seven was a number looking for a job');
});

test('the band a thing should be in comes from its age alone', () => {
	assert.equal(shouldBe(ago(0), NOW), 'here');
	assert.equal(shouldBe(ago(6), NOW), 'here');
	assert.equal(shouldBe(ago(8), NOW), 'synced');
	assert.equal(shouldBe(ago(40), NOW), 'cold');
	assert.equal(shouldBe(ago(3000), NOW), 'archive');
	/* And a clock skewed into the future does not make something colder. */
	assert.equal(shouldBe(NOW + 10 * DAY, NOW), 'here');
});

test('the coldest band is the last one — nothing cools out of it', () => {
	assert.equal(DWELL.archive, Infinity);
	assert.equal(shouldBe(ago(100000), NOW), 'archive');
});

test('warming is instant and by any distance; cooling is one band at a time', () => {
	assert.equal(oneStep('archive', 'here'), 'here', 'a person waiting for their own file waits for nothing');
	assert.equal(oneStep('here', 'archive'), 'synced', 'and never more than one band per pass');
	assert.equal(oneStep('synced', 'archive'), 'cold');
	assert.equal(oneStep('here', 'here'), 'here');
});

test('a thing where it belongs is left alone', () => {
	const m = reconcile({ id: 'a', touchedAt: ago(1), at: 'here' }, ALL, NOW);
	assert.equal(m.act, 'rest');
	assert.match(m.says, /where it should be/i);
});

test('a bundle is never unpacked — warming makes a new copy instead', () => {
	const cold: Thing = { id: 'a', touchedAt: ago(0), at: 'archive', bundled: true };
	const m = reconcile(cold, ALL, NOW);
	assert.equal(m.to, 'here');
	assert.equal(m.act, 'copy');
	assert.match(m.says, /the bundle is left alone/i);
});

test('a move to a place that is not answering is reported, not failed', () => {
	/* Everything reachable except the drawer, which is where a drive lives. */
	const reachable = ALL.filter((b) => b !== 'archive');
	const m = reconcile({ id: 'a', touchedAt: ago(3000), at: 'cold' }, reachable, NOW);
	assert.equal(m.blocked, true);
	assert.equal(m.to, 'archive');
	assert.match(m.says, /nothing is plugged in/i, 'say which place and why, not "failed"');
});

test('the gap is two lists, because blocked is not the same as broken', () => {
	const things: Thing[] = [
		{ id: 'fresh', touchedAt: ago(1), at: 'here' },
		{ id: 'cooling', touchedAt: ago(40), at: 'synced' },
		{ id: 'old', touchedAt: ago(3000), at: 'cold' },
	];
	const g = gapOf(things, ALL.filter((b) => b !== 'archive'), NOW);
	assert.deepEqual(g.ready.map((m) => m.id), ['cooling']);
	assert.deepEqual(g.waiting.map((m) => m.id), ['old']);
	assert.match(g.says, /1 to move, 1 waiting/);
	/* Nothing in either list is called an error. */
	assert.doesNotMatch(g.says, /fail|error|problem/i);
});

test('everything in its place says so plainly', () => {
	assert.match(gapOf([{ id: 'a', touchedAt: ago(1), at: 'here' }], ALL, NOW).says, /everything is where it should be/i);
});

test('only the cold bands bundle, and only once there is enough to be worth it', () => {
	assert.equal(bundles('here'), false);
	assert.equal(bundles('synced'), false);
	assert.equal(bundles('cold'), true);
	assert.equal(bundles('archive'), true);

	const few = shouldBundle('archive', BUNDLE_AT_LEAST - 1);
	assert.equal(few.make, false);
	assert.match(few.says, new RegExp(String(BUNDLE_AT_LEAST)));

	const enough = shouldBundle('archive', 400);
	assert.equal(enough.make, true);
	/* The promise that makes bundling safe, stated where a person reads it. */
	assert.match(enough.says, /destroyed without touching the rest/i);
});

test('a hot band never bundles, so a thing can be opened on its own', () => {
	const hot = shouldBundle('here', 10_000);
	assert.equal(hot.make, false);
	assert.match(hot.says, /opened one by one/i);
});

test('cooling a long-untouched thing takes several passes, and never churns', () => {
	/* Left alone for years, starting hot. Each pass moves it one band and no
	 * pass ever moves it back, which is what stops bundles being rewritten. */
	let at = BANDS[0];
	const seen: string[] = [at];
	for (let i = 0; i < 6; i++) {
		const m = reconcile({ id: 'a', touchedAt: ago(3000), at }, ALL, NOW);
		if (m.act === 'rest') break;
		assert.equal(bandNumber(m.to), bandNumber(at) + 1, 'one band per pass');
		at = m.to;
		seen.push(at);
	}
	assert.deepEqual(seen, ['here', 'synced', 'cold', 'archive']);
	assert.equal(reconcile({ id: 'a', touchedAt: ago(3000), at }, ALL, NOW).act, 'rest', 'and then it settles');
});
