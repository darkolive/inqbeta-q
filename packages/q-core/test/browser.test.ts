/*
 * What a browser may be trusted with.
 *
 * The sentences are the product here — a person decides whether to trust their
 * evidence to this page by reading them — so they are tested like anything else
 * that can be wrong.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserCan, type Features } from '../src/browser';

const chrome: Features = { directoryPicker: true, directoryInput: true, privateStorage: true };
const safari: Features = { directoryPicker: false, directoryInput: true, privateStorage: true };
const oldish: Features = { directoryPicker: false, directoryInput: false, privateStorage: true };
const nothing: Features = { directoryPicker: false, directoryInput: false, privateStorage: false };

test('a browser with a folder picker can keep things', () => {
	const can = browserCan(chrome);
	assert.equal(can.keep, true);
	assert.equal(can.read, true);
	assert.equal(can.fix, '', 'nothing to fix, so nothing to nag about');
});

test('Safari saves into its own storage, and offers Back up now', () => {
	/* Revised 2026-09-23: read-only Safari broke the experience. Browser storage
	 * is the working copy; the backup button is what makes it safe. */
	const can = browserCan(safari);
	assert.equal(can.keep, true);
	assert.equal(can.read, true);
	assert.equal(can.backup, true);
	assert.match(can.says, /back up now/i);
	assert.match(can.says, /seven days/i);
});

test('a folder on disk needs no backup button', () => {
	assert.equal(browserCan(chrome).backup, false);
});

test('private storage alone is enough to save', () => {
	assert.equal(browserCan(oldish).keep, true);
	assert.equal(browserCan(oldish).backup, true);
});

test('a folder that can only be read in, with nowhere to save, is a reader', () => {
	const can = browserCan({ directoryPicker: false, directoryInput: true, privateStorage: false });
	assert.equal(can.keep, false);
	assert.equal(can.read, true);
	assert.ok(can.fix.trim());
});

test('a browser with nothing says so rather than failing later', () => {
	const can = browserCan(nothing);
	assert.equal(can.keep, false);
	assert.equal(can.read, false);
	assert.ok(can.says.trim());
	assert.ok(can.fix.trim());
});

test('keeping always implies reading; nothing can save to what it cannot open', () => {
	for (const f of [chrome, safari, oldish, nothing]) {
		const can = browserCan(f);
		if (can.keep) assert.equal(can.read, true);
		assert.ok(can.says.trim(), 'every browser gets an answer');
	}
});
