/*
 * Announcements from Q's home federation (ADR-Q-016 §6).
 *
 * For now they travel the way the standing invitation does: the caretaker
 * signs them with the federation key in the Communication tab, and publishes
 * /announcements.json. Every Q checks each one against the federation's DID
 * before showing it, so the server is trusted with nothing. When the bellboy
 * has its public address (step 5), it rings members the moment one is out;
 * the announcement itself stays the same signed thing.
 */
import { checkAnnouncement, type Announcement, type Publication } from '@inqbeta/q-core/announcements';

export const ANNOUNCEMENTS_FILE_SCHEMA = 'inqbeta.announcements/1';
export interface AnnouncementsFile {
	schema: typeof ANNOUNCEMENTS_FILE_SCHEMA;
	federation: string;
	announcements: Announcement[];
}

/** Where a federation's announcements are kept on its storage unit. */
const atStorage = (storage: string, federation: string) => `${storage}/fed/${federation}/announcements.json`;

/**
 * The live, genuine announcements of this federation, newest first. From its
 * storage unit when it has one (ADR-Q-016 step 5), else the site's own file.
 * Either way each is checked against the federation's signature. Never throws.
 */
export async function readAnnouncements(federation: string, storage?: string): Promise<Announcement[]> {
	if (storage) {
		const got = await readFrom(atStorage(storage, federation), federation);
		if (got) return got;
	}
	return (await readFrom('/announcements.json', federation)) ?? [];
}

async function readFrom(url: string, federation: string): Promise<Announcement[] | null> {
	try {
		const r = await fetch(url, { cache: 'no-store' });
		if (!r.ok) return null;
		const f = (await r.json()) as AnnouncementsFile;
		if (f?.schema !== ANNOUNCEMENTS_FILE_SCHEMA || f.federation !== federation || !Array.isArray(f.announcements)) return null;
		const out: Announcement[] = [];
		for (const a of f.announcements) if ((await checkAnnouncement(a, federation)).ok) out.push(a);
		return out.sort((a, b) => b.at.localeCompare(a.at));
	} catch {
		return null;
	}
}

/** Send the federation's announcements to its storage unit; the gate checks and rings members. */
export async function publishAnnouncements(storage: string, federation: string, list: Announcement[], publication: Publication): Promise<{ ok: true } | { ok: false; says: string }> {
	try {
		const now = Date.now();
		const file: AnnouncementsFile = { schema: ANNOUNCEMENTS_FILE_SCHEMA, federation, announcements: list.filter((a) => Date.parse(a.until) > now) };
		const r = await fetch(atStorage(storage, federation), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ file, publication }),
			/* Never hang: after 15 seconds, say so and offer the file instead. */
			signal: AbortSignal.timeout(15_000)
		});
		const said = (await r.json().catch(() => ({}))) as { says?: string };
		return r.ok ? { ok: true } : { ok: false, says: said.says ?? `The storage unit said ${r.status}.` };
	} catch {
		return { ok: false, says: 'The storage unit didn’t answer in time.' };
	}
}

/** The file to publish: still-live announcements only. */
export function announcementsFile(federation: string, list: Announcement[]): string {
	const now = Date.now();
	const file: AnnouncementsFile = {
		schema: ANNOUNCEMENTS_FILE_SCHEMA,
		federation,
		announcements: list.filter((a) => Date.parse(a.until) > now)
	};
	return JSON.stringify(file, null, 2);
}

/* Read or not, on this device, for whoever is signed in (cleared when they sign out:
 * q-core storage.ts). Reading doesn't clear one — it stays until its time is over. */
export function readIds(): Set<string> {
	try {
		return new Set(JSON.parse(localStorage.getItem('q.announcements.read') ?? '[]') as string[]);
	} catch {
		return new Set();
	}
}
/** Put back the read marks your vault remembers, after signing in. */
export function restoreRead(ids: string[]): void {
	if (!ids.length) return;
	try {
		localStorage.setItem('q.announcements.read', JSON.stringify([...new Set([...readIds(), ...ids])]));
	} catch {
		/* no storage: they show as new this time */
	}
}

/** Mark something read: an announcement, or a message (by its content hash). */
export function markRead(...ids: string[]): void {
	try {
		const s = readIds();
		for (const id of ids) s.add(id);
		localStorage.setItem('q.announcements.read', JSON.stringify([...s]));
	} catch {
		/* No storage: it simply shows as new again next time. */
	}
	if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('q-read'));
}
