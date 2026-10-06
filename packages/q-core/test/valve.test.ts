/* Drift and the safety valve (ADR-Q-027 addendum; jobs D2, D3). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driftOf, valveOf } from '../src/mint';

const NOW = new Date('2026-10-06T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

test('drift: 0 when matched or over-backed or nothing out; the share unmatched otherwise', () => {
	assert.equal(driftOf(10_000, 10_000), 0);
	assert.equal(driftOf(12_000, 10_000), 0);
	assert.equal(driftOf(0, 0), 0);
	assert.ok(Math.abs(driftOf(8_500, 10_000) - 0.15) < 1e-12);
});

test('the valve: open, warning over 10%, shut over 20%; buying is never in it', () => {
	const at = { lastReconciledAt: daysAgo(1), now: NOW };
	assert.deepEqual([valveOf({ drift: 0, circulation: 100 }, at).shut, valveOf({ drift: 0, circulation: 100 }, at).warn], [false, false]);
	const warn = valveOf({ drift: 0.15, circulation: 100 }, at);
	assert.deepEqual([warn.shut, warn.warn], [false, true]);
	const shut = valveOf({ drift: 0.25, circulation: 100 }, at);
	assert.equal(shut.shut, true);
	assert.match(shut.says, /Buying stays open/);
});

test('books not reconciled for 30 days count as unknown: shut; a new bank has 30 days for its first', () => {
	assert.equal(valveOf({ drift: 0, circulation: 100 }, { lastReconciledAt: daysAgo(31), now: NOW }).shut, true);
	assert.equal(valveOf({ drift: 0, circulation: 100 }, { lastReconciledAt: null, openedAt: daysAgo(10), now: NOW }).shut, false);
	assert.equal(valveOf({ drift: 0, circulation: 100 }, { lastReconciledAt: null, openedAt: daysAgo(40), now: NOW }).shut, true);
	assert.equal(valveOf({ drift: 0, circulation: 0 }, { openedAt: daysAgo(400), now: NOW }).shut, false, 'nothing out, nothing to pause');
});
