/*
 * Drops: something shared by link, kept for a while in a storage unit
 * (2 October 2026). Darren: why does the card need to be IN the link? It
 * doesn't. The card waits, locked, in the storage unit; the link is short —
 * an address and a key — so it fits any message or code, and the card keeps
 * its full pictures.
 *
 *   the card      sealed by you (signed), then locked with a fresh random key
 *   the key       lives only in the link's #fragment, which browsers never
 *                 send to any server — so the storage unit holds ciphertext
 *                 it can't open
 *   the drop      the locked box, signed by you, saying when it may go
 *                 (at most 30 days): the gate checks that and nothing else
 *
 * Pure: WebCrypto only, so it's tested in Node.
 */
import { b64url, unb64url } from './canonical';
import { sealWith, type SealedReceipt } from './seal';
import type { Identity } from './passkey';

export const DROP_SCHEMA = 'inqbeta.drop/1';
export const DROP_DAYS = 30;

export interface Box {
	iv: string;
	ct: string;
}

/** Lock anything JSON with a new key. Returns the box and the key, as text. */
export async function lockForLink(thing: unknown): Promise<{ box: Box; key: string }> {
	const raw = crypto.getRandomValues(new Uint8Array(32));
	const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(thing))));
	return { box: { iv: b64url(iv), ct: b64url(ct) }, key: b64url(raw) };
}

/** Open a box with the key from a link. Throws when the key is wrong or the box was changed. */
export async function unlockFromLink(box: Box, keyText: string): Promise<unknown> {
	const key = await crypto.subtle.importKey('raw', unb64url(keyText) as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['decrypt']);
	const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(box.iv) as Uint8Array<ArrayBuffer> }, key, unb64url(box.ct) as Uint8Array<ArrayBuffer>);
	return JSON.parse(new TextDecoder().decode(plain));
}

/** The drop the storage unit keeps: the box, signed by you, with when it may go. */
export function makeDrop(identity: Pick<Identity, 'did' | 'publicKey' | 'signing'>, box: Box, days = DROP_DAYS, now = new Date()): Promise<SealedReceipt> {
	const until = new Date(now.getTime() + Math.min(days, DROP_DAYS) * 86400000).toISOString();
	return sealWith(identity, { schema: DROP_SCHEMA, source: 'inqbeta:q/drop', box, until });
}
