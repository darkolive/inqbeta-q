/*
 * The zip a vault leaves in.
 *
 * Checked against the format rather than against itself: a reader that is not
 * this code has to be able to open it, or the vault is a one-way door. The
 * structure is verified byte by byte, and `unzip` here is written from the spec
 * independently of the writer so the two cannot agree on the same mistake.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, zip } from '../src/zip';

const bytes = (s: string) => new TextEncoder().encode(s);

test('crc32 matches the known values every zip tool agrees on', () => {
	assert.equal(crc32(bytes('')), 0x00000000);
	assert.equal(crc32(bytes('a')), 0xe8b7be43);
	assert.equal(crc32(bytes('123456789')), 0xcbf43926);
	assert.equal(crc32(bytes('The quick brown fox jumps over the lazy dog')), 0x414fa339);
});

test('the archive has the signatures and counts a reader looks for', () => {
	const out = zip([
		{ name: 'one.dsv', bytes: bytes('first'), at: new Date('2026-09-19T12:00:00Z') },
		{ name: 'two.dsv', bytes: bytes('second'), at: new Date('2026-09-19T12:00:00Z') }
	]);
	const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

	/* Starts with a local file header. */
	assert.equal(view.getUint32(0, true), 0x04034b50);

	/* Ends with an end-of-central-directory saying how many files there are. */
	const end = out.length - 22;
	assert.equal(view.getUint32(end, true), 0x06054b50);
	assert.equal(view.getUint16(end + 8, true), 2, 'entries on this disk');
	assert.equal(view.getUint16(end + 10, true), 2, 'entries in total');

	/* The central directory is where the end record says it is. */
	const cdOffset = view.getUint32(end + 16, true);
	assert.equal(view.getUint32(cdOffset, true), 0x02014b50);

	/* Stored, not deflated — the method field of the first local header. */
	assert.equal(view.getUint16(8, true), 0);
});

test('every byte goes in exactly as it came, so anything can read it back', () => {
	const payload = new Uint8Array(256).map((_, i) => i);
	const out = zip([{ name: 'bytes.dsv', bytes: payload }]);
	/* Stored means the payload appears verbatim somewhere in the archive. */
	const haystack = Array.from(out).join(',');
	assert.ok(haystack.includes(Array.from(payload).join(',')), 'the file was altered on the way in');
});

test('an empty vault still makes a valid archive', () => {
	const out = zip([]);
	assert.equal(out.length, 22, 'nothing but an end-of-central-directory');
	const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
	assert.equal(view.getUint32(0, true), 0x06054b50);
	assert.equal(view.getUint16(8, true), 0);
});

test('a real unzip opens it and the files come out unchanged', (t) => {
	let have = true;
	try {
		execFileSync('unzip', ['-v'], { stdio: 'ignore' });
	} catch {
		have = false;
	}
	if (!have) return t.skip('no unzip on this machine');

	const dir = mkdtempSync(join(tmpdir(), 'q-zip-'));
	const files = [
		{ name: 'a1b2c3.dsv', bytes: new Uint8Array([0, 1, 2, 250, 251, 255]) },
		{ name: 'READ ME.txt', bytes: bytes('This is a locked folder.\nEverything in here is encrypted.\n') },
		{ name: 'dostudy.json', bytes: bytes('{"did":"did:key:z6Mk"}') }
	];
	writeFileSync(join(dir, 'vault.zip'), zip(files));
	execFileSync('unzip', ['-q', 'vault.zip'], { cwd: dir });

	const out = readdirSync(dir).filter((n) => n !== 'vault.zip').sort();
	assert.deepEqual(out, ['READ ME.txt', 'a1b2c3.dsv', 'dostudy.json']);
	for (const f of files) {
		assert.deepEqual([...readFileSync(join(dir, f.name))], [...f.bytes], `${f.name} came out different`);
	}
});

test('unzip reads back exactly what zip wrote, paths and all', async () => {
	const { unzip } = await import('../src/zip');
	const input = [
		{ name: 'abc.dsv', bytes: bytes('locked one') },
		{ name: 'ucan/bafy.ucan', bytes: bytes('token') },
		{ name: 'ucan/revoked/bafz.ucan', bytes: new Uint8Array([0, 1, 2, 255]) }
	];
	const back = await unzip(zip(input));
	assert.deepEqual(back.map((e) => e.name), input.map((e) => e.name));
	for (let i = 0; i < input.length; i++) assert.deepEqual(back[i].bytes, input[i].bytes);
});

test('unzip opens a deflated zip made by another tool', async () => {
	const { unzip } = await import('../src/zip');
	const dir = mkdtempSync(join(tmpdir(), 'q-unzip-'));
	writeFileSync(join(dir, 'a.txt'), 'hello hello hello hello hello');
	try {
		execFileSync('zip', ['-q', '-9', 'out.zip', 'a.txt'], { cwd: dir });
	} catch {
		return; /* no zip tool on this machine; the stored path is covered above */
	}
	const back = await unzip(new Uint8Array(readFileSync(join(dir, 'out.zip'))));
	assert.equal(new TextDecoder().decode(back[0].bytes), 'hello hello hello hello hello');
});

test('unzip refuses what is not a zip', async () => {
	const { unzip } = await import('../src/zip');
	await assert.rejects(unzip(bytes('not a zip at all, just words')), /not a zip/i);
});
