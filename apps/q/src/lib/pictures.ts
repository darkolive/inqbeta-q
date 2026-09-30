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
