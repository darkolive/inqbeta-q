/* What a message can carry (4 October 2026): pictures, files in pieces, links, places, cards. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attach, joinPieces, attachmentProblem, linkProblem, tidyLink, cleanName, isPiece, mapLink, INLINE_BYTES, MOST_FILE_BYTES, toBase64, fromBase64 } from '../src/attachments';

const bytes = (n: number, seed = 7) => {
	const b = new Uint8Array(new ArrayBuffer(n));
	for (let i = 0; i < n; i++) b[i] = (i * seed + (i >> 8)) & 255;
	return b;
};

test('a small file rides inside the message', async () => {
	const out = await attach('file', { name: 'note.txt', type: 'text/plain', bytes: bytes(1000) });
	assert.ok('attachment' in out);
	assert.equal(out.pieces.length, 0);
	assert.equal(out.attachment.bytes, 1000);
	assert.deepEqual(fromBase64(out.attachment.data!), bytes(1000));
	assert.equal(attachmentProblem(out.attachment), null);
});

test('a big file goes in pieces and joins back exactly, in any order', async () => {
	const file = bytes(INLINE_BYTES * 5 + 123, 13);
	const out = await attach('file', { name: 'report.pdf', type: 'application/pdf', bytes: file }, 300 * 1024);
	assert.ok('attachment' in out);
	assert.equal(out.attachment.data, undefined);
	assert.equal(out.attachment.pieces, out.pieces.length);
	assert.ok(out.pieces.every(isPiece));
	const shuffled = [...out.pieces].reverse();
	const joined = await joinPieces(shuffled);
	assert.ok(joined.ok);
	assert.deepEqual(joined.bytes, file);
	assert.equal(joined.name, 'report.pdf');
});

test('pieces still missing, or tampered with, are never joined into a file', async () => {
	const out = await attach('file', { name: 'a.bin', type: '', bytes: bytes(INLINE_BYTES * 3, 3) }, 200 * 1024);
	assert.ok('attachment' in out);
	const partial = await joinPieces(out.pieces.slice(1));
	assert.equal(partial.ok, false);
	const bad = out.pieces.map((p, i) => (i === 1 ? { ...p, data: toBase64(bytes(200 * 1024, 99)) } : p));
	const wrong = await joinPieces(bad);
	assert.equal(wrong.ok, false);
	assert.match(wrong.ok ? '' : wrong.says, /don’t match/);
});

test('too big, or empty, is said plainly', async () => {
	const big = await attach('file', { name: 'film.mov', type: 'video/quicktime', bytes: new Uint8Array(new ArrayBuffer(MOST_FILE_BYTES + 1)) });
	assert.ok('says' in big && /20\.0 MB/.test(big.says));
	const empty = await attach('file', { name: 'x', type: '', bytes: new Uint8Array(new ArrayBuffer(0)) });
	assert.ok('says' in empty);
});

test('links are web addresses only; typed ones get their https', () => {
	assert.equal(tidyLink('darkolive.co.uk/about'), 'https://darkolive.co.uk/about');
	assert.equal(linkProblem(tidyLink('darkolive.co.uk')), null);
	assert.ok(linkProblem('javascript:alert(1)'));
	assert.ok(linkProblem('data:text/html,hi'));
	assert.equal(attachmentProblem({ kind: 'link', url: 'https://inqbeta.com' }), null);
});

test('places: a pin, or words, and only on Earth', () => {
	assert.equal(attachmentProblem({ kind: 'place', lat: 51.48, lng: -3.18 }), null);
	assert.equal(attachmentProblem({ kind: 'place', label: 'The café by the station' }), null);
	assert.ok(attachmentProblem({ kind: 'place', lat: 120, lng: 0 }));
	assert.ok(attachmentProblem({ kind: 'place' }));
	assert.match(mapLink({ lat: 51.48, lng: -3.18 }), /openstreetmap\.org\/\?mlat=51\.48000&mlon=-3\.18000/);
});

test('names can’t climb out of a folder', () => {
	assert.equal(cleanName('../../etc/passwd'), 'passwd');
	assert.equal(cleanName('C:\\Users\\me\\photo.jpg'), 'photo.jpg');
	assert.equal(cleanName(''), 'file');
});
