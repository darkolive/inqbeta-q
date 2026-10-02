/*
 * Sealing to people — no shared secret at all.
 *
 * The content key is wrapped once per recipient with X25519, so only that
 * recipient's passkey can rebuild the key that unwraps it. Who it is for is on
 * the envelope in the clear; the gate is whether the key unwraps, never a list.
 *
 * Returns the hash of the ORIGINAL content alongside the envelope, because that
 * is what a receipt must commit to: sealing must never change what was signed.
 * (The passphrase seal, the older shared-secret case, stays in the DoStudy
 * kernel and uses the same envelope schema.)
 */
import { b64url, canonical, sha256, unb64url } from './canonical';
import { publicKeyFrom, toDid, x25519PublicFromEd25519 } from './did';
import { current, type Identity } from './passkey';

export const SEAL_SCHEMA = 'dostudy.sealed/1';
export const TO_PEOPLE_ALG = 'AES-GCM-256/X25519-HKDF-SHA256';

export interface SealedToPeople {
	schema: typeof SEAL_SCHEMA;
	alg: typeof TO_PEOPLE_ALG;
	iv: string;
	ciphertext: string;
	forWhom: string;
	/**
	 * 'gzip' when the content was compressed before it was sealed (2 October
	 * 2026). Big things that are mostly text — a voice message's audio written
	 * as base64 — come out about a quarter smaller. Absent on older seals,
	 * which open as before.
	 */
	zip?: 'gzip';
	/** One entry per person. The content key, wrapped so only they can unwrap it. */
	recipients: { did: string; ephemeral: string; iv: string; wrapped: string }[];
}

export type Opened = { ok: true; body: unknown; says: string } | { ok: false; says: string };

/** Anything that can open a seal addressed to `did` — a local key, or Q across the window. */
export interface Opener {
	did: string;
	open(sealed: SealedToPeople): Promise<Opened>;
}

/** Anything that can sign as `did` — a local key, or Q across the window. */
export interface Signer {
	did: string;
	/** The Ed25519 key, base64url, as it appears in a receipt signature. */
	publicKey: string;
	/** Signs UTF-8 canonical(doc). Returns the signature, base64url. */
	signCanonical(doc: unknown): Promise<string>;
	/** Signs raw bytes (Ed25519). UCAN tokens need this; see ucan/token.ts. */
	signBytes?(bytes: Uint8Array): Promise<Uint8Array>;
}

export function isSealedToPeople(body: unknown): body is SealedToPeople {
	return (
		!!body &&
		typeof body === 'object' &&
		(body as SealedToPeople).schema === SEAL_SCHEMA &&
		(body as SealedToPeople).alg === TO_PEOPLE_ALG
	);
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function joined(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(new ArrayBuffer(a.length + b.length));
	out.set(a);
	out.set(b, a.length);
	return out;
}

const WRAP_INFO = enc.encode('dostudy.sealed/x25519');

/* Both public keys go into the salt, so a wrapped key cannot be lifted into
 * another recipient's entry. An all-zero shared secret means a non-key; refused. */
async function wrappingKey(shared: ArrayBuffer, ephemeral: Uint8Array, recipient: Uint8Array) {
	if (new Uint8Array(shared).every((b) => b === 0)) throw new Error('That is not a usable key.');
	const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: joined(ephemeral, recipient), info: WRAP_INFO },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

async function squeeze(bytes: Uint8Array, how: 'gzip' | 'gunzip'): Promise<Uint8Array<ArrayBuffer>> {
	const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(how === 'gzip' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function sealTo(
	body: unknown,
	people: string[],
	forWhom: string,
	opts: { zip?: boolean } = {}
): Promise<{ sealed: SealedToPeople; contentHash: string }> {
	const dids = [...new Set(people.map((p) => p.trim()).filter(Boolean).map(toDid))];
	if (!dids.length) throw new Error('Sealing to people needs at least one person.');

	const plain = canonical(body);
	const contentKey = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
	const aes = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
	const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
	const raw = enc.encode(plain);
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, opts.zip ? await squeeze(raw, 'gzip') : raw);

	const recipients: SealedToPeople['recipients'] = [];
	for (const did of dids) {
		const theirs = x25519PublicFromEd25519(publicKeyFrom(did));
		const theirKey = await crypto.subtle.importKey('raw', theirs, { name: 'X25519' }, false, []);
		const eph = (await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair;
		const ephRaw = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
		const shared = await crypto.subtle.deriveBits({ name: 'X25519', public: theirKey }, eph.privateKey, 256);
		const kek = await wrappingKey(shared, ephRaw, theirs);
		const wiv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
		const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wiv }, kek, contentKey);
		recipients.push({ did, ephemeral: b64url(ephRaw), iv: b64url(wiv), wrapped: b64url(wrapped) });
	}
	contentKey.fill(0);

	return {
		sealed: { schema: SEAL_SCHEMA, alg: TO_PEOPLE_ALG, iv: b64url(iv), ciphertext: b64url(ciphertext), forWhom, ...(opts.zip ? { zip: 'gzip' as const } : {}), recipients },
		contentHash: await sha256(plain)
	};
}

/**
 * Open with a local key. Entries are found by DID only to say something useful;
 * a forged entry claiming your DID still would not unwrap.
 */

/** Sign and seal a receipt with your passkey */
/**
 * Sign and wrap content as a receipt, with an identity given explicitly.
 *
 * Split out from `seal()` on 2026-09-20 so that sealing can be exercised
 * without module state. A signing path that can only run inside a signed-in
 * browser is a signing path nothing tests, and checkReceipt() below needs real
 * receipts to have anything to say.
 */
export async function sealWith<T extends object>(
	identity: Pick<Identity, 'did' | 'publicKey' | 'signing'>,
	content: T
): Promise<SealedReceipt> {
	const plain = canonical(content);
	const contentHash = await sha256(plain);
	const sig = await crypto.subtle.sign(
		{ name: 'Ed25519' },
		identity.signing.privateKey,
		new TextEncoder().encode(plain)
	);
	return {
		schema: 'inqbeta.receipt/1',
		source: (content as { source?: string }).source || 'inqbeta:unknown',
		did: identity.did,
		publicKey: identity.publicKey,
		signedAt: new Date().toISOString(),
		contentHash,
		signature: b64url(sig),
		content
	} as SealedReceipt;
}

export async function seal<T extends object>(content: T): Promise<SealedReceipt> {
	const identity = current();
	if (!identity) throw new Error('No passkey identity available');
	return sealWith(identity, content);
}

export interface SealedReceipt {
	schema: string;
	source: string;
	did: string;
	publicKey: string;
	signedAt: string;
	contentHash: string;
	signature: string;
	content: unknown;
}

/** Type alias for sealed receipts (used by federation, ui-receipts, etc.) */
export type Sealed<K extends string, T> = SealedReceipt & { kind?: K } & T;

/*
 * Where an opening key comes from when the one held is missing.
 *
 * Safari keeps every key Q holds across a refresh except the X25519 opening
 * key (2026-09-28). So after a refresh Q carries on signed in without it, and
 * the first time something sealed must be opened, this asks for one passkey
 * touch to rebuild it. passkey.ts sets it; nothing else should.
 */
let openingSource: (() => Promise<CryptoKey>) | null = null;
export function setOpeningSource(fn: (() => Promise<CryptoKey>) | null): void {
	openingSource = fn;
}

export async function openWith(sealed: SealedToPeople, key: { did: string; opening: CryptoKey }): Promise<Opened> {
	if (!(key.opening instanceof CryptoKey) && openingSource && isSealedToPeople(sealed) && sealed.recipients.some((r) => r.did === key.did)) {
		try {
			key = { did: key.did, opening: await openingSource() };
		} catch (e) {
			return { ok: false, says: e instanceof Error ? e.message : 'Touch your passkey to open this.' };
		}
	}
	if (!isSealedToPeople(sealed))
		return { ok: false, says: 'This was sealed with a passphrase, not to a person. A passkey will not open it.' };
	const mine = sealed.recipients.filter((r) => r.did === key.did);
	if (!mine.length) {
		const n = sealed.recipients.length;
		return { ok: false, says: `Your passkey is not ${n === 1 ? 'the one' : `one of the ${n}`} this was sealed for.` };
	}
	const myX = x25519PublicFromEd25519(publicKeyFrom(key.did));
	for (const r of mine) {
		try {
			const ephRaw = unb64url(r.ephemeral);
			const eph = await crypto.subtle.importKey('raw', ephRaw, { name: 'X25519' }, false, []);
			const shared = await crypto.subtle.deriveBits({ name: 'X25519', public: eph }, key.opening, 256);
			const kek = await wrappingKey(shared, ephRaw, myX);
			const contentKey = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(r.iv) }, kek, unb64url(r.wrapped));
			const aes = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['decrypt']);
			const opened = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(sealed.iv) }, aes, unb64url(sealed.ciphertext)));
			const plain = sealed.zip === 'gzip' ? await squeeze(opened, 'gunzip') : opened;
			return { ok: true, body: JSON.parse(dec.decode(plain)), says: 'Opened with your passkey.' };
		} catch {
			/* try the next entry, if there is one */
		}
	}
	return {
		ok: false,
		says: 'This names your passkey, but it would not open. The sealed part may have been damaged — or the entry was never really made with your key.'
	};
}

/* ------------------------------------------------------------------ *
 * Checking a receipt.
 *
 * WHY THIS DID NOT EXIST UNTIL NOW, WHICH IS WORTH SAYING. Every receipt Q has
 * ever written has been signed, and until 20 September nothing anywhere
 * checked one. A signature nobody verifies is decoration — it costs the bytes
 * and buys nothing, and it lets a page say "signed" about a file it has not
 * examined. assurance.ts then made it worse by writing `held: 'signed'` into
 * every answering, which is a claim, and a claim nothing tests is the thing
 * this project keeps finding and calling out.
 *
 * WHAT CAN BE CHECKED FROM A RECEIPT ALONE:
 *
 *   the DID is the key    did:key is derived FROM the public key, so a receipt
 *                         cannot claim somebody else's name while carrying its
 *                         own key. This is the check that matters most and it
 *                         is pure arithmetic.
 *   the signature holds   Ed25519 over the canonical content.
 *   the hash matches      contentHash is what it says it is.
 *
 * WHAT CANNOT, AND THIS IS A CONSEQUENCE WE CHOSE. `present` and `verified`
 * say a key was touched, or a fingerprint given. Checking that from outside
 * would need the authenticator data and its flags — which carries the AAGUID,
 * the make and model of the key, and assurance.ts refuses to let that travel.
 *
 * So those two rungs are the signer's own word, enforced where the answering
 * happened. Exactly like an unwitnessed time in revocation.ts: fine for your
 * own records, not proof to somebody disputing it. `witnessed` is the rung
 * that becomes checkable again, because somebody else signed.
 *
 * That trade is deliberate and it is stated in the result rather than papered
 * over, because a verifier that returns "verified: true" for a claim it cannot
 * test is worse than one that returns nothing.
 * ------------------------------------------------------------------ */

export interface ReceiptCheck {
	/** True only when everything checkable checked out. */
	ok: boolean;
	/** The DID really is this receipt's public key. */
	isWhoItSays: boolean;
	/** The signature verifies over the content. */
	signatureHolds: boolean;
	/** contentHash matches the content. */
	hashMatches: boolean;
	/**
	 * What the receipt claims about itself that this check cannot reach. Empty
	 * when there is nothing outstanding.
	 */
	takenOnTrust: string[];
	/** One line, in the words a person would use. Shown, not paraphrased. */
	says: string;
}

function isReceipt(x: unknown): x is SealedReceipt {
	const r = x as SealedReceipt;
	return (
		!!r &&
		typeof r === 'object' &&
		typeof r.did === 'string' &&
		typeof r.publicKey === 'string' &&
		typeof r.signature === 'string' &&
		typeof r.contentHash === 'string' &&
		'content' in r
	);
}

/**
 * Check a receipt, and say plainly what was not checked.
 *
 * Never throws: a malformed receipt is a thing to report, not an exception for
 * a page to turn into a red box nobody can act on.
 */
export async function checkReceipt(receipt: unknown): Promise<ReceiptCheck> {
	const no = (says: string): ReceiptCheck => ({
		ok: false,
		isWhoItSays: false,
		signatureHolds: false,
		hashMatches: false,
		takenOnTrust: [],
		says
	});

	if (!isReceipt(receipt)) return no('This is not a receipt.');

	let isWhoItSays = false;
	try {
		/* did:key is DERIVED from the public key, so this is arithmetic rather
		 * than a lookup: a receipt cannot wear somebody else's name. */
		isWhoItSays = toDid(receipt.publicKey) === toDid(receipt.did);
	} catch {
		isWhoItSays = false;
	}

	const plain = canonical(receipt.content);
	const hashMatches = (await sha256(plain)) === receipt.contentHash;

	let signatureHolds = false;
	try {
		const key = await crypto.subtle.importKey(
			'raw',
			publicKeyFrom(receipt.publicKey),
			{ name: 'Ed25519' },
			false,
			['verify']
		);
		signatureHolds = await crypto.subtle.verify(
			{ name: 'Ed25519' },
			key,
			unb64url(receipt.signature),
			new TextEncoder().encode(plain)
		);
	} catch {
		signatureHolds = false;
	}

	/* What the content claims about itself that a signature cannot reach. */
	const held = (receipt.content as { held?: string } | null)?.held;
	const takenOnTrust: string[] = [];
	if (held === 'present') takenOnTrust.push('that a key was touched when this was answered');
	if (held === 'verified') takenOnTrust.push('that a fingerprint, face or PIN was given');

	if (!isWhoItSays) {
		return {
			ok: false,
			isWhoItSays,
			signatureHolds,
			hashMatches,
			takenOnTrust,
			says: 'This receipt names one identity and carries another’s key.'
		};
	}
	if (!hashMatches) {
		return { ok: false, isWhoItSays, signatureHolds, hashMatches, takenOnTrust, says: 'The contents have changed since this was written.' };
	}
	if (!signatureHolds) {
		return { ok: false, isWhoItSays, signatureHolds, hashMatches, takenOnTrust, says: 'The signature does not hold. This was not written by that key.' };
	}

	return {
		ok: true,
		isWhoItSays,
		signatureHolds,
		hashMatches,
		takenOnTrust,
		says: takenOnTrust.length
			? `Signed by ${receipt.did.slice(0, 16)}… and unchanged since. Taken on their word: ${takenOnTrust.join(', ')}.`
			: `Signed by ${receipt.did.slice(0, 16)}… and unchanged since.`
	};
}

/**
 * Whose a receipt is, once it has been checked.
 *
 * Three things a folder holds, and they are not failures of each other: your
 * own receipts, receipts somebody gave you, and receipts that do not hold up.
 * Telling them apart is what lets a screen show all three without lying about
 * any of them.
 *
 * THE RULE THAT MATTERS: A RECEIPT THAT FAILS IS NEVER HIDDEN. It is the one a
 * person most needs to see. Dropping it silently would leave a folder that
 * looks clean because the evidence of it not being clean was swallowed — the
 * same failure as an archive that shows a tick for a drive nobody has plugged
 * in since 2024.
 */
export type Whose =
	/** Signed by the passkey in front of us. */
	| 'yours'
	/** Signed by somebody else, and it holds. Normal — a card, an attestation. */
	| 'theirs'
	/** No signature at all. Readable, but nothing stands behind it. */
	| 'unsigned'
	/** There is a signature and it does not hold. Show it and say so. */
	| 'broken';

export interface Ownership {
	whose: Whose;
	/** One line, in the words a person would use. Shown, not paraphrased. */
	says: string;
}

export function whose(receipt: unknown, check: ReceiptCheck, myDid: string | null): Ownership {
	const r = receipt as { did?: unknown; signature?: unknown };
	if (typeof r?.signature !== 'string' || typeof r?.did !== 'string') {
		return { whose: 'unsigned', says: 'Nothing signed this. It is readable, and that is all.' };
	}
	if (!check.ok) return { whose: 'broken', says: check.says };
	if (myDid && r.did === myDid) return { whose: 'yours', says: check.says };
	return { whose: 'theirs', says: `From ${r.did.slice(0, 16)}…, and it holds.` };
}
