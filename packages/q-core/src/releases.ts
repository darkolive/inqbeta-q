/*
 * A release: the site map, signed with the site's authority. ADR-Q-003 §5.
 *
 * Until now a site map was signed by the founder's own DID. A release is the
 * same map (site.ts — same schema, same checkSite) with the "why I may"
 * beside it: an invocation of /site/publish, for this domain and this exact
 * map, and the grants that lead back to the site's own key. So whoever holds
 * the site key — today Darren, after a sale somebody else — is whoever can
 * release it, and anyone can check that from the file alone.
 *
 * The map is named by its CORE (domain, files, pages, previous) so the
 * invocation can name it without naming itself.
 *
 * Carriers — Vercel, Cloudflare, a mini PC, a federation's nodes — take a
 * release and serve it. None of them is trusted: every file is named by its
 * hash and the release is signed, so any copy can be checked.
 *
 * Pure.
 */
import { b64url, canonical, unb64url } from './canonical';
import { sha256Hex } from './vault';
import { checkReceipt, sealWith, type SealedReceipt } from './seal';
import { signerFor, type Identity } from './passkey';
import { SITE_SCHEMA, siteContent, type SiteContent } from './site';
import { SITE_COMMANDS, actFor, checkAuthority, checkFounding, type Founding } from './sites';
import { readDelegation, readInvocation, type Delegation } from './ucan/token';
import type { KnownRevocation } from './ucan/validate';

export interface ReleaseContent extends SiteContent {
	/** The site's own key. */
	site: string;
	/** The /site/publish invocation, UCAN bytes, base64url. */
	authority: string;
	/** The chain that allows it, from the site key down. */
	grants: string[];
}

export function isRelease(x: unknown): x is SealedReceipt & { content: ReleaseContent } {
	const c = (x as SealedReceipt | null)?.content as ReleaseContent | undefined;
	return !!c && c.schema === SITE_SCHEMA && typeof c.site === 'string' && typeof c.authority === 'string' && Array.isArray(c.grants);
}

/** The hash a release's authority names: the map, without the authority. */
export async function mapId(c: Pick<SiteContent, 'domain' | 'files' | 'pages' | 'previous'>): Promise<string> {
	const core = { domain: c.domain, files: c.files, pages: c.pages, ...(c.previous ? { previous: c.previous } : {}) };
	return sha256Hex(new TextEncoder().encode(canonical(core)));
}

/** The hash the NEXT release names this one by, as `previous`. */
export async function releaseId(c: SiteContent): Promise<string> {
	return sha256Hex(new TextEncoder().encode(canonical(c)));
}

export async function signRelease(
	identity: Identity,
	map: { domain: string; files: Record<string, string>; pages?: Record<string, string>; previous?: string },
	o: { site: string; grants: Delegation[] }
): Promise<SealedReceipt & { content: ReleaseContent }> {
	const core = siteContent(map);
	const id = await mapId(core);
	const invocation = await actFor(signerFor(identity), {
		site: o.site,
		cmd: SITE_COMMANDS.publish,
		proofs: o.grants,
		args: { domain: core.domain, map: id }
	});
	const content: ReleaseContent = {
		...core,
		site: o.site,
		authority: b64url(invocation.bytes),
		grants: o.grants.map((g) => b64url(g.bytes))
	};
	return (await sealWith(identity, content)) as SealedReceipt & { content: ReleaseContent };
}

export type ReleaseCheck = { ok: true; content: ReleaseContent; by: string; id: string; says: string } | { ok: false; says: string };

/** Whether a release holds, offline, from itself (and the site's founding). Never throws. */
export async function checkRelease(receipt: unknown, o: { founding?: Founding; revocations?: KnownRevocation[] } = {}): Promise<ReleaseCheck> {
	if (!isRelease(receipt)) return { ok: false, says: 'That is not a release of a site.' };
	const r = await checkReceipt(receipt);
	if (!r.ok) return { ok: false, says: r.says };
	const c = receipt.content;
	let id: string;
	try {
		id = await mapId(siteContent(c));
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
	if (o.founding) {
		const f = await checkFounding(o.founding);
		if (!f.ok) return { ok: false, says: f.says };
		if (o.founding.site !== c.site) return { ok: false, says: 'This release is for a different site.' };
		if (o.founding.domain !== c.domain) return { ok: false, says: `This release is for ${c.domain}, not ${o.founding.domain}.` };
	}
	try {
		const inv = await readInvocation(unb64url(c.authority));
		const grants = await Promise.all(c.grants.map((g) => readDelegation(unb64url(g))));
		if (inv.payload.iss !== receipt.did) return { ok: false, says: 'The permission was used by someone other than the signer.' };
		if (inv.payload.args.map !== id || inv.payload.args.domain !== c.domain) return { ok: false, says: 'The permission was for a different release.' };
		const a = checkAuthority(inv, { site: c.site, cmd: SITE_COMMANDS.publish, proofs: grants, revocations: o.revocations });
		if (!a.ok) return { ok: false, says: `Not allowed to release this site: ${a.says}` };
	} catch (e) {
		return { ok: false, says: `The permission could not be read: ${e instanceof Error ? e.message : String(e)}` };
	}
	return { ok: true, content: c, by: receipt.did, id: await releaseId(c), says: `${Object.keys(c.files).length} files, released with the authority of ${c.domain}'s own key.` };
}
