/*
 * Pictures a page can show — always ones in your own vault.
 *
 * An image block names a picture by its content address: the address of the
 * LOCKED file, which is also its name on disk (`<hex>.dsv` ↔
 * `content://sha256/<hex>`). So a page can never point at somewhere else, and
 * a picture is found by name without opening anything.
 *
 * Two ways to hand one to the renderer:
 *   preview  — a blob: URL, made once per picture and reused.
 *   public   — a data: URL, so the static file carries the picture inside it
 *              and depends on nothing. Same bytes, same data URL, so the page
 *              still compiles to the same bytes.
 */
import { readItem, saveLocked, type FolderItem } from '@inqbeta/q-core/folder';

export interface Picture {
	address: string;
	name: string;
	type: string;
	size: number;
	item: FolderItem;
}

const addressOf = (diskPath: string): string | null => {
	const m = /(?:^|\/)([0-9a-f]{64})\.dsv$/.exec(diskPath);
	return m ? `content://sha256/${m[1]}` : null;
};

/** Every locked picture in the vault, newest first (items already are). */
export function picturesIn(items: FolderItem[]): Picture[] {
	const out: Picture[] = [];
	for (const item of items) {
		if (!item.locked || !item.meta?.type?.startsWith('image/')) continue;
		const address = addressOf(item.diskPath);
		if (address) out.push({ address, name: item.meta.name, type: item.meta.type, size: item.meta.size ?? 0, item });
	}
	return out;
}

const blobs = new Map<string, string>();

/** Displayable URLs for the preview, made once each. */
export async function previewUrls(pictures: Picture[]): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	await Promise.all(
		pictures.map(async (p) => {
			let url = blobs.get(p.address);
			if (!url) {
				const { data, meta } = await readItem(p.item);
				url = URL.createObjectURL(new Blob([data], { type: meta.type || p.type }));
				blobs.set(p.address, url);
			}
			out[p.address] = url;
		})
	);
	return out;
}

/** data: URLs for exactly the pictures a public page uses. */
export async function inlineUrls(pictures: Picture[], wanted: Iterable<string>): Promise<Record<string, string>> {
	const want = new Set(wanted);
	const out: Record<string, string> = {};
	for (const p of pictures) {
		if (!want.has(p.address)) continue;
		const { data, meta } = await readItem(p.item);
		out[p.address] = `data:${meta.type || p.type};base64,${base64(data)}`;
	}
	return out;
}

function base64(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
}

/** Lock a picture into the vault and return its address. */
export async function addPicture(file: File): Promise<string> {
	if (!file.type.startsWith('image/')) throw new Error('That is not a picture.');
	const onDisk = await saveLocked('pictures', file.name, await file.arrayBuffer(), file.type);
	const address = addressOf(onDisk);
	if (!address) throw new Error('The picture was saved, but under a name that is not its contents.');
	return address;
}

/** Every picture address a page names, through groups. */
export function addressesIn(blocks: { settings: Record<string, unknown>; children?: unknown[] }[]): string[] {
	const out: string[] = [];
	const walk = (list: { settings: Record<string, unknown>; children?: unknown[] }[]) => {
		for (const b of list) {
			const at = b.settings['q:block/at'];
			if (typeof at === 'string' && at) out.push(at);
			if (b.children?.length) walk(b.children as typeof list);
		}
	};
	walk(blocks);
	return [...new Set(out)];
}

/* ---- Profile and card pictures (ADR-Q-015, 1 October 2026) ----
 * Make a picture small, on this device, before it is kept. A chosen photo can
 * be many megabytes; what goes into your profile is a JPEG cropped to the shape
 * it's shown in. Nothing leaves the browser. */
export async function smallPicture(file: File, w: number, h: number, quality = 0.82): Promise<string> {
	if (!file.type.startsWith('image/')) throw new Error('That isn’t a picture.');
	const bitmap = await createImageBitmap(file);
	const scale = Math.max(w / bitmap.width, h / bitmap.height);
	const sw = w / scale, sh = h / scale;
	const sx = (bitmap.width - sw) / 2, sy = (bitmap.height - sh) / 2;
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('This browser can’t make the picture smaller.');
	ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
	bitmap.close();
	return canvas.toDataURL('image/jpeg', quality);
}

export const PICTURE = { w: 320, h: 320 } as const;
export const COVER = { w: 1200, h: 400 } as const;

/** A smaller copy of a picture already kept as a data: URL, for a link (cards travel in links). */
export async function thumbnail(dataUrl: string, size = 96, quality = 0.7): Promise<string> {
	const img = new Image();
	img.src = dataUrl;
	await img.decode();
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) return '';
	const s = Math.min(img.width, img.height);
	ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
	return canvas.toDataURL('image/jpeg', quality);
}
