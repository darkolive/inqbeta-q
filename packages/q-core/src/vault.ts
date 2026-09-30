/*
 * The locked folder.
 *
 * Darren, 2026-09-16: "when the folder is created… the only way to open it is
 * by your actual DID matching… you can try and open it on your desktop and it
 * won't open. You don't know what's in it."
 *
 * WHAT A WEB PAGE CAN AND CANNOT LOCK. It cannot put a password on the folder
 * itself — Finder will always open a folder. What it can do is make everything
 * INSIDE unreadable: each file is encrypted with a key only your passkey can
 * rebuild, and saved under a meaningless name, so opening the folder on the
 * desktop shows a list of `.dsv` files that say nothing about what they are.
 * What still shows is how many there are, their sizes, and when they changed.
 *
 * THE KEY. AES-GCM-256, derived from the passkey's PRF secret alongside the
 * signing key (passkey.ts). Same passkey, same key, every time, on any device
 * the passkey reaches; never stored; never leaves the page. Offline is fine —
 * nothing here touches the network.
 *
 * THE COST OF THAT, SAID PLAINLY. No passkey, no files. There is no reset and
 * no back door, because a back door is the thing this exists not to have.
 * "Save a readable copy" on the Data tab is the way to keep something outside
 * the lock.
 *
 * THE FORMAT. `DSV1` · 12-byte IV · ciphertext of:
 *   4-byte big-endian length · JSON metadata · the file's own bytes
 * The name, type and where it belongs are INSIDE the encryption.
 *
 * THE NAME ON DISK IS THE HASH (2026-09-16). A locked file is saved as
 * `<sha256 of its locked bytes, hex>.dsv` — the inQbeta locator spec's
 * `content://sha256/<hex>` made into a filename. It still says nothing about
 * what the file is, but now the same file has the same name on every node and
 * every copy location, a copy can be checked against its own name, and a
 * receipt can point at it by hash wherever it happens to be kept. Files made
 * before this keep their random names and still open; they are simply not
 * checkable by name.
 */
import { cidFromHex } from './ucan/cid';

export const VAULT_EXT = '.dsv';
const MAGIC = new Uint8Array([0x44, 0x53, 0x56, 0x31]); // "DSV1"

export interface VaultMeta {
	/** The file's real name. */
	name: string;
	/** Where it belongs, e.g. "receipts", "notes", "files". Empty for the top. */
	path: string;
	/** MIME type, or '' when unknown. */
	type: string;
	size: number;
	/** ISO — when it was put in the vault. */
	saved: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

const HEX64 = /^[0-9a-f]{64}$/;

function hex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** The SHA-256 of some bytes, hex. */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
	const b = bytes instanceof Uint8Array ? bytes.slice() : bytes;
	return hex(await crypto.subtle.digest('SHA-256', b));
}

/** The on-disk name for locked bytes: `<sha256 hex>.dsv`. */
export async function contentName(locked: Uint8Array): Promise<string> {
	return (await sha256Hex(locked)) + VAULT_EXT;
}

/** The inQbeta locator for locked bytes: `content://sha256/<hex>`. */
export async function contentAddress(locked: Uint8Array): Promise<string> {
	return `content://sha256/${await sha256Hex(locked)}`;
}

/**
 * The same address as a CID (`bafkrei…`, raw codec, SHA-256) — how UCAN and
 * IPFS tools name bytes. The digest is the one already in the file's name.
 */
export async function contentCid(locked: Uint8Array): Promise<string> {
	return cidFromHex(await sha256Hex(locked)).toBase32();
}

/** The CID for a content name, without reading the file. null for other names. */
export function cidForName(name: string): string | null {
	return isContentName(name) ? cidFromHex(name.slice(0, -VAULT_EXT.length)).toBase32() : null;
}

/** Whether a filename is a content name (so it can be checked). */
export function isContentName(name: string): boolean {
	return name.endsWith(VAULT_EXT) && HEX64.test(name.slice(0, -VAULT_EXT.length));
}

/**
 * Does a file still match its own name? `null` when the name is not a content
 * name (an older random name, or one a person typed) — nothing to check against.
 */
export async function matchesName(name: string, bytes: Uint8Array): Promise<boolean | null> {
	if (!isContentName(name)) return null;
	return name.slice(0, -VAULT_EXT.length) === (await sha256Hex(bytes));
}

/** A random name — only for files made before content names. Kept for reference. */
export function randomName(): string {
	const b = crypto.getRandomValues(new Uint8Array(12));
	return [...b].map((x) => x.toString(16).padStart(2, '0')).join('') + VAULT_EXT;
}

export function looksLocked(bytes: Uint8Array): boolean {
	return bytes.length > 16 && MAGIC.every((m, i) => bytes[i] === m);
}

/** Encrypt a file with its metadata. */
export async function lockBytes(
	key: CryptoKey,
	meta: Omit<VaultMeta, 'size' | 'saved'> & { saved?: string },
	data: ArrayBuffer | Uint8Array
): Promise<Uint8Array<ArrayBuffer>> {
	const body = data instanceof Uint8Array ? data : new Uint8Array(data);
	const full: VaultMeta = { ...meta, size: body.length, saved: meta.saved ?? new Date().toISOString() };
	const head = enc.encode(JSON.stringify(full));
	const plain = new Uint8Array(4 + head.length + body.length);
	new DataView(plain.buffer).setUint32(0, head.length);
	plain.set(head, 4);
	plain.set(body, 4 + head.length);

	const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
	const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
	plain.fill(0);

	const out = new Uint8Array(new ArrayBuffer(4 + 12 + cipher.length));
	out.set(MAGIC);
	out.set(iv, 4);
	out.set(cipher, 16);
	return out;
}

/**
 * Decrypt. Throws when the key is not the one it was locked with — which, for
 * AES-GCM, is indistinguishable from the file having been damaged.
 */
export async function unlockBytes(
	key: CryptoKey,
	bytes: Uint8Array
): Promise<{ meta: VaultMeta; data: Uint8Array<ArrayBuffer> }> {
	if (!looksLocked(bytes)) throw new Error('Not a locked DoStudy file.');
	const iv = bytes.slice(4, 16);
	const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes.slice(16)));
	const len = new DataView(plain.buffer).getUint32(0);
	const meta = JSON.parse(dec.decode(plain.subarray(4, 4 + len))) as VaultMeta;
	const data = plain.slice(4 + len);
	return { meta, data };
}

/* A short sealed phrase kept in dostudy.json, so a wrong key is caught once,
 * up front, rather than as a folder full of files that "will not open". */
const CHECK = 'dostudy vault';

export async function makeCheck(key: CryptoKey): Promise<string> {
	const b = await lockBytes(key, { name: CHECK, path: '', type: 'text/plain', saved: '1970-01-01T00:00:00.000Z' }, enc.encode(CHECK));
	let s = '';
	for (const x of b) s += String.fromCharCode(x);
	return btoa(s);
}

export async function passesCheck(key: CryptoKey, check: string): Promise<boolean> {
	try {
		const s = atob(check);
		const b = new Uint8Array(s.length);
		for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
		const { data } = await unlockBytes(key, b);
		return dec.decode(data) === CHECK;
	} catch {
		return false;
	}
}

/** What sits next to the locked files in plain text, for whoever opens the folder. */
export const README = `This is a locked DoStudy folder.

Everything in here is encrypted to one person's passkey. The files cannot be
opened from this folder — their names, contents and types are all inside the
lock.

To see what is here, open DoStudy, sign in with the passkey this folder
belongs to, and go to the Data tab. It works offline.

There is no password and no way round it. Without that passkey, nobody —
including Dark Olive — can open these files.

Please leave dostudy.json where it is. It says which passkey this folder
belongs to.
`;
