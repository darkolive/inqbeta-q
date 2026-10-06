/*
 * Writing to an office, from the asker's side (ADR-Q-037; ADR-Q-038, 6 October
 * 2026): one conversation with the office, shown as the federation — its logo
 * and name, and the office — never the face of whoever holds it.
 */
import { MESSAGE_SCHEMA } from '@inqbeta/q-core/inbox';
import { officeAddresses, revokedSet, type OfficeAddress } from '@inqbeta/q-core/offices';
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
