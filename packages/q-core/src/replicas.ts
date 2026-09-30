/*
 * Copy locations — the same locked folder, kept in more than one place.
 *
 * Darren, 2026-09-16: "you then designate other copy locations. This may be a
 * local community node, or it may be your Google Drive, does not matter."
 *
 * A copy location is another folder you choose: a USB drive, a synced cloud
 * folder (Google Drive for desktop, iCloud Drive, Dropbox), a share on a
 * community node. It only ever holds LOCKED files, so wherever it is, nobody
 * there can read them — the worst a location can do is lose or withhold a copy,
 * which is why there can be several.
 *
 * Syncing copies what is missing, in both directions, and never overwrites:
 * locked files are named by their own hash, so the same name on both sides IS
 * the same file. The permission tokens in ucan/ (named by their CID) travel
 * the same way, so a revocation made on one device reaches the others.
 * Before copying, each file is checked against its name; one
 * that no longer matches is damaged, is not spread, and is reported. Each location carries a copy of
 * dostudy.json, and a location that belongs to another passkey is refused.
 *
 * Remembered per DID in IndexedDB; each location needs the browser's
 * permission, like the main folder.
 */
import { folderOwner, openDb, primaryHandle } from './folder';
import { folderChannel, syncChannels } from './storage-channels';

type Perm = 'granted' | 'denied' | 'prompt';
interface Dir extends FileSystemDirectoryHandle {
	queryPermission(o: { mode: 'readwrite' }): Promise<Perm>;
	requestPermission(o: { mode: 'readwrite' }): Promise<Perm>;
	values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
}

export interface Replica {
	id: string;
	name: string;
	added: string;
	lastSync?: string;
	state: 'ready' | 'asleep' | 'lost';
}

interface Stored {
	id: string;
	did: string;
	name: string;
	added: string;
	lastSync?: string;
	handle: Dir;
}

const MANIFEST = 'dostudy.json';
const READ_ME = 'READ ME.txt';

async function all(): Promise<Stored[]> {
	const d = await openDb();
	return new Promise((resolve) => {
		const req = d.transaction('replicas').objectStore('replicas').getAll();
		req.onsuccess = () => resolve((req.result as Stored[]) ?? []);
		req.onerror = () => resolve([]);
	});
}

async function put(r: Stored | null, id: string) {
	const d = await openDb();
	await new Promise<void>((resolve, reject) => {
		const tx = d.transaction('replicas', 'readwrite');
		if (r) tx.objectStore('replicas').put(r, id);
		else tx.objectStore('replicas').delete(id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

async function mine(): Promise<Stored[]> {
	const did = folderOwner();
	return did ? (await all()).filter((r) => r.did === did) : [];
}

async function readDid(d: FileSystemDirectoryHandle): Promise<string | null> {
	try {
		const f = await (await d.getFileHandle(MANIFEST)).getFile();
		return (JSON.parse(await f.text()) as { did?: string }).did ?? null;
	} catch {
		return null;
	}
}

export async function listReplicas(): Promise<Replica[]> {
	const out: Replica[] = [];
	for (const r of await mine()) {
		const perm = await r.handle.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt' as Perm);
		let state: Replica['state'] = perm === 'granted' ? 'ready' : 'asleep';
		if (state === 'ready') {
			const did = await readDid(r.handle);
			if (did && did !== r.did) state = 'lost';
		}
		out.push({ id: r.id, name: r.name, added: r.added, lastSync: r.lastSync, state });
	}
	return out.sort((a, b) => a.added.localeCompare(b.added));
}

export type ReplicaOutcome = { ok: true; name: string } | { ok: false; says: string; cancelled?: boolean };

/** Choose another folder to keep a copy in. Call from a click. */
export async function addReplica(): Promise<ReplicaOutcome> {
	const did = folderOwner();
	const main = primaryHandle();
	if (!did || !main) return { ok: false, says: 'Open your main folder first.' };
	let d: Dir;
	try {
		d = await (window as unknown as { showDirectoryPicker(o: object): Promise<Dir> }).showDirectoryPicker({
			id: 'q-replica',
			mode: 'readwrite'
		});
	} catch (e) {
		if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, cancelled: true, says: 'No folder was chosen.' };
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
	if (await d.isSameEntry(main)) return { ok: false, says: 'That is your main folder. Choose a different place.' };
	for (const r of await mine())
		if (await r.handle.isSameEntry(d).catch(() => false)) return { ok: false, says: 'That folder is already a copy location.' };
	const owner = await readDid(d);
	if (owner && owner !== did) return { ok: false, says: 'That folder belongs to a different passkey.' };
	const id = crypto.randomUUID();
	await put({ id, did, name: d.name, added: new Date().toISOString(), handle: d }, id);
	return { ok: true, name: d.name };
}

/** Allow a remembered copy location again. Call from a click. */
export async function allowReplica(id: string): Promise<boolean> {
	const r = (await mine()).find((x) => x.id === id);
	if (!r) return false;
	return (await r.handle.requestPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted';
}

/** Stop using a copy location. The folder and its files stay where they are. */
export async function removeReplica(id: string): Promise<void> {
	await put(null, id);
}

export interface SyncResult {
	sent: number;
	received: number;
	same: number;
	/** Files that no longer match their content name, and were not copied. */
	damaged: string[];
}

/**
 * Copy what is missing, both ways. Never overwrites. Now one storage channel
 * like any other (storage-channels.ts): the same rules for a USB drive, the
 * Dropbox folder on a Mac, or Google Drive — including the continuity
 * envelope, newer wins.
 */
export async function syncReplica(id: string): Promise<SyncResult> {
	const did = folderOwner();
	const main = primaryHandle();
	if (!did || !main) throw new Error('Open your main folder first.');
	const r = (await mine()).find((x) => x.id === id);
	if (!r) throw new Error('That copy location is not remembered.');
	if ((await r.handle.queryPermission({ mode: 'readwrite' })) !== 'granted') throw new Error(`Allow ${r.name} first.`);
	const out = await syncChannels(
		folderChannel(main, { id: 'vault', called: 'this vault', kind: 'this-browser' }),
		folderChannel(r.handle, { id: r.id, called: r.name }),
		did
	);
	await put({ ...r, lastSync: out.at }, id);
	return { sent: out.sent, received: out.received, same: out.same, damaged: [...out.damaged, ...out.failed] };
}

/**
 * Sync every copy location this browser may already write to — no prompts.
 * Run on a timer and when the page comes back into view; one that needs
 * allowing again is skipped and shows as asleep on /nodes.
 */
export async function syncAllQuietly(): Promise<{ id: string; name: string; result?: SyncResult; error?: string }[]> {
	const out: { id: string; name: string; result?: SyncResult; error?: string }[] = [];
	if (!folderOwner() || !primaryHandle()) return out;
	for (const r of await mine()) {
		const perm = await r.handle.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt' as Perm);
		if (perm !== 'granted') continue;
		try {
			out.push({ id: r.id, name: r.name, result: await syncReplica(r.id) });
		} catch (e) {
			out.push({ id: r.id, name: r.name, error: e instanceof Error ? e.message : String(e) });
		}
	}
	return out;
}
