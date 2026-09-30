/*
 * An article on a site is a chain of signed versions. ADR-Q-003 §4.
 *
 * Every save in Write is a version receipt: the whole page (the design, not a
 * diff), its address, the version it came from, and — beside the "what" — the
 * "why I may": an invocation of /site/edit for this article and this page,
 * with the grants that allow it. Signed by whoever wrote it.
 *
 * So a version can be checked by anyone, from itself:
 *   - the receipt's signature holds and its content is unchanged;
 *   - the page is the page it names (the address is recomputed);
 *   - the signer was allowed to edit THIS site, through a chain that starts
 *     at the site's own key.
 *
 * Draft and published are positions in the chain, not states of a file: a
 * site's folder (and its releases) name exactly one version of each article.
 *
 * Pure.
 */
import { b64url, canonical, unb64url } from './canonical';
import { contentAddress } from './vault';
import { PAGE_SCHEMA, type Page } from './pages';
import { checkReceipt, sealWith, type SealedReceipt } from './seal';
import { signerFor, type Identity } from './passkey';
import { SITE_COMMANDS, actFor, checkAuthority, checkFounding, type Founding } from './sites';
import { readDelegation, readInvocation, type Delegation } from './ucan/token';
import type { KnownRevocation } from './ucan/validate';

export const VERSION_SCHEMA = 'inqbeta.article-version/1';

/** Where an article sits on its site. Closed: a folder name is never typed freely. */
export const SECTIONS = ['projects', 'posts'] as const;
export type Section = (typeof SECTIONS)[number];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlug(s: string): boolean {
	return SLUG.test(s) && s.length <= 80;
}

/** A title as the slug it would be given. */
export function slugOf(title: string): string {
	return (
		title
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 80)
			.replace(/-$/, '') || 'untitled'
	);
}

export interface VersionContent {
	source: 'inqbeta:q/article-version';
	kind: 'article-version';
	schema: typeof VERSION_SCHEMA;
	/** The site's key. */
	site: string;
	domain: string;
	section: Section;
	slug: string;
	page: Page;
	/** content://sha256/… of the page. */
	address: string;
	/** The address this version was made from. null for an article's first. */
	parent: string | null;
	/** /site/edit invocation, UCAN bytes, base64url. */
	authority: string;
	/** The grants it rests on, root first, UCAN bytes, base64url. */
	grants: string[];
}

export const pageAddress = (page: Page) => contentAddress(new TextEncoder().encode(canonical(page)));

/** Sign a version of an article. `grants` is how `identity` may edit the site, root first. */
export async function writeVersion(
	identity: Identity,
	o: { site: string; domain: string; section: Section; slug: string; page: Page; parent: string | null; grants: Delegation[] }
): Promise<SealedReceipt> {
	if (!(SECTIONS as readonly string[]).includes(o.section)) throw new Error(`“${o.section}” is not a section of the site.`);
	if (!isSlug(o.slug)) throw new Error(`“${o.slug}” cannot be an article's address. Use lower-case letters, numbers and hyphens.`);
	if (o.page?.schema !== PAGE_SCHEMA) throw new Error('That is not a page.');
	const address = await pageAddress(o.page);
	const invocation = await actFor(signerFor(identity), {
		site: o.site,
		cmd: SITE_COMMANDS.edit,
		proofs: o.grants,
		args: { article: `${o.section}/${o.slug}`, page: address }
	});
	const content: VersionContent = {
		source: 'inqbeta:q/article-version',
		kind: 'article-version',
		schema: VERSION_SCHEMA,
		site: o.site,
		domain: o.domain,
		section: o.section,
		slug: o.slug,
		page: o.page,
		address,
		parent: o.parent,
		authority: b64url(invocation.bytes),
		grants: o.grants.map((g) => b64url(g.bytes))
	};
	return sealWith(identity, content);
}

export function isVersion(x: unknown): x is SealedReceipt & { content: VersionContent } {
	return (x as SealedReceipt)?.content !== undefined && ((x as SealedReceipt).content as VersionContent)?.schema === VERSION_SCHEMA;
}

export type VersionCheck = { ok: true; content: VersionContent; by: string; says: string } | { ok: false; says: string };

/**
 * Check a version, from itself — and, when `founding` is given, that the site
 * it claims is that founded site. Never throws.
 */
export async function checkVersion(
	receipt: unknown,
	o: { founding?: Founding; revocations?: KnownRevocation[] } = {}
): Promise<VersionCheck> {
	if (!isVersion(receipt)) return { ok: false, says: 'That is not a version of an article.' };
	const r = await checkReceipt(receipt);
	if (!r.ok) return { ok: false, says: r.says };
	const c = receipt.content;
	if (!(SECTIONS as readonly string[]).includes(c.section) || !isSlug(c.slug)) return { ok: false, says: 'The article is not in a place the site has.' };
	if ((await pageAddress(c.page)) !== c.address) return { ok: false, says: 'The page is not the page this version names.' };
	if (o.founding) {
		const f = await checkFounding(o.founding);
		if (!f.ok) return { ok: false, says: f.says };
		if (o.founding.site !== c.site) return { ok: false, says: 'This version is for a different site.' };
		if (o.founding.domain !== c.domain) return { ok: false, says: `This version is for ${c.domain}, not ${o.founding.domain}.` };
	}
	try {
		const inv = await readInvocation(unb64url(c.authority));
		const grants = await Promise.all(c.grants.map((g) => readDelegation(unb64url(g))));
		if (inv.payload.iss !== receipt.did) return { ok: false, says: 'The permission was used by someone other than the signer.' };
		if (inv.payload.args.page !== c.address || inv.payload.args.article !== `${c.section}/${c.slug}`)
			return { ok: false, says: 'The permission was for a different article or page.' };
		const a = checkAuthority(inv, { site: c.site, cmd: SITE_COMMANDS.edit, proofs: grants, revocations: o.revocations });
		if (!a.ok) return { ok: false, says: `Not allowed to edit this site: ${a.says}` };
	} catch (e) {
		return { ok: false, says: `The permission could not be read: ${e instanceof Error ? e.message : String(e)}` };
	}
	return { ok: true, content: c, by: receipt.did, says: `${c.section}/${c.slug}, signed by someone allowed to edit ${c.domain}.` };
}
