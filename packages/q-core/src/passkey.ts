/*
 * Your passkey is your key.
 *
 * Darren, 2026-09-16:
 *
 *   > "Is it possible to use WebAuthn, my biometric, to sign in that creates my
 *   > DID signature that's unique… Can this all be done without having to store
 *   > anything, made on the fly, but it's the same every time?"
 *
 *   > "It's exactly the same as your keychain, whatever system you're using to
 *   > get into your phone anyway. So we're assuming they're verified by that,
 *   > and that's all we need."
 *
 * HOW. Not the passkey's own signature — that signs a fresh challenge every
 * time, and its public key is only handed over once, at creation, so using it
 * would mean storing it somewhere. Instead the WebAuthn PRF extension: give the
 * passkey a fixed input and it returns a 32-byte secret that is the SAME every
 * time, for that passkey on this site, and that nobody without the passkey can
 * compute. That secret is the seed. From it, in memory, on every unlock:
 *
 *   seed ──HKDF──▶ Ed25519 signing key ──▶ did:key   (who you are, signs receipts)
 *     │                  └──convert──▶ X25519 key     (opens what is sealed to you)
 *     └──HKDF──▶ AES-GCM vault key                    (locks your DoStudy folder)
 *
 * NOTHING IS STORED BY US. Not the seed, not the keys, not the DID, not a
 * credential id. The passkey is discoverable, so the browser offers it without
 * being told which one to look for. The one thing that is stored is the passkey
 * itself — in iCloud Keychain, Google Password Manager, 1Password, a hardware
 * key — wherever the person chose when the system asked. That is the gate, and
 * it is the same gate as their phone.
 *
 * THE ASSERTION IS NOT CHECKED, ON PURPOSE. There is no server here to check it
 * against, and nothing needs it: the security is that only the passkey can
 * produce the PRF output. A random challenge is passed because the API demands
 * one.
 *
 * WHAT CHANGES YOUR IDENTITY — said here so nobody changes it by accident:
 *   - IDENTITY_INPUT below. Change it and every person gets a new DID.
 *   - The site's domain. A passkey belongs to one domain, so localhost, a
 *     Vercel preview and darkolive.co.uk each give a DIFFERENT DID from the same
 *     fingerprint. Test on one, and expect the others to differ.
 *   - A different passkey. Two passkeys are two identities. Linking them is a
 *     signed statement, not something this file can do.
 *   - Losing the passkey. There is no reset, because there is nothing held
 *     anywhere to reset from. Anything sealed only to that DID stays sealed.
 *
 * EVERY SITE SIGNS IN ON ITS OWN (decided 2026-09-16). A browser ties each
 * passkey to the site it was made on, so each site has its own key; they are
 * made one person by signed link receipts back to a root (links.ts), checked
 * offline. No site depends on another being reachable.
 *
 * Held in memory for the life of the tab. The seed is never written to
 * storage: it is exactly as sensitive as the passkey, and anything on the page
 * can read localStorage. Since 2026-09-25 the non-extractable KEYS (never the
 * seed) are also kept in IndexedDB for 30 quiet minutes so a reload carries
 * on — see "Staying signed in across a reload" below.
 */
import { decodePointer, encodePointer, setPointerRead, type VaultPointer } from './pointer';
import { b64url, didFromPublicKey, pkcs8, x25519PrivateFromEd25519Seed } from './did';
import { canonical } from './canonical';
import { openWith, setOpeningSource, type Opener, type Signer } from './seal';
import { clearIdentityStorage } from './storage';

/**
 * The fixed input the passkey is asked to turn into a secret — the inQbeta
 * identity schema's own address (decided 2026-09-16). An identifier kept in the
 * inQbeta repository, never fetched: every site derives keys the same way from
 * the same unchanging string, with nobody's server involved. Never change it.
 */
export const IDENTITY_INPUT = 'https://schemas.inqbeta.local/governance/Identity.json';

export interface Identity {
	/** did:key:z6Mk… — the name that goes on things. */
	did: string;
	/** The same Ed25519 key, base64url, as it appears in a receipt signature. */
	publicKey: string;
	/** Signs receipts. */
	signing: CryptoKeyPair;
	/** Opens what was sealed to this DID. */
	opening: CryptoKey;
	/** Locks and unlocks the files in your DoStudy folder (vault.ts). Never extractable. */
	vault: CryptoKey;
}

const enc = new TextEncoder();

function bytes(n: number): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
}

async function prfInput(): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', enc.encode(IDENTITY_INPUT));
}

/**
 * Keys from a 32-byte seed. Pure: the same seed gives the same identity on any
 * machine, which is the whole promise, and what the smoke test holds it to.
 */
export async function identityFromSeed(seed: ArrayBuffer | Uint8Array): Promise<Identity> {
	const raw = seed instanceof Uint8Array ? seed : new Uint8Array(seed);
	if (raw.length !== 32) throw new Error('The passkey secret should be 32 bytes.');
	const base = await crypto.subtle.importKey('raw', raw.slice(), 'HKDF', false, ['deriveBits', 'deriveKey']);
	/* Through HKDF rather than used directly, so the seed is never itself a
	 * signing key and a second key could be derived later without touching it. */
	const edSeed = new Uint8Array(
		await crypto.subtle.deriveBits(
			{ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('dostudy.identity'), info: enc.encode('ed25519') },
			base,
			256
		)
	);

	/* The folder key, from the same secret by a different label — so it can
	 * never be confused with, or worked out from, the signing key. */
	const vault = await crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('dostudy.identity'), info: enc.encode('vault') },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);

	/* A private JWK carries its public half as `x`, which saves doing the curve
	 * maths — so the key is imported once, briefly exportable, to read it… */
	const probe = await crypto.subtle.importKey('pkcs8', pkcs8('Ed25519', edSeed), { name: 'Ed25519' }, true, ['sign']);
	const { x } = await crypto.subtle.exportKey('jwk', probe);
	if (!x) throw new Error('This browser did not return the public key.');
	/* …and the key the page keeps is imported again, not exportable, so nothing
	 * running in the page can copy it out. */
	const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8('Ed25519', edSeed), { name: 'Ed25519' }, false, ['sign']);
	const publicKey = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x }, { name: 'Ed25519' }, true, ['verify']);
	const rawPublic = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));

	const xPriv = await x25519PrivateFromEd25519Seed(edSeed);
	const opening = await crypto.subtle.importKey('pkcs8', pkcs8('X25519', xPriv), { name: 'X25519' }, false, ['deriveBits']);
	edSeed.fill(0);
	xPriv.fill(0);

	return {
		did: didFromPublicKey(rawPublic),
		publicKey: b64url(rawPublic),
		signing: { privateKey, publicKey },
		opening,
		vault
	};
}

/* ------------------------------------------------------------------ *
 * The one held identity
 * ------------------------------------------------------------------ */

let held: Identity | null = null;
const listeners = new Set<(id: Identity | null) => void>();

/*
 * The one thing kept between visits: the PUBLIC DID, so the header can show
 * "signed in — touch to resume" after a reload or in a new tab. Darren chose
 * this over keeping the secret (2026-09-16). A DID can lock things to you and
 * never open them, so it is safe to leave lying about; the keys still come
 * only from the passkey, one touch at a time.
 */
const REMEMBER = 'dostudy-passkey-did';

export function remembered(): string | null {
	try {
		return localStorage.getItem(REMEMBER);
	} catch {
		return null;
	}
}

function remember(did: string | null) {
	try {
		if (did) localStorage.setItem(REMEMBER, did);
		else localStorage.removeItem(REMEMBER);
	} catch {
		/* Private window or blocked storage: the header just asks afresh. */
	}
}

export function current(): Identity | null {
	return held;
}

/** Called with the identity whenever it changes, and once straight away. */
export function watch(fn: (id: Identity | null) => void): () => void {
	listeners.add(fn);
	fn(held);
	return () => listeners.delete(fn);
}

function hold(id: Identity | null, from: 'here' | 'kept' | 'other-tab' = 'here') {
	held = id;
	remember(id?.did ?? null);
	for (const fn of listeners) fn(id);
	if (from === 'here') void keepSession(id);
	if (!id && from === 'here') tellOtherTabs('signed-out');
}

/* ------------------------------------------------------------------ *
 * Staying signed in across a reload — for 30 minutes of quiet.
 *
 * Darren, 2026-09-25, choosing it: a refresh or a new tab should carry on
 * rather than ask for the passkey again. Revises the 2026-09-16 rule above
 * ("the keys still come only from the passkey, one touch at a time") for
 * this one browser, for a short while.
 *
 * WHAT IS KEPT. The CryptoKey objects themselves, in IndexedDB — not the seed,
 * not any key's bytes. They were imported non-extractable, and a browser keeps
 * that property through storage: page code can USE them (sign, open, unlock
 * the vault) but can never read them out. The seed is never kept anywhere.
 *
 * WHEN THEY GO. After 30 minutes with no use (any click or key press in Q
 * counts), after 12 hours whatever happens, on sign-out — in every tab — and
 * whenever the browser clears the site's data.
 *
 * WHAT IT COSTS. Someone who sits down at this browser within those 30
 * minutes is signed in as you, exactly as they would be if the tab had been
 * left open. Nothing else changes: a stolen copy of the storage is keys that
 * cannot be exported, locked to this browser profile.
 * ------------------------------------------------------------------ */

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;
const SESSION_DB = 'q-session';
const SESSION_STORE = 'keys';
const SESSION_KEY = 'held';

interface KeptSession {
	did: string;
	publicKey: string;
	since: number;
	seen: number;
}

/*
 * Each key in its own record (2026-09-28). Kept together, one key a browser
 * cannot give back spoils the whole record — Safari returned null for all of
 * it — and there is no telling which. Apart, each is checked by name.
 */
const KEY_RECORDS = ['signing-private', 'signing-public', 'opening', 'vault'] as const;
type KeyRecord = (typeof KEY_RECORDS)[number];
const keysOf = (id: Identity): Record<KeyRecord, CryptoKey> => ({
	'signing-private': id.signing.privateKey,
	'signing-public': id.signing.publicKey,
	opening: id.opening,
	vault: id.vault
});

/** Whether a kept session may be picked up again. Pure, so it can be tested. */
export function sessionStillGood(k: { since: number; seen: number } | null, now = Date.now()): boolean {
	return !!k && now - k.seen < SESSION_IDLE_MS && now - k.since < SESSION_MAX_MS && k.seen <= now + 60_000;
}

function sessionDb(): Promise<IDBDatabase | null> {
	return new Promise((resolve) => {
		try {
			if (typeof indexedDB === 'undefined') return resolve(null);
			/* Version 2, and the store made only if missing: a 'q-session' opened
			 * elsewhere without it (a console check did exactly that, 2026-09-28)
			 * left version 1 with no store, and every keep failed without a word. */
			const req = indexedDB.open(SESSION_DB, 2);
			req.onupgradeneeded = () => {
				if (!req.result.objectStoreNames.contains(SESSION_STORE)) req.result.createObjectStore(SESSION_STORE);
			};
			req.onsuccess = () => {
				const db = req.result;
				if (db.objectStoreNames.contains(SESSION_STORE)) return resolve(db);
				console.warn('[Q] staying signed in: the session store is missing');
				resolve(null);
			};
			req.onerror = () => (console.warn('[Q] staying signed in: could not open', req.error?.name, req.error?.message), resolve(null));
		} catch {
			resolve(null);
		}
	});
}

async function sessionOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
	const db = await sessionDb();
	if (!db) return null;
	return new Promise((resolve) => {
		try {
			const tx = db.transaction(SESSION_STORE, mode);
			const req = fn(tx.objectStore(SESSION_STORE));
			tx.oncomplete = () => resolve(req ? (req.result as T) : null);
			/* Said in the console, not swallowed: a browser that will not keep the
			 * keys (Safari has refused some kinds) is why a refresh signs you out. */
			tx.onerror = () => (console.warn('[Q] staying signed in:', tx.error?.name, tx.error?.message), resolve(null));
			tx.onabort = () => (console.warn('[Q] staying signed in (aborted):', tx.error?.name, tx.error?.message), resolve(null));
		} catch (e) {
			console.warn('[Q] staying signed in:', e instanceof Error ? `${e.name} ${e.message}` : e);
			resolve(null);
		}
	});
}

async function keepSession(id: Identity | null) {
	if (!id) {
		await sessionOp('readwrite', (s) => {
			s.delete(SESSION_KEY);
			for (const k of KEY_RECORDS) s.delete(`key:${k}`);
		});
		return;
	}
	const now = Date.now();
	const keys = keysOf(id);
	/* Only names and non-extractable keys — never a seed; there is none on an Identity. */
	await sessionOp('readwrite', (s) => {
		for (const k of KEY_RECORDS) s.put(keys[k], `key:${k}`);
		return s.put({ did: id.did, publicKey: id.publicKey, since: now, seen: now } satisfies KeptSession, SESSION_KEY);
	});
	/* Read straight back: a browser can accept keys and still not return them. */
	const back = await readKept();
	console.info(
		'[Q] staying signed in:',
		back.kept?.did === id.did && !back.missing.length
			? 'kept for 30 quiet minutes'
			: back.kept?.did === id.did && back.missing.join() === 'opening'
				? 'kept for 30 quiet minutes (this browser will not keep the opening key; one touch brings it back when needed)'
				: `NOT kept — ${back.kept ? `these keys did not come back: ${back.missing.join(', ')}` : 'nothing came back'}`
	);
}

async function readKept(): Promise<{ kept: KeptSession | null; keys: Partial<Record<KeyRecord, CryptoKey>>; missing: KeyRecord[] }> {
	const kept = (await sessionOp<KeptSession>('readonly', (s) => s.get(SESSION_KEY))) ?? null;
	const keys: Partial<Record<KeyRecord, CryptoKey>> = {};
	for (const k of KEY_RECORDS) {
		const v = await sessionOp<CryptoKey>('readonly', (s) => s.get(`key:${k}`));
		if (v instanceof CryptoKey) keys[k] = v;
	}
	return { kept, keys, missing: KEY_RECORDS.filter((k) => !keys[k]) };
}

let lastSeenWrite = 0;
/** Q is being used: push the 30-minute window along. At most once a minute. */
export function sessionSeen() {
	const now = Date.now();
	if (!held || now - lastSeenWrite < 60_000) return;
	lastSeenWrite = now;
	void sessionOp<KeptSession>('readwrite', (s) => {
		const get = s.get(SESSION_KEY);
		get.onsuccess = () => {
			const k = get.result as KeptSession | undefined;
			if (k && k.did === held?.did) s.put({ ...k, seen: now }, SESSION_KEY);
		};
		return get;
	});
}

/**
 * On load: carry on as whoever was signed in here, if it was recently enough.
 * Resolves with the identity, or null (and the kept keys are dropped).
 */
export async function resumeSession(): Promise<Identity | null> {
	if (held) return held;
	const { kept: k, keys, missing } = await readKept();
	/* The opening key alone may be missing — Safari will not give an X25519 key
	 * back. Carry on without it; one touch rebuilds it when it is first needed. */
	const lost = missing.filter((m) => m !== 'opening');
	const why = !k ? 'nothing kept' : !sessionStillGood(k) ? 'too long ago' : lost.length ? `these keys did not come back: ${lost.join(', ')}` : '';
	console.info('[Q] carrying on after a refresh:', why ? `no — ${why}` : 'yes');
	if (why || !k) {
		if (k || Object.keys(keys).length) await keepSession(null);
		return null;
	}
	const identity: Identity = {
		did: k.did,
		publicKey: k.publicKey,
		signing: { privateKey: keys['signing-private']!, publicKey: keys['signing-public']! },
		/* Possibly absent (see above): seal.openWith then asks openingSource. */
		opening: keys.opening as CryptoKey,
		vault: keys.vault!
	};
	if (!keys.opening) {
		/* Registered here, not at load: seal.ts and passkey.ts import each other. */
		setOpeningSource(rebuildOpening);
		console.info('[Q] carrying on without the opening key — one touch brings it back when something sealed is opened');
	}
	hold(identity, 'kept');
	lastSeenWrite = 0;
	sessionSeen();
	return identity;
}

/* Sign-out in one tab signs out every tab. */
let tabs: BroadcastChannel | null = null;
function tellOtherTabs(what: 'signed-out') {
	try {
		tabs?.postMessage(what);
	} catch {
		/* no other tabs to tell */
	}
}
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
	tabs = new BroadcastChannel('q-session');
	tabs.onmessage = (e) => {
		if (e.data === 'signed-out' && held) hold(null, 'other-tab');
	};
	const seen = () => sessionSeen();
	window.addEventListener('pointerdown', seen, { passive: true });
	window.addEventListener('keydown', seen, { passive: true });
}

/**
 * Hold an identity rebuilt some other way than a passkey touch — the recovery
 * card (ADR-Q-005). It gives the caller nothing it did not already have: the
 * keys are the ones the caller rebuilt, and are held exactly as a sign-in holds them.
 */
export function holdIdentity(id: Identity) {
	hold(id);
}

/** Drop the keys and the remembered DID. Signing in again rebuilds exactly the same ones. */
export function forget() {
	hold(null);
}

/**
 * Leave properly.
 *
 * `forget()` drops the keys and the remembered DID. This also clears everything
 * else that belonged to the person who was signed in — their address book,
 * their session, their second-factor settings — because a browser that has been
 * signed out of should not still be holding them (storage.ts says which, and a
 * test says the list is complete).
 *
 * The folder is deliberately left alone: its handle is keyed by DID, so signing
 * back in opens the same folder without asking. Giving one up is
 * `forgetFolder()`, which is a thing a person does on purpose.
 */
export function signOut() {
	rememberUsed(null);
	setPointerRead({ pointer: null, carried: null });
	clearIdentityStorage();
	hold(null);
	/* After the clear as well as before: `hold` writes the remembered DID, and
	 * clearing it first then writing null is belt and braces rather than a bug. */
	clearIdentityStorage();
}

/* ------------------------------------------------------------------ *
 * The browser part
 * ------------------------------------------------------------------ */

/*
 * WHERE YOUR PASSKEY IS — the first question a sign-in should ask.
 *
 * Darren, 2026-09-16: "First question… where's your keys? Is it in your
 * keychain? Is it an external device — a Ledger could be there? That then
 * decides the sign-in method."
 *
 *   device        this computer or phone's own keychain (iCloud Keychain,
 *                 Google Password Manager, Windows Hello, a password manager)
 *   security-key  a hardware key over USB or NFC. It must support FIDO2's
 *                 hmac-secret (the PRF this relies on) — YubiKey 5 does; check
 *                 any other, including a Ledger, before relying on it.
 *   phone         a passkey on another phone, reached by scanning a QR code
 *
 * The choice becomes WebAuthn `hints` (and, when making a passkey,
 * `authenticatorAttachment`), which steer the browser's prompt to the right
 * place. Browsers that do not know hints simply show their usual choice.
 * Remembered between visits — it is not a secret.
 */
export type KeyPlace = 'device' | 'security-key' | 'phone';

export const KEY_PLACES: { id: KeyPlace; label: string; says: string }[] = [
	{ id: 'device', label: 'This device', says: 'Your keychain — Touch ID, Face ID, Windows Hello, or a password manager.' },
	{ id: 'security-key', label: 'A security key', says: 'A hardware key over USB or NFC that supports FIDO2 hmac-secret, such as a YubiKey 5.' },
	{ id: 'phone', label: 'My phone', says: 'A passkey on your phone — the browser shows a QR code to scan.' }
];

const PLACE_KEY = 'q-key-place';

export function keyPlace(): KeyPlace {
	try {
		const v = localStorage.getItem(PLACE_KEY);
		return v === 'security-key' || v === 'phone' ? v : 'device';
	} catch {
		return 'device';
	}
}

export function setKeyPlace(place: KeyPlace) {
	try {
		localStorage.setItem(PLACE_KEY, place);
	} catch {
		/* not remembered then */
	}
}

function hintsFor(place: KeyPlace): string[] {
	return place === 'device' ? ['client-device'] : place === 'security-key' ? ['security-key'] : ['hybrid'];
}

export type Outcome =
	/** `via`: which passkey opened it — the founding one, or a way back in by its label (ADR-Q-005). */
	| { ok: true; identity: Identity; via?: string }
	/** `needsEnvelope`: a way-in passkey (ADR-Q-005 §6) whose continuity file is not in this browser. */
	| { ok: false; says: string; cancelled?: boolean; needsEnvelope?: boolean };

const NEEDS_ENVELOPE =
	'This passkey is a way back into your vault, not a new identity. Choose your latest backup, and it will open as you.';

export function passkeysAvailable(): boolean {
	return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function' && !!navigator.credentials;
}

/* TypeScript's DOM types lag the PRF extension, so its shape is written here. */
interface PrfResults {
	prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
	/* largeBlob (the vault pointer, pointer.ts): at creation `supported`; on a
	 * read `blob`; on a write `written`. */
	largeBlob?: { supported?: boolean; blob?: ArrayBuffer; written?: boolean };
}

/*
 * The passkey that signed in, by id — needed to write the vault pointer,
 * because a browser writes a passkey's note only when told exactly which
 * passkey (one, by id). Session storage: it survives a reload in this tab
 * and goes when the tab does, or at sign-out. Not secret, but it is this
 * person's, so it is cleared with them (storage.ts).
 */
function rememberUsed(raw: ArrayBuffer | null) {
	try {
		if (raw) sessionStorage.setItem('q-passkey-used', b64url(new Uint8Array(raw)));
		else sessionStorage.removeItem('q-passkey-used');
	} catch {
		/* private mode: the next note cannot say which passkey */
	}
}
function usedCredential(): Uint8Array<ArrayBuffer> | null {
	try {
		const v = sessionStorage.getItem('q-passkey-used');
		if (!v) return null;
		const bin = atob(v.replace(/-/g, '+').replace(/_/g, '/'));
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}

function said(e: unknown): Outcome {
	const name = e instanceof DOMException ? e.name : '';
	if (name === 'NotAllowedError' || name === 'AbortError')
		return { ok: false, cancelled: true, says: 'Nothing happened — the passkey prompt was closed or timed out.' };
	if (name === 'InvalidStateError')
		return { ok: false, says: 'There is already a passkey for this site on that device. Use "Sign in" instead.' };
	if (name === 'SecurityError')
		return { ok: false, says: 'This page cannot use passkeys from where it is running. It has to be served from its own web address, not opened as a file.' };
	return { ok: false, says: `The passkey could not be used: ${e instanceof Error ? e.message : String(e)}` };
}

const UNSUPPORTED =
	'This passkey or browser cannot produce the secret this needs (the WebAuthn "PRF" extension). ' +
	'Recent Chrome, Edge and Safari with iCloud Keychain or Google Password Manager can, and hardware keys with FIDO2 hmac-secret (such as a YubiKey 5); some others cannot yet.';

/*
 * THE PASSKEY'S HOME DOMAIN — decided 26 September 2026, following the
 * incubator: one root domain is the constant, and every service lives under
 * it (schemas., auth., federation., q.). A passkey belongs to the ROOT, so Q
 * can sit at any address under it and every passkey still works. Only a new
 * root would be a move, and the root does not change.
 *
 * A browser accepts a passkey domain only if the page is on it or under it.
 * So the root is used only there; anywhere else (localhost, a *.vercel.app
 * preview) the browser ties the passkey to that exact address, which makes it
 * a test identity — on purpose. The app sets the root once at start-up.
 */
let homeDomain: string | null = null;

/** Set the root domain passkeys belong to. Empty or unset means "this exact address". */
export function setPasskeyDomain(root: string | null | undefined): void {
	const r = (root ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
	homeDomain = r || null;
}

/** The domain a passkey made or used here belongs to, or undefined for this exact address. */
export function passkeyDomain(host: string = typeof location !== 'undefined' ? location.hostname : ''): string | undefined {
	if (!homeDomain || !host) return undefined;
	const h = host.toLowerCase();
	return h === homeDomain || h.endsWith(`.${homeDomain}`) ? homeDomain : undefined;
}

const rpFor = () => {
	const id = passkeyDomain();
	return { name: 'DoStudy', ...(id ? { id } : {}) };
};
const rpIdFor = (exactAddress = false) => {
	const id = exactAddress ? undefined : passkeyDomain();
	return id ? { rpId: id } : {};
};

/**
 * Make a passkey for this site.
 *
 * `label` is what the person will see in their keychain. It is stored there,
 * by their system, and nowhere else.
 */
export async function makePasskey(label: string, place: KeyPlace = keyPlace()): Promise<Outcome> {
	setKeyPlace(place);
	if (!passkeysAvailable()) return { ok: false, says: 'This browser does not do passkeys.' };
	const name = label.trim() || 'DoStudy';
	try {
		const cred = (await navigator.credentials.create({
			publicKey: {
				rp: rpFor(),
				/* Random, not the person's name or email. It identifies nothing. */
				user: { id: bytes(16), name, displayName: name },
				challenge: bytes(32),
				pubKeyCredParams: [
					{ type: 'public-key', alg: -8 },
					{ type: 'public-key', alg: -7 },
					{ type: 'public-key', alg: -257 }
				],
				/* Not yet in TypeScript's DOM types; see KeyPlace above. */
				...({ hints: hintsFor(place) } as object),
				authenticatorSelection: {
					authenticatorAttachment: place === 'device' ? 'platform' : 'cross-platform',
					residentKey: 'required',
					requireResidentKey: true,
					userVerification: 'required'
				},
				extensions: { prf: { eval: { first: await prfInput() } }, largeBlob: { support: 'preferred' } } as AuthenticationExtensionsClientInputs
			}
		})) as PublicKeyCredential | null;
		if (!cred) return { ok: false, cancelled: true, says: 'No passkey was made.' };

		const ext = cred.getClientExtensionResults() as PrfResults;
		/* For diagnosis: whether this new passkey said it can carry a note. */
		if (typeof console !== 'undefined') console.info('[vault note] largeBlob at creation', ext.largeBlob, 'prf at creation', !!ext.prf?.results?.first);
		if (ext.prf?.enabled === false) return { ok: false, says: UNSUPPORTED };
		/* Some systems hand the secret back at creation. Most ask again. */
		const first = ext.prf?.results?.first;
		if (first) {
			const identity = await identityFromSeed(first);
			/*
			 * THIS passkey is now the one in use, for the vault note too. Missing
			 * until 30 September: signing in by making a passkey left the note to
			 * be written to whichever passkey the tab used before — an older one
			 * that cannot carry a note — so a brand-new passkey was told it could
			 * not. What the passkey said at creation about carrying one is kept.
			 */
			rememberUsed(cred.rawId);
			setPointerRead({ pointer: null, carried: ext.largeBlob?.supported ?? null });
			hold(identity);
			return { ok: true, identity };
		}
		return unlock(place);
	} catch (e) {
		return said(e);
	}
}

/**
 * Sign in: ask for the passkey, rebuild the keys, hold them for this tab.
 *
 * `exactAddress`: look for passkeys saved under this exact address rather than
 * the root domain — the ones made before the root was set (26–27 September
 * 2026), which the browser files under inqbeta.dev, not inqbeta.dev.
 */
export async function unlock(place: KeyPlace = keyPlace(), exactAddress = false, askNote = true): Promise<Outcome> {
	setKeyPlace(place);
	if (!passkeysAvailable()) return { ok: false, says: 'This browser does not do passkeys.' };
	try {
		const cred = (await navigator.credentials.get({
			publicKey: {
				challenge: bytes(32),
				...rpIdFor(exactAddress),
				userVerification: 'required',
				...({ hints: hintsFor(place) } as object),
				/* largeBlob read: the vault pointer comes back with the same touch, offline. */
				extensions: {
					prf: { eval: { first: await prfInput() } },
					...(askNote ? { largeBlob: { read: true } } : {})
				} as AuthenticationExtensionsClientInputs
			}
		})) as PublicKeyCredential | null;
		if (!cred) return { ok: false, cancelled: true, says: 'No passkey was chosen.' };
		const results = cred.getClientExtensionResults() as PrfResults;
		const first = results.prf?.results?.first;
		if (!first) return { ok: false, says: UNSUPPORTED };
		rememberUsed(cred.rawId);
		if (typeof console !== 'undefined') console.info('[vault note] largeBlob at sign-in', results.largeBlob);
		setPointerRead({
			pointer: decodePointer(results.largeBlob?.blob),
			/* A note came back: this passkey carries one. None: unknown until one is written. */
			carried: results.largeBlob?.blob ? true : null
		});

		/* ADR-Q-005 §6. A founding passkey — every passkey made by "Create",
		 * first-time users included — works exactly as it always has: its secret
		 * IS the seed. A passkey made as a way back in only opens the continuity
		 * envelope, and without the envelope it signs nobody in rather than
		 * minting a stranger. Loaded on demand, so there is no import cycle. */
		const handle = (cred.response as AuthenticatorAssertionResponse).userHandle;
		const c = await import('./continuity');
		const role = c.passkeyRole(handle ? new Uint8Array(handle) : null);
		if (role.role === 'way-in') {
			const env = await c.knownEnvelope(role);
			if (!env) return { ok: false, says: NEEDS_ENVELOPE, needsEnvelope: true };
			const opened = await c.openEnvelope(env, new Uint8Array(first), 'passkey');
			if (!opened.ok) return { ok: false, says: opened.says };
			opened.seed.fill(0);
			hold(opened.identity);
			return { ok: true, identity: opened.identity, via: opened.via.label };
		}

		const identity = await identityFromSeed(first);
		hold(identity);
		return { ok: true, identity, via: 'your founding passkey' };
	} catch (e) {
		/* Signing in must never depend on the note: a browser that refuses the
		 * largeBlob read is asked again without it. */
		if (askNote && e instanceof DOMException && e.name === 'NotSupportedError') return unlock(place, exactAddress, false);
		return said(e);
	}
}

/* ------------------------------------------------------------------ *
 * Ways back in (ADR-Q-005): touches that return the passkey's secret for one
 * action and hold nothing afterwards.
 * ------------------------------------------------------------------ */

export type PasskeyTouch =
	| { ok: true; prf: Uint8Array<ArrayBuffer>; userHandle: Uint8Array | null }
	| { ok: false; says: string; cancelled?: boolean };

/** One touch: this passkey's secret and its user handle. `only` limits it to one credential. */
export async function touchPasskey(place: KeyPlace = keyPlace(), only?: Uint8Array<ArrayBuffer>): Promise<PasskeyTouch> {
	if (!passkeysAvailable()) return { ok: false, says: 'This browser does not do passkeys.' };
	try {
		const cred = (await navigator.credentials.get({
			publicKey: {
				challenge: bytes(32),
				...rpIdFor(),
				userVerification: 'required',
				...(only ? { allowCredentials: [{ type: 'public-key' as const, id: only }] } : ({ hints: hintsFor(place) } as object)),
				extensions: { prf: { eval: { first: await prfInput() } } } as AuthenticationExtensionsClientInputs
			}
		})) as PublicKeyCredential | null;
		if (!cred) return { ok: false, cancelled: true, says: 'No passkey was chosen.' };
		const first = (cred.getClientExtensionResults() as PrfResults).prf?.results?.first;
		if (!first) return { ok: false, says: UNSUPPORTED };
		const handle = (cred.response as AuthenticatorAssertionResponse).userHandle;
		return { ok: true, prf: new Uint8Array(first), userHandle: handle ? new Uint8Array(handle) : null };
	} catch (e) {
		return said(e) as PasskeyTouch;
	}
}

/**
 * Make a passkey that is a way back in. `userId` is `continuity.wayInHandle(did)`,
 * which is how sign-in later knows it opens an envelope and is not a new person.
 */
export async function makeWayInPasskey(label: string, userId: Uint8Array<ArrayBuffer>, place: KeyPlace): Promise<PasskeyTouch> {
	if (!passkeysAvailable()) return { ok: false, says: 'This browser does not do passkeys.' };
	const name = label.trim() || 'Q — a way back in';
	try {
		const cred = (await navigator.credentials.create({
			publicKey: {
				rp: rpFor(),
				user: { id: userId, name, displayName: name },
				challenge: bytes(32),
				pubKeyCredParams: [
					{ type: 'public-key', alg: -8 },
					{ type: 'public-key', alg: -7 },
					{ type: 'public-key', alg: -257 }
				],
				...({ hints: hintsFor(place) } as object),
				authenticatorSelection: {
					authenticatorAttachment: place === 'device' ? 'platform' : 'cross-platform',
					residentKey: 'required',
					requireResidentKey: true,
					userVerification: 'required'
				},
				extensions: { prf: { eval: { first: await prfInput() } }, largeBlob: { support: 'preferred' } } as AuthenticationExtensionsClientInputs
			}
		})) as PublicKeyCredential | null;
		if (!cred) return { ok: false, cancelled: true, says: 'No passkey was made.' };
		const ext = cred.getClientExtensionResults() as PrfResults;
		if (ext.prf?.enabled === false) return { ok: false, says: UNSUPPORTED };
		const first = ext.prf?.results?.first;
		if (first) return { ok: true, prf: new Uint8Array(first), userHandle: userId };
		/* Most systems only give the secret on a sign-in: one more touch, of this passkey only. */
		return touchPasskey(place, new Uint8Array(cred.rawId));
	} catch (e) {
		return said(e) as PasskeyTouch;
	}
}

/* ------------------------------------------------------------------ *
 * The two things other code needs from an identity
 * ------------------------------------------------------------------ */

/** Signs the canonical form of a document with this identity's Ed25519 key. */
export function signerFor(id: Identity): Signer & Required<Pick<Signer, 'signBytes'>> {
	return {
		did: id.did,
		publicKey: id.publicKey,
		async signCanonical(doc: unknown) {
			const sig = await crypto.subtle.sign({ name: 'Ed25519' }, id.signing.privateKey, new TextEncoder().encode(canonical(doc)));
			return b64url(sig);
		},
		async signBytes(bytes: Uint8Array) {
			return new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, id.signing.privateKey, bytes as Uint8Array<ArrayBuffer>));
		}
	};
}

/** Opens what was sealed to this identity's DID. */
export function openerFor(id: Identity): Opener {
	return { did: id.did, open: (sealed) => openWith(sealed, id) };
}


/* One touch rebuilds the whole identity, opening key included, for this tab —
 * and only one at a time, however many sealed things ask at once. */
let rebuilding: Promise<CryptoKey> | null = null;
function rebuildOpening(): Promise<CryptoKey> {
	if (held?.opening instanceof CryptoKey) return Promise.resolve(held.opening);
	rebuilding ??= unlock(keyPlace())
		.then((out) => {
			if (!out.ok) throw new Error(out.says || 'Touch your passkey to open this.');
			if (!(out.identity.opening instanceof CryptoKey)) throw new Error('This passkey could not rebuild the key that opens sealed things.');
			return out.identity.opening;
		})
		.finally(() => (rebuilding = null));
	return rebuilding;
}

/* ------------------------------------------------------------------ *
 * Writing the vault pointer (pointer.ts) — one touch, offline.
 * ------------------------------------------------------------------ */

export type PointerNoted = { ok: true } | { ok: false; says: string; cancelled?: boolean; unsupported?: boolean };

/**
 * Write the note into the passkey that signed in. Asks for a touch. Needs no
 * network: the passkey is on this device (or on its security key), and its
 * synced copy carries the note to your other devices when they next sync.
 */
export async function notePointer(p: VaultPointer): Promise<PointerNoted> {
	if (!passkeysAvailable()) return { ok: false, says: 'This browser does not do passkeys.' };
	const id = usedCredential();
	if (typeof console !== 'undefined') console.info('[vault note] writing to passkey', id ? b64url(id).slice(0, 12) + '…' : 'none');
	/* A browser writes a passkey's note only for one passkey named by id. */
	if (!id) return { ok: false, says: 'Sign in with your passkey first, so Q knows which passkey to note it on.' };
	let blob: Uint8Array<ArrayBuffer>;
	try {
		blob = encodePointer(p);
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
	try {
		const cred = (await navigator.credentials.get({
			publicKey: {
				challenge: bytes(32),
				...rpIdFor(),
				userVerification: 'required',
				allowCredentials: [{ type: 'public-key', id }],
				extensions: { largeBlob: { write: blob } } as AuthenticationExtensionsClientInputs
			}
		})) as PublicKeyCredential | null;
		if (!cred) return { ok: false, cancelled: true, says: 'Nothing was noted.' };
		const written = (cred.getClientExtensionResults() as PrfResults).largeBlob?.written;
		/* For diagnosis in the browser console: what the passkey answered. */
		if (typeof console !== 'undefined') console.info('[vault note] largeBlob write', (cred.getClientExtensionResults() as PrfResults).largeBlob);
		if (!written) {
			setPointerRead({ pointer: null, carried: false });
			return {
				ok: false,
				unsupported: true,
				says: 'This passkey cannot carry a note. Either it was made before Q asked for one, or the keychain it lives in does not keep notes (iCloud Keychain and Google Password Manager do).'
			};
		}
		setPointerRead({ pointer: p, carried: true });
		return { ok: true };
	} catch (e) {
		const out = said(e);
		return out.ok ? { ok: true } : { ok: false, says: out.says, cancelled: out.cancelled };
	}
}
