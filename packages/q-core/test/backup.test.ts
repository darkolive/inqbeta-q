/*
 * A backup is proven, not assumed (ADR-Q-003; audit 2026-09-25).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_MANIFEST, backupOwner, buildManifest, checkBackup, makeBackup } from '../src/backup';
import { sha256Hex } from '../src/vault';
import { unzip, type ZipEntry } from '../src/zip';

const enc = (s: string) => new TextEncoder().encode(s);

async function locked(text: string, dir = ''): Promise<ZipEntry> {
	const bytes = enc(text);
	return { name: `${dir}${await sha256Hex(bytes)}.dsv`, bytes };
}

async function sample(): Promise<ZipEntry[]> {
	return [
		await locked('one'),
		await locked('two', 'sites/'),
		await locked('three', 'sites/darkolive.co.uk/posts/'),
		{ name: 'dostudy.json', bytes: enc('{"did":"did:key:z6Mk"}') }
	];
}

test('a backup is zipped, read back, and every member checks out before it is handed over', async () => {
	const made = await makeBackup(await sample(), 'did:key:z6Mk', '2026-09-25T10:00:00.000Z');
	assert.ok(made.ok);
	assert.equal(made.manifest.members.length, 4);
	assert.equal(made.check.files, 4);
	assert.equal(made.check.root, made.manifest.root);
	const names = (await unzip(made.bytes)).map((e) => e.name);
	assert.ok(names.includes(BACKUP_MANIFEST));
});

test('the root is the same for the same files in any order', async () => {
	const files = await sample();
	const a = await buildManifest(files, 'did:key:z6Mk', '2026-09-25T10:00:00.000Z');
	const b = await buildManifest([...files].reverse(), 'did:key:z6Mk', '2026-09-25T10:00:00.000Z');
	assert.equal(a.root, b.root);
});

test('a file missing from the archive is noticed', async () => {
	const made = await makeBackup(await sample(), null);
	assert.ok(made.ok);
	const back = (await unzip(made.bytes)).filter((e) => !e.name.startsWith('sites/'));
	const check = await checkBackup(back);
	assert.equal(check.ok, false);
	assert.equal(check.missing.length, 2);
});

test('a changed byte is damage, whether or not the file is content-named', async () => {
	const made = await makeBackup(await sample(), null);
	assert.ok(made.ok);
	const back = await unzip(made.bytes);
	const bent = back.map((e) => (e.name === 'dostudy.json' ? { ...e, bytes: enc('{"did":"did:key:other"}') } : e));
	const check = await checkBackup(bent);
	assert.equal(check.ok, false);
	assert.deepEqual(check.damaged, ['dostudy.json']);
});

test('a manifest edited after the fact is refused', async () => {
	const made = await makeBackup(await sample(), null);
	assert.ok(made.ok);
	const back = await unzip(made.bytes);
	const edited = back.map((e) => {
		if (e.name !== BACKUP_MANIFEST) return e;
		const m = JSON.parse(new TextDecoder().decode(e.bytes));
		m.members.pop();
		return { ...e, bytes: enc(JSON.stringify(m)) };
	});
	const check = await checkBackup(edited);
	assert.equal(check.ok, false);
	assert.match(check.says, /changed since it was made/);
});

test('an older backup with no manifest still has its content names checked', async () => {
	const files = await sample();
	assert.equal((await checkBackup(files)).ok, true);
	const bad = files.map((e, i) => (i === 0 ? { ...e, bytes: enc('not one') } : e));
	const check = await checkBackup(bad);
	assert.equal(check.ok, false);
	assert.equal(check.root, null);
});

test('a backup says whose it is before anything is unlocked', async () => {
	const made = await makeBackup(await sample(), 'did:key:z6MkOwner');
	assert.ok(made.ok);
	assert.equal(backupOwner(await unzip(made.bytes)), 'did:key:z6MkOwner');
	/* an older backup: no manifest, but the vault's own dostudy.json names it */
	assert.equal(backupOwner(await sample()), 'did:key:z6Mk');
	assert.equal(backupOwner([await locked('alone')]), null);
});

test('the continuity envelope also says whose a backup is', () => {
	const env = { name: 'continuity.json', bytes: enc(JSON.stringify({ schema: 'inqbeta.continuity/1', did: 'did:key:z6MkCont' })) };
	assert.equal(backupOwner([env]), 'did:key:z6MkCont');
});
