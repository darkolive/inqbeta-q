/*
 * A DID's history as a chain of answers.
 *
 * Genesis answers who you are. Everything after answers what's next and
 * records only the difference. The tests that matter are the three things the
 * shape does not give you for free: a chain is not a blockchain, "what's next"
 * branches, and confidence decays while the record does not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	CHECKPOINT_EVERY,
	GENESIS_QUESTION,
	NEXT_QUESTION,
	checkChain,
	confidence,
	fold,
	forkAt,
	howSure,
	isMerge,
	needsCheckpoint,
	nothingChanged,
	type Step,
} from '../src/chain';

const step = (seq: number, parent: string | null, changed: Step['changed'] = {}): Step => ({
	id: `s${seq}`,
	parent,
	seq,
	asks: seq === 0 ? GENESIS_QUESTION : NEXT_QUESTION,
	changed,
	at: new Date(2026, 0, seq + 1).toISOString(),
});

const chain = (): Step[] => [
	step(0, null, { 'q:person/called': 'Darren' }),
	step(1, 's0', { 'q:person/site': 'darkolive.co.uk' }),
	step(2, 's1', {}),
	step(3, 's2', { 'q:person/called': 'Darren Knipe' }),
];

test('genesis asks who you are, and nothing came before it', () => {
	assert.equal(checkChain(chain()), null);

	const orphan = [{ ...step(0, null), parent: 'somewhere' }, ...chain().slice(1)];
	assert.match(checkChain(orphan)!.says, /claims something came before it/i);

	const wrongQuestion = [{ ...step(0, null), asks: NEXT_QUESTION }, ...chain().slice(1)];
	assert.match(checkChain(wrongQuestion)!.says, /other than who you are/i);
});

test('a cut history is found at the cut, and nothing after it is reported', () => {
	const cut = [...chain()];
	cut[2] = { ...cut[2], parent: 's0' };
	const broken = checkChain(cut)!;
	assert.equal(broken.at, 2);
	assert.match(broken.says, /cut or rewritten/i);
});

test('the current state is the fold, and the newest answer wins', () => {
	assert.deepEqual(fold(chain()), {
		'q:person/called': 'Darren Knipe',
		'q:person/site': 'darkolive.co.uk',
	});
});

test('unsetting removes, so "answered nothing" and "never asked" do not read the same', () => {
	const s = fold([...chain(), step(4, 's3', { 'q:person/site': null })]);
	assert.equal('q:person/site' in s, false);
	assert.equal(s['q:person/called'], 'Darren Knipe');
});

test('nothing changed is a real event — somebody looked and it still held', () => {
	const c = chain();
	assert.equal(nothingChanged(c[2]), true);
	assert.equal(nothingChanged(c[1]), false);
	/* And it leaves the state exactly as it was. */
	assert.deepEqual(fold(c.slice(0, 3)), fold(c.slice(0, 2)));
});

test('two steps from one parent is a fork, and Q reports it without guessing why', () => {
	const a = { ...step(2, 's1', { x: 'one' }), id: 'a' };
	const b = { ...step(2, 's1', { x: 'two' }), id: 'b' };
	const f = forkAt(a, b)!;
	assert.equal(f.from, 's1');
	/* Both readings named. A hash chain cannot tell them apart from inside. */
	assert.match(f.says, /two devices wrote while apart/i);
	assert.match(f.says, /same key told two stories/i);
});

test('the same step twice is not a fork, and different parents are not either', () => {
	const a = step(2, 's1');
	assert.equal(forkAt(a, a), null);
	assert.equal(forkAt(a, step(2, 's0')), null);
});

test('a merge is a step like any other, which is what makes it auditable', () => {
	assert.equal(isMerge({ ...step(3, 'a'), alsoFollows: 'b' }), true);
	assert.equal(isMerge(step(3, 'a')), false);
});

test('folding from the beginning forever is why checkpoints exist', () => {
	assert.equal(needsCheckpoint(CHECKPOINT_EVERY - 1), false);
	assert.equal(needsCheckpoint(CHECKPOINT_EVERY), true);
});

test('confidence halves on schedule and never reaches zero', () => {
	const now = Date.now();
	const year = 365 * 24 * 60 * 60 * 1000;

	assert.equal(confidence(now, year, now), 1);
	assert.ok(Math.abs(confidence(now - year, year, now) - 0.5) < 1e-9);
	assert.ok(Math.abs(confidence(now - 2 * year, year, now) - 0.25) < 1e-9);

	/* Twenty years on, still not nothing — because "we no longer rely on this"
	 * and "this never happened" are different sentences. */
	assert.ok(confidence(now - 20 * year, year, now) > 0);
});

test('a future timestamp does not push confidence above certain', () => {
	const now = Date.now();
	assert.equal(confidence(now + 1_000_000, 1000, now), 1);
});

test('the sentence never says an answer is wrong, only how long since anyone confirmed it', () => {
	assert.match(howSure(0.9), /recently confirmed/i);
	assert.match(howSure(0.6), /still stands/i);
	assert.match(howSure(0.3), /may still be true/i);
	assert.match(howSure(0.01), /nothing since says whether it still is/i);
	for (const c of [0.9, 0.6, 0.3, 0.01]) {
		assert.doesNotMatch(howSure(c), /wrong|false|expired|invalid/i);
	}
});
