/*
 * Calls, direct between two people, as a chain of receipts. ADR-Q-004.
 *
 * Darren, 2026-09-25:
 *
 *   "It starts when someone makes a call and presses that call button. That's
 *   creating that first receipt, which is sent, and then that chain lifecycle
 *   can hash itself. The receiver then accepts to receive the call. That's
 *   their receipt. … And then both click end, leave call, from their end,
 *   which generates their final closing receipt."
 *
 * So a call is a chain of receipts, each naming the one before by its hash
 * (the same `parent` shape as chain.ts):
 *
 *     call.placed      signed by the caller          parent: none
 *          │
 *     call.accepted    signed by the person called   parent: placed
 *          │
 *        ┌─┴──────────────┐
 *     call.ended       call.ended                    parent: accepted
 *     (caller's side)  (their side)
 *
 * The two endings both follow `accepted`. That is a branch, and chain.ts says
 * when a branch is harmless: two DIFFERENT keys each telling their own side.
 * Each person closes their own end; neither signs for the other.
 *
 * A call nobody answered is still a chain: placed, then the caller's own
 * ending ("no answer") from placed.
 *
 * WHY THE HANDSHAKE IS SAFE. WebRTC encrypts the media to whatever key the
 * SDP names in `a=fingerprint`. Whoever can change the SDP in transit can sit
 * in the middle. So `placed` and `accepted` each name their SDP's fingerprint
 * and its hash, and are signed. The key at the far end of the wire is the key
 * of the person who signed — checked, not hoped.
 *
 * FACTS ONLY. The receipts hold the SDP's hash, never the SDP (which carries
 * network addresses). The SDP travels beside the receipt in the link and is
 * checked against it, then thrown away. What is kept: who, when, how long,
 * audio or video, direct or relayed, and how each side left.
 */
import { b64url, canonical, sha256, unb64url } from './canonical';
import { checkReceipt, isSealedToPeople, sealTo, sealWith, type Opener, type SealedReceipt, type SealedToPeople } from './seal';
import type { Identity } from './passkey';

export const CALL_SOURCE = 'inqbeta:call';
export const CALL_CHAIN_SCHEMA = 'q.call-chain/1';

/** How long a placed call can wait to be accepted. A link lying in an inbox for a week should not still ring. */
export const RING_FOR_MS = 60 * 60 * 1000;
/** Two accounts of the same call further apart than this are worth saying so. */
export const ACCOUNTS_AGREE_WITHIN_S = 15;

type Signs = Pick<Identity, 'did' | 'publicKey' | 'signing'>;

export type CallEvent = 'call.placed' | 'call.accepted' | 'call.ended';
export type CallMedia = 'audio' | 'video';
export type CallRoute = 'direct' | 'relayed';
/** How a side left. */
export type Leaving = 'hung-up' | 'they-left' | 'dropped' | 'cancelled' | 'no-answer';

export interface CallStep {
	source: typeof CALL_SOURCE;
	event: CallEvent;
	/** The call's name: random, chosen when it is placed. */
	call: string;
	/** contentHash of the step before. Null only for call.placed. */
	parent: string | null;
	at: string;

	/* placed and accepted: the handshake, named but not kept */
	/** Who it is for. Accepted is always for the caller. */
	to?: string;
	/** The DTLS fingerprint the SDP names, e.g. "sha-256 AB:CD:…". */
	fingerprint?: string;
	/** sha256 of the SDP that travelled with this step. */
	sdp?: string;
	/** placed only: after this, it no longer rings. */
	expires?: string;

	/* ended: this side's own account */
	/** When media first flowed, as this side saw it. Absent if it never did. */
	began?: string;
	seconds?: number;
	media?: CallMedia[];
	route?: CallRoute;
	how?: Leaving;
}

export type CallReceipt = SealedReceipt & { content: CallStep };

/** What travels in a link: the signed step, and the SDP it vouches for. */
export interface Handshake {
	step: CallReceipt;
	sdp: string;
}

/* ------------------------------------------------------------------ *
 * The handshake
 * ------------------------------------------------------------------ */

/**
 * The one DTLS fingerprint an SDP names, or null. Several lines are fine if
 * they agree (one per media section); two different ones is refused, because
 * which of them would the signature be vouching for?
 */
export function fingerprintOf(sdp: string): string | null {
	const found = [...sdp.matchAll(/^a=fingerprint:(\S+)\s+([0-9A-Fa-f:]+)\s*$/gm)].map((m) => `${m[1].toLowerCase()} ${m[2].toUpperCase()}`);
	if (!found.length) return null;
	return found.every((f) => f === found[0]) ? found[0] : null;
}

export function newCallId(): string {
	return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

async function handshakeFields(sdp: string) {
	const fingerprint = fingerprintOf(sdp);
	if (!fingerprint) throw new Error('That connection has no single encryption fingerprint to vouch for.');
	return { fingerprint, sdp: await sha256(sdp) };
}

/** The first receipt: pressing Call. */
export async function placeCall(identity: Signs, o: { sdp: string; to?: string; call?: string }, now = Date.now()): Promise<Handshake> {
	const content: CallStep = {
		source: CALL_SOURCE,
		event: 'call.placed',
		call: o.call ?? newCallId(),
		parent: null,
		at: new Date(now).toISOString(),
		...(o.to ? { to: o.to } : {}),
		...(await handshakeFields(o.sdp)),
		expires: new Date(now + RING_FOR_MS).toISOString()
	};
	return { step: (await sealWith(identity, content)) as CallReceipt, sdp: o.sdp };
}

/** The second receipt: the person called accepts. Follows `placed`. */
export async function acceptCall(identity: Signs, placed: CallReceipt, sdp: string, now = Date.now()): Promise<Handshake> {
	if (placed.content.event !== 'call.placed') throw new Error('Only a placed call can be accepted.');
	if (placed.did === identity.did) throw new Error('You cannot accept your own call.');
	const content: CallStep = {
		source: CALL_SOURCE,
		event: 'call.accepted',
		call: placed.content.call,
		parent: placed.contentHash,
		at: new Date(now).toISOString(),
		to: placed.did,
		...(await handshakeFields(sdp))
	};
	return { step: (await sealWith(identity, content)) as CallReceipt, sdp };
}

/**
 * Each side's closing receipt: its own account, from its own end. Follows
 * `accepted` — or `placed`, for a call that was never answered.
 */
export async function endCall(
	identity: Signs,
	from: CallReceipt,
	seen: { began?: number; ended: number; media: CallMedia[]; route?: CallRoute; how: Leaving }
): Promise<CallReceipt> {
	const e = from.content.event;
	if (e === 'call.ended') throw new Error('A call is ended from where it got to, not from another ending.');
	if (e === 'call.placed' && from.did !== identity.did) throw new Error('Only the caller can close a call nobody answered.');
	const began = seen.began != null ? Math.floor(seen.began / 1000) * 1000 : undefined;
	const ended = Math.floor(seen.ended / 1000) * 1000;
	const content: CallStep = {
		source: CALL_SOURCE,
		event: 'call.ended',
		call: from.content.call,
		parent: from.contentHash,
		at: new Date(ended).toISOString(),
		...(began != null ? { began: new Date(began).toISOString() } : {}),
		seconds: began != null ? Math.max(0, Math.round((ended - began) / 1000)) : 0,
		media: [...new Set(seen.media)].sort() as CallMedia[],
		...(seen.route ? { route: seen.route } : {}),
		how: seen.how
	};
	return (await sealWith(identity, content)) as CallReceipt;
}

export type HandshakeCheck = { ok: true; step: CallReceipt; sdp: string; by: string; says: string } | { ok: false; says: string };

function isHandshake(x: unknown): x is Handshake {
	const h = x as Handshake | null;
	return !!h && typeof h.sdp === 'string' && (h.step?.content as CallStep | undefined)?.source === CALL_SOURCE;
}

async function checkHandshakeStep(h: Handshake, now: number): Promise<{ ok: false; says: string } | null> {
	const r = await checkReceipt(h.step);
	if (!r.ok) return { ok: false, says: `The link has been changed since it was signed: ${r.says}` };
	const c = h.step.content;
	if ((await sha256(h.sdp)) !== c.sdp) return { ok: false, says: 'The connection in the link is not the one that was signed.' };
	if (fingerprintOf(h.sdp) !== c.fingerprint) return { ok: false, says: 'The encryption key in the link is not the one that was signed.' };
	if (c.expires && Date.parse(c.expires) < now) return { ok: false, says: 'This call has stopped ringing. Ask for a new one.' };
	return null;
}

/** Someone is calling you: whether the placed call holds. Never throws. */
export async function checkPlaced(x: unknown, o: { me?: string; now?: number } = {}): Promise<HandshakeCheck> {
	if (!isHandshake(x)) return { ok: false, says: 'That is not a call link.' };
	if (x.step.content.event !== 'call.placed') return { ok: false, says: 'That is an answer to a call, not a call.' };
	const bad = await checkHandshakeStep(x, o.now ?? Date.now());
	if (bad) return bad;
	if (x.step.content.to && o.me && x.step.content.to !== o.me) return { ok: false, says: 'This call was made for someone else.' };
	return { ok: true, step: x.step, sdp: x.sdp, by: x.step.did, says: 'Signed by the caller; the encryption key is theirs.' };
}

/** They accepted your call: whether the acceptance holds and follows your placed call. Never throws. */
export async function checkAccepted(x: unknown, o: { placed?: CallReceipt; now?: number }): Promise<HandshakeCheck> {
	if (!isHandshake(x)) return { ok: false, says: 'That is not a call link.' };
	const c = x.step.content;
	if (c.event !== 'call.accepted') return { ok: false, says: 'That is a call, not an answer to one.' };
	const bad = await checkHandshakeStep(x, o.now ?? Date.now());
	if (bad) return bad;
	if (!o.placed) return { ok: false, says: 'There is no call of yours for this to answer.' };
	if (c.call !== o.placed.content.call) return { ok: false, says: 'This answers a different call.' };
	if (c.parent !== o.placed.contentHash) return { ok: false, says: 'This does not follow the call you placed.' };
	if (x.step.did === o.placed.did) return { ok: false, says: 'That is your own call coming back, not an answer.' };
	if (c.to !== o.placed.did) return { ok: false, says: 'This answer was made for someone else.' };
	return { ok: true, step: x.step, sdp: x.sdp, by: x.step.did, says: 'Signed by the person you called; the encryption key is theirs.' };
}

/* ------------------------------------------------------------------ *
 * Packing — small enough for a link
 * ------------------------------------------------------------------ */

async function squeeze(text: string): Promise<Uint8Array> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unsqueeze(bytes: Uint8Array): Promise<string> {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return new Response(stream).text();
}

/**
 * A handshake as link-safe text. With `sealFor`, only those DIDs (and the
 * signer) can open it — worth doing when you know who you are calling,
 * because an SDP carries your network addresses.
 */
export async function packHandshake(h: Handshake, sealFor?: string[]): Promise<string> {
	const plain = b64url(await squeeze(canonical(h)));
	if (!sealFor?.length) return plain;
	/* Squeeze BEFORE sealing: ciphertext does not compress, so the other way
	 * round makes a link three times longer. */
	const { sealed } = await sealTo({ z: plain }, [...sealFor, h.step.did], 'a call');
	return b64url(await squeeze(canonical(sealed)));
}

export type Unpacked = { ok: true; handshake: unknown; sealed: boolean } | { ok: false; says: string };

/** Accepts the packed text, or a whole link with it in #o= or #a=. */
export async function unpackHandshake(text: string, opener?: Opener): Promise<Unpacked> {
	const packed = (text.trim().match(/[#&]([oa])=([A-Za-z0-9_-]+)/)?.[2] ?? text.trim()).replace(/\s+/g, '');
	let body: unknown;
	try {
		body = JSON.parse(await unsqueeze(unb64url(packed)));
	} catch {
		return { ok: false, says: 'That does not look like a call link — was all of it copied?' };
	}
	if (!isSealedToPeople(body)) return { ok: true, handshake: body, sealed: false };
	if (!opener) return { ok: false, says: 'This link is sealed. Unlock Q to open it.' };
	const opened = await opener.open(body as SealedToPeople);
	if (!opened.ok) return { ok: false, says: 'This link was sealed for someone else.' };
	const z = (opened.body as { z?: unknown } | null)?.z;
	if (typeof z !== 'string') return { ok: false, says: 'That sealed link holds no call.' };
	try {
		return { ok: true, handshake: JSON.parse(await unsqueeze(unb64url(z))), sealed: true };
	} catch {
		return { ok: false, says: 'That sealed link could not be read.' };
	}
}

/* ------------------------------------------------------------------ *
 * The chain — what is kept
 * ------------------------------------------------------------------ */

export interface CallChain {
	schema: typeof CALL_CHAIN_SCHEMA;
	/** placed, then accepted (if it was), then the endings. */
	steps: CallReceipt[];
}

export function callChain(steps: (CallReceipt | undefined | null)[]): CallChain {
	return { schema: CALL_CHAIN_SCHEMA, steps: steps.filter((s): s is CallReceipt => !!s) };
}

export function isCallChain(x: unknown): x is CallChain {
	return (x as CallChain | null)?.schema === CALL_CHAIN_SCHEMA && Array.isArray((x as CallChain).steps);
}

export interface CallSummary {
	call: string;
	caller: string;
	/** Who was called, if they accepted (or it was addressed to them). */
	called?: string;
	placedAt: string;
	accepted: boolean;
	/** Who has closed their side. */
	closedBy: string[];
	/** True when everyone who was on it has closed their side. */
	complete: boolean;
	seconds: number;
	media: CallMedia[];
	route?: CallRoute;
}

export type CallCheck = { ok: true; summary: CallSummary; says: string } | { ok: false; says: string };

const lengthOf = (s: number) => (s < 60 ? `${s} second${s === 1 ? '' : 's'}` : `${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? '' : 's'}`);

/** Whether a call's chain holds, step by step, offline. Never throws. */
export async function checkCallChain(x: unknown): Promise<CallCheck> {
	if (!isCallChain(x) || !x.steps.length) return { ok: false, says: 'That is not the record of a call.' };
	for (const s of x.steps) {
		if ((s?.content as CallStep | undefined)?.source !== CALL_SOURCE) return { ok: false, says: 'Something in this record is not part of a call.' };
		const r = await checkReceipt(s);
		if (!r.ok) return { ok: false, says: `A step does not hold: ${r.says}` };
	}
	const [placed, ...rest] = x.steps;
	const call = placed.content.call;
	if (placed.content.event !== 'call.placed' || placed.content.parent !== null) return { ok: false, says: 'The record does not begin with the call being placed.' };
	if (rest.some((s) => s.content.call !== call)) return { ok: false, says: 'Steps from a different call are mixed in.' };

	const accepted = rest[0]?.content.event === 'call.accepted' ? rest[0] : undefined;
	const endings = rest.slice(accepted ? 1 : 0);
	if (endings.some((s) => s.content.event !== 'call.ended')) return { ok: false, says: 'The steps are out of order.' };

	if (accepted) {
		if (accepted.content.parent !== placed.contentHash) return { ok: false, says: 'The acceptance does not follow this call.' };
		if (accepted.did === placed.did) return { ok: false, says: 'The caller cannot accept their own call.' };
		if (accepted.content.to !== placed.did) return { ok: false, says: 'The acceptance was for someone else.' };
		if (placed.content.to && placed.content.to !== accepted.did) return { ok: false, says: 'Someone other than the person called accepted it.' };
	}
	const people = accepted ? [placed.did, accepted.did] : [placed.did];
	const head = accepted ?? placed;
	const closedBy: string[] = [];
	for (const e of endings) {
		if (e.content.parent !== head.contentHash) return { ok: false, says: 'An ending does not follow where the call got to.' };
		if (!people.includes(e.did)) return { ok: false, says: 'Someone who was not on the call has signed an ending.' };
		if (closedBy.includes(e.did)) return { ok: false, says: 'The same person closed the call twice.' };
		closedBy.push(e.did);
	}

	const secs = endings.map((e) => e.content.seconds ?? 0);
	const seconds = secs.length ? Math.max(...secs) : 0;
	const media = [...new Set(endings.flatMap((e) => e.content.media ?? []))].sort() as CallMedia[];
	const route = endings.find((e) => e.content.route === 'relayed')?.content.route ?? endings.find((e) => e.content.route)?.content.route;
	const complete = people.every((p) => closedBy.includes(p));
	const summary: CallSummary = {
		call,
		caller: placed.did,
		called: accepted?.did ?? placed.content.to,
		placedAt: placed.content.at,
		accepted: !!accepted,
		closedBy,
		complete,
		seconds,
		media,
		route
	};

	const what = media.includes('video') ? 'Video call' : 'Call';
	let says: string;
	if (!accepted) says = closedBy.length ? 'Placed, and not answered.' : 'Placed — waiting to be answered.';
	else if (!endings.length) says = `${what} accepted and under way.`;
	else {
		says = `${what}, ${lengthOf(seconds)}${route ? `, ${route}` : ''}. `;
		says += complete ? 'Placed, accepted, and each of you closed your own side.' : 'Placed and accepted; only one side has closed theirs.';
		if (secs.length === 2 && Math.abs(secs[0] - secs[1]) > ACCOUNTS_AGREE_WITHIN_S)
			says += ` The two accounts differ by ${Math.abs(secs[0] - secs[1])} seconds.`;
	}
	return { ok: true, summary, says };
}
