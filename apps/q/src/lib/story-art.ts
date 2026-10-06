/*
 * The polished build in the browser (ADR-Q-033, "Make it final"; 6 October 2026).
 *
 * KEPT BESIDE THE BOOK. A drawn slide can be tens of thousands of
 * characters, and a book's steps each hold the whole story, so the pictures
 * are kept once each, by their own SHA-256, in this browser's IndexedDB
 * ("q-story-art"); a slide holds only the address (slide-art.ts ArtRef).
 * Recordings for videos are kept there too, by what was said and who said it.
 *
 * PLAYED IN A SEALED FRAME. Each picture plays inside its own iframe with a
 * sandbox (no scripts) and a content policy that loads nothing, so even its
 * style sheet can't reach Q's page. Q (same origin, outside the frame) holds
 * every animation still and sets its clock: the slide's seconds.
 *
 * PICTURES OF A MOMENT. For a review, or a video frame, the picture at any
 * second is drawn onto a canvas: the live SVG is copied with each element's
 * style as it is at that moment written onto it, then drawn as an image.
 */
import { artHash } from '@inqbeta/q-core/slide-art';
import { ART_H, ART_W } from '@inqbeta/q-core/slide-art';

const DB = 'q-story-art';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
	dbp ??= new Promise((ok, no) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => {
			req.result.createObjectStore('art');
			req.result.createObjectStore('voice');
		};
		req.onsuccess = () => ok(req.result);
		req.onerror = () => no(req.error);
	});
	return dbp;
}
async function put(store: 'art' | 'voice', key: string, value: unknown) {
	const d = await db();
	await new Promise<void>((ok, no) => {
		const tx = d.transaction(store, 'readwrite');
		tx.objectStore(store).put(value, key);
		tx.oncomplete = () => ok();
		tx.onerror = () => no(tx.error);
	});
}
async function get<T>(store: 'art' | 'voice', key: string): Promise<T | undefined> {
	const d = await db();
	return new Promise((ok, no) => {
		const req = d.transaction(store).objectStore(store).get(key);
		req.onsuccess = () => ok(req.result as T | undefined);
		req.onerror = () => no(req.error);
	});
}

const memory = new Map<string, string>();
/** Keep a (cleaned) picture; its address. */
export async function keepArt(svg: string): Promise<string> {
	const hash = await artHash(svg);
	memory.set(hash, svg);
	try {
		await put('art', hash, svg);
	} catch {
		/* a private window: it lives for this visit only */
	}
	return hash;
}
/** A kept picture by its address, checked against it; null if this browser doesn't have it. */
export async function artOf(hash: string): Promise<string | null> {
	const svg = memory.get(hash) ?? (await get<string>('art', hash).catch(() => undefined));
	if (!svg || (await artHash(svg)) !== hash) return null;
	memory.set(hash, svg);
	return svg;
}

export interface Recording {
	/** The MP3, base64. */
	audio: string;
	/** When each word is said: [start, end] seconds. */
	words: [number, number][];
}
const voiceKey = async (voice: string, text: string) => artHash(`${voice}\n${text}`);
export async function keptRecording(voice: string, text: string): Promise<Recording | null> {
	return (await get<Recording>('voice', await voiceKey(voice, text)).catch(() => undefined)) ?? null;
}
export async function keepRecording(voice: string, text: string, r: Recording) {
	try {
		await put('voice', await voiceKey(voice, text), r);
	} catch {
		/* not kept: it'll be recorded again next time */
	}
}

/* ------------------------------------------------------------ the sealed frame */

/** Q's palette for the pictures, as the player sets it: light and dark. */
export function paletteCss(dark: boolean): string {
	const v = dark
		? { olive: '#8fae5a', 'olive-soft': '#2c3a1c', orange: '#e8862a', 'orange-soft': '#4a2d12', ink: '#e9ecef', mid: '#8a919c', paper: '#151a14', good: '#45b26b', blue: '#7e9ad0' }
		: { olive: '#556B2F', 'olive-soft': '#dfe7cf', orange: '#D16900', 'orange-soft': '#fbe3cc', ink: '#2b2f36', mid: '#9aa1ab', paper: '#ffffff', good: '#2e9e5b', blue: '#6280b6' };
	return `:root{${Object.entries(v)
		.map(([k, c]) => `--q-${k}:${c}`)
		.join(';')}}`;
}
export const isDark = () => typeof document !== 'undefined' && (document.documentElement.classList.contains('dark') || document.documentElement.dataset.mode === 'dark');

/** The page that holds one picture: nothing loads, nothing runs. */
export function frameDoc(svg: string, dark = isDark()): string {
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>${paletteCss(dark)}html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block;width:100%;height:100%}</style></head><body>${svg}</body></html>`;
}

export interface Stage {
	/** Set every animation to this second of the slide. */
	at(seconds: number): void;
	/** When every animation that ends has ended (a still is drawn here). */
	end: number;
	svg: SVGSVGElement;
}
/** Take hold of a picture's animations once its frame has loaded. */
export function stageIn(frame: HTMLIFrameElement): Stage | null {
	const doc = frame.contentDocument;
	const svg = doc?.querySelector('svg');
	if (!doc || !svg) return null;
	const anims = doc.getAnimations();
	let end = 0;
	for (const a of anims) {
		a.pause();
		const t = a.effect?.getComputedTiming();
		if (t && Number.isFinite(Number(t.endTime))) end = Math.max(end, Number(t.endTime) / 1000);
	}
	return {
		svg: svg as unknown as SVGSVGElement,
		end,
		at(seconds) {
			const ms = Math.max(0, (Number.isFinite(seconds) ? seconds : end) * 1000);
			for (const a of anims) a.currentTime = ms;
		}
	};
}

/** A hidden frame holding a picture, for taking pictures of its moments. Remove it when done. */
export async function hiddenStage(svg: string, dark = isDark()): Promise<{ stage: Stage; remove: () => void }> {
	const frame = document.createElement('iframe');
	frame.setAttribute('sandbox', 'allow-same-origin');
	frame.setAttribute('aria-hidden', 'true');
	frame.tabIndex = -1;
	frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${ART_W}px;height:${ART_H}px;border:0;visibility:hidden`;
	const loaded = new Promise<void>((ok) => frame.addEventListener('load', () => ok(), { once: true }));
	frame.srcdoc = frameDoc(svg, dark);
	document.body.append(frame);
	await loaded;
	const stage = stageIn(frame);
	if (!stage) {
		frame.remove();
		throw new Error('That picture couldn’t be shown.');
	}
	return { stage, remove: () => frame.remove() };
}

/* ------------------------------------------------------------ a moment as a picture */

/* What's copied from each element's style at the moment: everything a picture can animate. */
const COPY = ['fill', 'stroke', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'transform', 'transform-origin', 'transform-box', 'offset-path', 'offset-distance', 'offset-rotate', 'offset-anchor', 'stop-color', 'stop-opacity', 'visibility', 'd', 'r', 'cx', 'cy', 'rx', 'ry', 'mix-blend-mode'];

/** Any live SVG as it looks right now, as standalone SVG text (styles written on, no style sheet). */
export function svgNow(svg: SVGSVGElement, width = ART_W, height = ART_H): string {
	const copy = svg.cloneNode(true) as SVGSVGElement;
	const live = [svg, ...svg.querySelectorAll('*')];
	const dead = [copy, ...copy.querySelectorAll('*')];
	const view = svg.ownerDocument.defaultView ?? window;
	live.forEach((el, i) => {
		const d = dead[i] as SVGElement;
		if (!d || el.tagName.toLowerCase() === 'style') return;
		const cs = view.getComputedStyle(el);
		d.setAttribute('style', COPY.map((p) => `${p}:${cs.getPropertyValue(p)}`).filter((x) => !x.endsWith(':')).join(';'));
		d.removeAttribute('class');
	});
	copy.querySelectorAll('style').forEach((s) => s.remove());
	copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	copy.setAttribute('width', String(width));
	copy.setAttribute('height', String(height));
	return new XMLSerializer().serializeToString(copy);
}

/** Draw SVG text into a canvas context, filling the box. */
export async function drawSvg(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number) {
	const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
	try {
		const img = new Image();
		img.decoding = 'sync';
		await new Promise<void>((ok, no) => {
			img.onload = () => ok();
			img.onerror = () => no(new Error('A frame couldn’t be drawn.'));
			img.src = url;
		});
		ctx.drawImage(img, x, y, w, h);
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** Pictures of a drawn slide at moments through it (fractions of `seconds`), as small JPEGs for the AI to look at. */
export async function framesOf(svg: string, seconds: number, at: number[]): Promise<{ at: number; image: string }[]> {
	const { stage, remove } = await hiddenStage(svg, false);
	try {
		const canvas = Object.assign(document.createElement('canvas'), { width: ART_W, height: ART_H });
		const ctx = canvas.getContext('2d')!;
		const out: { at: number; image: string }[] = [];
		for (const f of at) {
			stage.at(f * seconds);
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, ART_W, ART_H);
			await drawSvg(ctx, svgNow(stage.svg), 0, 0, ART_W, ART_H);
			out.push({ at: f, image: canvas.toDataURL('image/jpeg', 0.82) });
		}
		return out;
	} finally {
		remove();
	}
}
