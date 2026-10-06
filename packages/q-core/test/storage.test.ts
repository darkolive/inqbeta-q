/*
 * The test that stops this happening again.
 *
 * Signing out once cleared the remembered DID and left a person's address book
 * behind, because each module reached for localStorage on its own and nothing
 * could say what "everything" was. So this reads the source and fails if any
 * key is written anywhere without being declared in storage.ts.
 *
 * A key nobody remembered to clear can no longer be added quietly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STORED_KEYS, clearIdentityStorage, identityKeys } from '../src/storage';

const ROOTS = [
	join(import.meta.dirname, '..', 'src'),
	join(import.meta.dirname, '..', '..', '..', 'apps', 'q', 'src')
];

function sources(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			if (name === 'node_modules' || name === '.svelte-kit') continue;
			out.push(...sources(path));
		} else if (/\.(ts|svelte)$/.test(name)) {
			out.push(path);
		}
	}
	return out;
}

/** Keys written anywhere in the source, with where each was found. */
function written(): Map<string, string[]> {
	const found = new Map<string, string[]>();
	const pattern = /(?:local|session)Storage\.(?:setItem|removeItem|getItem)\(\s*'([^']+)'/g;
	for (const root of ROOTS) {
		for (const file of sources(root)) {
			const text = readFileSync(file, 'utf8');
			for (const m of text.matchAll(pattern)) {
				const where = found.get(m[1]) ?? [];
				where.push(file.replace(/.*inqbeta-q\//, ''));
				found.set(m[1], where);
			}
		}
	}
	return found;
}

test('every key the source touches is declared in storage.ts', () => {
	const declared = new Set(STORED_KEYS.map((k) => k.key));
	const undeclared = [...written()].filter(([key]) => !declared.has(key));
	assert.deepEqual(
		undeclared.map(([key, where]) => `${key} (${where.join(', ')})`),
		[],
		'a key is read or written somewhere without being declared in storage.ts — add it, and say whether it belongs to the identity or to the device'
	);
});

test('nothing is declared twice, and every declaration says what it holds', () => {
	const seen = new Set<string>();
	for (const k of STORED_KEYS) {
		assert.ok(!seen.has(k.key), `${k.key} is declared twice`);
		seen.add(k.key);
		assert.ok(k.holds.trim(), `${k.key} does not say what it holds`);
		assert.ok(k.kind === 'identity' || k.kind === 'device', `${k.key} has no kind`);
	}
});

test('the things that belong to a person are the things sign-out clears', () => {
	const cleared = new Set(identityKeys().map((k) => k.key));

	/* Named one by one rather than counted, so adding a key to the registry
	 * without thinking about this list is a failing test rather than a silent
	 * change of behaviour. */
	for (const key of [
		'dostudy-passkey-did',
		'inqbeta-address-book',
		'inqbeta-session',
		'inqbeta-second-factor',
		'inqbeta-second-factor-pending',
		'inqbeta-zk-2fa',
		'inqbeta-zk-pending',
		'q.announcements.read',
		'q.notify'
	]) {
		assert.ok(cleared.has(key), `${key} should be cleared when somebody signs out`);
	}

	/* And the two that must survive, or signing out punishes the next person. */
	for (const key of ['q-key-place', 'inqbeta-q-mode']) {
		assert.ok(!cleared.has(key), `${key} is how the browser is set up and should survive sign-out`);
	}
});

test('clearing works, and a browser that refuses one key still loses the rest', () => {
	const store = new Map<string, string>();
	let refusals = 0;
	const fake = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => {
			if (k === 'inqbeta-session' && refusals++ === 0) throw new Error('blocked');
			store.delete(k);
		},
		get length() {
			return store.size;
		},
		key: (i: number) => [...store.keys()][i] ?? null
	};
	const g = globalThis as unknown as { localStorage?: unknown; sessionStorage?: unknown };
	const hadLocal = g.localStorage;
	const hadSession = g.sessionStorage;
	g.localStorage = fake;
	g.sessionStorage = fake;

	try {
		for (const k of STORED_KEYS) store.set(k.key, 'something');
		store.set('q:battery-said:did:key:zAna:did:key:zMint', '2');
		clearIdentityStorage();
		assert.ok(![...store.keys()].some((k) => k.startsWith('q:battery-said:')), 'keys declared by prefix go too');

		for (const k of identityKeys()) {
			if (k.key === 'inqbeta-session') continue; // the one that refused
			assert.ok(!store.has(k.key), `${k.key} survived a sign-out`);
		}
		assert.ok(store.has('q-key-place'), 'a device preference was cleared');
		assert.ok(store.has('inqbeta-q-mode'), 'a device preference was cleared');
	} finally {
		g.localStorage = hadLocal;
		g.sessionStorage = hadSession;
	}
});
