/*
 * THE VAULT POINTER — a note the passkey carries about where your vault is.
 *
 * Darren, 29 September 2026: "when you use a passkey … can it leave a
 * timestamp … last time used … with some kind of Git ID so it knows where the
 * source of truth is. Whether that's the Google Drive or on the browser
 * device." Then: "it should happen on syncing and on signing out … something
 * that you learn to do … an important feature of it being an offline function."
 *
 * HOW. WebAuthn's largeBlob extension: a site may keep about a kilobyte INSIDE
 * a passkey, read back at the same touch that signs you in. So the pointer
 * travels with the passkey — through iCloud Keychain or Google Password
 * Manager — to every device you use, and is read with no network at all.
 * Writing it needs a touch of its own, so it is written at the moments you
 * are already doing something on purpose: syncing, backing up, signing out.
 *
 * WHAT IT SAYS. When it was noted; the vault's HEAD — a fingerprint of which
 * files the vault holds (their names are content hashes, so two copies with
 * the same files have the same head, like a Git commit id); how many files;
 * which device noted it; and where copies were carried at that moment.
 * Nothing secret: no keys, no contents, no folder names beyond a label.
 *
 * WHERE IT WORKS. Passkeys made with largeBlob support — iCloud Keychain and
 * Google Password Manager do; most third-party managers and Chrome on Android
 * do not. A passkey made before Q asked for it cannot carry one (support is
 * fixed when the passkey is made). Everything here is optional: no pointer
 * simply means nothing is said.
 *
 * Pure — no browser APIs — so it is tested in Node.
 */

export interface VaultPointer {
	v: 1;
	/** When it was noted (ISO). */
	at: string;
	/** Fingerprint of the vault's files: same files, same head. */
	head: string;
	files: number;
	/** The device that noted it, e.g. "Safari on Mac". */
	from: string;
	/** Where copies were carried when it was noted, e.g. ["Google Drive"]. */
	copies: string[];
}

/** WebAuthn gives the passkey roughly a kilobyte; stay well inside it. */
export const POINTER_MAX_BYTES = 512;

export function encodePointer(p: VaultPointer): Uint8Array<ArrayBuffer> {
	const tidy: VaultPointer = {
		v: 1,
		at: p.at,
		head: p.head.slice(0, 64),
		files: Math.max(0, Math.floor(p.files)),
		from: p.from.slice(0, 60),
		copies: p.copies.map((c) => c.slice(0, 40)).slice(0, 5)
	};
	const out = new TextEncoder().encode(JSON.stringify(tidy));
	if (out.length > POINTER_MAX_BYTES) throw new Error('The vault note is too long for a passkey.');
	return out;
}

export function decodePointer(bytes: ArrayBuffer | Uint8Array | null | undefined): VaultPointer | null {
	if (!bytes || bytes.byteLength === 0) return null;
	try {
		const p = JSON.parse(new TextDecoder().decode(bytes)) as Partial<VaultPointer>;
		if (p.v !== 1 || typeof p.at !== 'string' || typeof p.head !== 'string') return null;
		if (Number.isNaN(Date.parse(p.at))) return null;
		return {
			v: 1,
			at: p.at,
			head: p.head,
			files: typeof p.files === 'number' ? p.files : 0,
			from: typeof p.from === 'string' ? p.from : '',
			copies: Array.isArray(p.copies) ? p.copies.filter((c): c is string => typeof c === 'string') : []
		};
	} catch {
		return null;
	}
}

/** "Safari on Mac", "Chrome on Windows" — a label a person recognises, nothing more. */
export function deviceLabel(ua: string): string {
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /Firefox\//.test(ua)
			? 'Firefox'
			: /Chrome\//.test(ua) || /CriOS\//.test(ua)
				? 'Chrome'
				: /Safari\//.test(ua)
					? 'Safari'
					: 'a browser';
	const os = /iPhone/.test(ua)
		? 'iPhone'
		: /iPad/.test(ua)
			? 'iPad'
			: /Android/.test(ua)
				? 'Android'
				: /Mac OS X|Macintosh/.test(ua)
					? 'Mac'
					: /Windows/.test(ua)
						? 'Windows'
						: /Linux/.test(ua)
							? 'Linux'
							: 'a device';
	return `${browser} on ${os}`;
}

/*
 * What the passkey said at the last sign-in in this tab. Kept in memory
 * only: it is re-read at every sign-in, and there is nothing to keep.
 *   pointer   the note, or null for none
 *   carried   true: the passkey can carry one; false: it cannot; null: unknown
 */
export interface PointerRead {
	pointer: VaultPointer | null;
	carried: boolean | null;
}
let read: PointerRead = { pointer: null, carried: null };
const listeners = new Set<(r: PointerRead) => void>();

export function setPointerRead(r: PointerRead): void {
	read = r;
	for (const fn of listeners) fn(read);
}

/** What the passkey has said so far in this tab. */
export function pointerRead(): PointerRead {
	return read;
}

export function watchPointer(fn: (r: PointerRead) => void): () => void {
	listeners.add(fn);
	fn(read);
	return () => listeners.delete(fn);
}

/** Whether this vault is the one the note describes, is behind it, or is newer than it. */
export function comparePointer(
	p: VaultPointer | null,
	here: { head: string; files: number; lastChange: number }
): 'none' | 'same' | 'behind' | 'ahead' {
	if (!p) return 'none';
	if (p.head === here.head) return 'same';
	return here.lastChange > Date.parse(p.at) ? 'ahead' : 'behind';
}
