/*
 * Writing to an office, from the asker's side (ADR-Q-037; ADR-Q-038, 6 October
 * 2026): one conversation with the office, shown as the federation — its logo
 * and name, and the office — never the face of whoever holds it.
 */
import { MESSAGE_SCHEMA } from '@inqbeta/q-core/inbox';
import { archiveItem, officeAddresses, officeIdentities, readArchive, revokedSet, type OfficeAddress, type OfficeId, type OfficeKeyring } from '@inqbeta/q-core/offices';
import { current } from '@inqbeta/q-core/passkey';
import { sealTo, openWith, checkReceipt, type SealedToPeople } from '@inqbeta/q-core/seal';
import { shelfPut, shelfRead, shelfClear, shelves } from '@inqbeta/q-core/folder';
import { officeName } from '$lib/role.svelte';
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

/* ---- The office shelf (ADR-Q-038): the working copy, in your folder, sealed to the office ---- *
 * "Office records" in your working folder, one shelf per office you hold:
 * each letter sealed to the office's key, never in your personal backup,
 * emptied when the office ends. The record itself is the archive on the
 * federation's storage; the shelf is what this device works from.
 */
const KEYS = 'q.office-keys';
const keyMap = (): Record<string, string> => {
	try {
		return JSON.parse(localStorage.getItem(KEYS) ?? '{}') as Record<string, string>;
	} catch {
		return {};
	}
};
/** The office's key now (a public DID, from the appointment), so arriving post can be shelved sealed to it. */
export function rememberOfficeKey(federation: string, office: string, key: string): void {
	try {
		localStorage.setItem(KEYS, JSON.stringify({ ...keyMap(), [`${federation}|${office}`]: key }));
	} catch {
		/* the shelf waits for the desk */
	}
}
function forgetOfficeKey(federation: string, office: string): void {
	const m = keyMap();
	delete m[`${federation}|${office}`];
	try {
		localStorage.setItem(KEYS, JSON.stringify(m));
	} catch {
		/* nothing kept */
	}
}
/** The shelf's name on disk: readable in Finder, unique per federation and office. */
export const shelfName = (federation: string, office: string) => `${officeName(office)} of ${federation.slice(-10)}`;

/** Put a letter for an office on its shelf, sealed to the office's key. Nothing if the key isn't known here yet. */
export async function shelveOfficePost(m: Signed): Promise<void> {
	const ref = m.content.office ?? m.content.fromOffice;
	const key = ref ? keyMap()[`${ref.federation}|${ref.office}`] : undefined;
	if (!ref || !key) return;
	const { sealed } = await sealTo(m, [key], `The ${officeName(ref.office).toLowerCase()}’s records`, { zip: true });
	await shelfPut(shelfName(ref.federation, ref.office), `${m.contentHash.slice(0, 24)}.json`, JSON.stringify(sealed)).catch(() => false);
}

/** What's on an office's shelf, opened with its keys. */
export async function readShelf(ring: OfficeKeyring): Promise<Signed[]> {
	const ids = await officeIdentities(ring);
	const out: Signed[] = [];
	for (const text of await shelfRead(shelfName(ring.federation, ring.office)).catch(() => [])) {
		try {
			const sealed = JSON.parse(text) as SealedToPeople;
			const id = ids.find((k) => sealed.recipients?.some((r) => r.did === k.did));
			if (!id) continue;
			const opened = await openWith(sealed, id);
			if (opened.ok && (await checkReceipt(opened.body)).ok) out.push(opened.body as Signed);
		} catch {
			/* not one of ours */
		}
	}
	return out;
}

/** The office has ended: empty its shelf, and forget its key here. Its papers stay with the federation. */
export async function clearShelf(federation: string, office: string): Promise<void> {
	await shelfClear(shelfName(federation, office));
	forgetOfficeKey(federation, office);
}

/** Empty every shelf for an office you no longer hold. */
export async function tidyShelves(held: { federation: string; office: string }[]): Promise<void> {
	const keep = new Set(held.map((h) => shelfName(h.federation, h.office)));
	for (const s of await shelves().catch(() => [])) if (!keep.has(s)) await shelfClear(s);
	const m = keyMap();
	for (const k of Object.keys(m)) {
		const [federation, office] = k.split('|');
		if (!held.some((h) => h.federation === federation && h.office === office)) forgetOfficeKey(federation, office);
	}
}
