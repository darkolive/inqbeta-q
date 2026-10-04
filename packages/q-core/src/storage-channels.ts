/*
 * Storage channels — every place your vault is carried, behind one shape.
 *
 * Audit 2026-09-25, Phase 1. The incubator's rule: "Google / Apple / Dropbox /
 * NAS / federation vault are storage channels only" — bytes in, bytes out,
 * sealed; never an authority. Before this, Q had three mechanisms that did not
 * know about each other (replicas.ts, places.ts, the backup zip). This is the
 * one interface they all go through, so a folder, Google Drive, Dropbox and
 * OneDrive differ only in how they list, read and write a file.
 *
 * WHAT MOVES, AND HOW:
 *
 *   locked files (.dsv) and     named by their own hash, so the same name IS
 *   permission tokens (.ucan)   the same file: copied where missing, both
 *                               ways, never overwritten. A file that does not
 *                               match its name is damaged — reported, never
 *                               spread.
 *   continuity.json             the envelope (ADR-Q-005): the one signed later
 *                               stands, both ways, so a channel never brings
 *                               back a way in that was taken out.
 *   dostudy.json, READ ME.txt   copied where missing; a channel belonging to
 *                               another DID is refused outright.
 *
 * Only sealed bytes ever reach a channel. A provider sees file names that are
 * hashes, and ciphertext.
 */
import { CONTINUITY_FILE, keepEnvelope } from './continuity';
import { VAULT_EXT, matchesName } from './vault';

const UCAN_EXT = '.ucan';
const MANIFEST = 'dostudy.json';
const READ_ME = 'READ ME.txt';

export type ChannelKind = 'this-browser' | 'folder' | 'google-drive' | 'dropbox' | 'onedrive' | 'bucket' | 'store';

export interface StorageChannel {
	id: string;
	kind: ChannelKind;
	/** What a person calls it. */
	called: string;
	/** Every path held, relative to the vault's top, '/'-separated. */
	list(): Promise<string[]>;
	get(path: string): Promise<Uint8Array | null>;
	put(path: string, bytes: Uint8Array): Promise<void>;
}

export interface ChannelSync {
	sent: number;
	received: number;
	same: number;
	/** Paths that did not match their own names, with which side they were on. */
	damaged: string[];
	/** Paths a channel would not take or give, with why. */
	failed: string[];
	at: string;
}

function isContent(path: string): boolean {
	return path.endsWith(VAULT_EXT) || path.endsWith(UCAN_EXT);
}

function base(path: string): string {
	return path.split('/').pop() ?? path;
}

/* A .ucan file's name is its CID; checked by ucan/store, loaded on demand so
 * this file stays free of the browser folder code that store imports. */
async function intact(path: string, bytes: Uint8Array): Promise<boolean> {
	const name = base(path);
	if (name.endsWith(UCAN_EXT)) {
		const { tokenMatchesName } = await import('./ucan/store');
		return (await tokenMatchesName(name, bytes)) !== false;
	}
	return (await matchesName(name, bytes)) !== false;
}

async function ownerOf(ch: StorageChannel): Promise<string | null> {
	try {
		const b = await ch.get(MANIFEST);
		return b ? ((JSON.parse(new TextDecoder().decode(b)) as { did?: string }).did ?? null) : null;
	} catch {
		return null;
	}
}

function parse(b: Uint8Array | null): unknown {
	if (!b) return null;
	try {
		return JSON.parse(new TextDecoder().decode(b));
	} catch {
		return null;
	}
}

/**
 * Bring two channels level — usually this vault and one place it is carried.
 * Never deletes, never overwrites a content-named file, never spreads damage.
 */
export async function syncChannels(here: StorageChannel, there: StorageChannel, me: string): Promise<ChannelSync> {
	const owner = await ownerOf(there);
	if (owner && owner !== me) throw new Error(`${there.called} belongs to a different passkey.`);

	const r: ChannelSync = { sent: 0, received: 0, same: 0, damaged: [], failed: [], at: new Date().toISOString() };
	const [a, b] = await Promise.all([here.list(), there.list()]);
	const inA = new Set(a);
	const inB = new Set(b);

	async function copy(path: string, from: StorageChannel, to: StorageChannel, side: 'sent' | 'received') {
		try {
			const bytes = await from.get(path);
			if (!bytes) return;
			if (!(await intact(path, bytes))) {
				r.damaged.push(`${path} (in ${from.called})`);
				return;
			}
			await to.put(path, bytes);
			r[side]++;
		} catch (e) {
			r.failed.push(`${path}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	/* Several at once: a first sync of a whole vault, or a new device pulling
	 * one down, was a file at a time and slow (Darren, 25 September). */
	const up = a.filter(isContent).filter((p) => {
		if (inB.has(p)) {
			r.same++;
			return false;
		}
		return true;
	});
	const down = b.filter(isContent).filter((p) => !inA.has(p));
	await inParallel(up, (p) => copy(p, here, there, 'sent'));
	await inParallel(down, (p) => copy(p, there, here, 'received'));

	/* The two that explain a vault: copied where missing, never over. */
	for (const name of [MANIFEST, READ_ME]) {
		try {
			if (inA.has(name) && !inB.has(name)) {
				const x = await here.get(name);
				if (x) await there.put(name, x);
			} else if (inB.has(name) && !inA.has(name)) {
				const x = await there.get(name);
				if (x) await here.put(name, x);
			}
		} catch (e) {
			r.failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	/* The continuity envelope: the one signed later stands, whichever side. */
	if (inA.has(CONTINUITY_FILE) || inB.has(CONTINUITY_FILE)) {
		try {
			const [x, y] = await Promise.all([here.get(CONTINUITY_FILE), there.get(CONTINUITY_FILE)]);
			const keep = await keepEnvelope(parse(x), parse(y), me);
			if (keep === 'incoming' && y) {
				await here.put(CONTINUITY_FILE, y);
				r.received++;
			} else if (x && (await keepEnvelope(parse(y), parse(x), me)) === 'incoming') {
				await there.put(CONTINUITY_FILE, x);
				r.sent++;
			}
		} catch (e) {
			r.failed.push(`${CONTINUITY_FILE}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	return r;
}

/** How many copies run at once. Enough to fill a home connection; few enough that a provider does not throttle. */
export const AT_ONCE = 6;

async function inParallel<T>(items: T[], fn: (t: T) => Promise<void>, n = AT_ONCE): Promise<void> {
	let next = 0;
	const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
		while (next < items.length) await fn(items[next++]);
	});
	await Promise.all(workers);
}

/**
 * Does the channel now hold every locked file and token this vault holds?
 * Asked of the channel itself after a sync — a fact, not an assumption.
 */
export async function holdsEverything(here: StorageChannel, there: StorageChannel): Promise<boolean> {
	const [a, b] = await Promise.all([here.list(), there.list()]);
	const inB = new Set(b);
	return a.filter(isContent).every((p) => inB.has(p));
}

/** A channel held in memory — for tests, and for anything that wants one. */
export function memoryChannel(called = 'memory', id = crypto.randomUUID()): StorageChannel & { files: Map<string, Uint8Array> } {
	const files = new Map<string, Uint8Array>();
	return {
		id,
		kind: 'bucket',
		called,
		files,
		async list() {
			return [...files.keys()];
		},
		async get(p) {
			return files.get(p) ?? null;
		},
		async put(p, b) {
			files.set(p, b.slice());
		}
	};
}

/* ------------------------------------------------------------------ *
 * A folder as a channel: the vault itself (on disk, or in the browser's
 * own storage — both are directory handles), or a copy location such as a
 * USB drive or the Dropbox / Google Drive folder on a Mac.
 * ------------------------------------------------------------------ */

const DEPTH = 4;

export function folderChannel(
	dir: FileSystemDirectoryHandle,
	o: { id: string; called: string; kind?: ChannelKind }
): StorageChannel {
	async function walk(d: FileSystemDirectoryHandle, prefix: string, depth: number, out: string[]) {
		for await (const h of (d as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
			if (h.name.startsWith('.')) continue;
			if (h.kind === 'directory') {
				if (depth < DEPTH) await walk(h as FileSystemDirectoryHandle, `${prefix}${h.name}/`, depth + 1, out);
			} else out.push(prefix + h.name);
		}
		return out;
	}
	async function parent(path: string, create: boolean): Promise<{ d: FileSystemDirectoryHandle; name: string }> {
		const parts = path.split('/').filter(Boolean);
		if (parts.some((p) => p === '..' || p === '.')) throw new Error('Not a vault path.');
		const name = parts.pop()!;
		let d = dir;
		for (const p of parts) d = await d.getDirectoryHandle(p, { create });
		return { d, name };
	}
	return {
		id: o.id,
		kind: o.kind ?? 'folder',
		called: o.called,
		list: () => walk(dir, '', 0, []),
		async get(path) {
			try {
				const { d, name } = await parent(path, false);
				return new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer());
			} catch {
				return null;
			}
		},
		async put(path, bytes) {
			const { d, name } = await parent(path, true);
			const { writeIn } = await import('./fsx');
			await writeIn(d, name, bytes);
		}
	};
}
