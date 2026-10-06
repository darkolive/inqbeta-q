/*
 * Reading Incubator's registry (ADR-Q-021 addendum, 6 October 2026), checked
 * on this device: each card against its signatures, each registration against
 * Incubator's registrar, the latest card by its chain.
 */
import { checkCard, checkRegistration, latestCard, type FederationCard, type RegisteredReceipt } from '@inqbeta/q-core/registration';
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

export async function hostTrust(federation: string): Promise<HostTrust> {
	const { latest } = await readRegistration(federation);
	if (!latest?.holds) return { state: 'not', says: 'It isn’t registered with Incubator, so Q can’t vouch for who runs it or what it runs.' };
	const core = latest.registered.content.core;
	if (core?.kind === 'unchanged') return { state: 'registered', entry: latest, says: `Registered with Incubator, running Q’s core unchanged (release ${core.release}).` };
	if (core?.kind === 'branch') return { state: 'branch', entry: latest, says: `Registered with Incubator, running its own branch of Q, with its source named.` };
	return { state: 'unchecked', entry: latest, says: 'Registered with Incubator while testing; its core hasn’t been checked.' };
}
