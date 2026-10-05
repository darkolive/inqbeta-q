/*
 * Q's home federation (ADR-Q-016): Incubator. Signing up is joining it.
 *
 * The caretaker publishes a standing invitation — signed by the federation
 * key, renewed at most every 90 days — as /incubator.json on the site. Every
 * Q reads it and CHECKS IT ITSELF (checkInvitation): the signatures, the
 * founding, the manifest. The server that served the file is trusted with
 * nothing; a file someone swapped fails the check and is ignored.
 */
import { onDevelopmentSite } from '$lib/site';
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
	/**
	 * Where the federation's services answer from the internet (ADR-Q-016 step
	 * 5). Not trusted for truth: everything collected from them is checked
	 * against the federation's signature. Step 3 makes this a signed list.
	 */
	services?: { storage?: string; bellboy?: string };
	/**
	 * The host's logo (ADR-Q-018 §2), a path on this site with its fingerprint:
	 * /host/logo.webp?v=<first 12 of its sha256>. Not signed yet; only ever an
	 * image of the host's own choosing.
	 */
	logo?: string;
}

export type Home =
	| { ok: true; federation: string; name: string; purpose: string; joinHref: string; until: string; services: { storage?: string; bellboy?: string }; logo?: string; founder: string }
	| { ok: false; says: string };

/** Read /incubator.json and check it. Never throws. */
export async function readHome(): Promise<Home> {
	try {
		/* The development site reads its own host file, until founded the shared one (ADR-Q-034 §5). */
		let r = await fetch(onDevelopmentSite() ? '/dev/incubator.json' : '/incubator.json', { cache: 'no-store' });
		if (!r.ok && onDevelopmentSite()) r = await fetch('/incubator.json', { cache: 'no-store' });
		if (!r.ok) return { ok: false, says: 'No home federation published yet.' };
		const f = (await r.json()) as HomeFile;
		if (f?.schema !== HOME_SCHEMA) return { ok: false, says: 'The home federation file isn’t one.' };
		const inv = await unpack(f.invitation);
		if (!isInvitation(inv)) return { ok: false, says: 'The home invitation can’t be read.' };
		const check = await checkInvitation(inv);
		if (!check.ok) return { ok: false, says: check.says };
		if (inv.founding.federation !== f.federation) return { ok: false, says: 'The home invitation is for a different federation.' };
		const services = {
			...(typeof f.services?.storage === 'string' && /^https:\/\//.test(f.services.storage) ? { storage: f.services.storage.replace(/\/$/, '') } : {}),
			...(typeof f.services?.bellboy === 'string' && /^wss:\/\//.test(f.services.bellboy) ? { bellboy: f.services.bellboy } : {})
		};
		const logo = typeof f.logo === 'string' && /^(\/dev)?\/host\/logo\.(webp|png|jpg|svg)(\?v=[0-9a-f]+)?$/.test(f.logo) ? f.logo : undefined;
		return {
			ok: true,
			federation: f.federation,
			name: inv.founding.name,
			purpose: inv.manifest.constitution.purpose,
			joinHref: `/federations/join#${f.invitation}`,
			until: f.until,
			services,
			...(logo ? { logo } : {}),
			founder: inv.founding.root
		};
	} catch {
		return { ok: false, says: 'The home federation couldn’t be read.' };
	}
}
