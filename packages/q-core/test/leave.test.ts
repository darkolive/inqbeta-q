/*
 * Leave no trace. Every store is cleared, one failure never stops the rest,
 * and what cannot be cleared is said, not hidden.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveNoTrace, STAYS_BEHIND } from '../src/leave';

const store = () => {
	const m = new Map<string, string>([['q-remember', 'did:key:x']]);
	return { clear: () => m.clear(), get size() { return m.size; } };
};

test('clears every store, and keeps going past one that fails', async () => {
	const g = globalThis as Record<string, unknown>;
	const local = store();
	const session = store();
	const deleted: string[] = [];
	const removed: string[] = [];
	let signedOut = false;
	g.localStorage = local;
	g.sessionStorage = session;
	g.indexedDB = {
		databases: async () => [{ name: 'q-session' }],
		deleteDatabase: (name: string) => {
			deleted.push(name);
			const req: Record<string, unknown> = {};
			queueMicrotask(() => (req.onsuccess as () => void)?.());
			return req;
		}
	};
	g.caches = { keys: async () => { throw new Error('no caches here'); }, delete: async () => true };
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: {
			storage: {
				getDirectory: async () => ({
					async *[Symbol.asyncIterator]() { yield ['q', {}]; },
					removeEntry: async (n: string) => { removed.push(n); }
				})
			}
		}
	});

	const r = await leaveNoTrace({ signOut: () => (signedOut = true) });

	assert.equal(signedOut, true);
	assert.equal(local.size, 0);
	assert.equal(session.size, 0);
	assert.deepEqual(removed, ['q']);
	assert.deepEqual(deleted.sort(), ['dostudy', 'q-session']);
	assert.deepEqual(r.failed.map((f) => f.step), ['caches']);
	assert.ok(r.cleared.includes('service-worker') && r.cleared.includes('cookies'), 'later steps still ran');
	for (const k of ['localStorage', 'sessionStorage', 'indexedDB', 'caches']) delete g[k];
});

test('what stays behind is said plainly', () => {
	assert.deepEqual(STAYS_BEHIND.map((s) => s.id), ['passkey', 'downloads', 'history']);
	for (const s of STAYS_BEHIND) assert.ok(s.says.endsWith('.'));
});
