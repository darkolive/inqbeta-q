/*
 * Read, wrote, reviewed.
 *
 * The rule worth defending is that these are three different KINDS of thing,
 * not three values of one enum. A design that signs a receipt per glance
 * collapses under its own bookkeeping, and a design that treats reading as
 * equivalent to reviewing lets an old answer look fresh because somebody
 * glanced at it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTS, lastTouched, noteRead, stillWorth, whyThere, worthKeeping, type TouchAct } from '../src/touches';
import { confidence } from '../src/chain';
import { shouldBe } from '../src/bands';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 20);
const ago = (d: number) => NOW - d * DAY;

test('only a review is worth a receipt, and the other two say how they are kept', () => {
	assert.equal(worthKeeping('reviewed'), true);
	assert.equal(worthKeeping('read'), false);
	assert.equal(worthKeeping('wrote'), false);

	const kept = Object.fromEntries(ACTS.map((a) => [a.act, a.kept]));
	assert.deepEqual(kept, { read: 'local', wrote: 'derived', reviewed: 'signed' });
});

test('reads collapse into a count, because a hundred opens are one fact', () => {
	let tally = noteRead(null, 'thing', ago(30));
	assert.equal(tally.times, 1);
	for (let i = 29; i >= 0; i--) tally = noteRead(tally, 'thing', ago(i));
	assert.equal(tally.times, 31);
	assert.equal(tally.firstAt, ago(30));
	assert.equal(tally.lastAt, NOW);
});

test('a read arriving out of order does not move the last-read backwards', () => {
	const tally = noteRead(noteRead(null, 'thing', ago(1)), 'thing', ago(40));
	assert.equal(tally.lastAt, ago(1), 'a stale device syncing late must not make something look older');
	assert.equal(tally.firstAt, ago(40));
	assert.equal(tally.times, 2);
});

test('the newest act wins, whichever of the three it was', () => {
	assert.deepEqual(lastTouched({ writtenAt: ago(100) }), { at: ago(100), by: 'wrote' });
	assert.deepEqual(
		lastTouched({ writtenAt: ago(100), reads: noteRead(null, 'x', ago(3)) }),
		{ at: ago(3), by: 'read' },
	);
	assert.deepEqual(
		lastTouched({ writtenAt: ago(100), reads: noteRead(null, 'x', ago(3)), reviewedAt: ago(1) }),
		{ at: ago(1), by: 'reviewed' },
	);
	/* An old review does not beat a recent read. */
	assert.equal(lastTouched({ writtenAt: ago(100), reads: noteRead(null, 'x', ago(2)), reviewedAt: ago(90) }).by, 'read');
});

test('reading keeps a thing warm — which is the whole reason bands needed this', () => {
	/* Written years ago, opened last week. Age since writing would archive it. */
	const old = { writtenAt: ago(900), reads: noteRead(null, 'invoice', ago(3)) };
	assert.equal(shouldBe(old.writtenAt, NOW), 'archive');
	assert.equal(shouldBe(lastTouched(old).at, NOW), 'here', 'a monthly-checked invoice is not archive material');
});

test('a band engine that cannot explain itself is one nobody trusts', () => {
	assert.match(whyThere({ at: ago(0), by: 'read' }, NOW), /opened this today/i);
	assert.match(whyThere({ at: ago(1), by: 'read' }, NOW), /yesterday/i);
	assert.match(whyThere({ at: ago(14), by: 'reviewed' }, NOW), /still holds 14 days ago/i);
	const cold = whyThere({ at: ago(400), by: 'wrote' }, NOW);
	assert.match(cold, /13 months ago/);
	assert.match(cold, /nobody has opened it since/i, 'say what did NOT happen, not only what did');
});

test('reading does not make an old answer true again; reviewing does', () => {
	const year = 365 * DAY;
	/* Same thing, same age. One was read; the other was checked. */
	assert.ok(Math.abs(stillWorth(ago(365), year, NOW) - 0.5) < 1e-9);
	assert.equal(stillWorth(null, year, NOW), 0, 'never reviewed is worth nothing, which is not the same as false');
	/* And it is the same curve chain.ts uses — one decay, not two. */
	assert.equal(stillWorth(ago(100), year, NOW), confidence(ago(100), year, NOW));
});

test('every act has a question a person would recognise', () => {
	for (const { act, asks } of ACTS) {
		assert.match(asks, /\?$/, `${act} should be asked, not labelled`);
		assert.ok(asks.length > 20, `${act} needs a real question`);
	}
	const acts: TouchAct[] = ACTS.map((a) => a.act);
	assert.deepEqual(acts, ['read', 'wrote', 'reviewed']);
});
