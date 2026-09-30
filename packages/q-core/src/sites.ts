/*
 * A website is a key, founded by you. ADR-Q-003.
 *
 * Darren, 2026-09-24: "you start with the first primary signer, the user, and
 * then everything from that is the build" — and, on the key itself: "a website
 * is an asset … you can pass that key to another person and then they own the
 * sovereignty."
 *
 * So:
 *
 *   THE SITE KEY IS RANDOM. 32 random bytes, turned into keys exactly the way
 *   a passkey's secret is (identityFromSeed), so a site signs, can be sealed
 *   to, and has a did:key like anyone else. It is NOT derived from your
 *   passkey, because a thing derived from you cannot be sold without selling
 *   you.
 *
 *   IT IS KEPT SEALED TO ITS OWNER. The seed is sealed to the owner's DID
 *   (sealTo) and stored in the vault. Only the owner's passkey opens it. Losing
 *   it is the risk of owning it; it travels with the vault's backups.
 *
 *   FOUNDING TAKES TWO SIGNATURES. `site.founded` is signed by the root AND by
 *   the new site key — the genesis rule links.ts uses. Neither alone founds
 *   anything.
 *
 *   AUTHORITY IS UCAN. The site key delegates `/site` to its founder (subject:
 *   the site). The founder can delegate narrower commands on — `/site/edit`
 *   to an editor — and anyone who acts for the site shows the chain.
 *   Checking is ucan/validate.ts, unchanged.
 *
 * Pure: no storage, no window. q-core/folder and the app decide where things
 * are kept.
 */
import { canonical, b64url, unb64url } from './canonical';
import { publicKeyFrom, toDid } from './did';
import { identityFromSeed, signerFor, type Identity } from './passkey';
import { openWith, sealTo, type Opener, type Signer, type SealedToPeople } from './seal';
import { delegate, invoke, canSignBytes, type Delegation, type Invocation } from './ucan/token';
import { checkInvocation, type KnownRevocation } from './ucan/validate';
import { UcanError } from './ucan/errors';

export const SITE_FOUNDED_SCHEMA = 'inqbeta.site-founded/1';
export const SITE_KEY_SCHEMA = 'inqbeta.site-key/1';

/** What may be done with a site. Paths, so `/site` covers all three. */
export const SITE_COMMANDS = {
	all: '/site',
	/** Write and sign drafts and versions of the site's pages. */
	edit: '/site/edit',
	/** Sign a release (site map). */
	publish: '/site/publish',
	/** Invite, revoke, rotate, hand over. */
	admin: '/site/admin'
} as const;

export interface SiteStatement {
	schema: typeof SITE_FOUNDED_SCHEMA;
	event: 'site.founded';
	/** The site's own key. */
	site: string;
	/** Who founded it — the first signer. */
	root: string;
	/** What it is called, in words. */
	name: string;
	/** Where it is served. */
	domain: string;
	/** 1 for the first key; each rotation or handover adds one. */
	generation: number;
	at: string;
}

export interface Founding extends SiteStatement {
	signatures: { by: 'site' | 'root'; did: string; signature: string }[];
}

export interface Founded {
	founding: Founding;
	/** The site key, open, for this session only. Never stored as it is. */
	key: Identity;
	/** The site key → its founder, for everything the site can do. */
	grant: Delegation;
	/** The seed, sealed to the founder. What the vault keeps. */
	sealedKey: SealedToPeople;
}

const DOMAIN = /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)$/;

/*
 * Addresses a host hands out, not domains anyone owns. Found on 2026-09-24:
 * Dark Olive was founded as darkolive-8ccsqf2ra-darkolives-projects.vercel.app
 * — a preview link that changes on every upload. A site is founded as its own
 * name, even before that name points anywhere.
 */
const HOSTED = /\.(vercel\.app|netlify\.app|pages\.dev|workers\.dev|github\.io|onrender\.com|herokuapp\.com|fly\.dev)$/;

export function hostedAddress(domain: string): boolean {
	return HOSTED.test(domain);
}

function statementOf(f: Founding): SiteStatement {
	const { signatures: _s, ...st } = f;
	return st;
}

async function verify(did: string, doc: unknown, signature: string): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(did), { name: 'Ed25519' }, false, ['verify']);
		return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(signature), new TextEncoder().encode(canonical(doc)));
	} catch {
		return false;
	}
}

/**
 * Found a site. `root` is the founder's signer (the passkey, touched).
 * Returns everything to keep: the founding receipt (public), the grant
 * (public), and the key sealed to the founder (private, for the vault).
 */
export async function foundSite(root: Signer, o: { name: string; domain: string }, seed?: Uint8Array): Promise<Founded> {
	const domain = o.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
	if (!DOMAIN.test(domain)) throw new Error(`“${o.domain}” is not a domain.`);
	if (hostedAddress(domain))
		throw new Error(`${domain} is an address your host gave the site, not the site's own name. Found it as its own domain — for example darkolive.co.uk — even before that points here.`);
	const name = o.name.trim();
	if (!name) throw new Error('A site needs a name.');

	const raw = seed ?? crypto.getRandomValues(new Uint8Array(32));
	if (raw.length !== 32) throw new Error('A site key is 32 bytes.');
	const key = await identityFromSeed(raw);
	const site = signerFor(key);

	const statement: SiteStatement = {
		schema: SITE_FOUNDED_SCHEMA,
		event: 'site.founded',
		site: key.did,
		root: toDid(root.did),
		name,
		domain,
		generation: 1,
		at: new Date().toISOString()
	};
	const founding: Founding = {
		...statement,
		signatures: [
			{ by: 'site', did: key.did, signature: await site.signCanonical(statement) },
			{ by: 'root', did: statement.root, signature: await root.signCanonical(statement) }
		]
	};
	const grant = await delegate(site, {
		to: statement.root,
		subject: key.did,
		cmd: SITE_COMMANDS.all,
		exp: null,
		meta: { 'inqbeta/site': domain }
	});
	const { sealed: sealedKey } = await sealTo(
		{ schema: SITE_KEY_SCHEMA, site: key.did, domain, generation: 1, seed: b64url(raw) },
		[statement.root],
		`The key to ${name} (${domain})`
	);
	if (!seed) raw.fill(0);
	return { founding, key, grant, sealedKey };
}

export type FoundingCheck = { ok: true; says: string } | { ok: false; says: string };

/** Check a founding receipt, offline. Both signatures, over the same words. */
export async function checkFounding(f: unknown): Promise<FoundingCheck> {
	const x = f as Founding;
	if (!x || x.schema !== SITE_FOUNDED_SCHEMA || !Array.isArray(x.signatures)) return { ok: false, says: 'This is not a site founding.' };
	const st = statementOf(x);
	const bySite = x.signatures.find((s) => s.by === 'site');
	const byRoot = x.signatures.find((s) => s.by === 'root');
	if (!bySite || bySite.did !== st.site || !(await verify(st.site, st, bySite.signature)))
		return { ok: false, says: 'The site key did not sign this, so it was not founded.' };
	if (!byRoot || byRoot.did !== st.root || !(await verify(st.root, st, byRoot.signature)))
		return { ok: false, says: 'The founder did not sign this, so nobody founded it.' };
	return { ok: true, says: `${st.name} (${st.domain}) was founded by ${st.root.slice(0, 20)}… on ${st.at.slice(0, 10)}.` };
}

/** Open a site key from the vault with the owner's passkey. */
export async function openSiteKey(sealed: SealedToPeople, owner: Opener | { did: string; opening: CryptoKey }): Promise<Identity> {
	const opened = 'open' in owner ? await owner.open(sealed) : await openWith(sealed, owner);
	if (!opened.ok) throw new Error(opened.says);
	const body = opened.body as { schema?: string; site?: string; seed?: string };
	if (body?.schema !== SITE_KEY_SCHEMA || !body.seed || !body.site) throw new Error('That is not a site key.');
	const key = await identityFromSeed(unb64url(body.seed));
	if (key.did !== body.site) throw new Error('The key does not match the site it says it is for.');
	return key;
}

/** Give someone a command on a site. Signed by whoever already holds it; `proofs` is how they hold it. */
export async function grantSite(giver: Signer, o: { site: string; to: string; cmd: string; exp?: number | null; label?: string }): Promise<Delegation> {
	if (!canSignBytes(giver)) throw new Error('This key cannot sign UCANs.');
	if (!o.cmd.startsWith(SITE_COMMANDS.all)) throw new Error(`“${o.cmd}” is not a site command.`);
	return delegate(giver, {
		to: toDid(o.to),
		subject: toDid(o.site),
		cmd: o.cmd,
		exp: o.exp ?? null,
		...(o.label ? { meta: { label: o.label } } : {})
	});
}

/**
 * Act for a site: an invocation naming the command and the chain that allows
 * it. Attached to whatever is being signed (a page version, a release), it is
 * the "why I may" beside the "what I did".
 */
export async function actFor(
	signer: Signer,
	o: { site: string; cmd: string; proofs: Delegation[]; args?: Record<string, string> }
): Promise<Invocation> {
	if (!canSignBytes(signer)) throw new Error('This key cannot sign UCANs.');
	return invoke(signer, { subject: toDid(o.site), cmd: o.cmd, args: o.args ?? {}, proofs: o.proofs, exp: null });
}

export type Authority = { ok: true; by: string; chain: string[]; says: string } | { ok: false; says: string };

/** Whether an invocation really was allowed by the site. Never throws. */
export function checkAuthority(
	inv: Invocation,
	o: { site: string; cmd: string; proofs: Delegation[]; revocations?: KnownRevocation[]; at?: number }
): Authority {
	try {
		if (inv.payload.sub !== toDid(o.site)) return { ok: false, says: 'That was done for a different site.' };
		if (inv.payload.cmd !== o.cmd) return { ok: false, says: `That was ${inv.payload.cmd}, not ${o.cmd}.` };
		const allowed = checkInvocation(inv, { proofs: o.proofs, revocations: o.revocations, at: o.at });
		return {
			ok: true,
			by: inv.payload.iss,
			chain: allowed.chain.map((d) => d.payload.aud),
			says: `Allowed by the site, through ${allowed.chain.length} ${allowed.chain.length === 1 ? 'grant' : 'grants'}.`
		};
	} catch (e) {
		return { ok: false, says: e instanceof UcanError || e instanceof Error ? e.message : String(e) };
	}
}
