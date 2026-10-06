/*
 * Your DoStudy folder.
 *
 * Darren, 2026-09-16: "a folder exists somewhere, either in your downloads or
 * wherever it is, that becomes the storage folder for things that you're going
 * to work with. So this may be images, files, MD files, whatever it may be."
 *
 * WHAT IT IS. A real folder on the person's computer, chosen once, that the
 * site can read and write — the File System Access API. Receipts, sealed notes
 * and reads are saved into it instead of dropping into Downloads, and the Read
 * and Verify tabs can open from it without a drag.
 *
 * WHOSE IT IS. A small `dostudy.json` inside names the DID it belongs to. The
 * folder is remembered PER DID (in IndexedDB, which can hold the handle), and
 * checked against that file each time it is woken, so a folder made with one
 * passkey is never quietly used by another. Nothing about the folder leaves
 * the machine; the browser only ever hands the page a handle.
 *
 * THE BROWSER ASKS, NOT US. A remembered folder comes back "asleep": the page
 * may not touch it until the person allows it again with a tap (recent Chrome
 * offers "allow on every visit", which skips that). The picker cannot be
 * opened, and a folder cannot be made, without them.
 *
 * WHERE IT WORKS. Chrome and Edge on a computer offer a real folder. Safari
 * (Mac, iPhone, iPad) and Firefox do not — so there, since 2026-09-17, the
 * folder is kept in the browser's own private file system (OPFS) instead:
 * the same locked files, the same layout, the same manifest, but inside the
 * browser rather than in Finder. It needs no picker and no permission; the
 * page says plainly where it is, and "Save a readable copy" / "Add files" are
 * the ways in and out. Where neither exists, saving falls back to a download.
 *
 * Safari may clear a site's storage after weeks without a visit unless the
 * site is added to the Dock / Home Screen; Q asks the browser to keep it
 * (navigator.storage.persist) and says so on the page.
 */
import { browserFilesSupported, children, writeFile, writeIn } from './fsx';
import type { Proof } from './places';
import { current, remembered, watch as watchIdentity } from './passkey';
import { README, VAULT_EXT, contentName, isContentName, looksLocked, lockBytes, makeCheck, matchesName, passesCheck, unlockBytes, type VaultMeta } from './vault';
import { unzip } from './zip';
import { BACKUP_MANIFEST, backupOwner, checkBackup, makeBackup, type BackupCheck } from './backup';
import { seal } from './seal';
import { CONTINUITY_FILE, keepEnvelope, rememberEnvelope, type Envelope } from './continuity';
import { thisBrowser } from './browser';

export const FOLDER_SCHEMA = 'dostudy.folder/1';
/** Kept in step with ucan/store.ts (not imported, to keep the two independent). */
const UCAN_FOLDER = 'ucan';
const MANIFEST = 'dostudy.json';

/* How deep every walk over the vault goes. One number, so the ledger, the
 * backup and a copy location can never disagree about what the vault holds. */
export const VAULT_DEPTH = 4;
const READ_ME = 'READ ME.txt';

export type FolderState =
	/** Not looked yet. */
	| { kind: 'checking' }
	| { kind: 'unsupported' }
	/** No passkey to key the folder by. */
	| { kind: 'no-identity' }
	| { kind: 'none' }
	/** Remembered, waiting for a tap to allow it again. */
	| { kind: 'asleep'; name: string }
	/** `inBrowser`: kept in the browser's private file system, not a folder on disk. */
	| { kind: 'ready'; name: string; inBrowser?: boolean }
	/** Remembered, but moved, deleted, or no longer this passkey's. */
	| { kind: 'lost'; name: string; says: string };

/* The File System Access parts TypeScript's DOM types do not carry yet. */
type Perm = 'granted' | 'denied' | 'prompt';
interface Dir extends FileSystemDirectoryHandle {
	queryPermission(o: { mode: 'readwrite' }): Promise<Perm>;
	requestPermission(o: { mode: 'readwrite' }): Promise<Perm>;
}
type Picker = (o: { id?: string; mode?: 'readwrite'; startIn?: string | FileSystemHandle }) => Promise<Dir>;

/** A real folder on disk can be chosen (Chrome, Edge). */
export function folderSupported(): boolean {
	return typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker === 'function';
}

/** Where the folder lives in this browser: on disk, inside the browser, or nowhere. */
export function folderPlace(): 'disk' | 'browser' | 'none' {
	return folderSupported() ? 'disk' : browserFilesSupported() ? 'browser' : 'none';
}

/** The name shown for a folder kept inside the browser. */
export const IN_BROWSER_NAME = 'Kept in this browser';

/* The browser-kept folder for a DID: <OPFS>/q/<did>. Made when first asked for. */
async function browserFolder(did: string): Promise<Dir> {
	const root = await navigator.storage.getDirectory();
	const q = await root.getDirectoryHandle('q', { create: true });
	return (await q.getDirectoryHandle(did.replace(/[^A-Za-z0-9_-]/g, '_'), { create: true })) as Dir;
}

/* ------------------------------------------------------------------ *
 * Remembering the handle — IndexedDB, keyed by DID
 * ------------------------------------------------------------------ */

/* 'folders': the main folder per DID. 'replicas': other copy locations (replicas.ts). */
export function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('dostudy', 2);
		req.onupgradeneeded = () => {
			for (const store of ['folders', 'replicas'])
				if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function stored(did: string): Promise<Dir | null> {
	try {
		const d = await openDb();
		return await new Promise((resolve) => {
			const req = d.transaction('folders').objectStore('folders').get(did);
			req.onsuccess = () => resolve((req.result as Dir | undefined) ?? null);
			req.onerror = () => resolve(null);
		});
	} catch {
		return null;
	}
}

async function store(did: string, dir: Dir | null): Promise<void> {
	const d = await openDb();
	await new Promise<void>((resolve, reject) => {
		const tx = d.transaction('folders', 'readwrite');
		if (dir) tx.objectStore('folders').put(dir, did);
		else tx.objectStore('folders').delete(did);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

let state: FolderState = { kind: 'checking' };
let dir: Dir | null = null;
const listeners = new Set<(s: FolderState) => void>();

function set(next: FolderState, handle: Dir | null = null) {
	state = next;
	dir = next.kind === 'ready' ? handle : null;
	for (const fn of listeners) fn(state);
}

/** The open main folder, for replicas.ts. Null unless ready. */
export function primaryHandle(): FileSystemDirectoryHandle | null {
	return dir;
}

/** The DID the folder is kept for — signed in, or remembered. */
export function folderOwner(): string | null {
	return whose();
}

export function folderState(): FolderState {
	return state;
}

/** Called now, and whenever the folder's state changes. Starts the first look. */
export function watchFolder(fn: (s: FolderState) => void): () => void {
	listeners.add(fn);
	fn(state);
	if (!started) start();
	return () => listeners.delete(fn);
}

let started = false;
function start() {
	started = true;
	/* A different passkey means a different folder. */
	watchIdentity(() => void refresh());
}

function whose(): string | null {
	return current()?.did ?? remembered();
}

interface Manifest {
	schema?: string;
	did?: string;
	made?: string;
	locked?: boolean;
	/** A phrase sealed with the vault key — see vault.ts. */
	check?: string;
	note?: string;
}

async function readManifest(d: Dir): Promise<Manifest | null> {
	try {
		const f = await (await d.getFileHandle(MANIFEST)).getFile();
		return JSON.parse(await f.text());
	} catch (e) {
		if (e instanceof DOMException && e.name === 'NotFoundError') return null;
		throw e;
	}
}

async function writeText(d: FileSystemDirectoryHandle, name: string, text: string | Blob) {
	await writeIn(d, name, text);
}

/**
 * Check a folder that has been allowed: still there, still this passkey's.
 * When the keys are unlocked, also that the vault key is the one it was locked
 * with, and fill in the lock details on a folder made before the keys were.
 */
async function confirm(d: Dir, did: string): Promise<FolderState> {
	try {
		const m = await readManifest(d);
		if (m && m.did && m.did !== did)
			return { kind: 'lost', name: d.name, says: 'That folder belongs to a different passkey.' };
		const id = current();
		const key = id && id.did === did ? id.vault : null;
		if (key && m?.check && !(await passesCheck(key, m.check)))
			return { kind: 'lost', name: d.name, says: 'That folder does not open with this passkey.' };
		if (!m || (key && !m.check)) {
			await writeText(d, MANIFEST, await manifestFor(did, m?.made));
			await writeText(d, READ_ME, README);
		}
		return { kind: 'ready', name: d.name };
	} catch {
		return {
			kind: 'lost',
			name: d.name,
			says: 'That folder could not be found. It may have been moved, renamed or deleted.'
		};
	}
}

async function manifestFor(did: string, made?: string): Promise<string> {
	const id = current();
	const m: Manifest = {
		schema: FOLDER_SCHEMA,
		did,
		made: made ?? new Date().toISOString(),
		locked: true,
		note: 'A locked DoStudy folder. Everything in it is encrypted to the passkey named above. See READ ME.txt.'
	};
	if (id && id.did === did) m.check = await makeCheck(id.vault);
	return JSON.stringify(m, null, '\t');
}

let persistAsked = false;

/** Look again, without asking the person anything. */
export async function refresh(): Promise<FolderState> {
	const place = folderPlace();
	if (place === 'none') {
		set({ kind: 'unsupported' });
		return state;
	}
	const did = whose();
	if (!did) {
		set({ kind: 'no-identity' });
		return state;
	}
	if (place === 'browser') {
		try {
			const d = await browserFolder(did);
			if (!persistAsked) {
				persistAsked = true;
				void navigator.storage.persist?.().catch(() => false);
			}
			const next = await confirm(d, did);
			set(
				next.kind === 'ready'
					? { ...next, name: IN_BROWSER_NAME, inBrowser: true }
					: next.kind === 'lost'
						? { ...next, name: IN_BROWSER_NAME }
						: next,
				d
			);
		} catch (e) {
			set({ kind: 'lost', name: IN_BROWSER_NAME, says: `This browser would not open its own storage: ${e instanceof Error ? e.message : String(e)}` });
		}
		return state;
	}
	const d = await stored(did);
	if (!d) {
		set({ kind: 'none' });
		return state;
	}
	const perm = await d.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt' as Perm);
	if (perm !== 'granted') {
		set({ kind: 'asleep', name: d.name });
		return state;
	}
	const next = await confirm(d, did);
	set(next, d);
	return state;
}

export type FolderOutcome = { ok: true; name: string } | { ok: false; says: string; cancelled?: boolean };

/* ------------------------------------------------------------------ *
 * Opening and closing a vault, where the browser cannot hold one
 * ------------------------------------------------------------------ */

/*
 * Darren, 2026-09-19: "the storage question is, where is your vault? And if you
 * can't answer that question, then you can't proceed, because receipts just
 * disappear and then they're gone."
 *
 * On a browser with no folder picker, the honest answer is that the vault is a
 * folder on disk and the browser is a cache of it. You open the vault, work,
 * and close it — like a physical one.
 *
 * OPENING uses the one thing Safari does give: <input type="file"
 * webkitdirectory>, which hands over every file under a folder to read. It
 * cannot write back and it cannot be remembered, which is why this is a copy in
 * and a copy out rather than a live folder.
 *
 * It works because every locked file is named by its own hash. Re-opening the
 * same vault writes the same names over the same bytes, so opening twice is the
 * same as opening once, and two vaults merge by union with nothing to resolve.
 */

/* continuity.json (ADR-Q-005) travels with the vault: it is how you get back
 * in when a passkey is gone, so every backup and copy must carry it. */
const MANIFEST_NAMES = new Set([MANIFEST, READ_ME, CONTINUITY_FILE]);

/** Is this a file a vault carries? Locked receipts, and the two that explain them. */
export function belongsInVault(name: string): boolean {
	return isContentName(name) || name.endsWith(VAULT_EXT) || MANIFEST_NAMES.has(name);
}

export interface VaultOpened {
	/** Files written into the working copy. */
	added: number;
	/** Files that were already there, byte for byte. */
	already: number;
	/** Files passed over because a vault does not carry them. */
	ignored: number;
	/** Files left out because they did not match their backup's list or their own name. */
	damaged: number;
	/** Files the backup's list names that were not in it. */
	missing: number;
	/** What checking a backup zip found, in a line. Absent for a folder. */
	checked?: string;
}

/**
 * Read a vault in from a folder the person chose.
 *
 * Takes what a file input hands over. Nothing here needs the folder again
 * afterwards, which is the point: the browser cannot keep it, so it does not
 * try.
 */
export async function openVaultFrom(files: ArrayLike<File>): Promise<{ ok: true; opened: VaultOpened } | { ok: false; says: string }> {
	if (!dir) return { ok: false, says: 'There is nowhere to open it into yet. Sign in first.' };

	/* A backup zip, or a folder (a backup someone unzipped). Both become the
	 * same list of paths inside the vault. */
	const entries: { path: string; bytes: () => Promise<Uint8Array> }[] = [];
	const skip = new Set<string>();
	let check: BackupCheck | null = null;
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		if (/\.zip$/i.test(file.name)) {
			try {
				const inside = await unzip(new Uint8Array(await file.arrayBuffer()));
				const strip = commonTop(inside.map((e) => e.name));
				/* Check the backup against its own list before any of it goes in.
				 * Damaged files are left out; everything whole is restored. */
				check = await checkBackup(strip ? inside.map((e) => ({ ...e, name: e.name.slice(strip.length + 1) })) : inside);
				for (const d of check.damaged) skip.add(d);
				for (const e of inside) {
					const b = e.bytes;
					entries.push({ path: strip ? e.name.slice(strip.length + 1) : e.name, bytes: async () => b });
				}
			} catch (e) {
				return { ok: false, says: e instanceof Error ? e.message : String(e) };
			}
			continue;
		}
		const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
		entries.push({ path: rel.includes('/') ? rel.split('/').slice(1).join('/') : rel, bytes: async () => new Uint8Array(await file.arrayBuffer()) });
	}

	/* Passkey first, always: the backup must belong to the DID that is signed
	 * in, or none of it goes in. A zip names its owner in the clear (backup.json,
	 * or dostudy.json in older ones), so this is known before anything opens. */
	const me = current()?.did ?? null;
	if (!me) return { ok: false, says: 'Sign in with your passkey first, then open the backup.' };
	const named: { name: string; bytes: Uint8Array }[] = [];
	for (const e of entries) {
		if (e.path === BACKUP_MANIFEST || e.path === MANIFEST || e.path === CONTINUITY_FILE) named.push({ name: e.path, bytes: await e.bytes() });
	}
	const owner = backupOwner(named);
	if (owner && owner !== me) {
		return {
			ok: false,
			says: `This backup belongs to a different passkey (…${owner.slice(-8)}). You are signed in as …${me.slice(-8)}. Sign in with the passkey it was made with, then open it again.`
		};
	}

	const opened: VaultOpened = {
		added: 0,
		already: 0,
		ignored: 0,
		damaged: skip.size,
		missing: check?.missing.length ?? 0,
		...(check ? { checked: check.says } : {})
	};
	for (const e of entries) {
		if (e.path === BACKUP_MANIFEST || skip.has(e.path)) continue;
		const parts = e.path.split('/').filter(Boolean);
		const name = parts[parts.length - 1];
		if (!name || parts.some((p) => p === '..' || p === '.' || p.startsWith('.')) || !belongsInBackup(parts)) {
			opened.ignored++;
			continue;
		}
		let parent: FileSystemDirectoryHandle = dir;
		for (const p of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(p, { create: true });
		/* A content-named file that is already here with the same name IS the
		 * same file — that is what a content name means. Nothing to write. */
		/* The continuity envelope: the one signed later stands, so an old backup
		 * never brings back a way in that was taken out (continuity.keepEnvelope). */
		if (e.path === CONTINUITY_FILE && (await has(parent as Dir, name))) {
			let existing: unknown = null;
			try {
				existing = JSON.parse(await (await (await parent.getFileHandle(name)).getFile()).text());
			} catch {
				existing = null;
			}
			let incoming: unknown = null;
			try {
				incoming = JSON.parse(new TextDecoder().decode(await e.bytes()));
			} catch {
				incoming = null;
			}
			if ((await keepEnvelope(existing, incoming, me)) === 'existing') {
				opened.already++;
				continue;
			}
		}
		if ((isContentName(name) || name.endsWith('.ucan')) && (await has(parent as Dir, name))) {
			opened.already++;
			continue;
		}
		await writeText(parent, name, new Blob([(await e.bytes()) as BlobPart]));
		opened.added++;
		/* Keep this browser's copy of the envelope current too, so a way-in
		 * passkey can sign in here next time without the backup. */
		if (e.path === CONTINUITY_FILE) {
			try {
				await rememberEnvelope(JSON.parse(new TextDecoder().decode(await e.bytes())) as Envelope);
			} catch {
				/* the vault has it; the browser copy is a convenience */
			}
		}
	}
	await refresh();
	return { ok: true, opened };
}

/**
 * Whether this browser's working copy holds nothing yet — a new browser, or
 * one Safari has cleared. Q uses it to offer "open your vault from a backup"
 * straight after the passkey, instead of an empty dashboard.
 */
export async function isEmpty(): Promise<boolean> {
	if (!dir) return true;
	async function any(d: FileSystemDirectoryHandle, depth: number): Promise<boolean> {
		for await (const h of children(d)) {
			if (h.name.startsWith('.')) continue;
			if (h.kind === 'directory') {
				if (depth < VAULT_DEPTH && (await any(h as FileSystemDirectoryHandle, depth + 1))) return true;
				continue;
			}
			if (h.name === MANIFEST || h.name === READ_ME) continue;
			if (h.name.endsWith(VAULT_EXT) || h.name.endsWith('.ucan')) return true;
		}
		return false;
	}
	return !(await any(dir, 0));
}

/** The continuity envelope at the top of the vault (ADR-Q-005), parsed, or null. */
export async function readContinuity(): Promise<unknown | null> {
	if (!dir) return null;
	try {
		return JSON.parse(await (await (await dir.getFileHandle(CONTINUITY_FILE)).getFile()).text());
	} catch {
		return null;
	}
}

/** Write the continuity envelope. Plain JSON: it must be readable before anything is unlocked. */
export async function writeContinuity(envelope: object): Promise<void> {
	if (!dir) throw new Error('Open your vault first.');
	await writeText(dir, CONTINUITY_FILE, JSON.stringify(envelope, null, '\t'));
}

/** Restore from a backup zip or folder. The same as opening a vault. */
export const restoreVault = openVaultFrom;

/* A zip made by zipping a folder has that folder as every entry's first part.
 * Returns it, to be taken off, or null when entries sit at the top already. */
function commonTop(names: string[]): string | null {
	if (!names.length || names.some((n) => !n.includes('/'))) return null;
	const first = names[0].split('/')[0];
	if (first === UCAN_FOLDER) return null;
	return names.every((n) => n.split('/')[0] === first) ? first : null;
}

/* What a backup carries: the manifest, locked files, UCAN tokens, and anything
 * saved into a subfolder. Nothing starting with a dot. */
function belongsInBackup(parts: string[]): boolean {
	const name = parts[parts.length - 1];
	/* An office's papers are the federation's, synced to its own storage: never in your personal backup (ADR-Q-038). */
	if (parts[0] === OFFICE_SHELF) return false;
	if (parts[0] === UCAN_FOLDER) return name.endsWith('.ucan');
	if (parts.length === 1) return belongsInVault(name);
	return true;
}

async function has(d: Dir, name: string): Promise<boolean> {
	try {
		await d.getFileHandle(name);
		return true;
	} catch {
		return false;
	}
}

export interface VaultExport {
	/** A name to save it under. */
	name: string;
	bytes: Uint8Array;
	files: number;
	/** The backup manifest's root — what a copy receipt names. */
	root: string;
}

/**
 * Everything in the working copy, as one archive to put back in the vault.
 *
 * A full snapshot every time, not a delta. Content names make that safe —
 * putting it back replaces each file with itself — and a delta is a promise
 * about what is already elsewhere, which is exactly the promise this browser
 * cannot keep.
 */
export async function closeVault(): Promise<{ ok: true; taken: VaultExport } | { ok: false; says: string }> {
	if (!dir) return { ok: false, says: 'No vault is open.' };
	const entries: { name: string; bytes: Uint8Array; at: Date }[] = [];
	async function walk(d: FileSystemDirectoryHandle, prefix: string, depth: number) {
		for await (const h of children(d)) {
			if (h.name.startsWith('.')) continue;
			if (h.kind === 'directory') {
				if (depth < VAULT_DEPTH) await walk(h as FileSystemDirectoryHandle, `${prefix}${h.name}/`, depth + 1);
				continue;
			}
			const parts = (prefix + h.name).split('/');
			if (!belongsInBackup(parts)) continue;
			const file = await (h as FileSystemFileHandle).getFile();
			entries.push({ name: prefix + h.name, bytes: new Uint8Array(await file.arrayBuffer()), at: new Date(file.lastModified) });
		}
	}
	await walk(dir, '', 0);
	const did = whose();
	const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
	/* Zipped with its list of contents, read back and checked before anything
	 * leaves (backup.ts). Nothing is marked as backed up here — only once the
	 * file has actually been handed over. */
	const made = await makeBackup(entries, did);
	if (!made.ok) return { ok: false, says: made.says };
	return {
		ok: true,
		taken: {
			name: `${did ? suggestFolderName(did) : 'Q vault'} backup ${stamp}.zip`,
			bytes: made.bytes,
			files: made.manifest.members.length,
			root: made.manifest.root
		}
	};
}

/*
 * A record, in the vault, that a copy was made: which backup (its root), how
 * many files, and how it left. Standing is TOLD — a download or the share
 * sheet is as far as Q can see — so it is never drawn as checked.
 *
 * Written before the backup is marked, so it is not itself counted as "new
 * since the last backup"; it travels in the next one.
 */
async function recordCopy(c: { how: 'share' | 'download'; root: string; files: number; bytes: number; name: string }) {
	try {
		const receipt = await seal({
			source: 'inqbeta:q/copy',
			schema: 'inqbeta.copy/1',
			channel: 'carried',
			how: c.how,
			root: c.root,
			files: c.files,
			bytes: c.bytes,
			name: c.name,
			standing: 'told',
			at: new Date().toISOString()
		});
		await saveLocked('copies', `copy-${c.root.slice(0, 16)}-${Date.now()}.json`, JSON.stringify(receipt, null, 2), 'application/json');
	} catch {
		/* The backup itself left; the record of it is best effort. */
	}
}

/**
 * "Back up now": the whole vault, out, in one tap.
 *
 * On a phone or tablet it opens the share sheet, where "Save to Files" puts it
 * in iCloud Drive. On a computer it downloads. If the share sheet will not
 * open (the tap went stale while the zip was built), it downloads instead —
 * a backup is never lost to the choice of door.
 */
export async function backupNow(): Promise<
	{ ok: true; files: number; name: string; root: string; how: 'share' | 'download' } | { ok: false; says: string; cancelled?: boolean }
> {
	const out = await closeVault();
	if (!out.ok) return out;
	const { name, bytes, files, root } = out.taken;
	const file = new File([bytes as BlobPart], name, { type: 'application/zip' });
	const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
	const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
	if (touch && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
		try {
			await nav.share({ files: [file], title: name });
			await recordCopy({ how: 'share', root, files, bytes: bytes.length, name });
			markExported();
			markDownloaded();
			return { ok: true, files, name, root, how: 'share' };
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') {
				return { ok: false, cancelled: true, says: 'Backup cancelled.' };
			}
			/* NotAllowedError and friends: fall through to a download. */
		}
	}
	try {
		download(name, file, 'application/zip');
	} catch (e) {
		return { ok: false, says: `The backup could not be saved: ${e instanceof Error ? e.message : String(e)}` };
	}
	await recordCopy({ how: 'download', root, files, bytes: bytes.length, name });
	markExported();
	markDownloaded();
	return { ok: true, files, name, root, how: 'download' };
}

/*
 * Whether the vault folder syncs somewhere.
 *
 * Asked, never detected. A browser hands over a folder's NAME and nothing else
 * — no path, no volume, no clue whether iCloud is watching it — so there is
 * nothing to inspect. The person can see their own Finder; Q cannot. Believing
 * them is the only honest option, and it makes the warning they see true.
 */
const SYNCED = 'q-vault-synced';

export function vaultSyncs(): boolean {
	try {
		return localStorage.getItem(SYNCED) === 'yes';
	} catch {
		return false;
	}
}

export function setVaultSyncs(yes: boolean) {
	try {
		if (yes) localStorage.setItem(SYNCED, 'yes');
		else localStorage.removeItem(SYNCED);
	} catch {
		/* Then it is asked again next time, which is no worse than not asking. */
	}
}

/* When the vault was last taken out of this browser. Best effort — if the
 * browser clears it, the count comes back high, which errs the safe way. */
const EXPORTED_AT = 'q-vault-exported';
/* When a download (a sealed file of the whole vault) was last made: the copy nobody else holds (ADR-Q-028). */
const DOWNLOADED_AT = 'q-vault-downloaded';
const downloadListeners = new Set<(at: number) => void>();
function markDownloaded() {
	try {
		localStorage.setItem(DOWNLOADED_AT, String(Date.now()));
	} catch {
		/* then a download looks due again, which is the safe way round */
	}
	for (const fn of downloadListeners) fn(lastDownload());
}
/** When the last download of the whole vault was made in this browser. 0 for never. */
export function lastDownload(): number {
	try {
		return Number(localStorage.getItem(DOWNLOADED_AT)) || 0;
	} catch {
		return 0;
	}
}
/** Called now and after every download. */
export function watchDownload(fn: (at: number) => void): () => void {
	downloadListeners.add(fn);
	fn(lastDownload());
	return () => downloadListeners.delete(fn);
}

/*
 * Something new was written into the vault (2 October 2026). Darren ended a
 * call on his phone, signed out, and the desktop never saw it: the copy to
 * Google Drive only ran every five minutes. Listeners here (autosync) carry
 * each new receipt out moments after it's made.
 */
const writeListeners = new Set<() => void>();
export function watchWrites(fn: () => void): () => void {
	writeListeners.add(fn);
	return () => writeListeners.delete(fn);
}

const backupListeners = new Set<(at: number) => void>();

function markExported() {
	try {
		localStorage.setItem(EXPORTED_AT, String(Date.now()));
	} catch {
		/* Then every count is "everything", which is the right way to be wrong. */
	}
	for (const fn of backupListeners) fn(lastExport());
}

/**
 * A storage channel (Google Drive, …) has just been checked to hold every
 * locked file in the vault. That is a backup — a better one than a zip, since
 * it was asked rather than assumed — so the "Back up now" dot clears.
 * No receipt is written: one every five minutes would itself be new each
 * time, and never let the vault be level. The channel is the record.
 */
export function noteCarried(): void {
	markExported();
}

/** When "Back up now" last ran in this browser. 0 for never. */
export function lastBackup(): number {
	return lastExport();
}

/** Called now and after every backup. */
export function watchBackup(fn: (at: number) => void): () => void {
	backupListeners.add(fn);
	fn(lastExport());
	return () => backupListeners.delete(fn);
}

function lastExport(): number {
	try {
		return Number(localStorage.getItem(EXPORTED_AT)) || 0;
	} catch {
		return 0;
	}
}

/** How many receipts have been written since the vault was last taken out. */
export async function unexported(): Promise<number> {
	if (!dir) return 0;
	const since = lastExport();
	let n = 0;
	async function walk(d: FileSystemDirectoryHandle, prefix: string, depth: number) {
		for await (const h of children(d)) {
			if (h.name.startsWith('.')) continue;
			if (h.kind === 'directory') {
				if (depth < VAULT_DEPTH) await walk(h as FileSystemDirectoryHandle, `${prefix}${h.name}/`, depth + 1);
				continue;
			}
			if (!belongsInBackup((prefix + h.name).split('/')) || h.name === MANIFEST || h.name === READ_ME) continue;
			const file = await (h as FileSystemFileHandle).getFile();
			if (file.lastModified > since) n++;
		}
	}
	await walk(dir, '', 0);
	return n;
}

/**
 * The vault's HEAD — its fingerprint, for the vault pointer (pointer.ts).
 *
 * Locked files are named by their content, so the list of names IS the list
 * of contents: two copies holding the same files have the same head, wherever
 * they are and whenever they were copied, like a Git commit id. SHA-256 over
 * the sorted paths, first 12 characters. Also the count, and the newest
 * change, so a copy can tell whether it is behind a note or ahead of it.
 */
export async function vaultHead(): Promise<{ head: string; files: number; lastChange: number } | null> {
	if (!dir) return null;
	const paths: string[] = [];
	let lastChange = 0;
	async function walk(d: FileSystemDirectoryHandle, prefix: string, depth: number) {
		for await (const h of children(d)) {
			if (h.name.startsWith('.')) continue;
			if (h.kind === 'directory') {
				if (depth < VAULT_DEPTH) await walk(h as FileSystemDirectoryHandle, `${prefix}${h.name}/`, depth + 1);
				continue;
			}
			if (!belongsInBackup((prefix + h.name).split('/')) || h.name === MANIFEST || h.name === READ_ME) continue;
			paths.push(prefix + h.name);
			const file = await (h as FileSystemFileHandle).getFile();
			if (file.lastModified > lastChange) lastChange = file.lastModified;
		}
	}
	await walk(dir, '', 0);
	paths.sort();
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(paths.join('\n'))));
	const head = [...digest.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
	return { head, files: paths.length, lastChange };
}

/** Generate a suggested folder name based on DID */
export function suggestFolderName(did: string): string {
	// Shorten DID for readability (last 8 chars)
	const shortDid = did.slice(-8);
	return `Incubator - Master - ${shortDid}`;
}

/** Choose (or make, in the picker) the folder. Must be called from a click. */
export async function chooseFolder(): Promise<FolderOutcome> {
	if (!folderSupported()) return { ok: false, says: 'This browser cannot use a folder.' };
	const did = whose();
	if (!did) return { ok: false, says: 'Sign in with your passkey first — the folder is kept for that passkey.' };
	let d: Dir;
	try {
		d = await (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker({
			id: 'dostudy',
			mode: 'readwrite',
			/* Not Downloads. People empty it, and cleaning tools empty it for
			 * them — a vault chosen there is a vault waiting to be thrown away.
			 * Documents is somewhere a person would look, and on a Mac it is
			 * often inside iCloud Drive already. */
			startIn: 'documents'
		});
	} catch (e) {
		if (e instanceof DOMException && e.name === 'AbortError')
			return { ok: false, cancelled: true, says: 'No folder was chosen.' };
		return { ok: false, says: `That folder could not be used: ${e instanceof Error ? e.message : String(e)}` };
	}
	const checked = await confirm(d, did);
	if (checked.kind !== 'ready') {
		return { ok: false, says: checked.kind === 'lost' ? `${checked.says} Choose another, or make a new one.` : 'That folder could not be used.' };
	}
	await store(did, d);
	set(checked, d);
	return { ok: true, name: d.name };
}

/**
 * Show a person where their folder actually is.
 *
 * A browser never tells a page the path of a folder it was given — that is the
 * point of the File System Access API, and it is not an oversight to work
 * around. What a page CAN do is open the system dialog already standing in
 * that folder, where the operating system shows the path in its own window.
 * So: no path is read, and the person still finds out where their things are.
 *
 * Whatever they do in that dialog is ignored. It is a window to look through,
 * not a way to change anything. Closing it is the expected ending, which is why
 * a cancel counts as a success here.
 *
 * Must be called from a click.
 */
export async function revealFolder(): Promise<FolderOutcome> {
	if (!folderSupported()) return { ok: false, says: 'This browser cannot show a folder on disk.' };
	const d = primaryHandle();
	if (!d) return { ok: false, says: 'No folder is in use yet.' };
	try {
		await (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker({
			id: 'dostudy',
			mode: 'readwrite',
			startIn: d
		});
	} catch (e) {
		if (!(e instanceof DOMException && e.name === 'AbortError')) {
			return { ok: false, says: `The folder could not be shown: ${e instanceof Error ? e.message : String(e)}` };
		}
	}
	return { ok: true, name: d.name };
}

/** Allow a remembered folder again. Must be called from a click. */
export async function wakeFolder(): Promise<FolderOutcome> {
	const did = whose();
	if (!did) return { ok: false, says: 'Sign in with your passkey first.' };
	const d = await stored(did);
	if (!d) return { ok: false, says: 'No folder has been chosen for this passkey yet.' };
	const perm = await d.requestPermission({ mode: 'readwrite' }).catch(() => 'denied' as Perm);
	if (perm !== 'granted') {
		set({ kind: 'asleep', name: d.name });
		return { ok: false, says: 'The browser was not allowed to use the folder.' };
	}
	const next = await confirm(d, did);
	set(next, d);
	return next.kind === 'ready' ? { ok: true, name: d.name } : { ok: false, says: next.kind === 'lost' ? next.says : '' };
}

/** Stop using the folder. The folder and everything in it stay exactly where they are. */
export async function forgetFolder(): Promise<void> {
	const did = whose();
	if (did) await store(did, null).catch(() => {});
	await refresh();
}

/* ------------------------------------------------------------------ *
 * Files — through the vault
 * ------------------------------------------------------------------ */

export interface FolderItem {
	/** Where it is on disk, relative to the folder. What Finder shows. */
	diskPath: string;
	/** Locked to the passkey (a .dsv file), or plain and readable by anyone. */
	locked: boolean;
	/** What it really is. Null for a locked file this passkey cannot open. */
	meta: VaultMeta | null;
	/*
	 * Whether a locked file still matches its content name. null when there is
	 * nothing to check (an older random name, a typed name, or not locked).
	 */
	intact: boolean | null;
	modified: number;
}

async function locate(path: string, create: boolean): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
	if (!dir) throw new Error('The folder is not open.');
	const parts = path.split('/').filter(Boolean);
	if (parts.some((p) => p === '..' || p === '.')) throw new Error('Not a path inside the folder.');
	const name = parts.pop();
	if (!name) throw new Error('No file name.');
	let parent: FileSystemDirectoryHandle = dir;
	for (const p of parts) parent = await parent.getDirectoryHandle(p, { create });
	return { parent, name };
}

async function bytesAt(path: string): Promise<{ file: File; bytes: Uint8Array }> {
	const { parent, name } = await locate(path, false);
	const file = await (await parent.getFileHandle(name)).getFile();
	return { file, bytes: new Uint8Array(await file.arrayBuffer()) };
}

function keyOrThrow(): CryptoKey {
	const id = current();
	if (!id) throw new Error('Sign in with your passkey to use your folder.');
	return id.vault;
}

/**
 * Everything in the folder, up to three levels of subfolders deep, newest first.
 * Locked files are opened to read their real names — which needs the passkey;
 * without it they are listed with no name at all.
 */
export async function listItems(): Promise<FolderItem[]> {
	if (!dir) return [];
	const key = current()?.vault ?? null;
	/* Pass 1: walk the tree. Directory listings only — cheap. */
	const found: { h: FileSystemFileHandle; diskPath: string; prefix: string }[] = [];
	async function walk(d: FileSystemDirectoryHandle, prefix: string, depth: number) {
		const subs: Promise<void>[] = [];
		for await (const h of children(d)) {
			if (h.name.startsWith('.')) continue;
			if (h.kind === 'directory') {
				/* ucan/ holds signed permission tokens, shown under Receipts, not Files. */
				if (!prefix && h.name === UCAN_FOLDER) continue;
				/* Office records are the federation's, opened on the office's desk, not among your own files. */
				if (!prefix && h.name === OFFICE_SHELF) continue;
				if (depth < VAULT_DEPTH) subs.push(walk(h as FileSystemDirectoryHandle, `${prefix}${h.name}/`, depth + 1));
				continue;
			}
			if (!prefix && (h.name === MANIFEST || h.name === READ_ME)) continue;
			found.push({ h: h as FileSystemFileHandle, diskPath: prefix + h.name, prefix });
		}
		await Promise.all(subs);
	}
	await walk(dir, '', 0);
	/* Pass 2: open each file — in parallel, and only once per version of it. */
	return (await pool(found, 8, (f) => describe(f.h, f.diskPath, f.prefix, key))).sort((a, b) => b.modified - a.modified);
}

/*
 * Unlocking and hashing every file on every refresh was the slowest thing in Q:
 * a full decrypt and SHA-256 of the whole vault each time anything changed.
 * A locked file is named by its own hash, so the same name, size and time is
 * the same bytes, and the answer can be kept. Kept per vault key, so signing
 * in as somebody else starts clean.
 */
type Described = { meta: VaultMeta | null; intact: boolean | null };
const described = new WeakMap<CryptoKey, Map<string, Described>>();

async function describe(h: FileSystemFileHandle, diskPath: string, prefix: string, key: CryptoKey | null): Promise<FolderItem> {
	const file = await h.getFile();
	if (!h.name.endsWith(VAULT_EXT)) {
		return {
			diskPath,
			locked: false,
			meta: {
				name: h.name,
				path: prefix.replace(/\/$/, ''),
				type: file.type,
				size: file.size,
				saved: new Date(file.lastModified).toISOString()
			},
			intact: null,
			modified: file.lastModified
		};
	}
	let meta: VaultMeta | null = null;
	let intact: boolean | null = null;
	if (key) {
		let cache = described.get(key);
		if (!cache) described.set(key, (cache = new Map()));
		const sig = `${diskPath}\u0000${file.size}\u0000${file.lastModified}`;
		let hit = cache.get(sig);
		if (!hit) {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const ok = await matchesName(h.name, bytes);
			let m: VaultMeta | null = null;
			try {
				if (looksLocked(bytes)) m = (await unlockBytes(key, bytes)).meta;
			} catch {
				m = null;
			}
			hit = { meta: m, intact: ok };
			cache.set(sig, hit);
		}
		meta = hit.meta;
		intact = hit.intact;
	}
	/* Saved through the Save dialog: grouped by the folder it sits in. */
	if (meta && !meta.path && prefix) meta = { ...meta, path: prefix.replace(/\/$/, '') };
	return { diskPath, locked: true, meta, intact, modified: file.lastModified };
}

/** Run `fn` over `items`, `n` at a time, keeping order. */
export async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
	const out = new Array<R>(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
	return out;
}

/** The real contents of an item, unlocked if it is locked. */
export async function readItem(item: FolderItem): Promise<{ meta: VaultMeta; data: Uint8Array<ArrayBuffer> }> {
	const { bytes } = await bytesAt(item.diskPath);
	if (item.locked) return unlockBytes(keyOrThrow(), bytes);
	if (!item.meta) throw new Error('Unknown file.');
	const data = new Uint8Array(new ArrayBuffer(bytes.length));
	data.set(bytes);
	return { meta: item.meta, data };
}

/** The contents as a File, named and typed as it really is. */
export async function itemAsFile(item: FolderItem): Promise<File> {
	const { meta, data } = await readItem(item);
	return new File([data], meta.name, { type: meta.type, lastModified: Date.parse(meta.saved) || Date.now() });
}

/** Lock something into the folder. Returns the name it was given on disk. */
export async function saveLocked(path: string, name: string, data: ArrayBuffer | Uint8Array | string, type = ''): Promise<string> {
	if (!dir) throw new Error('The folder is not open.');
	/*
	 * The one place everything that makes a receipt goes through, and so the one
	 * place to refuse. Since 2026-09-23 a browser's own storage counts as
	 * somewhere to save (the working copy, made safe by "Back up now"), so this
	 * refuses only where there is nowhere to write at all.
	 *
	 * Reading a vault IN is not making a receipt and does not come through here.
	 */
	const can = thisBrowser();
	if (!can.keep) {
		throw new Error(
			`${can.says} ${can.fix}`.trim()
		);
	}
	const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
	const locked = await lockBytes(keyOrThrow(), { name, path, type }, bytes);
	const onDisk = await contentName(locked);
	await writeText(dir, onDisk, new Blob([locked]));
	for (const fn of writeListeners) fn();
	return onDisk;
}

/** Lock a plain file that is already in the folder, then remove the readable original. */
export async function lockItem(item: FolderItem): Promise<void> {
	if (item.locked || !item.meta) return;
	const { data } = await readItem(item);
	await saveLocked(item.meta.path, item.meta.name, data, item.meta.type);
	const { parent, name } = await locate(item.diskPath, false);
	await parent.removeEntry(name);
}

/** Delete from the folder. Permanent — the page asks first. */
export async function deleteItem(item: FolderItem): Promise<void> {
	const { parent, name } = await locate(item.diskPath, false);
	await parent.removeEntry(name);
}

/** Hand a file to the person as an ordinary download. */
export function download(name: string, data: BlobPart, type = 'application/octet-stream') {
	const url = URL.createObjectURL(new Blob([data], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save something the person made. Into the folder, locked, when the folder is
 * open and they are signed in; as a download otherwise — which is what
 * happened before the folder existed, so nobody without one is worse off.
 * Returns a sentence saying which.
 */
export async function saveOut(into: string, name: string, text: string): Promise<string> {
	if (state.kind === 'ready' && current()) {
		try {
			await saveLocked(into, name, text, 'application/json');
			return `Saved to your ${state.name} folder, locked to your passkey. It is on the Data tab.`;
		} catch {
			/* Fall through to a download rather than lose it. */
		}
	}
	download(name, text, 'application/json');
	return state.kind === 'ready' || state.kind === 'asleep'
		? `Downloaded as ${name}. Sign in with your passkey to save into your locked folder instead.`
		: `Downloaded as ${name}.`;
}

/* ------------------------------------------------------------------ *
 * The system's own file pickers, opening in the Q folder
 *
 * Darren, 2026-09-16: "when you add a file… it opens your folder, then where to
 * save or where to grab a file. Why can't that happen the same way — open your
 * file system to select?" It can: the browser's own Open and Save dialogs, told
 * to start in the Q folder. Chrome and Edge only, like the folder itself.
 * ------------------------------------------------------------------ */

type PickerOpts = {
	id?: string;
	startIn?: FileSystemHandle | string;
	multiple?: boolean;
	suggestedName?: string;
	types?: { description: string; accept: Record<string, string[]> }[];
};
type PickerWindow = {
	showOpenFilePicker?: (o: PickerOpts) => Promise<FileSystemFileHandle[]>;
	showSaveFilePicker?: (o: PickerOpts) => Promise<FileSystemFileHandle>;
};

export function pickersSupported(): boolean {
	if (typeof window === 'undefined') return false;
	const w = window as unknown as PickerWindow;
	return typeof w.showOpenFilePicker === 'function' && typeof w.showSaveFilePicker === 'function';
}

function isAbort(e: unknown) {
	return e instanceof DOMException && e.name === 'AbortError';
}

/** Where a file sits relative to the Q folder, or null when it is somewhere else. */
async function whereInFolder(handle: FileSystemFileHandle): Promise<string | null> {
	if (!dir) return null;
	const resolver = dir as unknown as { resolve(h: FileSystemHandle): Promise<string[] | null> };
	const parts = await resolver.resolve(handle).catch(() => null);
	return parts ? parts.join('/') : null;
}

export interface PickedFile {
	file: File;
	/** Its path inside the Q folder, or null when it came from elsewhere. */
	inFolder: string | null;
	/** Whether it was a locked .dsv file. */
	locked: boolean;
	/** What it really is — unlocked when it was locked. */
	meta: VaultMeta;
	data: Uint8Array<ArrayBuffer>;
}

/**
 * Open the system's Open dialog — in the Q folder, or in Downloads when adding
 * from outside — and read what was chosen, unlocking locked files with the
 * passkey. Returns [] if the dialog was cancelled. Call from a click.
 */
export async function openWithPicker(opts: { multiple?: boolean; from?: 'folder' | 'downloads' } = {}): Promise<PickedFile[]> {
	const w = window as unknown as PickerWindow;
	if (!w.showOpenFilePicker) throw new Error('This browser has no file picker for this. Use Chrome or Edge.');
	let handles: FileSystemFileHandle[];
	try {
		handles = await w.showOpenFilePicker({
			id: opts.from === 'downloads' ? 'q-add' : 'q-open',
			startIn: opts.from === 'downloads' ? 'downloads' : (dir ?? 'documents'),
			multiple: !!opts.multiple
		});
	} catch (e) {
		if (isAbort(e)) return [];
		throw e;
	}
	const out: PickedFile[] = [];
	for (const h of handles) {
		const file = await h.getFile();
		const bytes = new Uint8Array(await file.arrayBuffer());
		const inFolder = await whereInFolder(h);
		if (looksLocked(bytes)) {
			const { meta, data } = await unlockBytes(keyOrThrow(), bytes);
			out.push({ file, inFolder, locked: true, meta, data });
		} else {
			const data = new Uint8Array(new ArrayBuffer(bytes.length));
			data.set(bytes);
			out.push({
				file,
				inFolder,
				locked: false,
				meta: { name: file.name, path: '', type: file.type, size: file.size, saved: new Date(file.lastModified).toISOString() },
				data
			});
		}
	}
	return out;
}

/**
 * Open the system's Save dialog in the Q folder and write the file there,
 * locked. The suggested name is the file's content name (its hash), so the
 * desktop still gives nothing away; a name typed in the dialog WILL show on the
 * desktop, and the page says so. Returns null if cancelled. Call from a click.
 *
 * Locked BEFORE the dialog opens, so the hash can be suggested; where it lands
 * is read from the folder it is saved in.
 */
export async function saveWithPicker(
	name: string,
	data: ArrayBuffer | Uint8Array | string,
	type = ''
): Promise<{ where: string; inFolder: boolean } | null> {
	const w = window as unknown as PickerWindow;
	if (!w.showSaveFilePicker) throw new Error('This browser has no save dialog for this. Use Chrome or Edge.');
	const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
	const locked = await lockBytes(keyOrThrow(), { name, path: '', type }, bytes);
	let handle: FileSystemFileHandle;
	try {
		handle = await w.showSaveFilePicker({
			id: 'q-save',
			startIn: dir ?? 'documents',
			suggestedName: await contentName(locked),
			types: [{ description: 'Locked Q file', accept: { 'application/octet-stream': [VAULT_EXT] } }]
		});
	} catch (e) {
		if (isAbort(e)) return null;
		throw e;
	}
	const inFolder = await whereInFolder(handle);
	await writeFile(handle, locked);
	return { where: inFolder ?? handle.name, inFolder: inFolder !== null };
}

/* ------------------------------------------------------------------ *
 * Proving a place.
 *
 * Darren, 2026-09-20: "created, found, findable, and can be written to and
 * read, then that becomes a live confirmed storage."
 *
 * The important words are AND READ. A browser reporting that it supports
 * folders is a CAPABILITY; a byte written and read back is a FACT. Q has
 * already believed the first kind once and lost a folder to it.
 *
 * WHY THE PROBE IS RAW RANDOM BYTES, NOT A LOCKED FILE. The question being
 * asked is whether this place can hold bytes and give the same ones back. That
 * is not the same question as whether the vault key works, which vault.ts
 * tests on its own. Keeping them apart means a folder can be proved BEFORE
 * anybody commits anything to it — which is the only useful time — and a stray
 * probe left behind by a crash is sixty-four random bytes rather than
 * something that looks like a receipt. `belongsInVault()` does not claim it,
 * so it never travels.
 *
 * WHAT IT CATCHES THAT A WRITE ALONE DOES NOT. A place that takes a file and
 * returns different bytes is DAMAGED, and damaged is worse than refusing,
 * because refusing is obvious and quiet alteration looks like working. Only a
 * comparison finds it.
 * ------------------------------------------------------------------ */

/** Sixty-four bytes is enough to catch truncation, padding and silent rewriting. */
const PROBE_BYTES = 64;

export interface Proved {
	proof: Proof;
	/**
	 * The probe's name, when it could not be tidied away. Not a failure — the
	 * place works — but a person should be told there is a stray file and that
	 * this place will not let Q remove things.
	 */
	leftBehind?: string;
}

/**
 * Write something small, read it back, compare, remove.
 *
 * Never throws: every way this can go wrong is one of the four outcomes
 * `confirmation()` knows how to describe, and an exception here would become a
 * red box saying something a person cannot act on.
 */
export async function proveFolder(into?: FileSystemDirectoryHandle): Promise<Proved> {
	const d = into ?? dir;
	if (!d) return { proof: { tried: true, wrote: false, readBack: false, matched: false, at: Date.now() } };

	/* Named so a stray one is recognisable and obviously ours. Not a content
	 * name and not .dsv, so belongsInVault() never carries it anywhere. */
	const tag = [...crypto.getRandomValues(new Uint8Array(new ArrayBuffer(6)))]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	const name = `.q-check-${tag}.tmp`;
	const sent = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(PROBE_BYTES)));
	const at = Date.now();

	try {
		await writeIn(d, name, sent);
	} catch {
		return { proof: { tried: true, wrote: false, readBack: false, matched: false, at } };
	}

	let back: Uint8Array | null = null;
	try {
		const handle = await d.getFileHandle(name);
		back = new Uint8Array(await (await handle.getFile()).arrayBuffer());
	} catch {
		back = null;
	}

	const matched =
		back !== null && back.length === sent.length && sent.every((b, i) => b === back![i]);

	let leftBehind: string | undefined;
	try {
		await d.removeEntry(name);
	} catch {
		leftBehind = name;
	}

	return {
		proof: { tried: true, wrote: true, readBack: back !== null, matched, at },
		...(leftBehind ? { leftBehind } : {})
	};
}

/* ---- The office shelf (ADR-Q-038, 6 October 2026) ----
 *
 * Darren: "the federation folder lives inside your working folder and then
 * syncs to the designated storage … it always ensures that there is a DID
 * sign-in authorising that part … and the only storage you have is whilst you
 * hold that role."
 *
 * A real folder, "Office records", inside your working folder, with one shelf
 * per office you hold. What's on it is sealed to the office's key, not
 * yours, so only the office's keys open it; it's the working copy of the
 * office's records, whose home is the federation's storage. Never in your
 * personal backup or among your own files; emptied when the office ends.
 */
export const OFFICE_SHELF = 'Office records';

async function shelfDir(shelf: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
	if (!dir) return null;
	const safe = shelf.replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 80);
	if (!safe) return null;
	try {
		const top = await (dir as FileSystemDirectoryHandle).getDirectoryHandle(OFFICE_SHELF, { create });
		return await top.getDirectoryHandle(safe, { create });
	} catch {
		return null;
	}
}

/** Put something on an office's shelf (already sealed to the office's key). */
export async function shelfPut(shelf: string, name: string, text: string): Promise<boolean> {
	const d = await shelfDir(shelf, true);
	if (!d) return false;
	await writeIn(d, name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 120) || 'item.json', text);
	return true;
}

/** Everything on an office's shelf, as text. */
export async function shelfRead(shelf: string): Promise<string[]> {
	const d = await shelfDir(shelf, false);
	if (!d) return [];
	const out: string[] = [];
	for await (const h of children(d)) {
		if (h.kind !== 'file' || h.name.startsWith('.')) continue;
		out.push(await (await (h as FileSystemFileHandle).getFile()).text());
	}
	return out;
}

/** The shelves on this folder now. */
export async function shelves(): Promise<string[]> {
	if (!dir) return [];
	try {
		const top = await (dir as FileSystemDirectoryHandle).getDirectoryHandle(OFFICE_SHELF, { create: false });
		const out: string[] = [];
		for await (const h of children(top)) if (h.kind === 'directory') out.push(h.name);
		return out;
	} catch {
		return [];
	}
}

/** Empty and remove a shelf: the office has ended, and its papers stay with the federation. */
export async function shelfClear(shelf: string): Promise<void> {
	if (!dir) return;
	try {
		const top = await (dir as FileSystemDirectoryHandle).getDirectoryHandle(OFFICE_SHELF, { create: false });
		await top.removeEntry(shelf, { recursive: true });
	} catch {
		/* nothing there */
	}
}
