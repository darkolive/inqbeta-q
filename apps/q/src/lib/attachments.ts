/*
 * Attachments in the browser (4 October 2026; the rules are q-core's
 * attachments.ts). Shrinking pictures, keeping files in the vault, joining
 * pieces as they arrive, and showing what a message carries.
 *
 * Files live in the vault under "files", named by the start of their SHA-256,
 * so the same picture sent twice is kept once, and a message only has to say
 * which file it means. Pieces wait under "pieces" until the last one is in.
 */
import { listItems, readItem, saveLocked, deleteItem, download, type FolderItem } from '@inqbeta/q-core/folder';
import { fromBase64, joinPieces, isPiece, PICTURE_SIDE, type Attachment, type Piece } from '@inqbeta/q-core/attachments';
import type { Person } from '$lib/people';

const FILES = 'files';
const PIECES = 'pieces';
const fileName = (sha: string, name: string) => `${sha.slice(0, 16)}-${name}`;

/** A picture made small enough to send quickly: the longest side PICTURE_SIDE, as JPEG. Small ones are left alone. */
export async function shrinkPicture(file: File): Promise<{ name: string; type: string; bytes: Uint8Array<ArrayBuffer>; w: number; h: number }> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, PICTURE_SIDE / Math.max(bitmap.width, bitmap.height));
	const w = Math.round(bitmap.width * scale);
	const h = Math.round(bitmap.height * scale);
	const raw = new Uint8Array(await file.arrayBuffer());
	/* Already small and not being resized: send it as it is (keeps a GIF moving, a PNG sharp). */
	if (scale === 1 && raw.length <= 400 * 1024) return { name: file.name, type: file.type || 'image/jpeg', bytes: raw, w, h };
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, w, h);
	ctx.drawImage(bitmap, 0, 0, w, h);
	bitmap.close();
	const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('The picture could not be made smaller.'))), 'image/jpeg', 0.84));
	return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

async function filesIn(path: string): Promise<FolderItem[]> {
	return (await listItems()).filter((i) => i.meta?.path === path);
}

/** Keep a file in your vault (once: the same bytes are never kept twice). */
export async function keepFile(sha: string, name: string, type: string, bytes: Uint8Array<ArrayBuffer>) {
	const want = fileName(sha, name);
	if ((await filesIn(FILES)).some((i) => i.meta?.name === want)) return;
	await saveLocked(FILES, want, bytes, type);
}

/** A file in your vault, by its fingerprint. */
async function findFile(sha: string): Promise<{ data: Uint8Array<ArrayBuffer>; type: string; name: string } | null> {
	const item = (await filesIn(FILES)).find((i) => i.meta?.name.startsWith(`${sha.slice(0, 16)}-`));
	if (!item) return null;
	const { meta, data } = await readItem(item);
	return { data, type: meta.type, name: meta.name.slice(17) };
}

/** A piece has arrived: keep it, and if it was the last one, join the file and keep that. */
export async function receivePiece(piece: unknown): Promise<'kept' | 'joined' | 'refused'> {
	if (!isPiece(piece)) return 'refused';
	await saveLocked(PIECES, `${piece.sha256}-${piece.index}.piece`, JSON.stringify(piece), 'application/x-q-piece');
	const mine = (await filesIn(PIECES)).filter((i) => i.meta?.name.startsWith(`${piece.sha256}-`));
	if (mine.length < piece.count) return 'kept';
	const pieces: Piece[] = [];
	for (const i of mine) {
		try {
			const p = JSON.parse(new TextDecoder().decode((await readItem(i)).data));
			if (isPiece(p)) pieces.push(p);
		} catch {
			/* a piece that won't read is just missing */
		}
	}
	const joined = await joinPieces(pieces);
	if (!joined.ok) return 'kept';
	await keepFile(joined.sha256, joined.name, joined.type, joined.bytes);
	for (const i of mine) await deleteItem(i).catch(() => {});
	return 'joined';
}

const urls = new Map<string, string>();
/** Something to show or save: a blob URL for a picture or file, from the message itself or your vault. Null while pieces are still on their way. */
export async function attachmentUrl(a: Attachment): Promise<string | null> {
	const key = a.sha256 ?? '';
	if (key && urls.has(key)) return urls.get(key)!;
	let bytes: Uint8Array<ArrayBuffer> | null = null;
	if (a.data) bytes = fromBase64(a.data);
	else if (a.sha256) bytes = (await findFile(a.sha256))?.data ?? null;
	if (!bytes) return null;
	const url = URL.createObjectURL(new Blob([bytes], { type: a.type || 'application/octet-stream' }));
	if (key) urls.set(key, url);
	return url;
}

/** Save a file someone sent you, as an ordinary download. */
export async function saveAttachment(a: Attachment): Promise<boolean> {
	const bytes = a.data ? fromBase64(a.data) : a.sha256 ? ((await findFile(a.sha256))?.data ?? null) : null;
	if (!bytes) return false;
	download(a.name ?? 'file', bytes, a.type || 'application/octet-stream');
	return true;
}

/** A card someone passed on: add them to your address book, the way linking up does. */
export async function addCardToAddressBook(a: Attachment): Promise<boolean> {
	if (a.kind !== 'card' || !a.did || !a.card) return false;
	const at = new Date().toISOString();
	const card = { schema: 'inqbeta.card-link/1', name: 'Personal', details: a.card, ...(a.inbox ? { inbox: a.inbox } : {}), at };
	const record = { schema: 'inqbeta.linked/1', source: 'inqbeta:q/link', with: a.did, card, signed: null, at, passedOn: true };
	await saveLocked('contacts', `linked-${a.did.slice(-16)}.json`, JSON.stringify(record, null, 2), 'application/json');
	return true;
}

/** A person's card as an attachment, to pass on. */
export const cardOf = (p: Pick<Person, 'did' | 'details' | 'inbox'>): Attachment => ({ kind: 'card', did: p.did, card: p.details, ...(p.inbox ? { inbox: p.inbox } : {}) });

/** "Ana", "Ana and Ben", "Ana, Ben and Cat". */
export function namesText(names: string[]): string {
	return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
