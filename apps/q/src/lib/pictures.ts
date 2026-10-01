/*
 * Make a picture small, on this device, before it is kept (cards, 1 October
 * 2026). A chosen photo can be many megabytes; what goes into your profile is
 * a JPEG cropped to the shape it's shown in. Nothing leaves the browser.
 */

/** Crop to fill w×h from the centre, then encode as a JPEG data: URL. */
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
