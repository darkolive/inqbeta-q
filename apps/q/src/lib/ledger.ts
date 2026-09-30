/*
 * What is in your folder, read once and understood.
 *
 * Every JSON file in the folder (opened with your passkey) is shown to each
 * feature pack in turn; a pack that recognises it claims it. Link receipts are
 * Q's own and recognised here. Everything else is simply a file.
 *
 * The UCAN tokens in ucan/ (permissions, links, revocations) are read too —
 * they are not locked, and every one is checked against its signature and its
 * name before it counts.
 *
 * Plain module with a watcher, like the rest of q-core — no runes outside
 * components. Refreshed whenever the folder or the signed-in identity changes,
 * and on demand.
 */
import { listItems, pool, readItem, watchFolder, type FolderItem, type FolderState } from '@inqbeta/q-core/folder';
import { current, watch as watchIdentity } from '@inqbeta/q-core/passkey';
import { isLink, ucanLinks, type Link, type UcanLink } from '@inqbeta/q-core/links';
import { checkReceipt, whose } from '@inqbeta/q-core/seal';
import { folderStore, gather, type Delegation, type KnownRevocation, type Token } from '@inqbeta/q-core/ucan/index';
import type { ReceiptState } from '@inqbeta/q-core/offline-queue';
import { FEATURES, type Found } from './features/registry';
import { receiptFromToken, receiptsInJson, type ReceiptEntry } from './receipts';

/** Download state for a receipt */
export interface ReceiptDownloadState {
	receiptId: string;
	state: ReceiptState;
	progress: number;
	updatedAt: string;
}

export interface Ledger {
	state: 'idle' | 'loading' | 'ready' | 'locked' | 'no-folder';
	items: FolderItem[];
	links: { item: FolderItem; link: Link }[];
	/** UCAN tokens in the folder, all signature-checked. */
	tokens: Token[];
	ucanLinks: UcanLink[];
	/** Delegations that are not device links: permissions given or held. */
	grants: Delegation[];
	revocations: KnownRevocation[];
	/** Every signed record — receipts, links, permissions — checked. */
	receipts: ReceiptEntry[];
	/** Files that are receipts, so Files can leave them to the Receipts page. */
	receiptPaths: Set<string>;
	found: Found[];
	loadedAt: string | null;
	/** Download states for incoming receipts */
	downloadStates: Map<string, ReceiptDownloadState>;
}

const EMPTY: Ledger = {
	state: 'idle',
	items: [],
	links: [],
	tokens: [],
	ucanLinks: [],
	grants: [],
	revocations: [],
	receipts: [],
	receiptPaths: new Set(),
	found: [],
	loadedAt: null,
	downloadStates: new Map()
};

let ledger: Ledger = EMPTY;
let folder: FolderState = { kind: 'checking' };
const listeners = new Set<(l: Ledger) => void>();
let started = false;
let run = 0;

function set(l: Ledger) {
	ledger = l;
	for (const fn of listeners) fn(l);
}

export function watchLedger(fn: (l: Ledger) => void): () => void {
	listeners.add(fn);
	fn(ledger);
	if (!started) {
		started = true;
		watchFolder((s) => {
			folder = s;
			void refreshLedger();
		});
		watchIdentity(() => void refreshLedger());
	}
	return () => listeners.delete(fn);
}

/*
 * Refreshes coalesce. Signing in fires the identity watcher AND the folder
 * watcher, and a save fires the folder again — each used to start a full pass
 * of its own. Now one runs, and at most one more follows it to pick up what
 * changed meanwhile.
 */
let running: Promise<void> | null = null;
let again = false;

export function refreshLedger(): Promise<void> {
	if (running) {
		again = true;
		return running;
	}
	running = (async () => {
		try {
			do {
				again = false;
				await pass();
			} while (again);
		} finally {
			running = null;
		}
	})();
	return running;
}

/*
 * What was read out of a file, kept while the file is unchanged. Opening and
 * signature-checking every JSON file on every refresh was the other half of
 * the slowness; a locked file's name is its hash, so an unchanged name, size
 * and time is an unchanged answer. Keyed by the signed-in DID as well, because
 * `checked` says whose a receipt is.
 */
type Read = { json: unknown; checked: Awaited<ReturnType<typeof whose>> | null };
const reads = new Map<string, Read | null>();

async function readJson(item: FolderItem, did: string | null): Promise<Read | null> {
	const sig = `${did}\u0000${item.diskPath}\u0000${item.modified}\u0000${item.meta?.size ?? ''}`;
	if (reads.has(sig)) return reads.get(sig)!;
	let out: Read | null = null;
	try {
		const json = JSON.parse(new TextDecoder().decode((await readItem(item)).data));
		out = { json, checked: isLink(json) ? null : whose(json, await checkReceipt(json), did) };
	} catch {
		out = null;
	}
	if (reads.size > 5000) reads.clear();
	reads.set(sig, out);
	return out;
}

async function pass(): Promise<void> {
	const mine = ++run;
	if (folder.kind !== 'ready') {
		set({ ...EMPTY, state: folder.kind === 'checking' ? 'idle' : 'no-folder' });
		return;
	}
	/* Keep showing what is there while looking again — no flash of empty. */
	if (ledger.state !== 'ready') set({ ...ledger, state: 'loading' });
	const items = await listItems().catch(() => [] as FolderItem[]);
	if (!current()) {
		if (mine === run) set({ ...EMPTY, state: 'locked', items });
		return;
	}
	const did = current()?.did ?? null;
	const jsonItems = items.filter((item) => item.meta && item.meta.name.toLowerCase().endsWith('.json'));
	/* Read in parallel, then walk in order, so the lists come out as before. */
	const tokensP = folderStore.all().catch(() => [] as Token[]);
	const read = await pool(jsonItems, 8, (item) => readJson(item, did));
	const links: Ledger['links'] = [];
	const found: Found[] = [];
	const receipts: ReceiptEntry[] = [];
	for (let i = 0; i < jsonItems.length; i++) {
		const r = read[i];
		if (!r) continue;
		const item = jsonItems[i];
		const json = r.json;
		receipts.push(...(await receiptsInJson(json, item).catch(() => [])));
		if (isLink(json)) {
			links.push({ item, link: json });
			continue;
		}
		/*
		 * Checked ONCE, for every file, rather than by each pack — and now
		 * remembered while the file is unchanged.
		 *
		 * A FILE THAT FAILS IS STILL LISTED. It is the one a person most needs
		 * to see, and a folder that looks clean because the evidence of it not
		 * being clean was swallowed is worse than no folder at all.
		 */
		const checked = r.checked!;
		for (const f of FEATURES) {
			const hit = f.recognise(json, item);
			if (hit) {
				found.push(...hit.map((h) => ({ ...h, checked })));
				break;
			}
		}
	}
	const tokens = await tokensP;
	const { delegations, revocations } = await gather({ put: async () => {}, all: async () => tokens });
	const linkList = ucanLinks(tokens);
	const linkCids = new Set(linkList.map((l) => l.approval.cid.toString()));
	const grants = delegations.filter((d) => !linkCids.has(d.cid.toString()));
	for (const t of tokens) receipts.push(receiptFromToken(t, revocations));
	receipts.sort((a, b) => b.at.localeCompare(a.at));
	const receiptPaths = new Set(receipts.filter((r) => r.item).map((r) => r.item!.diskPath));
	if (mine === run)
		set({
			state: 'ready',
			items,
			links,
			tokens,
			ucanLinks: linkList,
			grants,
			revocations,
			receipts,
			receiptPaths,
			found,
			loadedAt: new Date().toISOString(),
			downloadStates: ledger.downloadStates
		});
}

/** Get download state for a specific receipt */
export function getReceiptDownloadState(receiptId: string): ReceiptDownloadState | undefined {
	return ledger.downloadStates.get(receiptId);
}

/** Update receipt download state (called by fetch wrapper) */
export function setReceiptDownloadState(receiptId: string, state: ReceiptState, progress: number): void {
	const downloadStates = new Map(ledger.downloadStates);
	downloadStates.set(receiptId, {
		receiptId,
		state,
		progress,
		updatedAt: new Date().toISOString()
	});
	set({ ...ledger, downloadStates });
}
