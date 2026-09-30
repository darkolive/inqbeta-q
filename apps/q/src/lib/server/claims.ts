/*
 * A claim: "this identity says it can be reached at this address."
 *
 * THE MESSAGE CARRIES NOTHING. Darren, 2026-09-19:
 *
 *   > "That message should not have an action at all. It's just information…
 *   > what is sent can be a link to a unique receipt, which this other end can
 *   > open, read, and it will determine what happens next on the receipt. But
 *   > the receipt can be a location that you download from, doesn't carry with
 *   > the message… It is literally just a receipt location, a DID address."
 *
 * So there is no code in the email, and nothing in it to act on. There is a
 * location. What sits at that location is a receipt SEALED TO THE DID that
 * made the claim — so the mail provider, anyone reading the inbox, and anyone
 * who intercepts the link all get the same thing: ciphertext.
 *
 * Inside the seal is a witness: 32 random bytes that exist nowhere else. Only
 * a passkey can get them out. Handing them back, signed, is what proves the
 * claim — the person held the mailbox AND the key, in one act, rather than
 * proving they can retype six digits.
 *
 * NOTHING IS STORED. The claim travels inside the link, encrypted under a
 * server-only key. Q runs as functions that come and go; a claim in a
 * module-level Map is lost the moment another instance answers.
 *
 * WHY ENCRYPTED AND NOT SIGNED. A signed claim would put the address and the
 * witness in the link in the clear. The point of the exercise is that the link
 * says nothing.
 */
import { env } from '$env/dynamic/private';
import { b64url, unb64url, canonical } from '@inqbeta/q-core/canonical';
import type { ChannelKind } from '@inqbeta/q-core/channels';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Long enough to reach an inbox and be opened unhurriedly; short enough to expire. */
export const CLAIM_LIFE_MS = 30 * 60 * 1000;

export interface Claim {
	/** The identity making the claim. There is always one: the passkey comes first. */
	did: string;
	kind: ChannelKind;
	address: string;
	/** Base64url, 32 bytes. Obtainable only by opening the sealed receipt. */
	witness: string;
	/** Epoch ms. */
	exp: number;
}

export class NoClaimSecret extends Error {
	constructor() {
		super('Q_OTP_SECRET is not set, so channel claims cannot be issued.');
	}
}

let keyPromise: Promise<CryptoKey> | null = null;

function key(): Promise<CryptoKey> {
	if (!keyPromise) keyPromise = buildKey();
	return keyPromise;
}

async function buildKey(): Promise<CryptoKey> {
	const secret = env.Q_OTP_SECRET?.trim();
	if (!secret) throw new NoClaimSecret();
	const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('q.channel.claim'), info: enc.encode('aes-gcm') },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export function newWitness(): string {
	return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The whole claim, encrypted. This string is the location in the link, and says nothing. */
export async function sealClaim(c: Claim): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), enc.encode(canonical(c)));
	return `${b64url(iv)}~${b64url(body)}`;
}

export async function openClaim(token: string): Promise<Claim | null> {
	const [ivPart, bodyPart] = token.split('~');
	if (!ivPart || !bodyPart) return null;
	try {
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: unb64url(ivPart) },
			await key(),
			unb64url(bodyPart)
		);
		const c = JSON.parse(dec.decode(plain)) as Claim;
		return c.exp > Date.now() ? c : null;
	} catch {
		/* Wrong key, bent link, or the secret was rotated. One answer for all. */
		return null;
	}
}

/** Same length whatever the inputs, so a comparison cannot be timed. */
export function sameWitness(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/*
 * Best-effort, per-instance: real on one long-lived server, patchy across
 * serverless functions. A shared store (the Redis already down for pub/sub) is
 * what makes this honest. Unlike a six-digit code, though, a witness is 32
 * random bytes — there is nothing here to guess, so this limits noise rather
 * than defending a secret.
 */
const CLAIMS_PER_HOUR = 5;
const made = new Map<string, number[]>();

export function tooManyClaims(fingerprint: string): boolean {
	const now = Date.now();
	const recent = (made.get(fingerprint) ?? []).filter((t) => now - t < 60 * 60 * 1000);
	if (recent.length >= CLAIMS_PER_HOUR) {
		made.set(fingerprint, recent);
		return true;
	}
	recent.push(now);
	made.set(fingerprint, recent);
	if (made.size > 5000) made.clear();
	return false;
}
