/*
 * What a message can carry (Darren, 4 October 2026): "send a message first,
 * then who it goes to … add a file, add a picture, a link … think about it
 * from a design point so it's really enjoyable as a send-a-message card."
 *
 * A message carries attachments beside its words:
 *
 *   picture   shrunk before it's sent (Q does this in the browser), so it
 *             travels quickly; shown in the conversation.
 *   file      anything, up to 20 MB. Small ones ride inside the message;
 *             bigger ones go in pieces, each its own sealed post, and are
 *             joined again when they arrive, checked against the file's
 *             SHA-256, then kept in the receiver's vault.
 *   link      an address and, if the sender gave one, a title. Q never
 *             fetches it to make a preview: that would tell the site who's
 *             looking.
 *   place     a pin (latitude and longitude) and/or words ("the café by the
 *             station"). Only ever what the sender chose to share.
 *   card      someone's card, passed on so people can link up through you.
 *
 * A voice note is the message's own `audio`, as for voice messages.
 *
 * Every byte counts towards the node's free daily allowance (the gate's
 * sendBytesPerDay): free to give, never free to take.
 *
 * Pure: WebCrypto only, tested in Node.
 */

export const MOST_FILE_BYTES = 20 * 1024 * 1024;
/** Bytes that ride inside the message itself; anything bigger goes in pieces. */
export const INLINE_BYTES = 600 * 1024;
/** One piece: well inside the gate's 2 MB post once base64'd, signed and sealed. */
export const PIECE_BYTES = 900 * 1024;
export const MOST_ATTACHMENTS = 12;
/** The longest side of a picture, once shrunk. */
export const PICTURE_SIDE = 1600;

export interface Attachment {
	kind: 'picture' | 'file' | 'link' | 'place' | 'card';
	/* picture, file */
	name?: string;
	type?: string;
	bytes?: number;
	/** SHA-256 of the raw bytes, hex: how the pieces are joined and checked. */
	sha256?: string;
	/** The bytes themselves, base64, when small enough to ride inside. */
	data?: string;
	/** How many pieces it travels in, when it's too big to ride inside. */
	pieces?: number;
	w?: number;
	h?: number;
	/* link */
	url?: string;
	title?: string;
	/* place */
	lat?: number;
	lng?: number;
	label?: string;
	/* card: the details as its owner chose to show them, and where to write to them. */
	card?: Record<string, string>;
	did?: string;
	inbox?: string;
}

/** One piece of a big file, carried by its own message. */
export interface Piece {
	sha256: string;
	name: string;
	type: string;
	bytes: number;
	index: number;
	count: number;
	data: string;
}

/* ---- base64 that copes with big arrays (spreading 20 MB into fromCharCode doesn't) ---- */
export function toBase64(b: Uint8Array): string {
	let s = '';
	for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
	return btoa(s);
}
export function fromBase64(s: string): Uint8Array<ArrayBuffer> {
	const bin = atob(s);
	const out = new Uint8Array(new ArrayBuffer(bin.length));
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export async function sha256Hex(b: Uint8Array<ArrayBuffer>): Promise<string> {
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Whether these bytes ride inside the message, or go in pieces. */
export const ridesInside = (bytes: number) => bytes <= INLINE_BYTES;

/** A picture or file as an attachment, and the pieces it travels in (none when it rides inside). */
export async function attach(
	kind: 'picture' | 'file',
	file: { name: string; type: string; bytes: Uint8Array<ArrayBuffer>; w?: number; h?: number },
	pieceBytes = PIECE_BYTES
): Promise<{ attachment: Attachment; pieces: Piece[] } | { says: string }> {
	if (!file.bytes.length) return { says: `${file.name} is empty.` };
	if (file.bytes.length > MOST_FILE_BYTES) return { says: `${file.name} is ${sizeText(file.bytes.length)}. A message can carry up to ${sizeText(MOST_FILE_BYTES)}.` };
	const sha = await sha256Hex(file.bytes);
	const base: Attachment = { kind, name: cleanName(file.name), type: file.type || 'application/octet-stream', bytes: file.bytes.length, sha256: sha, ...(file.w ? { w: file.w, h: file.h } : {}) };
	if (ridesInside(file.bytes.length)) return { attachment: { ...base, data: toBase64(file.bytes) }, pieces: [] };
	const count = Math.ceil(file.bytes.length / pieceBytes);
	const pieces: Piece[] = [];
	for (let i = 0; i < count; i++)
		pieces.push({ sha256: sha, name: base.name!, type: base.type!, bytes: file.bytes.length, index: i, count, data: toBase64(file.bytes.subarray(i * pieceBytes, (i + 1) * pieceBytes)) });
	return { attachment: { ...base, pieces: count }, pieces };
}

/** Join pieces back into the file, or say why not. Checked against the file's own SHA-256. */
export async function joinPieces(pieces: Piece[]): Promise<{ ok: true; bytes: Uint8Array<ArrayBuffer>; name: string; type: string; sha256: string } | { ok: false; says: string }> {
	if (!pieces.length) return { ok: false, says: 'No pieces.' };
	const { sha256, count, bytes, name, type } = pieces[0];
	const by = new Map<number, Piece>();
	for (const p of pieces) if (p.sha256 === sha256 && p.count === count) by.set(p.index, p);
	if (by.size < count) return { ok: false, says: `${by.size} of ${count} pieces so far.` };
	const out = new Uint8Array(new ArrayBuffer(bytes));
	let at = 0;
	for (let i = 0; i < count; i++) {
		const part = fromBase64(by.get(i)!.data);
		if (at + part.length > bytes) return { ok: false, says: 'The pieces add up to more than the file.' };
		out.set(part, at);
		at += part.length;
	}
	if (at !== bytes) return { ok: false, says: 'The pieces don’t add up to the file.' };
	if ((await sha256Hex(out)) !== sha256) return { ok: false, says: 'The pieces don’t match the file they came from.' };
	return { ok: true, bytes: out, name, type, sha256 };
}

export function isPiece(x: unknown): x is Piece {
	const p = x as Piece;
	return (
		!!p &&
		/^[0-9a-f]{64}$/.test(p.sha256) &&
		typeof p.name === 'string' &&
		typeof p.type === 'string' &&
		Number.isInteger(p.bytes) &&
		p.bytes > 0 &&
		p.bytes <= MOST_FILE_BYTES &&
		Number.isInteger(p.index) &&
		Number.isInteger(p.count) &&
		p.index >= 0 &&
		p.index < p.count &&
		p.count <= Math.ceil(MOST_FILE_BYTES / (64 * 1024)) &&
		typeof p.data === 'string'
	);
}

/** Why an attachment can't be sent as it is, or null. */
export function attachmentProblem(a: Attachment): string | null {
	switch (a.kind) {
		case 'picture':
		case 'file':
			if (!a.name || !a.sha256 || !a.bytes) return 'A file needs its name, size and fingerprint.';
			if (a.bytes > MOST_FILE_BYTES) return `Up to ${sizeText(MOST_FILE_BYTES)} a file.`;
			if (!a.data && !a.pieces) return 'A file rides inside or in pieces.';
			return null;
		case 'link':
			return linkProblem(a.url ?? '');
		case 'place': {
			const pin = typeof a.lat === 'number' && typeof a.lng === 'number';
			if (pin && (Math.abs(a.lat!) > 90 || Math.abs(a.lng!) > 180)) return 'That isn’t a place on Earth.';
			return pin || a.label?.trim() ? null : 'A place needs a pin or some words.';
		}
		case 'card':
			return a.did && a.card ? null : 'A card needs whose it is.';
		default:
			return 'Q doesn’t know that kind of attachment.';
	}
}

/** Only web addresses: never javascript:, data: or anything that runs. */
export function linkProblem(url: string): string | null {
	try {
		const u = new URL(url.trim());
		return u.protocol === 'https:' || u.protocol === 'http:' ? null : 'Only web addresses (https://…) can be sent as links.';
	} catch {
		return 'That doesn’t look like a web address.';
	}
}

/** "https://example.org/x" from "example.org/x": people rarely type the https. */
export function tidyLink(typed: string): string {
	const t = typed.trim();
	return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
}

/** What it all weighs: the bytes that travel, inside the message and in pieces. */
export const weightOf = (as: Attachment[], audioChars = 0) => as.reduce((n, a) => n + (a.bytes ?? 0), 0) + Math.round(audioChars * 0.75);

export function sizeText(n: number): string {
	return n < 1024 ? `${n} bytes` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/** A file name that can't climb out of a folder or hide what it is. */
export function cleanName(name: string): string {
	const n = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim();
	return (n || 'file').slice(0, 120);
}

/** A map link for a place: OpenStreetMap, with the pin or a search for the words. */
export function mapLink(a: Pick<Attachment, 'lat' | 'lng' | 'label'>): string {
	if (typeof a.lat === 'number' && typeof a.lng === 'number') return `https://www.openstreetmap.org/?mlat=${a.lat.toFixed(5)}&mlon=${a.lng.toFixed(5)}#map=17/${a.lat.toFixed(5)}/${a.lng.toFixed(5)}`;
	return `https://www.openstreetmap.org/search?query=${encodeURIComponent(a.label ?? '')}`;
}
