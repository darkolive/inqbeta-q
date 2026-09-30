/*
 * A whole website as one signed receipt.
 *
 * Darren, 2026-09-23: "you just need the home page, main DNS pointing, and
 * then all these other … can just have central coming off from that. So that
 * is an incredibly simple thing to have cached."
 *
 * A site map lists every file a build produced — path → SHA-256 of its bytes —
 * and every page it was drawn from — route → the page's content address. It
 * is signed once, in Q, with the passkey. Then:
 *
 *   - a file whose hash is in the map is exactly what was published, checked
 *     by anyone with the map and the file, with no server to ask;
 *   - a file named by its own hash (SvelteKit's _app/immutable/…) never
 *     changes, so every CDN may keep it for ever;
 *   - the only thing that changes between releases is WHICH map the domain
 *     serves. Publishing is signing a new map; rolling back is pointing at the
 *     last one. Nothing is overwritten.
 *
 * Pure: bytes in, answers out. Hashing a build folder is the site's script.
 */
import { canonical } from './canonical';
import { checkReceipt, sealWith, type ReceiptCheck, type SealedReceipt } from './seal';
import { sha256Hex } from './vault';
import type { Identity } from './passkey';

export const SITE_SCHEMA = 'inqbeta.site/1';

export interface SiteContent {
	source: 'inqbeta:q/site';
	kind: 'site-map';
	schema: typeof SITE_SCHEMA;
	/** Where it is served, e.g. `darkolive.co.uk`. */
	domain: string;
	/** Every file the build produced: path (no leading slash) → sha256 hex. */
	files: Record<string, string>;
	/** Route → content address of the block page it was drawn from. */
	pages: Record<string, string>;
	/** The map this one replaces, by the hash of its content. Absent for the first. */
	previous?: string;
}

const HEX = /^[0-9a-f]{64}$/;
const PATH = /^(?!\/)(?!.*(^|\/)\.\.?(\/|$))[^\0]+$/;
const ADDRESS = /^content:\/\/sha256\/[0-9a-f]{64}$/;

const sortedObject = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

/** Build the content of a site map, refusing anything malformed. */
export function siteContent(input: { domain: string; files: Record<string, string>; pages?: Record<string, string>; previous?: string }): SiteContent {
	const domain = input.domain.trim().toLowerCase();
	if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) && domain !== 'localhost') throw new Error(`“${input.domain}” is not a domain.`);
	const files = Object.entries(input.files);
	if (!files.length) throw new Error('A site with no files is not a site.');
	for (const [p, h] of files) {
		if (!PATH.test(p)) throw new Error(`“${p}” is not a path inside the site.`);
		if (!HEX.test(h)) throw new Error(`The hash for ${p} is not a SHA-256.`);
	}
	for (const [r, a] of Object.entries(input.pages ?? {})) {
		if (!r.startsWith('/')) throw new Error(`“${r}” is not a route.`);
		if (!ADDRESS.test(a)) throw new Error(`The page at ${r} is not named by its content.`);
	}
	if (input.previous !== undefined && !HEX.test(input.previous)) throw new Error('The previous map must be named by its hash.');
	return {
		source: 'inqbeta:q/site',
		kind: 'site-map',
		schema: SITE_SCHEMA,
		domain,
		files: sortedObject(input.files),
		pages: sortedObject(input.pages ?? {}),
		...(input.previous ? { previous: input.previous } : {})
	};
}

/** The hash a later map names this one by. */
export async function siteId(content: SiteContent): Promise<string> {
	return sha256Hex(new TextEncoder().encode(canonical(content)));
}

/** Sign it. The passkey touch is the whole of "publishing". */
export function signSite(identity: Pick<Identity, 'did' | 'publicKey' | 'signing'>, content: SiteContent): Promise<SealedReceipt> {
	return sealWith(identity, content);
}

export interface SiteCheck {
	ok: boolean;
	receipt: ReceiptCheck;
	/** Files whose bytes match. */
	matched: number;
	/** Files named in the map that were not supplied. */
	missing: string[];
	/** Files supplied whose bytes do not match the map. */
	changed: string[];
	/** Files supplied that the map does not name. */
	extra: string[];
	says: string;
}

/**
 * Check a signed map against some files — all of a build, or only the ones a
 * visitor fetched. `files` is path → sha256 hex.
 */
export async function checkSite(receipt: unknown, files: Record<string, string>, opts: { all?: boolean } = {}): Promise<SiteCheck> {
	const r = await checkReceipt(receipt);
	const content = (receipt as SealedReceipt | null)?.content as SiteContent | undefined;
	const named = content?.schema === SITE_SCHEMA ? content.files : {};
	const changed: string[] = [];
	const extra: string[] = [];
	let matched = 0;
	for (const [p, h] of Object.entries(files)) {
		if (!(p in named)) extra.push(p);
		else if (named[p] !== h) changed.push(p);
		else matched++;
	}
	const missing = opts.all ? Object.keys(named).filter((p) => !(p in files)) : [];
	const ok = r.ok && content?.schema === SITE_SCHEMA && !changed.length && !extra.length && !missing.length;
	return {
		ok,
		receipt: r,
		matched,
		missing,
		changed,
		extra,
		says: !r.ok
			? r.says
			: content?.schema !== SITE_SCHEMA
				? 'The receipt holds, but it is not a site map.'
				: changed.length
					? `${changed.length} ${changed.length === 1 ? 'file has' : 'files have'} changed since the site was signed.`
					: extra.length
						? `${extra.length} ${extra.length === 1 ? 'file is' : 'files are'} not in the signed site.`
						: missing.length
							? `${missing.length} signed ${missing.length === 1 ? 'file is' : 'files are'} missing.`
							: `All ${matched} ${matched === 1 ? 'file is' : 'files are'} exactly what was signed.`
	};
}
