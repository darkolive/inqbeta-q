/*
 * Q's home federation (ADR-Q-016): Incubator. Signing up is joining it.
 *
 * The caretaker publishes a standing invitation — signed by the federation
 * key, renewed at most every 90 days — as /incubator.json on the site. Every
 * Q reads it and CHECKS IT ITSELF (checkInvitation): the signatures, the
 * founding, the manifest. The server that served the file is trusted with
 * nothing; a file someone swapped fails the check and is ignored.
 */
import { checkInvitation, isInvitation, unpack } from '@inqbeta/q-core/membership';

export const HOME_SCHEMA = 'inqbeta.home-federation/1';
export interface HomeFile {
	schema: typeof HOME_SCHEMA;
	/** The federation's DID. */
	federation: string;
	name: string;
	purpose: string;
	/** The standing invitation, packed as a join link carries it. */
	invitation: string;
	/** When the invitation runs out, ISO. */
	until: string;
}

export type Home = { ok: true; federation: string; name: string; purpose: string; joinHref: string; until: string } | { ok: false; says: string };

/** Read /incubator.json and check it. Never throws. */
export async function readHome(): Promise<Home> {
	try {
		const r = await fetch('/incubator.json', { cache: 'no-store' });
		if (!r.ok) return { ok: false, says: 'No home federation published yet.' };
		const f = (await r.json()) as HomeFile;
		if (f?.schema !== HOME_SCHEMA) return { ok: false, says: 'The home federation file isn’t one.' };
		const inv = await unpack(f.invitation);
		if (!isInvitation(inv)) return { ok: false, says: 'The home invitation can’t be read.' };
		const check = await checkInvitation(inv);
		if (!check.ok) return { ok: false, says: check.says };
		if (inv.founding.federation !== f.federation) return { ok: false, says: 'The home invitation is for a different federation.' };
		return { ok: true, federation: f.federation, name: inv.founding.name, purpose: inv.manifest.constitution.purpose, joinHref: `/federations/join#${f.invitation}`, until: f.until };
	} catch {
		return { ok: false, says: 'The home federation couldn’t be read.' };
	}
}
