/*
 * Auto-sync — "built in, every five minutes or whatever" (Darren, 2026-09-25).
 *
 * The browser's own storage stays the fast working copy. Every channel this
 * browser may already write to is brought level in the background: every five
 * minutes while the page is open, visible and online, and again when the page
 * comes back into view. Nothing is asked and nothing interrupts; a channel
 * that needs allowing again is skipped and shows as asleep on /nodes.
 *
 * Channels today: copy-location folders (replicas.ts), Google Drive, Dropbox
 * and OneDrive.
 */
import { syncAllQuietly } from '@inqbeta/q-core/replicas';
import { folderOwner, noteCarried, primaryHandle, watchWrites } from '@inqbeta/q-core/folder';
import { folderChannel, holdsEverything, syncChannels, type ChannelSync } from '@inqbeta/q-core/storage-channels';
import { googleChannel } from '$lib/google-channel';
import { CLOUDS, cloudChannel } from '$lib/cloud-channels';

const EVERY_MS = 5 * 60 * 1000;

export interface CloudState {
	/** 'google-drive', 'dropbox' or 'onedrive'. */
	kind: string;
	called: string;
	at?: string;
	/** Asked after the sync, and it holds every locked file here — so it counts as a backup. */
	holdsAll?: boolean;
	result?: ChannelSync;
	error?: string;
}
let cloud: CloudState[] = [];
const listeners = new Set<(c: CloudState[]) => void>();

export function watchCloud(fn: (c: CloudState[]) => void): () => void {
	listeners.add(fn);
	fn(cloud);
	return () => listeners.delete(fn);
}

/** Sync every connected cloud channel now. */
export async function syncCloudNow(): Promise<CloudState[]> {
	const did = folderOwner();
	const main = primaryHandle();
	if (!did || !main) return cloud;
	const out: CloudState[] = [];
	/* Google Drive, Dropbox, OneDrive: each one connected is brought level. */
	const connected = [await googleChannel(did).catch(() => null), ...(await Promise.all(CLOUDS.map((c) => cloudChannel(c.id, did).catch(() => null))))].filter(
		(c): c is NonNullable<typeof c> => !!c
	);
	const vault = folderChannel(main, { id: 'vault', called: 'this vault', kind: 'this-browser' });
	for (const g of connected) {
		try {
			const result = await syncChannels(vault, g, did);
			const holdsAll = !result.failed.length && !result.damaged.length && (await holdsEverything(vault, g));
			if (holdsAll) noteCarried();
			out.push({ kind: g.kind, called: g.called, at: result.at, result, holdsAll });
		} catch (e) {
			out.push({ kind: g.kind, called: g.called, at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) });
		}
	}
	cloud = out;
	for (const fn of listeners) fn(cloud);
	return cloud;
}

/**
 * Before signing out: carry everything out now, and wait for it (up to 20
 * seconds), so nothing made on this device is left behind on it.
 */
export async function flushSync(): Promise<{ ok: boolean; says: string }> {
	if (!navigator.onLine) return { ok: false, says: 'You’re offline, so what’s new stays on this device until you’re back online here.' };
	const run = (async () => {
		await syncAllQuietly().catch(() => []);
		const clouds = await syncCloudNow().catch(() => [] as CloudState[]);
		const failed = clouds.filter((c) => c.error);
		if (!clouds.length) return { ok: true, says: '' };
		return failed.length
			? { ok: false, says: `${failed.map((c) => c.called).join(', ')} didn’t take the latest: ${failed[0].error}` }
			: { ok: true, says: `Saved to ${clouds.map((c) => c.called).join(' and ')}.` };
	})();
	const late = new Promise<{ ok: boolean; says: string }>((r) => setTimeout(() => r({ ok: false, says: 'Your backup is taking a long time. It carries on next time you’re signed in here.' }), 20_000));
	return Promise.race([run, late]);
}

export function startAutoSync(onDone?: () => void): () => void {
	let running = false;
	async function tick() {
		/* Hidden is fine for a sync a write asked for: a phone locking straight after a call still sends it. */
		if (running || !navigator.onLine) return;
		running = true;
		try {
			const folders = await syncAllQuietly();
			const clouds = await syncCloudNow();
			const moved =
				folders.some((o) => (o.result?.sent ?? 0) + (o.result?.received ?? 0) > 0) ||
				clouds.some((c) => (c.result?.sent ?? 0) + (c.result?.received ?? 0) > 0);
			if (moved) onDone?.();
		} catch {
			/* Next tick tries again; /nodes shows each channel's last sync. */
		} finally {
			running = false;
		}
	}
	const timer = setInterval(() => document.visibilityState === 'visible' && void tick(), EVERY_MS);
	/*
	 * At the point of the transaction: a few seconds after anything new is
	 * written (a call's receipts, a message, a card), it's carried out. One
	 * burst of writes is one sync; a write during a sync runs one more after.
	 */
	let soon: ReturnType<typeof setTimeout> | null = null;
	let again = false;
	const stopWrites = watchWrites(() => {
		if (soon) clearTimeout(soon);
		soon = setTimeout(async () => {
			soon = null;
			if (running) return void (again = true);
			await tick();
			if (again) {
				again = false;
				void tick();
			}
		}, 3000);
	});
	const onVisible = () => {
		if (document.visibilityState === 'visible') void tick();
	};
	document.addEventListener('visibilitychange', onVisible);
	window.addEventListener('online', onVisible);
	void tick();
	return () => {
		clearInterval(timer);
		stopWrites();
		if (soon) clearTimeout(soon);
		document.removeEventListener('visibilitychange', onVisible);
		window.removeEventListener('online', onVisible);
	};
}
