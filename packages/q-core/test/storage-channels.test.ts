/*
 * Storage channels (audit 2026-09-25, Phase 1): one shape, and the rules of
 * what moves.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdsEverything, memoryChannel, syncChannels } from '../src/storage-channels';
import { sha256Hex } from '../src/vault';
import { addWay, newRecoveryKey, removeWay } from '../src/continuity';
import { identityFromSeed } from '../src/passkey';

const enc = (s: string) => new TextEncoder().encode(s);
async function locked(text: string, dir = '') {
	const bytes = enc(text);
	return { path: `${dir}${await sha256Hex(bytes)}.dsv`, bytes };
}
const ME = 'did:key:z6MkMe';
const manifest = (did: string) => enc(JSON.stringify({ schema: 'dostudy.folder/1', did }));

test('what is missing is copied both ways, and nothing is overwritten', async () => {
	const here = memoryChannel('vault');
	const there = memoryChannel('Dropbox');
	const a = await locked('a');
	const b = await locked('b', 'sites/');
	const c = await locked('c');
	here.files.set(a.path, a.bytes);
	here.files.set(b.path, b.bytes);
	here.files.set('dostudy.json', manifest(ME));
	there.files.set(c.path, c.bytes);
	there.files.set(a.path, a.bytes);

	const r = await syncChannels(here, there, ME);
	assert.equal(r.sent, 1);
	assert.equal(r.received, 1);
	assert.equal(r.same, 1);
	assert.ok(there.files.has(b.path) && here.files.has(c.path));
	assert.ok(there.files.has('dostudy.json'));
	/* Again: nothing left to do. */
	const again = await syncChannels(here, there, ME);
	assert.equal(again.sent + again.received, 0);
});

test('a damaged file is reported and never spread', async () => {
	const here = memoryChannel('vault');
	const there = memoryChannel('Drive');
	const a = await locked('a');
	there.files.set(a.path, enc('not what the name says'));
	const r = await syncChannels(here, there, ME);
	assert.equal(r.received, 0);
	assert.equal(r.damaged.length, 1);
	assert.ok(!here.files.has(a.path));
});

test('a channel that belongs to another passkey is refused', async () => {
	const here = memoryChannel('vault');
	const there = memoryChannel('Someone else’s Dropbox');
	there.files.set('dostudy.json', manifest('did:key:z6MkOther'));
	await assert.rejects(() => syncChannels(here, there, ME), /different passkey/);
});

test('the newer continuity envelope wins on both sides — an old one never returns a removed way', async () => {
	const seed = crypto.getRandomValues(new Uint8Array(32));
	const me = await identityFromSeed(seed);
	const older = await addWay(me, seed, null, crypto.getRandomValues(new Uint8Array(32)), { kind: 'passkey', label: 'Lost phone' });
	await new Promise((r) => setTimeout(r, 5));
	const two = await addWay(me, seed, older, newRecoveryKey(), { kind: 'recovery', label: 'Card' });
	await new Promise((r) => setTimeout(r, 5));
	const newer = await removeWay(me, two, 0);

	const here = memoryChannel('vault');
	const there = memoryChannel('OneDrive');
	here.files.set('continuity.json', enc(JSON.stringify(newer)));
	there.files.set('continuity.json', enc(JSON.stringify(older)));
	await syncChannels(here, there, me.did);
	const onThere = JSON.parse(new TextDecoder().decode(there.files.get('continuity.json')!));
	assert.equal(onThere.signedAt, newer.signedAt);
	const onHere = JSON.parse(new TextDecoder().decode(here.files.get('continuity.json')!));
	assert.equal(onHere.signedAt, newer.signedAt);
});

test('many files go across several at a time, and afterwards the channel is asked whether it holds everything', async () => {
	const here = memoryChannel('vault');
	const there = memoryChannel('Drive');
	let live = 0;
	let most = 0;
	const put = there.put;
	there.put = async (p, b) => {
		live++;
		most = Math.max(most, live);
		await new Promise((r) => setTimeout(r, 2));
		await put(p, b);
		live--;
	};
	for (let i = 0; i < 20; i++) {
		const f = await locked(`file ${i}`);
		here.files.set(f.path, f.bytes);
	}
	assert.equal(await holdsEverything(here, there), false);
	const r = await syncChannels(here, there, ME);
	assert.equal(r.sent, 20);
	assert.ok(most > 1, 'more than one at a time');
	assert.ok(most <= 6, 'but not unbounded');
	assert.equal(await holdsEverything(here, there), true);
});
