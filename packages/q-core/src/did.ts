/*
 * did:key — a person's public key written as a name.
 *
 * A did:key is not looked up anywhere. The key IS the identifier: decode the
 * string and you have the public key, so a reader can check a signature or seal
 * something to a person with nothing but the text in front of them. No
 * registry, no resolver, no network. That is the only kind of DID that fits a
 * system whose rule is "any file verifies offline".
 *
 * ONE KEY, TWO JOBS. The DID names an Ed25519 signing key. Sealing needs an
 * X25519 key, and rather than carry a second one around, the X25519 key is
 * CONVERTED from the Ed25519 one — the standard birational map used by the
 * did:key spec and by libsodium (crypto_sign_ed25519_pk_to_curve25519). So
 * "seal this to did:key:z6Mk…" needs nothing but the DID, and the same holds
 * for a bare publicKey lifted off a receipt signature: whoever signed a
 * receipt can be sealed to, straight from the receipt.
 *
 * Pure WebCrypto and BigInt, no dependencies, so it runs in the browser and in
 * the smoke test alike.
 */

const ED25519_PREFIX = new Uint8Array([0xed, 0x01]);
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export { b64url, unb64url } from './canonical';
import { unb64url } from './canonical';

export function base58(bytes: Uint8Array): string {
	let n = 0n;
	for (const b of bytes) n = (n << 8n) | BigInt(b);
	let out = '';
	while (n > 0n) {
		out = B58[Number(n % 58n)] + out;
		n /= 58n;
	}
	for (const b of bytes) {
		if (b !== 0) break;
		out = '1' + out;
	}
	return out;
}

export function unbase58(text: string): Uint8Array<ArrayBuffer> {
	let n = 0n;
	for (const c of text) {
		const i = B58.indexOf(c);
		if (i < 0) throw new Error('Not base58.');
		n = n * 58n + BigInt(i);
	}
	const bytes: number[] = [];
	while (n > 0n) {
		bytes.unshift(Number(n & 0xffn));
		n >>= 8n;
	}
	for (const c of text) {
		if (c !== '1') break;
		bytes.unshift(0);
	}
	const out = new Uint8Array(new ArrayBuffer(bytes.length));
	out.set(bytes);
	return out;
}

/** An Ed25519 public key (raw 32 bytes) as a did:key. */
export function didFromPublicKey(raw: Uint8Array): string {
	if (raw.length !== 32) throw new Error('An Ed25519 public key is 32 bytes.');
	const tagged = new Uint8Array(34);
	tagged.set(ED25519_PREFIX);
	tagged.set(raw, 2);
	return `did:key:z${base58(tagged)}`;
}

/**
 * The raw Ed25519 public key behind a did:key — or behind a base64url public
 * key as it appears in a receipt signature. Both are accepted because both
 * name the same thing, and a person should be able to paste either.
 */
export function publicKeyFrom(didOrKey: string): Uint8Array<ArrayBuffer> {
	const text = didOrKey.trim();
	if (text.startsWith('did:key:')) {
		if (!text.startsWith('did:key:z')) throw new Error('Only base58 did:key values are read.');
		const bytes = unbase58(text.slice('did:key:z'.length));
		if (bytes.length !== 34 || bytes[0] !== 0xed || bytes[1] !== 0x01)
			throw new Error('That did:key is not an Ed25519 key.');
		return bytes.slice(2);
	}
	const raw = unb64url(text);
	if (raw.length !== 32) throw new Error('That is neither a did:key nor a 32-byte public key.');
	return raw;
}

/** Normalise either form to the DID, so two spellings of one person compare equal. */
export function toDid(didOrKey: string): string {
	return didFromPublicKey(publicKeyFrom(didOrKey));
}

/* ------------------------------------------------------------------ *
 * Ed25519 → X25519
 * ------------------------------------------------------------------ */

const P = 2n ** 255n - 19n;

function mod(a: bigint): bigint {
	const r = a % P;
	return r < 0n ? r + P : r;
}

function pow(base: bigint, exp: bigint): bigint {
	let result = 1n;
	let b = mod(base);
	let e = exp;
	while (e > 0n) {
		if (e & 1n) result = (result * b) % P;
		b = (b * b) % P;
		e >>= 1n;
	}
	return result;
}

function fromLE(bytes: Uint8Array): bigint {
	let n = 0n;
	for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
	return n;
}

function toLE(n: bigint): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(new ArrayBuffer(32));
	let v = n;
	for (let i = 0; i < 32; i++) {
		out[i] = Number(v & 0xffn);
		v >>= 8n;
	}
	return out;
}

/**
 * The X25519 public key that belongs with an Ed25519 public key: u = (1+y)/(1−y).
 *
 * The sign bit of x is dropped — Montgomery u does not need it. y = 1 is the
 * identity point, which no real key is, and is refused rather than divided by.
 */
export function x25519PublicFromEd25519(edPublic: Uint8Array): Uint8Array<ArrayBuffer> {
	const bytes = edPublic.slice();
	bytes[31] &= 0x7f;
	const y = fromLE(bytes);
	if (y >= P || mod(1n - y) === 0n) throw new Error('Not a usable Ed25519 public key.');
	return toLE(mod((1n + y) * pow(1n - y, P - 2n)));
}

/**
 * The X25519 private scalar that belongs with an Ed25519 seed: the first half
 * of SHA-512(seed), clamped. Exactly what Ed25519 itself uses as its scalar,
 * which is why the two public keys correspond.
 */
export async function x25519PrivateFromEd25519Seed(seed: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const h = new Uint8Array(await crypto.subtle.digest('SHA-512', seed));
	const k = new Uint8Array(new ArrayBuffer(32));
	k.set(h.subarray(0, 32));
	k[0] &= 248;
	k[31] &= 127;
	k[31] |= 64;
	return k;
}

/* PKCS#8 wrappers for a raw 32-byte private key. WebCrypto will not import a
 * bare Ed25519 or X25519 seed as 'raw', so it goes in with its 16-byte header. */
const PKCS8_ED25519 = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
const PKCS8_X25519 = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20];

export function pkcs8(kind: 'Ed25519' | 'X25519', raw: Uint8Array): ArrayBuffer {
	const head = kind === 'Ed25519' ? PKCS8_ED25519 : PKCS8_X25519;
	const out = new Uint8Array(new ArrayBuffer(48));
	out.set(head);
	out.set(raw, 16);
	return out.buffer;
}
