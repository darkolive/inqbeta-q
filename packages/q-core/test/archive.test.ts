/*
 * Archive keys.
 *
 * The point of this file is one property, proved with real crypto rather than
 * asserted in a document: after the wrapped key is gone, the passkey that
 * wrote the archive cannot open it. That is what turns a stolen drive from a
 * permanent exposure into a closed one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { lockBytes, unlockBytes } from '../src/vault';
import {
	ARCHIVE_KEY_TYPE,
	canShred,
	isArchiveKeyFile,
	maySpread,
	newArchiveKey,
	openArchiveKey,
	wrapArchiveKey,
} from '../src/archive';

const seed = new Uint8Array(32).map((_, i) => i * 7 + 11);
const DRIVE = 'did:key:z6MkweTn4zvvHVT4a2Vvpah2Q6QhnJhAqZgHwj3ni4bEpGnc';
const meta = { archive: DRIVE, called: 'flash drive 2026', made: '2026-09-20T00:00:00.000Z' };

test('an archive key round-trips through the vault, and opens what it wrote', async () => {
	const me = await identityFromSeed(seed);
	const archiveKey = await newArchiveKey();
	const wrapped = await wrapArchiveKey(me.vault, archiveKey, meta);

	const record = await lockBytes(archiveKey, { name: 'invoices-2026.pdf', path: 'archive', type: 'application/pdf' }, new TextEncoder().encode('seven years of these'));

	const { key } = await openArchiveKey(me.vault, wrapped);
	const back = await unlockBytes(key, record);
	assert.equal(new TextDecoder().decode(back.data), 'seven years of these');
	assert.equal(back.meta.name, 'invoices-2026.pdf');
});

test('THE PROPERTY: without the wrapped key, the passkey that wrote it cannot open it', async () => {
	const me = await identityFromSeed(seed);
	const archiveKey = await newArchiveKey();
	await wrapArchiveKey(me.vault, archiveKey, meta);
	const record = await lockBytes(archiveKey, { name: 'invoices.pdf', path: 'archive', type: 'application/pdf' }, new TextEncoder().encode('secret'));

	/* The thief has the drive. The owner still has their passkey — and a
	 * rebuilt vault key is no use, because the archive was never sealed to it. */
	const rebuilt = await identityFromSeed(seed.slice());
	await assert.rejects(() => unlockBytes(rebuilt.vault, record));
});

test('the key is random, not derived — two archives never share a key', async () => {
	const a = await newArchiveKey();
	const b = await newArchiveKey();
	const rawA = new Uint8Array(await crypto.subtle.exportKey('raw', a));
	const rawB = new Uint8Array(await crypto.subtle.exportKey('raw', b));
	assert.notDeepEqual([...rawA], [...rawB]);

	/* And the same passkey cannot reproduce one. If this ever passes by
	 * derivation, the archive has stopped being closable. */
	const me = await identityFromSeed(seed);
	const mine = new Uint8Array(await crypto.subtle.exportKey('raw', me.vault).catch(() => new ArrayBuffer(0)));
	assert.notDeepEqual([...rawA], [...mine]);
});

test('an opened archive key cannot be exported again', async () => {
	const me = await identityFromSeed(seed);
	const wrapped = await wrapArchiveKey(me.vault, await newArchiveKey(), meta);
	const { key } = await openArchiveKey(me.vault, wrapped);
	assert.equal(key.extractable, false);
	await assert.rejects(() => crypto.subtle.exportKey('raw', key));
});

test('another passkey cannot unwrap the key at all', async () => {
	const me = await identityFromSeed(seed);
	const other = await identityFromSeed(new Uint8Array(32).fill(4));
	const wrapped = await wrapArchiveKey(me.vault, await newArchiveKey(), meta);
	await assert.rejects(() => openArchiveKey(other.vault, wrapped));
});

test('an ordinary vault file is not mistaken for an archive key', async () => {
	const me = await identityFromSeed(seed);
	const notAKey = await lockBytes(me.vault, { name: 'notes.md', path: 'files', type: 'text/markdown' }, new Uint8Array([1, 2, 3]));
	await assert.rejects(() => openArchiveKey(me.vault, notAKey), /not an archive key/i);
});

test('the key never spreads to copy locations, or shredding stops being one act', () => {
	assert.equal(isArchiveKeyFile(ARCHIVE_KEY_TYPE), true);
	assert.equal(maySpread(ARCHIVE_KEY_TYPE), false);
	assert.equal(maySpread('application/pdf'), true);
	assert.equal(maySpread('text/markdown'), true);
});

test('shredding is only offered when it would actually work', () => {
	const one = canShred(1);
	assert.equal(one.ok, true);
	assert.match(one.says, /wherever the drive is/i);

	const several = canShred(3);
	assert.equal(several.ok, false);
	assert.match(several.says, /3 places/);
	assert.match(several.fix, /remove the other copies first/i);

	const none = canShred(0);
	assert.equal(none.ok, false);
	assert.match(none.says, /including you/i, 'say the cost, not just the fact');
});
