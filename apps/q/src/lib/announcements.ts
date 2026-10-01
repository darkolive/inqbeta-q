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
import { checkAnnouncement, type Announcement } from '@inqbeta/q-core/announcements';

export const ANNOUNCEMENTS_FILE_SCHEMA = 'inqbeta.announcements/1';
export interface AnnouncementsFile {
	schema: typeof ANNOUNCEMENTS_FILE_SCHEMA;
	federation: string;
	announcements: Announcement[];
}

/** The live, genuine announcements of this federation, newest first. Never throws. */
export async function readAnnouncements(federation: string): Promise<Announcement[]> {
	try {
		const r = await fetch('/announcements.json', { cache: 'no-store' });
		if (!r.ok) return [];
		const f = (await r.json()) as AnnouncementsFile;
		if (f?.schema !== ANNOUNCEMENTS_FILE_SCHEMA || f.federation !== federation || !Array.isArray(f.announcements)) return [];
		const out: Announcement[] = [];
		for (const a of f.announcements) if ((await checkAnnouncement(a, federation)).ok) out.push(a);
		return out.sort((a, b) => b.at.localeCompare(a.at));
	} catch {
		return [];
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

/* Read or not, on this device. Reading doesn't clear one — it stays until its time is over. */
const READ_KEY = 'q.announcements.read';
export function readIds(): Set<string> {
	try {
		return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? '[]') as string[]);
	} catch {
		return new Set();
	}
}
export function markRead(id: string): void {
	try {
		const s = readIds();
		s.add(id);
		localStorage.setItem(READ_KEY, JSON.stringify([...s]));
	} catch {
		/* No storage: it simply shows as new again next time. */
	}
}
