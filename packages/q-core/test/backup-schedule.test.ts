/* When each copy happens (ADR-Q-028 §6). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketDue, choicesFrom, cloudDue, DEFAULT_CHOICES, downloadDue } from '../src/backup-schedule';

const H = 3_600_000;
const now = Date.parse('2026-10-03T12:00:00Z');

test('choices are checked one by one; anything unknown is the default', () => {
	assert.deepEqual(choicesFrom(null), DEFAULT_CHOICES);
	assert.deepEqual(choicesFrom({ cloud: 'daily', bucket: 'hourly', relay: 'off', download: 'never' }), { cloud: 'daily', bucket: 'every-save', relay: 'off', download: 'never' });
});

test('the cloud: every five minutes always goes; four times a day and daily wait their turn; signing out always goes', () => {
	assert.equal(cloudDue(now - 60_000, 'five-minutes', now), true);
	assert.equal(cloudDue(now - 5 * H, 'four-times-a-day', now), false);
	assert.equal(cloudDue(now - 6 * H, 'four-times-a-day', now), true);
	assert.equal(cloudDue(now - 23 * H, 'daily', now), false);
	assert.equal(cloudDue(now - 23 * H, 'daily', now, true), true);
	assert.equal(cloudDue(0, 'daily', now), true, 'never copied: due');
});

test('your bucket: on every save goes with each write; every five minutes waits for the timer', () => {
	assert.equal(bucketDue('every-save', 'write'), true);
	assert.equal(bucketDue('five-minutes', 'write'), false);
	assert.equal(bucketDue('five-minutes', 'timer'), true);
});

test('the download: never means never; otherwise once the gap has passed, and at once if there has never been one', () => {
	assert.equal(downloadDue(0, 'monthly', now), true);
	assert.equal(downloadDue(now - 29 * 24 * H, 'monthly', now), false);
	assert.equal(downloadDue(now - 31 * 24 * H, 'monthly', now), true);
	assert.equal(downloadDue(now - 8 * 24 * H, 'weekly', now), true);
	assert.equal(downloadDue(0, 'never', now), false);
});
