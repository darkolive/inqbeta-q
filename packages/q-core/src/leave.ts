/*
 * Leave no trace — clear everything Q keeps in this browser.
 *
 * Darren, 27 September 2026: carry the vault on Google Drive, work in an
 * internet café, reconnect, work offline, then "destroy, go" — a GDPR tool
 * the person holds, not a request they send to somebody.
 *
 * It works because Q keeps nothing anywhere but here and the person's own
 * channels. The vault, the identity and every token live in this origin's
 * storage, so clearing the origin is the whole of it.
 *
 * WHAT IT CLEARS (this origin only): the browser-kept vault (OPFS), every
 * IndexedDB database (folder handles, the session, the offline queue),
 * localStorage and sessionStorage (the remembered DID, the continuity copy,
 * settings), every cache and the service worker, and every cookie a page can
 * see. A server call adds `Clear-Site-Data`, which also reaches what a page
 * cannot (HTTP-only cookies, the HTTP cache) in browsers that honour it.
 *
 * WHAT IT CANNOT CLEAR — said on screen, never hidden (`STAYS_BEHIND`): a
 * passkey saved to this computer's keychain, a backup downloaded here, and the
 * browser's own history. And a folder on disk is the person's folder: Q
 * forgets it, and never deletes it.
 *
 * Each step is independent and swallows its own failure: one store that will
 * not clear must not stop the rest. Idempotent, so a second pass (gone.html,
 * after every connection has closed) finishes whatever a first was blocked on.
 */

export const STAYS_BEHIND: { id: string; says: string }[] = [
	{ id: 'passkey', says: 'A passkey saved on this computer. In shared places, sign in with your phone or a security key instead, so none is saved here.' },
	{ id: 'downloads', says: 'Any backup you downloaded here. Delete it from Downloads yourself.' },
	{ id: 'history', says: 'The browser’s own history. Use a private window to leave none.' }
];

export interface LeaveReport {
	/** What was cleared, one word each, for a test or a log. */
	cleared: string[];
	/** Steps that failed and why. Never stops the rest. */
	failed: { step: string; why: string }[];
}

type Step = [string, () => Promise<void> | void];

async function clearFileSystem(): Promise<void> {
	const root = await navigator.storage?.getDirectory?.();
	if (!root) return;
	const names: string[] = [];
	for await (const [name] of (root as unknown as AsyncIterable<[string, unknown]>)) names.push(name);
	for (const name of names) await root.removeEntry(name, { recursive: true });
}

/** Known names too, for browsers without `indexedDB.databases()`. */
const KNOWN_DBS = ['dostudy'];

async function clearDatabases(extra: string[] = []): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	const listed = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((d) => d.name).filter((n): n is string => !!n) : [];
	const names = [...new Set([...listed, ...KNOWN_DBS, ...extra])];
	await Promise.all(
		names.map(
			(name) =>
				new Promise<void>((resolve) => {
					const req = indexedDB.deleteDatabase(name);
					req.onsuccess = req.onerror = () => resolve();
					/* An open connection blocks it; the delete finishes once the page
					 * closes it, and gone.html runs this again to be sure. */
					req.onblocked = () => setTimeout(resolve, 800);
				})
		)
	);
}

async function clearCaches(): Promise<void> {
	if (typeof caches === 'undefined') return;
	for (const k of await caches.keys()) await caches.delete(k);
}

async function clearServiceWorkers(): Promise<void> {
	const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
	for (const r of regs) await r.unregister();
}

function clearCookies(): void {
	if (typeof document === 'undefined') return;
	for (const c of document.cookie.split(';')) {
		const name = c.split('=')[0]?.trim();
		if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
	}
}

/**
 * Clear this browser. `signOut` drops the identity held in memory first;
 * `siteData` is an address that answers with `Clear-Site-Data`.
 */
export async function leaveNoTrace(opts: { signOut?: () => void; siteData?: string; databases?: string[] } = {}): Promise<LeaveReport> {
	const report: LeaveReport = { cleared: [], failed: [] };
	const steps: Step[] = [
		['identity', () => opts.signOut?.()],
		['files', clearFileSystem],
		['databases', () => clearDatabases(opts.databases)],
		['local', () => localStorage.clear()],
		['session', () => sessionStorage.clear()],
		['caches', clearCaches],
		['service-worker', clearServiceWorkers],
		['cookies', clearCookies],
		['site-data', async () => {
			if (opts.siteData) await fetch(opts.siteData, { method: 'POST', cache: 'no-store', credentials: 'same-origin' });
		}]
	];
	for (const [step, run] of steps) {
		try {
			await run();
			report.cleared.push(step);
		} catch (e) {
			report.failed.push({ step, why: e instanceof Error ? e.message : String(e) });
		}
	}
	return report;
}
