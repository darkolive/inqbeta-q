/* Reading an exchange from its head (ADR-Q-029): the latest step vouches for every step before it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHead, headsOf } from '../src/from-head';

const step = (h: string, parent: string | null, at: string) => ({ contentHash: h, content: { parent, at } });

test('from the head back to the first: the whole story, in order', () => {
	const steps = [step('c', 'b', '3'), step('a', null, '1'), step('b', 'a', '2'), step('x', 'a', '2b')];
	const r = fromHead(steps, 'c');
	assert.deepEqual(r.chain.map((s) => s.contentHash), ['a', 'b', 'c']);
	assert.equal(r.whole, true);
	assert.deepEqual(r.problems, []);
});

test('a missing step or a loop is said, never guessed past', () => {
	assert.deepEqual(fromHead([step('c', 'b', '3')], 'c').problems, ['A step it follows is missing.']);
	assert.equal(fromHead([step('c', 'b', '3')], 'c').whole, false);
	assert.deepEqual(fromHead([step('a', 'b', '1'), step('b', 'a', '2')], 'a').problems, ['The steps go round in a loop.']);
	assert.deepEqual(fromHead([], 'z').problems, ['That step isn’t here.']);
});

test('the ends: one means one story; two means it branched', () => {
	assert.deepEqual(headsOf([step('a', null, '1'), step('b', 'a', '2')]).map((s) => s.contentHash), ['b']);
	assert.deepEqual(headsOf([step('a', null, '1'), step('b', 'a', '2'), step('x', 'a', '3')]).map((s) => s.contentHash), ['b', 'x']);
});
