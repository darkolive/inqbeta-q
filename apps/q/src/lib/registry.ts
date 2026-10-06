/*
 * Reading Incubator's registry (ADR-Q-021 addendum, 6 October 2026), checked
 * on this device: each card against its signatures, each registration against
 * Incubator's registrar, the latest card by its chain.
 */
import { checkCard, checkPutForward, checkRegistration, latestCard, CLUB_ON_HOST_SCHEMA, type ClubOnHostReceipt, type FederationCard, type RegisteredReceipt } from '@inqbeta/q-core/registration';
import { checkReceipt } from '@inqbeta/q-core/seal';
import { env } from '$env/dynamic/public';

/** Where Incubator is: inqbeta.com, for every copy; PUBLIC_INCUBATOR points elsewhere for testing (http://localhost:5173, say). */
export const incubatorOrigin = () => (env.PUBLIC_INCUBATOR?.trim() || 'https://inqbeta.com').replace(/\/$/, '');

export interface Entry {
	card: FederationCard;
	registered: RegisteredReceipt;
	/** Holds now: signed, registered by Incubator, running. */
	holds: boolean;
	says: string;
}

async function checked(items: unknown[], registrar: string | null): Promise<Entry[]> {
	const out: Entry[] = [];
	for (const x of items) {
		const { card, registered } = (x ?? {}) as { card?: FederationCard; registered?: RegisteredReceipt };
		if (!card || !registered || !(await checkCard(card)).ok) continue;
		const r = registrar ? await checkRegistration(registered, card, registrar) : { ok: false, says: 'Incubator’s registrar isn’t known here.' };
		out.push({ card, registered, holds: r.ok, says: r.says });
	}
	return out;
}

/** A federation's whole history, and its latest card. */
export async function readRegistration(federation: string): Promise<{ latest: Entry | null; history: Entry[] }> {
	const r = await fetch(`${incubatorOrigin()}/api/registry?federation=${encodeURIComponent(federation)}`).catch(() => null);
	const body = r?.ok ? ((await r.json().catch(() => null)) as { registrar?: string | null; items?: unknown[] } | null) : null;
	const history = await checked(body?.items ?? [], body?.registrar ?? null);
	const card = await latestCard(history.map((e) => e.card));
	const latest = card ? (history.filter((e) => e.card === card || e.card.at === card.at).at(-1) ?? null) : null;
	return { latest, history };
}

/** The public directory: every public registration still running. */
export async function readDirectory(): Promise<Entry[]> {
	const r = await fetch(`${incubatorOrigin()}/api/registry`).catch(() => null);
	const body = r?.ok ? ((await r.json().catch(() => null)) as { registrar?: string | null; items?: unknown[] } | null) : null;
	return (await checked(body?.items ?? [], body?.registrar ?? null)).filter((e) => e.holds && e.card.visibility === 'public');
}

/** A card's logo, as a full address on its own site. */
export const logoOf = (c: FederationCard) => (c.logo ? (/^https?:/.test(c.logo) ? c.logo : `${c.site}${c.logo.startsWith('/') ? '' : '/'}${c.logo}`) : undefined);

/*
 * Trust travels down (ADR-Q-019 addendum, 6 October 2026): what someone about
 * to join should know about the host. Registered with its core checked, a
 * named branch of Q, or not registered: Q can't vouch for who runs it.
 */
export type HostTrust =
	| { state: 'registered'; entry: Entry; says: string }
	| { state: 'branch'; entry: Entry; says: string }
	| { state: 'unchecked'; entry: Entry; says: string }
	| { state: 'not'; says: string };

export async function hostTrust(federation: string, depth = 0): Promise<HostTrust> {
	const { latest } = await readRegistration(federation);
	if (!latest?.holds) return { state: 'not', says: 'It isn’t registered with Incubator, so Q can’t vouch for who runs it or what it runs.' };
	/* A club holds only while its host does. */
	const host = latest.registered.content.host;
	if (host && depth === 0) {
		const h = await hostTrust(host, 1);
		if (h.state === 'not') return { state: 'not', says: 'Its host isn’t registered with Incubator now, so it can’t be either.' };
		if (h.state !== 'registered') return { ...h, entry: latest, says: `Registered through its host. ${h.says}` } as HostTrust;
		return { state: 'registered', entry: latest, says: `Registered with Incubator through its host, ${h.entry.card.name}, which runs Q’s core unchanged.` };
	}
	const core = latest.registered.content.core;
	if (core?.kind === 'unchanged') return { state: 'registered', entry: latest, says: `Registered with Incubator, running Q’s core unchanged (release ${core.release}).` };
	if (core?.kind === 'branch') return { state: 'branch', entry: latest, says: `Registered with Incubator, running its own branch of Q, with its source named.` };
	return { state: 'unchecked', entry: latest, says: 'Registered with Incubator while testing; its core hasn’t been checked.' };
}

/** The clubs a host has put forward, each countersigned by Incubator's registrar, checked here. */
export async function readClubs(host: string): Promise<ClubOnHostReceipt[]> {
	const r = await fetch(`${incubatorOrigin()}/api/registry?clubs=${encodeURIComponent(host)}`).catch(() => null);
	const body = r?.ok ? ((await r.json().catch(() => null)) as { registrar?: string | null; items?: unknown[] } | null) : null;
	const out: ClubOnHostReceipt[] = [];
	for (const x of body?.items ?? []) {
		const c = x as ClubOnHostReceipt;
		if (c?.content?.schema !== CLUB_ON_HOST_SCHEMA || c.did !== body?.registrar || c.content.host !== host) continue;
		if ((await checkReceipt(c)).ok && (await checkPutForward(c.content.putForward)).ok) out.push(c);
	}
	return out;
}

/** The link a club's founder sends their host's caretaker, to be put forward. */
export const putForwardLink = (origin: string, host: string, club: string, name: string) =>
	`${origin}/federations/one?id=${encodeURIComponent(host)}#put-forward=${encodeURIComponent(club)}~${encodeURIComponent(name)}`;

export function readPutForwardHash(hash: string): { club: string; name: string } | null {
	const m = /^#put-forward=([^~]+)~(.*)$/.exec(hash);
	if (!m) return null;
	const club = decodeURIComponent(m[1]);
	return /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/.test(club) ? { club, name: decodeURIComponent(m[2]).slice(0, 120) } : null;
}
