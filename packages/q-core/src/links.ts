/*
 * Links — how several keys are one person, without anybody's server.
 *
 * Decided 2026-09-16: every site signs in on its own, so every site has its own
 * key (a browser ties each passkey to its site). They are made one identity by
 * LINK RECEIPTS back to a root key — the key in Q, on your phone or computer.
 *
 *   1. The site's key writes a link REQUEST: "I, key K, on this site, ask to be
 *      linked to root R", and signs it.
 *   2. The root checks it and signs the SAME statement. Neither signature alone
 *      links anything — the genesis rule again: nothing is added behind the
 *      person's back, and no key is claimed without its own owner agreeing.
 *   3. Anyone holding the finished link checks both signatures offline and knows
 *      K is R's key. A link says whose key it is, so it covers what K signed
 *      before the link as well as after — the key was always that person's.
 *
 * The request and the finished link are small JSON files, carried however
 * files are carried — saved into the folder, dropped, pasted. Nothing is
 * looked up anywhere.
 *
 * Unlinking is a receipt too (`unlinkKey`), signed by the root, forward only:
 * what K signed while linked stays signed.
 *
 * SINCE THE UCAN DECISION (2026-09-16) a link is written as two standard UCAN
 * tokens instead of KeyLink JSON (which is still read):
 *   1. the request — an invocation by K of /inqbeta/identity/link, naming R;
 *   2. the approval — a powerline delegation R → K (sub null, cmd "/"), whose
 *      meta names the request. Unlinking is /ucan/revoke on that delegation.
 * Any UCAN tool reads the approval as "K may act for R"; Q reads the pair as
 * "K is R's key", because K asked for it itself.
 */
import { canonical, sha256, unb64url } from './canonical';
import { publicKeyFrom, toDid } from './did';
import type { Signer } from './seal';
import { CID } from './ucan/cid';
import { readContainerTokens } from './ucan/container';
import { UcanError } from './ucan/errors';
import { revoke } from './ucan/revoke';
import { canSignBytes, delegate, invoke, type Delegation, type Invocation, type Token } from './ucan/token';
import type { KnownRevocation } from './ucan/validate';

export const LINK_SCHEMA = 'https://schemas.inqbeta.local/identity/KeyLink.json';

export interface LinkStatement {
	schema: typeof LINK_SCHEMA;
	event: 'identity.linked' | 'identity.unlinked';
	/** The root identity this key speaks for. */
	root: string;
	/** The key being linked. */
	key: string;
	/** Where the key lives, in words: "Dark Olive (darkolive.co.uk)", "Darren's Android". */
	label: string;
	/** The site the key belongs to, when it is a site key. */
	origin?: string;
	at: string;
}

export interface Link extends LinkStatement {
	signatures: { by: 'key' | 'root'; did: string; signature: string }[];
}

async function verifySig(did: string, doc: unknown, signature: string): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(did), { name: 'Ed25519' }, false, ['verify']);
		return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(signature), new TextEncoder().encode(canonical(doc)));
	} catch {
		return false;
	}
}

function statementOf(l: LinkStatement): LinkStatement {
	const { schema, event, root, key, label, origin, at } = l;
	return { schema, event, root, key, label, origin, at };
}

export function isLink(x: unknown): x is Link {
	return !!x && typeof x === 'object' && (x as Link).schema === LINK_SCHEMA && Array.isArray((x as Link).signatures);
}

/** Step 1, on the site: the site's key asks to be linked to `root`. */
export async function requestLink(signer: Signer, root: string, label: string, origin?: string): Promise<Link> {
	const statement: LinkStatement = {
		schema: LINK_SCHEMA,
		event: 'identity.linked',
		root: toDid(root),
		key: signer.did,
		label: label.trim() || 'A key',
		origin,
		at: new Date().toISOString()
	};
	return { ...statement, signatures: [{ by: 'key', did: signer.did, signature: await signer.signCanonical(statement) }] };
}

export type LinkCheck =
	| { ok: true; complete: boolean; says: string }
	| { ok: false; says: string };

/** Check a request or a finished link, offline. */
export async function checkLink(link: Link): Promise<LinkCheck> {
	if (!isLink(link)) return { ok: false, says: 'This is not a link.' };
	const st = statementOf(link);
	const keySig = link.signatures.find((s) => s.by === 'key');
	const rootSig = link.signatures.find((s) => s.by === 'root');
	if (link.event === 'identity.linked') {
		if (!keySig || keySig.did !== st.key || !(await verifySig(st.key, st, keySig.signature)))
			return { ok: false, says: 'The key did not sign this itself, so it cannot be linked.' };
		if (!rootSig) return { ok: true, complete: false, says: 'A request, waiting for the root to sign.' };
	} else if (!rootSig) {
		return { ok: false, says: 'An unlink must be signed by the root.' };
	}
	if (rootSig.did !== st.root || !(await verifySig(st.root, st, rootSig.signature)))
		return { ok: false, says: 'The root signature does not match. This has been changed, or was not signed by the root.' };
	return {
		ok: true,
		complete: true,
		says: link.event === 'identity.linked' ? `${st.label} speaks for this identity from ${st.at.slice(0, 10)}.` : `${st.label} was unlinked on ${st.at.slice(0, 10)}.`
	};
}

/** Step 2, at the root: check the request and add the root's signature. */
export async function approveLink(root: Signer, request: Link): Promise<Link> {
	const c = await checkLink(request);
	if (!c.ok) throw new Error(c.says);
	if (request.event !== 'identity.linked') throw new Error('Only a link request can be approved.');
	if (request.root !== root.did) throw new Error('This request is for a different root identity.');
	if (request.signatures.some((s) => s.by === 'root')) return request;
	const st = statementOf(request);
	return { ...request, signatures: [...request.signatures, { by: 'root', did: root.did, signature: await root.signCanonical(st) }] };
}

/** At the root: stop a key speaking for you from now on. */
export async function unlinkKey(root: Signer, link: Link, reason = ''): Promise<Link> {
	const statement: LinkStatement = {
		schema: LINK_SCHEMA,
		event: 'identity.unlinked',
		root: root.did,
		key: link.key,
		label: reason ? `${link.label} — ${reason}` : link.label,
		origin: link.origin,
		at: new Date().toISOString()
	};
	return { ...statement, signatures: [{ by: 'root', did: root.did, signature: await root.signCanonical(statement) }] };
}

/** A short id for a link, for filenames and lists. */
export async function linkId(link: Link): Promise<string> {
	return (await sha256(canonical(statementOf(link)))).slice(0, 16);
}

/**
 * Which root does `did` speak for — from a set of links, offline. `at` is when
 * the signature in question was made: a link covers the key's whole history,
 * but an unlink dated on or before `at` means the key no longer spoke for the
 * root by then. What it signed before the unlink is untouched.
 */
export async function rootOf(
	did: string,
	links: Link[],
	at = new Date().toISOString()
): Promise<{ root: string; since: string; label: string } | null> {
	const target = toDid(did);
	let found: { root: string; since: string; label: string } | null = null;
	const unlinked = new Map<string, string>();
	for (const l of links) {
		if (l.key !== target) continue;
		const c = await checkLink(l);
		if (!c.ok || !c.complete) continue;
		if (l.event === 'identity.unlinked') {
			unlinked.set(l.root, l.at);
			continue;
		}
		if (!found || l.at < found.since) found = { root: l.root, since: l.at, label: l.label };
	}
	if (found) {
		const end = unlinked.get(found.root);
		if (end && end <= at) return null;
	}
	return found;
}

/* ---------- Links as UCAN ---------- */

export const LINK_COMMAND = '/inqbeta/identity/link';

export interface LinkRequestArgs {
	root: string;
	label: string;
	origin?: string;
}

function linkArgs(inv: Invocation): LinkRequestArgs | null {
	const a = inv.payload.args;
	if (inv.payload.cmd !== LINK_COMMAND || typeof a.root !== 'string' || typeof a.label !== 'string') return null;
	return { root: a.root, label: a.label, origin: typeof a.origin === 'string' ? a.origin : undefined };
}

/** Step 1, on the site: the site's key asks, in its own name, to speak for `root`. */
export async function requestLinkUcan(signer: Signer, root: string, label: string, origin?: string): Promise<Invocation> {
	if (!canSignBytes(signer)) throw new Error('This key cannot sign UCANs.');
	const args: Record<string, string> = { root: toDid(root), label: label.trim() || 'A key' };
	if (origin) args.origin = origin;
	return invoke(signer, { subject: signer.did, audience: toDid(root), cmd: LINK_COMMAND, args, exp: null });
}

/** Step 2, at the root: answer the request with a powerline delegation. */
export async function approveLinkUcan(root: Signer, request: Invocation): Promise<Delegation> {
	if (!canSignBytes(root)) throw new Error('This key cannot sign UCANs.');
	const args = linkArgs(request);
	if (!args || request.payload.iss !== request.payload.sub) throw new UcanError('InvalidToken', 'That is not a link request.');
	if (args.root !== root.did) throw new UcanError('InvalidAudience', 'This request is for a different root identity.');
	const meta: Record<string, string | CID> = { 'inqbeta/link': request.cid, label: args.label };
	if (args.origin) meta.origin = args.origin;
	return delegate(root, { to: request.payload.iss, subject: null, cmd: '/', exp: null, meta });
}

/** At the root: stop a key speaking for you from now on. */
export async function unlinkKeyUcan(root: Signer, approval: Delegation, reason?: string): Promise<Invocation> {
	if (!canSignBytes(root)) throw new Error('This key cannot sign UCANs.');
	return revoke(root, approval, [approval], reason);
}

export interface UcanLink {
	root: string;
	key: string;
	label: string;
	origin?: string;
	request: Invocation;
	approval: Delegation;
	/** Unix seconds, from the request. */
	since: number;
}

/** Complete links in a set of tokens: a request and the root's answer to it. */
export function ucanLinks(tokens: Token[]): UcanLink[] {
	const requests = new Map<string, Invocation>();
	for (const t of tokens) if (t.kind === 'invocation' && linkArgs(t) && t.payload.iss === t.payload.sub) requests.set(t.cid.toString(), t);
	const out: UcanLink[] = [];
	for (const t of tokens) {
		if (t.kind !== 'delegation') continue;
		const d = t.payload;
		const ref = d.meta?.['inqbeta/link'];
		if (d.sub !== null || d.cmd !== '/' || !(ref instanceof CID)) continue;
		const req = requests.get(ref.toString());
		const args = req && linkArgs(req);
		if (!req || !args || req.payload.iss !== d.aud || args.root !== d.iss) continue;
		out.push({ root: d.iss, key: d.aud, label: args.label, origin: args.origin, request: req, approval: t, since: req.payload.iat ?? 0 });
	}
	return out;
}

/**
 * Which root does `did` speak for, from UCAN tokens (already read and checked)
 * and known revocations. `at` is when the signature in question was made, in
 * Unix seconds; a revocation by the root dated on or before it ends the link.
 */
export function rootOfUcan(
	did: string,
	tokens: Token[],
	revocations: KnownRevocation[] = [],
	at = Math.floor(Date.now() / 1000)
): { root: string; since: number; label: string } | null {
	const key = toDid(did);
	const mine = ucanLinks(tokens).filter((l) => l.key === key).sort((a, b) => a.since - b.since);
	for (const l of mine) {
		const ended = revocations.some((r) => r.revoked.equals(l.approval.cid) && r.by === l.root && r.at <= at);
		if (!ended) return { root: l.root, since: l.since, label: l.label };
	}
	return null;
}

/* ---------- Reading whatever was pasted or opened ---------- */

export type LinkParcel =
	| { kind: 'ucan'; text: string; tokens: Token[] }
	| { kind: 'json'; link: Link };

/**
 * A link request or finished link, as it arrives: UCAN container text (what
 * Q writes now) or KeyLink JSON (what it wrote before). Throws with words a
 * person can act on.
 */
export async function readLinkParcel(raw: string): Promise<LinkParcel> {
	const text = raw.trim();
	if (text.startsWith('{')) {
		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			throw new Error('That looks like JSON but does not read.');
		}
		if (!isLink(json)) throw new Error('That is not a link.');
		return { kind: 'json', link: json };
	}
	try {
		return { kind: 'ucan', text, tokens: await readContainerTokens(text) };
	} catch (e) {
		throw new Error(`That is not a link: ${(e as Error).message}`);
	}
}

/** The link request inside a parcel, if that is what it is. */
export function requestIn(tokens: Token[]): (Invocation & { args: LinkRequestArgs }) | null {
	for (const t of tokens) {
		if (t.kind !== 'invocation') continue;
		const a = linkArgs(t);
		if (a && t.payload.iss === t.payload.sub) return Object.assign(t, { args: a });
	}
	return null;
}

