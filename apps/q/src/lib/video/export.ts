/*
 * A story as a video (ADR-Q-033, export as video; 6 October 2026).
 *
 * Darren: "export … a video version of that story with the downloaded voice
 * from ElevenLabs speaking it … a really nice promo piece then that you could
 * put on social media and other places, very engaging."
 *
 * Made entirely in this browser, nothing uploaded:
 *   1. the voice: each slide's words recorded by ElevenLabs in the book's
 *      voice (api/voice, cost agreed first), kept beside the book so a second
 *      export pays nothing;
 *   2. the timeline: a title card, each slide as long as its recording plus a
 *      breath, an end card with the maker's name;
 *   3. every frame drawn at its exact moment (so it's smooth however slow the
 *      computer is): the slide's picture (polished art, its movement, or its
 *      piece), and its words lighting up as they're said;
 *   4. H.264 video and AAC sound (WebCodecs), put together as an MP4.
 *
 * Wide (16:9) for YouTube and sites; tall (9:16) for Reels, TikTok, Shorts;
 * square for feeds.
 */
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { ART_H, ART_W } from '@inqbeta/q-core/slide-art';
import type { Book, Slide, Story } from '@inqbeta/q-core/storybook';
import { artOf, drawSvg, hiddenStage, keepRecording, keptRecording, svgNow, type Recording } from '$lib/story-art';
import { livePicture } from './live.svelte';

export type Shape = 'wide' | 'tall' | 'square';
export const SHAPES: Record<Shape, { w: number; h: number; name: string; for: string }> = {
	wide: { w: 1920, h: 1080, name: 'Wide (16:9)', for: 'YouTube, websites, presentations' },
	tall: { w: 1080, h: 1920, name: 'Tall (9:16)', for: 'Reels, TikTok, Shorts, Stories' },
	square: { w: 1080, h: 1080, name: 'Square (1:1)', for: 'Instagram and LinkedIn feeds' }
};
const FPS = 30;
const CARD = 2.6;
const END = 3.2;
const BREATH = 0.7;
const LEAD = 0.35;
const LEAST = 3.5;
const RATE = 48_000;

const C = { paper: '#f6f7f1', panel: '#ffffff', ink: '#2b2f36', soft: '#6b7280', olive: '#556B2F', orange: '#D16900', unlit: '#9aa1ab' };

/** What each slide says aloud: the first also says the story's title. */
export function linesOf(story: Story): string[] {
	return story.slides.map((s, i) => [i === 0 ? story.title : '', s.title, s.subtext].filter((x) => x.trim()).map((x) => x.trim().replace(/[.!?…]*$/, (m) => m || '.')).join(' '));
}

/** Can this browser make the video? A plain reason if not. */
export async function canExport(shape: Shape): Promise<string | null> {
	if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return 'This browser can’t make videos yet. Use Chrome or Edge, or a recent Safari.';
	const { w, h } = SHAPES[shape];
	if (!(await videoConfig(w, h))) return 'This browser can’t make this size of video.';
	if (!(await soundCodec())) return 'This browser can’t make the sound for a video. Use Chrome or Edge, or a recent Safari.';
	return null;
}
/* AAC where the browser can (every social site takes it); Opus otherwise (YouTube and most sites do). */
async function soundCodec(): Promise<{ codec: string; mux: 'aac' | 'opus' } | null> {
	for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']] as const) {
		const s = await AudioEncoder.isConfigSupported({ codec, sampleRate: RATE, numberOfChannels: 2, bitrate: 128_000 }).catch(() => null);
		if (s?.supported) return { codec, mux };
	}
	return null;
}
/* H.264 where the browser can (every site takes it); VP9 otherwise (YouTube and most sites do). */
async function videoConfig(w: number, h: number): Promise<(VideoEncoderConfig & { mux: 'avc' | 'vp9' }) | null> {
	for (const [codec, mux] of [['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42e028', 'avc'], ['vp09.00.40.08', 'vp9']] as const) {
		const c: VideoEncoderConfig = { codec, width: w, height: h, bitrate: 8_000_000, framerate: FPS, ...(mux === 'avc' ? { avc: { format: 'avc' as const } } : {}) };
		const s = await VideoEncoder.isConfigSupported(c).catch(() => null);
		if (s?.supported) return { ...c, mux };
	}
	return null;
}

/** The voice: what's not yet recorded, and recording it (agreed cost). */
export async function missingLines(voice: string, lines: string[]): Promise<string[]> {
	const out: string[] = [];
	for (const l of lines) if (!(await keptRecording(voice, l))) out.push(l);
	return out;
}
export async function quoteVoice(lines: string[]): Promise<number> {
	const r = await fetch('/api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines, quote: true }) });
	const out = (await r.json().catch(() => null)) as { upTo?: number; message?: string } | null;
	if (!r.ok || typeof out?.upTo !== 'number') throw new Error(out?.message ?? 'Recording can’t be priced here. It needs the host’s own computer, with an ElevenLabs key.');
	return out.upTo;
}
export async function recordLines(voice: string, lines: string[], agreed: number): Promise<number> {
	const r = await fetch('/api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines, voice, agreed }) });
	const out = (await r.json().catch(() => null)) as { ok?: boolean; recordings?: Recording[]; used?: number; message?: string } | null;
	if (!r.ok || !out?.ok || out.recordings?.length !== lines.length) throw new Error(out?.message ?? 'The voice couldn’t be recorded just now. Nothing was spent.');
	for (const [i, rec] of out.recordings.entries()) await keepRecording(voice, lines[i], rec);
	return out.used ?? 0;
}

export interface Progress {
	/** 0 to 1. */
	done: number;
	says: string;
}

/* ------------------------------------------------------------ drawing a frame */

function words(text: string) {
	return text.split(/\s+/).filter(Boolean);
}
/** Lay out words in lines no wider than `w`; each word keeps its index. */
function wrap(ctx: CanvasRenderingContext2D, list: { w: string; i: number }[], w: number) {
	const lines: { w: string; i: number }[][] = [[]];
	let width = 0;
	const space = ctx.measureText(' ').width;
	for (const item of list) {
		const ww = ctx.measureText(item.w).width;
		if (lines.at(-1)!.length && width + space + ww > w) {
			lines.push([]);
			width = 0;
		}
		width += (lines.at(-1)!.length ? space : 0) + ww;
		lines.at(-1)!.push(item);
	}
	return lines;
}
function drawWords(ctx: CanvasRenderingContext2D, lines: { w: string; i: number }[][], cx: number, y: number, lh: number, lit: number) {
	/* Each word is placed by its left edge, so the line is centred by hand. */
	ctx.textAlign = 'left';
	const space = ctx.measureText(' ').width;
	lines.forEach((line, k) => {
		const total = line.reduce((n, it, j) => n + ctx.measureText(it.w).width + (j ? space : 0), 0);
		let x = cx - total / 2;
		for (const it of line) {
			ctx.fillStyle = it.i < lit ? C.ink : C.unlit;
			ctx.fillText(it.w, x, y + k * lh);
			x += ctx.measureText(it.w).width + space;
		}
	});
}

interface Seg {
	kind: 'card' | 'slide' | 'end';
	start: number;
	length: number;
	slide?: Slide;
	index?: number;
	rec?: Recording;
	audio?: AudioBuffer;
}

/**
 * Make the video. `voice` is the ElevenLabs voice id whose recordings are
 * kept for every line (record first); `name` goes on the end card.
 */
export async function makeVideo(book: Book, story: Story, opts: { shape: Shape; voice: string; name?: string; onprogress?: (p: Progress) => void; stop?: () => boolean }): Promise<Blob> {
	const { w: W, h: H } = SHAPES[opts.shape];
	const tall = opts.shape === 'tall';
	const say = (done: number, says: string) => opts.onprogress?.({ done, says });
	await document.fonts.load('300 48px Lexend').catch(() => {});
	await document.fonts.load('400 48px Lexend').catch(() => {});

	/* The voice, decoded. */
	say(0, 'Getting the voice ready');
	const lines = linesOf(story);
	const decoder = new AudioContext({ sampleRate: RATE });
	const segs: Seg[] = [{ kind: 'card', start: 0, length: CARD }];
	let t = CARD;
	for (const [i, slide] of story.slides.entries()) {
		const rec = await keptRecording(opts.voice, lines[i]);
		if (!rec) throw new Error('A line hasn’t been recorded yet. Record the voice first.');
		const bytes = Uint8Array.from(atob(rec.audio), (c) => c.charCodeAt(0));
		const audio = await decoder.decodeAudioData(bytes.buffer);
		const length = Math.max(LEAST, LEAD + audio.duration + BREATH);
		segs.push({ kind: 'slide', start: t, length, slide, index: i, rec, audio });
		t += length;
	}
	segs.push({ kind: 'end', start: t, length: END });
	const total = t + END;
	void decoder.close();

	/* The sound, laid out on one track. */
	say(0.02, 'Laying out the sound');
	const mix = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE);
	for (const s of segs)
		if (s.audio) {
			const src = mix.createBufferSource();
			src.buffer = s.audio;
			src.connect(mix.destination);
			src.start(s.start + LEAD);
		}
	const sound = await mix.startRendering();

	/* The file. */
	const vconf = await videoConfig(W, H);
	if (!vconf) throw new Error('This browser can’t make this size of video.');
	const snd = await soundCodec();
	if (!snd) throw new Error('This browser can’t make the sound for a video.');
	const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: vconf.mux, width: W, height: H, frameRate: FPS }, audio: { codec: snd.mux, sampleRate: RATE, numberOfChannels: 2 }, fastStart: 'in-memory' });
	let failed: Error | null = null;
	const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failed = e as Error) });
	const { mux: _mux, ...vc } = vconf;
	venc.configure(vc);
	const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failed = e as Error) });
	aenc.configure({ codec: snd.codec, sampleRate: RATE, numberOfChannels: 2, bitrate: 128_000 });

	say(0.04, 'Making the sound');
	const CH = 1024;
	const left = sound.getChannelData(0);
	const right = sound.getChannelData(1);
	for (let i = 0; i < sound.length; i += CH) {
		const n = Math.min(CH, sound.length - i);
		const data = new Float32Array(n * 2);
		data.set(left.subarray(i, i + n), 0);
		data.set(right.subarray(i, i + n), n);
		const ad = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / RATE) * 1e6), data });
		aenc.encode(ad);
		ad.close();
	}

	/* The pictures, frame by frame. */
	const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
	const ctx = canvas.getContext('2d', { alpha: false })!;
	/* Wide: the picture fills most of the frame, the words under it. Tall: the picture as wide as it can be, high in the middle; the words bigger, under it. */
	const pad = Math.round(W * (tall ? 0.035 : opts.shape === 'square' ? 0.05 : 0.1));
	const picW = W - pad * 2;
	const picH = Math.round((picW * ART_H) / ART_W);
	const picY = tall ? Math.round(H * 0.2) : opts.shape === 'square' ? Math.round(H * 0.08) : Math.round(H * 0.05);
	const capY = picY + picH + Math.round(H * (tall ? 0.04 : 0.045));
	const big = Math.round(W * (tall ? 0.066 : opts.shape === 'square' ? 0.05 : 0.03));
	const small = Math.round(W * (tall ? 0.046 : opts.shape === 'square' ? 0.034 : 0.021));

	let live: { at: (t: number) => void; svg: () => SVGSVGElement; remove: () => void } | null = null;
	let art: { stage: Awaited<ReturnType<typeof hiddenStage>>['stage']; remove: () => void } | null = null;
	let current = -1;
	const frames = Math.ceil(total * FPS);
	try {
		for (let n = 0; n < frames; n++) {
			if (failed) throw failed;
			if (opts.stop?.()) throw new Error('Stopped. Nothing was saved.');
			const now = n / FPS;
			const seg = segs.findLast((s) => now >= s.start) ?? segs[0];
			const into = now - seg.start;
			ctx.fillStyle = C.paper;
			ctx.fillRect(0, 0, W, H);
			ctx.textBaseline = 'alphabetic';
			ctx.textAlign = 'center';

			if (seg.kind === 'card' || seg.kind === 'end') {
				const fade = Math.min(1, into / 0.5, (seg.length - into) / 0.4 + 0.2);
				ctx.globalAlpha = Math.max(0, fade);
				ctx.fillStyle = C.olive;
				ctx.fillRect(W / 2 - W * 0.05, H * 0.36, W * 0.1, Math.max(4, H * 0.006));
				ctx.fillStyle = C.ink;
				ctx.font = `300 ${Math.round(big * 1.35)}px Lexend`;
				const top = book.title || story.title;
				wrap(ctx, words(top).map((x, i) => ({ w: x, i })), W - pad * 2).forEach((l, k) => ctx.fillText(l.map((x) => x.w).join(' '), W / 2, H * 0.46 + k * big * 1.6));
				ctx.font = `300 ${small}px Lexend`;
				ctx.fillStyle = C.soft;
				/* Under the title: the story's title on the opening card; the maker and Q, a line each, on the end card. */
				const under = seg.kind === 'card' ? [book.title ? story.title : book.subtext] : [opts.name?.trim() ? `By ${opts.name.trim()}` : '', 'Made with Q · inqbeta.com'].filter(Boolean);
				under.forEach((line, k) => ctx.fillText(line, W / 2, H * 0.62 + k * small * 1.6, W - pad * 2));
				ctx.globalAlpha = 1;
			} else {
				const slide = seg.slide!;
				if (seg.index !== current) {
					live?.remove();
					art?.remove();
					live = art = null;
					current = seg.index!;
					const svg = slide.art ? await artOf(slide.art.hash) : null;
					if (svg) art = await hiddenStage(svg, false);
					else live = livePicture(slide);
				}
				/* The picture: a white panel, the slide's drawing on it. */
				ctx.fillStyle = C.panel;
				ctx.beginPath();
				ctx.roundRect(pad, picY, picW, picH, Math.round(W * 0.012));
				ctx.fill();
				const speak = Math.max(0, into - LEAD);
				if (art) {
					art.stage.at(speak);
					await drawSvg(ctx, svgNow(art.stage.svg), pad, picY, picW, picH);
				} else if (live) {
					const moving = Math.min(4, (seg.length - LEAD) * 0.7);
					const p = Math.min(1, speak / moving);
					live.at(p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
					await drawSvg(ctx, svgNow(live.svg()), pad, picY, picW, picH);
				}
				/* The words, lighting as they're said. */
				const titleWords = words(slide.title);
				const subWords = words(slide.subtext);
				const spoken = seg.index === 0 ? words(story.title).length : 0;
				const timings = seg.rec?.words ?? [];
				const lit = timings.filter(([s]) => s <= speak).length - spoken;
				ctx.font = `400 ${big}px Lexend`;
				const tl = wrap(ctx, titleWords.map((x, i) => ({ w: x, i })), picW);
				drawWords(ctx, tl, W / 2, capY + big, big * 1.25, lit);
				ctx.font = `300 ${small}px Lexend`;
				const sl = wrap(ctx, subWords.map((x, i) => ({ w: x, i: i + titleWords.length })), picW * 0.92);
				drawWords(ctx, sl, W / 2, capY + big + tl.length * big * 1.25 + small * 0.6, small * 1.4, lit);
				/* Where we are: a dot a slide. */
				const dots = story.slides.length;
				for (let k = 0; k < dots; k++) {
					ctx.beginPath();
					ctx.fillStyle = k <= seg.index! ? C.olive : '#d5d9dd';
					ctx.arc(W / 2 + (k - (dots - 1) / 2) * W * 0.022, picY + picH - W * 0.018, Math.max(4, W * 0.004), 0, Math.PI * 2);
					ctx.fill();
				}
				/* The story's title, small, above it all on a tall video. */
				if (tall) {
					ctx.textAlign = 'center';
					ctx.font = `300 ${small}px Lexend`;
					ctx.fillStyle = C.soft;
					ctx.fillText(story.title, W / 2, picY - small * 1.2);
				}
			}

			const frame = new VideoFrame(canvas, { timestamp: Math.round(now * 1e6), duration: Math.round(1e6 / FPS) });
			venc.encode(frame, { keyFrame: n % (FPS * 2) === 0 });
			frame.close();
			while (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
			if (n % 10 === 0) say(0.05 + 0.9 * (n / frames), `Drawing frame ${n + 1} of ${frames}`);
		}
	} finally {
		live?.remove();
		art?.remove();
	}
	say(0.96, 'Putting it together');
	await venc.flush();
	await aenc.flush();
	if (failed) throw failed;
	muxer.finalize();
	say(1, 'Ready');
	/* Marked when it isn't H.264 + AAC, so the page can say which sites may not take it. */
	const plain = vconf.mux === 'avc' && snd.mux === 'aac';
	return new Blob([muxer.target.buffer], { type: plain ? 'video/mp4' : `video/mp4; codecs="${vconf.mux === 'avc' ? 'avc1' : 'vp09'}, ${snd.mux === 'aac' ? 'mp4a' : 'opus'}"` });
}
