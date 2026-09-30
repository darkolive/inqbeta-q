/*
 * Archive keys — so that losing a drive costs one key, not everything.
 *
 * WHY THIS EXISTS. Darren's flash drive went missing from a drawer after a
 * break-in. He wanted to revoke it, and revocation.ts had to tell him the
 * truth: a revocation cannot reach a drive in somebody else's pocket. Whether
 * that theft matters depends entirely on ONE question —
 *
 *   what key opens what was on it, and does that key still exist?
 *
 * Today every locked file is sealed with the VAULT key, rebuilt from the
 * passkey. So a stolen drive holds ciphertext the owner's own passkey opens,
 * and there is nothing to destroy: the key is not stored anywhere, it is
 * DERIVED, so it can always be rebuilt. Worse, a did:dht identity key cannot
 * be rotated (mainline.ts). That combination is a permanent exposure and no
 * procedure fixes it.
 *
 * WHAT THIS CHANGES. An archive gets a key of its own. Files going to that
 * archive are locked with it. The key itself is kept — locked with the vault
 * key — as a single file IN THE VAULT, never on the archive. So:
 *
 *   - the drive alone is noise; the key is not on it;
 *   - the owner opens the archive because the vault holds the wrapped key;
 *   - DESTROYING the wrapped key makes the drive noise forever, immediately,
 *     without touching the drive — which is the whole point.
 *
 * THE TRAP, WRITTEN DOWN BECAUSE IT WILL LOOK LIKE A SIMPLIFICATION. The
 * archive key MUST be random. It must NOT be derived from the passkey seed
 * with a label, however tidy that is and however much it saves storing
 * anything. A derived key can always be re-derived, so it can never be
 * destroyed — and a key that cannot be destroyed gives back exactly the
 * problem this file exists to solve. `generateKey`, not `deriveKey`. If a
 * future change makes this derivable, the archive stops being closable and
 * nothing in the interface will look any different.
 *
 * ONE COPY, ON PURPOSE. The wrapped key is the thing whose destruction is the
 * remedy, so it must not be replicated to copy locations along with everything
 * else. belongsInVault() in folder.ts decides what spreads; this names the key
 * file so that decision can be made about it.
 */
import { lockBytes, unlockBytes } from './vault';

/** Marks the one file in a vault that holds an archive's key. */
export const ARCHIVE_KEY_TYPE = 'application/vnd.inqbeta.archive-key';

/** Where wrapped archive keys live inside the vault. Never on the archive. */
export const ARCHIVE_KEY_PATH = 'keys/archives';

export interface ArchiveKeyMeta {
	/** The archive's own DID — the label on the drive (places.ts). */
	archive: string;
	/** What the person calls it. 'flash drive 2026'. */
	called: string;
	made: string;
}

/**
 * A fresh key for one archive.
 *
 * Extractable, because it has to be wrapped to be kept. That is the only
 * reason, and the raw bytes never leave this module except sealed.
 */
export async function newArchiveKey(): Promise<CryptoKey> {
	return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/**
 * Wrap an archive key with the vault key, as an ordinary locked vault file.
 *
 * No new crypto: it is `lockBytes` over the raw key, so it is named by its own
 * hash and sits in the vault like anything else.
 */
export async function wrapArchiveKey(
	vaultKey: CryptoKey,
	archiveKey: CryptoKey,
	meta: ArchiveKeyMeta
): Promise<Uint8Array<ArrayBuffer>> {
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', archiveKey));
	const locked = await lockBytes(
		vaultKey,
		{ name: `${meta.archive}.key`, path: ARCHIVE_KEY_PATH, type: ARCHIVE_KEY_TYPE },
		raw
	);
	raw.fill(0);
	return locked;
}

/**
 * Open a wrapped archive key.
 *
 * Imported NOT extractable, so once it is in memory it cannot be exported
 * again — a page that has opened an archive cannot hand its key to anything.
 */
export async function openArchiveKey(
	vaultKey: CryptoKey,
	wrapped: Uint8Array
): Promise<{ key: CryptoKey; meta: ArchiveKeyMeta }> {
	const { meta, data } = await unlockBytes(vaultKey, wrapped);
	if (meta.type !== ARCHIVE_KEY_TYPE) throw new Error('That is not an archive key.');
	const key = await crypto.subtle.importKey('raw', data, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
	data.fill(0);
	return {
		key,
		meta: { archive: meta.name.replace(/\.key$/, ''), called: meta.name, made: meta.saved }
	};
}

/** True for the one file whose destruction ends an archive. */
export function isArchiveKeyFile(type: string): boolean {
	return type === ARCHIVE_KEY_TYPE;
}

/**
 * Whether this file may be copied to other places.
 *
 * False for an archive key. If the wrapped key is sitting on three copy
 * locations, destroying it is no longer one act, and "I shredded that archive"
 * becomes a thing a person believes rather than a thing that happened.
 */
export function maySpread(type: string): boolean {
	return !isArchiveKeyFile(type);
}

export interface ShredOutcome {
	/** How many wrapped copies Q knows of. The remedy works only at exactly one. */
	copies: number;
	ok: boolean;
	says: string;
	fix: string;
}

/**
 * Whether shredding this archive would actually end it.
 *
 * Asked BEFORE the person is told the drive is now safe, because being told
 * that wrongly is worse than not being told at all.
 */
export function canShred(copiesOfWrappedKey: number): ShredOutcome {
	if (copiesOfWrappedKey === 0) {
		return {
			copies: 0,
			ok: false,
			says: 'There is no key for this archive, so nothing on it can be opened by anyone — including you.',
			fix: ''
		};
	}
	if (copiesOfWrappedKey === 1) {
		return {
			copies: 1,
			ok: true,
			says: 'Destroying this key makes everything on that archive unreadable, wherever the drive is.',
			fix: ''
		};
	}
	return {
		copies: copiesOfWrappedKey,
		ok: false,
		says: `This key exists in ${copiesOfWrappedKey} places, so destroying one leaves the archive readable.`,
		fix: 'Remove the other copies first, then shred.'
	};
}
