/*
 * Writing to an office, from the asker's side (ADR-Q-037; ADR-Q-038, 6 October
 * 2026): one conversation with the office, shown as the federation — its logo
 * and name, and the office — never the face of whoever holds it.
 */
import { MESSAGE_SCHEMA } from '@inqbeta/q-core/inbox';
import { archiveItem, officeAddresses, officeIdentities, readArchive, revokedSet, type OfficeAddress, type OfficeId, type OfficeKeyring } from '@inqbeta/q-core/offices';
import { current } from '@inqbeta/q-core/passkey';
import { readHome } from '$lib/home';
import type { Signed } from '$lib/messages';

export interface OfficeRef {
	federation: string;
	office: string;
	/** The federation's name, as the office said it. */
	name?: string;
}

/** The office a message belongs to, for the person who wrote to it: what they asked, and what the office answered. */
export function officeOfMine(m: Signed, me: string): OfficeRef | null {
	if (m.did === me && m.content.office) return { federation: m.content.office.federation, office: m.content.office.office };
	if (m.content.to === me && m.content.fromOffice) return { federation: m.content.fromOffice.federation, office: m.content.fromOffice.office, ...(m.content.fromOffice.name ? { name: m.content.fromOffice.name } : {}) };
	return null;
}

export const officeHref = (r: { federation: string; office: string }) => `/messages/office/${encodeURIComponent(r.federation)}/${encodeURIComponent(r.office)}`;

/** Your conversation with one office: what you asked it, and what it answered, oldest first. */
export function officeConversation(receipts: { json?: unknown }[], me: string, federation: string, office: string): Signed[] {
	const out: Signed[] = [];
	const seen = new Set<string>();
	for (const r of receipts) {
		const s = r.json as Signed | undefined;
		if (s?.content?.schema !== MESSAGE_SCHEMA || s.content.kind !== 'message' || seen.has(s.signature)) continue;
		const o = officeOfMine(s, me);
		if (!o || o.federation !== federation || o.office !== office) continue;
		seen.add(s.signature);
		out.push(s);
	}
	return out.sort((a, b) => a.content.at.localeCompare(b.content.at));
}

/** How the federation looks: its name and logo, where this host knows them (its own federation). */
export async function federationLook(federation: string, fallbackName?: string): Promise<{ name: string; logo?: string }> {
	const h = await readHome().catch(() => null);
	if (h?.ok && h.federation === federation) return { name: h.name, ...(h.logo ? { logo: h.logo } : {}) };
	return { name: fallbackName ?? 'A federation' };
}

/** Who holds the office now, with their hours: from the host's node, each notice checked here. Only for this host's own federation. */
export async function officeHoldersNow(federation: string, office: string): Promise<OfficeAddress[]> {
	const h = await readHome().catch(() => null);
	const storage = h?.ok && h.federation === federation ? h.services.storage?.replace(/\/$/, '') : undefined;
	if (!storage) return [];
	const get = async (path: string) => {
		const r = await fetch(`${storage}/${path}/${federation}`, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
		return r?.ok ? (((await r.json().catch(() => null)) as { items?: unknown[] } | null)?.items ?? []) : [];
	};
	const [posts, revoked] = await Promise.all([get('offices'), get('revoked')]);
	return (await officeAddresses(posts, federation, { revoked: await revokedSet(revoked, federation) })).filter((a) => a.office === office);
}

/* ---- The office's records (ADR-Q-038): kept by the federation, read by whoever holds the office ---- */

async function storageFor(federation: string): Promise<string | undefined> {
	const h = await readHome().catch(() => null);
	return h?.ok && h.federation === federation ? h.services.storage?.replace(/\/$/, '') : undefined;
}

/** File a letter in the office's records on the federation's node: sealed to the office's key, signed by you. */
export async function fileInOfficeRecords(o: { federation: string; office: string; officeKey: string }, letter: Signed): Promise<boolean> {
	const me = current();
	const storage = await storageFor(o.federation);
	if (!me || !storage) return false;
	const item = await archiveItem(me, { federation: o.federation, office: o.office as OfficeId, officeKey: o.officeKey, body: letter });
	const r = await fetch(`${storage}/archive/${o.federation}/${o.officeKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(item) }).catch(() => null);
	return !!r?.ok;
}

/** The office's records, opened with every key it has had: all its letters, years back. Only signed letters about this office count. */
export async function readOfficeRecords(ring: OfficeKeyring): Promise<Signed[]> {
	const storage = await storageFor(ring.federation);
	if (!storage) return [];
	const items: unknown[] = [];
	for (const k of ring.keys) {
		const r = await fetch(`${storage}/archive/${ring.federation}/${k.did}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
		if (r?.ok) items.push(...((((await r.json().catch(() => null)) as { items?: unknown[] } | null)?.items) ?? []));
	}
	const out: Signed[] = [];
	for (const x of await readArchive(items, await officeIdentities(ring))) {
		const m = x.body as Signed;
		if (m?.content?.schema !== MESSAGE_SCHEMA || m.did !== x.filedBy) continue;
		const about = m.content.office ?? m.content.fromOffice;
		if (about?.federation === ring.federation && about.office === ring.office) out.push(m);
	}
	return out;
}

/* ---- The working copy: post for an office, on this device only, until the archive has it ---- */
const CACHE = 'q.office-cache';
const CACHE_MOST = 200;
export function cacheOfficePost(m: Signed): void {
	try {
		const all = JSON.parse(localStorage.getItem(CACHE) ?? '[]') as Signed[];
		if (all.some((x) => x.signature === m.signature)) return;
		localStorage.setItem(CACHE, JSON.stringify([...all, m].slice(-CACHE_MOST)));
	} catch {
		/* no room: the archive still has it */
	}
}
export function cachedOfficePost(): Signed[] {
	try {
		return JSON.parse(localStorage.getItem(CACHE) ?? '[]') as Signed[];
	} catch {
		return [];
	}
}
