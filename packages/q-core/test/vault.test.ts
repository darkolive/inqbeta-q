import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { lockBytes, unlockBytes, looksLocked, randomName, makeCheck, passesCheck, README, contentName, contentAddress, isContentName, matchesName } from '../src/vault';

const seed = new Uint8Array(32).map((_, i) => i * 3 + 5);

test('on disk, a locked file says nothing', async () => {
	const me = await identityFromSeed(seed);
	const locked = await lockBytes(me.vault, { name: 'budget-notes.md', path: 'files', type: 'text/markdown' }, new TextEncoder().encode('carnival float budget'));
	const asText = new TextDecoder('latin1').decode(locked);
	for (const leak of ['budget', 'carnival', '.md', 'markdown', 'files']) assert.ok(!asText.includes(leak), leak);
	assert.ok(looksLocked(locked));
	assert.ok(!looksLocked(new TextEncoder().encode('{"just":"json"}')));
	assert.match(randomName(), /^[0-9a-f]{24}\.dsv$/);
	assert.match(README, /cannot be\s+opened from this folder/);
});

test('the same passkey rebuilds the key; another cannot; tampering is caught', async () => {
	const me = await identityFromSeed(seed);
	const again = await identityFromSeed(seed.slice());
	const other = await identityFromSeed(new Uint8Array(32).fill(9));
	const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
	const locked = await lockBytes(me.vault, { name: 'float.png', path: 'files', type: 'image/png' }, image);

	const back = await unlockBytes(again.vault, locked);
	assert.deepEqual([...back.data], [...image]);
	assert.equal(back.meta.name, 'float.png');
	assert.equal(back.meta.size, image.length);

	await assert.rejects(unlockBytes(other.vault, locked));
	const bent = locked.slice();
	bent[bent.length - 2] ^= 1;
	await assert.rejects(unlockBytes(me.vault, bent));

	const check = await makeCheck(me.vault);
	assert.ok(await passesCheck(again.vault, check));
	assert.ok(!(await passesCheck(other.vault, check)));
	await assert.rejects(crypto.subtle.exportKey('raw', me.vault));
});

test('a locked file is named by its own hash, and can be checked against it', async () => {
	const me = await identityFromSeed(seed);
	const locked = await lockBytes(me.vault, { name: 'plan.md', path: '', type: 'text/markdown' }, new TextEncoder().encode('# plan'));
	const name = await contentName(locked);
	assert.match(name, /^[0-9a-f]{64}\.dsv$/);
	assert.ok(isContentName(name));
	assert.equal(await contentAddress(locked), `content://sha256/${name.slice(0, 64)}`);
	assert.equal(await matchesName(name, locked), true);

	const bent = locked.slice();
	bent[20] ^= 1;
	assert.equal(await matchesName(name, bent), false, 'a changed file no longer matches its name');
	assert.equal(await matchesName(randomName(), locked), null, 'old random names are not checked');
	assert.equal(await matchesName('my typed name.dsv', locked), null);

	// the same plaintext locked twice gets two names (a fresh IV each time)
	const again = await lockBytes(me.vault, { name: 'plan.md', path: '', type: 'text/markdown' }, new TextEncoder().encode('# plan'));
	assert.notEqual(await contentName(again), name);
});

test('a content name is also a CID, with the same digest', async () => {
	const { contentName, contentCid, cidForName } = await import('../src/vault');
	const bytes = new TextEncoder().encode('locked bytes stand-in');
	const name = await contentName(bytes);
	const cid = await contentCid(bytes);
	assert.match(cid, /^bafkrei/);
	assert.equal(cidForName(name), cid);
	assert.equal(cidForName('notes.txt'), null);
});
