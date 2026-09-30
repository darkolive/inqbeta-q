/*
 * The continuity home: what lets you sign again as the same DID when the
 * passkey you started with is gone. ADR-Q-005 (Option B, Darren 2026-09-25).
 *
 * The incubator's rule (catastrophic-recovery-ritual-charter §7, T2-SOV-006):
 * PRESERVE WHAT SIGNS; REBUILD WHAT DISPLAYS. A passkey is a carrier — it
 * unlocks the path — and must be replaceable. Before this file, Q's seed WAS
 * one passkey's PRF output, so losing that passkey lost the DID, the vault and
 * every site key sealed to it, however many backups there were.
 *
 * THE SHAPE. The seed does not change — for anyone who already has a DID, the
 * founding passkey's PRF output stays the seed, so every DID made so far
 * survives. What is added is an ENVELOPE: the same 32-byte seed, wrapped once
 * for each other way back in —
 *
 *   passkey   another passkey's PRF output (a second device, a hardware key,
 *             Q on a new domain) — each opens the envelope, none IS the seed
 *   recovery  a 32-byte recovery key, printed on a card, never sent anywhere
 *
 * Each wrap: AES-GCM-256 under HKDF(secret, salt, "inqbeta.continuity/<kind>"),
 * with the DID and the wrap's own description as additional data, so a wrap
 * cannot be lifted onto another person's envelope or relabelled.
 *
 * The envelope is SIGNED by the DID it serves. Only the seed can sign it, so
 * nobody without the seed can add a way in; and a stranger can check whose it
 * is without opening anything. It is plain JSON on purpose: it has to be
 * readable BEFORE anything is unlocked, which is the whole point of it.
 *
 * Pure: WebCrypto only, no window, no storage. Tested in Node.
 */
import { b64url, canonical, unb64url } from './canonical';
import { didFromPublicKey } from './did';
import { identityFromSeed, type Identity } from './passkey';

export const CONTINUITY_SCHEMA = 'inqbeta.continuity/1';
/** Where the envelope lives: the top of the vault, beside dostudy.json, and in every backup. */
export const CONTINUITY_FILE = 'continuity.json';

export type WayKind = 'passkey' | 'recovery';

export interface Wrap {
	kind: WayKind;
	/** What a person calls it: "MacBook", "YubiKey on my keys", "Recovery card, 25 Sep 2026". */
	label: string;
	/** For a passkey: the site it belongs to. A passkey only works on its own domain. */
	rpId?: string;
	/** For a passkey: where it lives. A security key is its own fate; a keychain passkey shares the keychain's. */
	carrier?: 'keychain' | 'security-key';
	added: string;
	salt: string;
	iv: string;
	sealed: string;
}

export interface Envelope {
	schema: typeof CONTINUITY_SCHEMA;
	did: string;
	/** The DID's Ed25519 key, base64url — what the signature is checked with. */
	publicKey: string;
	wraps: Wrap[];
	signedAt: string;
	signature: string;
}

const enc = new TextEncoder();

function random(n: number): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
}

/* What a wrap's additional data binds it to: whose it is and what it says it is. */
function aad(did: string, w: Pick<Wrap, 'kind' | 'label' | 'rpId' | 'added'>): Uint8Array<ArrayBuffer> {
	return enc.encode(canonical({ did, kind: w.kind, label: w.label, rpId: w.rpId ?? null, added: w.added })) as Uint8Array<ArrayBuffer>;
}

async function wrapKey(secret: Uint8Array, salt: Uint8Array, kind: WayKind, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
	if (secret.length !== 32) throw new Error('A way in needs a 32-byte secret.');
	const base = await crypto.subtle.importKey('raw', secret.slice(), 'HKDF', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: salt.slice(), info: enc.encode(`inqbeta.continuity/${kind}`) },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		[usage]
	);
}

/** Wrap the seed for one way in. `secret` is a passkey's PRF output or a recovery key. */
export async function wrapSeed(
	did: string,
	seed: Uint8Array,
	secret: Uint8Array,
	way: { kind: WayKind; label: string; rpId?: string; carrier?: Wrap['carrier']; added?: string }
): Promise<Wrap> {
	if (seed.length !== 32) throw new Error('The seed should be 32 bytes.');
	const meta = { kind: way.kind, label: way.label.trim() || way.kind, ...(way.rpId ? { rpId: way.rpId } : {}), added: way.added ?? new Date().toISOString() };
	const extra = way.carrier ? { carrier: way.carrier } : {};
	const salt = random(32);
	const iv = random(12);
	const key = await wrapKey(secret, salt, way.kind, 'encrypt');
	const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(did, meta) }, key, seed.slice());
	return { ...meta, ...extra, salt: b64url(salt), iv: b64url(iv), sealed: b64url(sealed) };
}

function body(e: Pick<Envelope, 'schema' | 'did' | 'publicKey' | 'wraps'>) {
	return canonical({ schema: e.schema, did: e.did, publicKey: e.publicKey, wraps: e.wraps });
}

/** Sign an envelope with the identity it serves. Only the seed's holder can. */
export async function signEnvelope(identity: Pick<Identity, 'did' | 'publicKey' | 'signing'>, wraps: Wrap[]): Promise<Envelope> {
	const base = { schema: CONTINUITY_SCHEMA, did: identity.did, publicKey: identity.publicKey, wraps } as const;
	const sig = await crypto.subtle.sign({ name: 'Ed25519' }, identity.signing.privateKey, enc.encode(body(base)));
	return { ...base, signedAt: new Date().toISOString(), signature: b64url(sig) };
}

export type EnvelopeCheck = { ok: true; did: string } | { ok: false; says: string };

/** Is this an envelope, signed by the DID it names? Checked without opening anything. */
export async function checkEnvelope(x: unknown): Promise<EnvelopeCheck> {
	const e = x as Envelope;
	if (!e || e.schema !== CONTINUITY_SCHEMA || typeof e.did !== 'string' || !Array.isArray(e.wraps) || typeof e.signature !== 'string')
		return { ok: false, says: 'This is not a continuity file.' };
	let raw: Uint8Array<ArrayBuffer>;
	try {
		raw = unb64url(e.publicKey);
	} catch {
		return { ok: false, says: 'This continuity file has no readable key.' };
	}
	if (didFromPublicKey(raw) !== e.did) return { ok: false, says: 'This continuity file names a DID its key does not belong to.' };
	const key = await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
	const good = await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(e.signature), enc.encode(body(e)));
	return good ? { ok: true, did: e.did } : { ok: false, says: 'This continuity file has been changed since it was signed.' };
}

export type Reopened = { ok: true; identity: Identity; seed: Uint8Array; via: Wrap } | { ok: false; says: string };

/**
 * Open the envelope with one secret and rebuild the identity. Tries every wrap
 * of that kind; succeeds only if the seed it finds rebuilds the envelope's own
 * DID — a seed that opens but signs as someone else is refused.
 */
export async function openEnvelope(e: Envelope, secret: Uint8Array, kind: WayKind): Promise<Reopened> {
	const checked = await checkEnvelope(e);
	if (!checked.ok) return checked;
	for (const w of e.wraps.filter((x) => x.kind === kind)) {
		try {
			const key = await wrapKey(secret, unb64url(w.salt), kind, 'decrypt');
			const seed = new Uint8Array(
				await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(w.iv), additionalData: aad(e.did, w) }, key, unb64url(w.sealed))
			);
			const identity = await identityFromSeed(seed);
			if (identity.did !== e.did) return { ok: false, says: 'That opened, but it rebuilds a different DID. Nothing was used.' };
			return { ok: true, identity, seed, via: w };
		} catch {
			/* not this one — try the next */
		}
	}
	return {
		ok: false,
		says: kind === 'recovery' ? 'That recovery key does not open this continuity file.' : 'This passkey is not one of the ways into this continuity file.'
	};
}

/** Add a way in. Needs the seed (you are signed in); returns the new, re-signed envelope. */
export async function addWay(
	identity: Identity,
	seed: Uint8Array,
	current: Envelope | null,
	secret: Uint8Array,
	way: { kind: WayKind; label: string; rpId?: string; carrier?: Wrap['carrier'] }
): Promise<Envelope> {
	if ((await identityFromSeed(seed)).did !== identity.did) throw new Error('That seed is not this identity’s.');
	if (current && current.did !== identity.did) throw new Error('That continuity file belongs to someone else.');
	const wrap = await wrapSeed(identity.did, seed, secret, way);
	return signEnvelope(identity, [...(current?.wraps ?? []), wrap]);
}

/** Take a way in out. The last one cannot go: an envelope with no ways in is a locked box. */
export async function removeWay(identity: Identity, current: Envelope, index: number): Promise<Envelope> {
	if (current.did !== identity.did) throw new Error('That continuity file belongs to someone else.');
	if (current.wraps.length <= 1) throw new Error('This is the last way back in. Add another before removing it.');
	return signEnvelope(identity, current.wraps.filter((_, i) => i !== index));
}

/* ------------------------------------------------------------------ *
 * The recovery key, as a person copies it onto a card.
 *
 * 32 random bytes and 2 check bytes, in Crockford base32 (no I, L, O or U, so
 * nothing is mistaken for anything else), in groups of five: 11 groups. The
 * check bytes catch a mistyped character before it is tried.
 * ------------------------------------------------------------------ */

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newRecoveryKey(): Uint8Array<ArrayBuffer> {
	return random(32);
}

async function check2(key: Uint8Array): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', key.slice())).slice(0, 2);
}

export async function formatRecoveryKey(key: Uint8Array): Promise<string> {
	if (key.length !== 32) throw new Error('A recovery key is 32 bytes.');
	const all = new Uint8Array([...key, ...(await check2(key))]);
	let bits = 0;
	let value = 0;
	let out = '';
	for (const b of all) {
		value = (value << 8) | b;
		bits += 8;
		while (bits >= 5) {
			out += B32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += B32[(value << (5 - bits)) & 31];
	return out.match(/.{1,5}/g)!.join('-');
}

export type ParsedKey = { ok: true; key: Uint8Array<ArrayBuffer> } | { ok: false; says: string };

export async function parseRecoveryKey(text: string): Promise<ParsedKey> {
	const clean = text
		.toUpperCase()
		.replace(/[\s-]/g, '')
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1');
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const c of clean) {
		const v = B32.indexOf(c);
		if (v < 0) return { ok: false, says: `“${c}” is not a character a recovery key uses.` };
		value = (value << 5) | v;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
		value &= (1 << bits) - 1;
	}
	if (out.length < 34) return { ok: false, says: 'That recovery key is too short — check every group was copied.' };
	const key = new Uint8Array(new ArrayBuffer(32));
	key.set(out.slice(0, 32));
	const want = await check2(key);
	if (want[0] !== out[32] || want[1] !== out[33]) return { ok: false, says: 'That recovery key has a mistake in it — check each group against the card.' };
	return { ok: true, key };
}

/* ------------------------------------------------------------------ *
 * Founding, or a way in? (ADR-Q-005 §6)
 *
 * Darren, 2026-09-25: a brand-new person has no history, and creating a
 * passkey for the first time must go on working exactly as it does today.
 *
 * So the question is answered by the passkey itself, through its WebAuthn user
 * handle — set when the passkey is made and handed back on every sign-in:
 *
 *   founding   made by "Create" on the landing page. The handle is random, as
 *              it always has been. Its PRF output IS the seed. A new person
 *              gets a new DID, straight away, nothing asked.
 *   way in     made by "Add a way back in" under Keys, while signed in. The
 *              handle says "a way into DID …" (a hash of it, not the DID). Its
 *              PRF output only opens the envelope — so if the envelope cannot
 *              be found, Q asks for a backup instead of minting a stranger.
 *
 * Every passkey made before this change has a random 16-byte handle, so every
 * one of them is founding: nothing about them changes.
 * ------------------------------------------------------------------ */

const WAY_IN_MARK = enc.encode('q1w');
const WAY_IN_LENGTH = WAY_IN_MARK.length + 32;

/** The user handle for a passkey made as a way into this DID. */
export async function wayInHandle(did: string): Promise<Uint8Array<ArrayBuffer>> {
	const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(did)));
	const out = new Uint8Array(new ArrayBuffer(WAY_IN_LENGTH));
	out.set(WAY_IN_MARK);
	out.set(h, WAY_IN_MARK.length);
	return out;
}

export type PasskeyRole = { role: 'founding' } | { role: 'way-in'; didHash: string };

/** What a passkey is, from the user handle it returned at sign-in. */
export function passkeyRole(userHandle: ArrayBuffer | Uint8Array | null | undefined): PasskeyRole {
	const h = userHandle ? new Uint8Array(userHandle instanceof Uint8Array ? userHandle : new Uint8Array(userHandle)) : null;
	if (!h || h.length !== WAY_IN_LENGTH || !WAY_IN_MARK.every((b, i) => h[i] === b)) return { role: 'founding' };
	return { role: 'way-in', didHash: b64url(h.slice(WAY_IN_MARK.length)) };
}

/** Is this envelope the one a way-in passkey belongs to? */
export async function envelopeFits(e: Pick<Envelope, 'did'>, role: PasskeyRole): Promise<boolean> {
	if (role.role !== 'way-in') return false;
	return b64url((await wayInHandle(e.did)).slice(WAY_IN_MARK.length)) === role.didHash;
}

/**
 * Two envelopes for the same DID — the one in the vault and one arriving from
 * a backup or a channel. Which should stand?
 *
 * The one signed later, because every change to the ways in (adding a device,
 * taking out a lost one) is a new signature. An older backup must never bring
 * back a way in that was deliberately removed. Anything that does not check,
 * or belongs to another DID, never replaces a good one.
 */
export async function keepEnvelope(existing: unknown, incoming: unknown, me: string): Promise<'existing' | 'incoming'> {
	const inc = await checkEnvelope(incoming);
	if (!inc.ok || inc.did !== me) return 'existing';
	const ex = await checkEnvelope(existing);
	if (!ex.ok || ex.did !== me) return 'incoming';
	return Date.parse((incoming as Envelope).signedAt) > Date.parse((existing as Envelope).signedAt) ? 'incoming' : 'existing';
}

/* ------------------------------------------------------------------ *
 * This browser's copy of the envelope.
 *
 * Public and signed, so it is kept where sign-in can reach it before anything
 * is unlocked — and survives sign-out, because signing back in with a way-in
 * passkey needs it. Safari may clear it, which is why every backup carries
 * the envelope too. Keyed by the same DID hash a way-in passkey carries.
 * ------------------------------------------------------------------ */

const LOCAL = 'q-continuity';

function localMap(): Record<string, Envelope> {
	try {
		return JSON.parse(localStorage.getItem(LOCAL) ?? '{}') as Record<string, Envelope>;
	} catch {
		return {};
	}
}

async function didHash(did: string): Promise<string> {
	return b64url((await wayInHandle(did)).slice(WAY_IN_MARK.length));
}

/** Keep this envelope in the browser, if it checks and is newer than what is here. */
export async function rememberEnvelope(e: Envelope): Promise<void> {
	const key = await didHash(e.did);
	const map = localMap();
	if ((await keepEnvelope(map[key] ?? null, e, e.did)) !== 'incoming') return;
	map[key] = e;
	try {
		localStorage.setItem(LOCAL, JSON.stringify(map));
	} catch {
		/* Not kept here; the vault and every backup still carry it. */
	}
}

/** Every envelope this browser holds that still checks — one per world signed in here. */
export async function envelopesHere(): Promise<Envelope[]> {
	const out: Envelope[] = [];
	for (const e of Object.values(localMap())) if ((await checkEnvelope(e)).ok) out.push(e);
	return out;
}

/** The envelope this browser holds for a DID, or for a way-in passkey. */
export async function knownEnvelope(who: string | PasskeyRole): Promise<Envelope | null> {
	const key = typeof who === 'string' ? await didHash(who) : who.role === 'way-in' ? who.didHash : null;
	if (!key) return null;
	const e = localMap()[key];
	return e && (await checkEnvelope(e)).ok ? e : null;
}

/* ------------------------------------------------------------------ *
 * How many ways back in — said weakest first (copies-and-doors.md).
 *
 * The keychain the founding passkey syncs through is ONE way however many
 * devices it is on: a passkey on a Mac and the same one on an iPhone share
 * one fate, the Apple or Google account. So a way-in passkey counts as its own
 * way only when it is a different kind of thing — a recovery card, or a
 * security key. A second synced passkey is convenience, not continuity.
 * ------------------------------------------------------------------ */

export type WaysStanding = { level: 'danger' | 'warn' | 'fine'; says: string; fix: string };

export function waysStanding(env: Pick<Envelope, 'wraps'> | null): WaysStanding {
	const wraps = env?.wraps ?? [];
	const cards = wraps.filter((w) => w.kind === 'recovery').length;
	const keys = wraps.filter((w) => w.kind === 'passkey' && w.carrier === 'security-key').length;
	const independent = cards + keys;
	if (wraps.length === 0)
		return {
			level: 'danger',
			says: 'Your passkey is your only way in. If it is lost, no backup can be opened.',
			fix: 'Keys → Ways back in: make a recovery card.'
		};
	if (independent === 0)
		return {
			level: 'warn',
			says: 'Your ways back in all live in the same keychain, so losing that account loses them all.',
			fix: 'Keys → Ways back in: make a recovery card, or add a security key.'
		};
	return {
		level: 'fine',
		says: `${independent} ${independent === 1 ? 'way' : 'ways'} back in that do not depend on your keychain${cards ? ' — keep the card offline' : ''}.`,
		fix: ''
	};
}
