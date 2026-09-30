/*
 * The vault pointer — the note a passkey carries about where the vault is.
 * The browser part (largeBlob) needs a passkey; this checks the note itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparePointer, decodePointer, deviceLabel, encodePointer, POINTER_MAX_BYTES, type VaultPointer } from '../src/pointer';

const P: VaultPointer = { v: 1, at: '2026-09-29T14:32:00.000Z', head: 'a1b2c3d4e5f6', files: 42, from: 'Safari on Mac', copies: ['Google Drive'] };

test('a note survives the trip through the passkey unchanged', () => {
	assert.deepEqual(decodePointer(encodePointer(P)), P);
});

test('a note always fits in a passkey, however long its parts', () => {
	const long = { ...P, from: 'x'.repeat(500), copies: Array(20).fill('y'.repeat(200)), head: 'z'.repeat(500) };
	assert.ok(encodePointer(long).byteLength <= POINTER_MAX_BYTES);
});

test('anything that is not a note reads as no note', () => {
	for (const b of [null, undefined, new Uint8Array(0), new TextEncoder().encode('hello'), new TextEncoder().encode('{"v":2}')])
		assert.equal(decodePointer(b), null);
});

test('the same files is the same head; otherwise newer changes say which is ahead', () => {
	const at = Date.parse(P.at);
	assert.equal(comparePointer(P, { head: P.head, files: 42, lastChange: at + 1e6 }), 'same');
	assert.equal(comparePointer(P, { head: 'other', files: 40, lastChange: at - 1e6 }), 'behind');
	assert.equal(comparePointer(P, { head: 'other', files: 43, lastChange: at + 1e6 }), 'ahead');
	assert.equal(comparePointer(null, { head: 'x', files: 0, lastChange: 0 }), 'none');
});

test('devices are named the way a person would say them', () => {
	assert.equal(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'), 'Safari on Mac');
	assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'), 'Chrome on Windows');
	assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), 'Safari on iPhone');
});
