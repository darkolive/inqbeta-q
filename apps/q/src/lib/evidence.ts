/*
 * Show it evidence on this device (ADR-Q-033, the storyboard for courses;
 * 6 October 2026). What a learner keeps for an outcome's Show it, as hashed
 * records (q-core evidenceOf), under q.evidence: a list, newest last. A file
 * is kept by its fingerprint only; the file itself stays where it is. When
 * evidence moves into the vault, each record is sealed as a receipt.
 */
import { evidenceOf, type Book, type Evidence, type EvidenceFile, type Story } from '@inqbeta/q-core/storybook';

const KEY = 'q.evidence';

function readAll(): Evidence[] {
	try {
		const all = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Evidence[];
		return Array.isArray(all) ? all : [];
	} catch {
		return [];
	}
}

/** What's been kept for one outcome of one unit, oldest first. */
export const evidenceFor = (book: string, outcome: string) => readAll().filter((e) => e.book === book && e.outcome === outcome);

/** A file's fingerprint, read in the browser. */
export async function fingerprint(file: File): Promise<EvidenceFile> {
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
	return { name: file.name, type: file.type, size: file.size, sha256: Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('') };
}

/** Keep evidence. Throws with what to do when there's nothing to keep, or this browser won't keep it. */
export async function keepEvidence(book: Book, outcome: Story, kept: { words?: string; file?: File | null }): Promise<Evidence> {
	const e = await evidenceOf(book, outcome, { words: kept.words, file: kept.file ? await fingerprint(kept.file) : undefined });
	try {
		localStorage.setItem(KEY, JSON.stringify([...readAll(), e]));
	} catch {
		throw new Error('This browser isn’t keeping things (a private window, or it’s full). Nothing was kept.');
	}
	return e;
}
