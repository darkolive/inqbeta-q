/*
 * Auto-sync — "built in, every five minutes or whatever" (Darren, 2026-09-25).
 *
 * The browser's own storage stays the fast working copy. Every channel this
 * browser may already write to is brought level in the background: every five
 * minutes while the page is open, visible and online, and again when the page
 * comes back into view. Nothing is asked and nothing interrupts; a channel
 * that needs allowing again is skipped and shows as asleep on /nodes.
 *
 * Channels today: copy-location folders (replicas.ts) and Google Drive.
 */
import { syncAllQuietly } from '@inqbeta/q-core/replicas';
import { folderOwner, noteCarried, primaryHandle } from '@inqbeta/q-core/folder';
import { folderChannel, holdsEverything, syncChannels, type ChannelSync } from '@inqbeta/q-core/storage-channels';
import { googleChannel } from '$lib/google-channel';

const EVERY_MS = 5 * 60 * 1000;

export interface CloudState {
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
	const g = await googleChannel(did).catch(() => null);
	if (g) {
		try {
			const vault = folderChannel(main, { id: 'vault', called: 'this vault', kind: 'this-browser' });
			const result = await syncChannels(vault, g, did);
			const holdsAll = !result.failed.length && !result.damaged.length && (await holdsEverything(vault, g));
			if (holdsAll) noteCarried();
			out.push({ called: g.called, at: result.at, result, holdsAll });
		} catch (e) {
			out.push({ called: g.called, at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) });
		}
	}
	cloud = out;
	for (const fn of listeners) fn(cloud);
	return cloud;
}

export function startAutoSync(onDone?: () => void): () => void {
	let running = false;
	async function tick() {
		if (running || document.visibilityState !== 'visible' || !navigator.onLine) return;
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
	const timer = setInterval(() => void tick(), EVERY_MS);
	const onVisible = () => {
		if (document.visibilityState === 'visible') void tick();
	};
	document.addEventListener('visibilitychange', onVisible);
	window.addEventListener('online', onVisible);
	void tick();
	return () => {
		clearInterval(timer);
		document.removeEventListener('visibilitychange', onVisible);
		window.removeEventListener('online', onVisible);
	};
}
