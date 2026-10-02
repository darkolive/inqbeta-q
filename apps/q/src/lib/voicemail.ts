/*
 * Voice messages (ADR-Q-022 Part A, 2 October 2026). When a call isn't
 * answered you can leave one: recorded here in the browser, sealed to them
 * like any message, waiting in storage until they collect it.
 *
 * Recorded as Opus where the browser can, AAC on Safari, at 48 kbps: a warm,
 * full voice (24 kbps sounded flat, Darren, 2 October). Two minutes is about
 * 720 KB, about 1.3 MB once signed and sealed, inside the storage's 2 MB limit
 * for a post. Storage only holds it until it's collected.
 *
 * Echo cancellation stays on; noise suppression and automatic volume are off,
 * because they're made for live calls and make a recorded voice sound muffled.
 */
import { MESSAGE_SCHEMA } from '@inqbeta/q-core/inbox';
import type { Signed } from './messages';

export const MOST_SECONDS = 120;
const BITRATE = 48_000;
/* A data: URL longer than this won't fit in a 2 MB post once sealed. */
const MOST_CHARS = 1_300_000;

export interface Recording {
	audio: string;
	seconds: number;
}

export function canRecord(): boolean {
	return typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;
}

function pickType(): string | undefined {
	for (const t of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']) if (MediaRecorder.isTypeSupported(t)) return t;
	return undefined;
}

const toDataUrl = (b: Blob) =>
	new Promise<string>((ok, fail) => {
		const r = new FileReader();
		r.onload = () => ok(String(r.result));
		r.onerror = () => fail(r.error);
		r.readAsDataURL(b);
	});

/**
 * Start recording. `onTick` gets the seconds so far; at MOST_SECONDS it stops
 * by itself and `onLimit` is called. `stop()` gives the recording.
 */
export async function startRecording(opts: { mic?: string; onTick: (s: number) => void; onLimit: () => void }) {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: { deviceId: opts.mic ? { exact: opts.mic } : undefined, echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
	});
	const mimeType = pickType();
	const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: BITRATE });
	const chunks: Blob[] = [];
	rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
	const began = Date.now();
	const seconds = () => Math.round((Date.now() - began) / 1000);
	const tick = setInterval(() => {
		opts.onTick(seconds());
		if (seconds() >= MOST_SECONDS) opts.onLimit();
	}, 250);
	const done = new Promise<void>((ok) => (rec.onstop = () => ok()));
	rec.start(1000);
	const finish = () => {
		clearInterval(tick);
		if (rec.state !== 'inactive') rec.stop();
		for (const t of stream.getTracks()) t.stop();
	};
	return {
		async stop(): Promise<Recording> {
			const s = Math.min(MOST_SECONDS, seconds());
			finish();
			await done;
			return { audio: await toDataUrl(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' })), seconds: s };
		},
		cancel: finish
	};
}

export function tooBig(r: Recording): boolean {
	return r.audio.length > MOST_CHARS;
}

/** "40 seconds", "1 min 20 s". */
export function lengthOf(s: number): string {
	return s < 60 ? `${s} second${s === 1 ? '' : 's'}` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
}

/** Voice messages in the vault, as signed receipts. */
export function voicemailsIn(receipts: { json?: unknown }[]): Signed[] {
	const seen = new Set<string>();
	const out: Signed[] = [];
	for (const r of receipts) {
		const s = r.json as Signed | undefined;
		if (s?.content?.schema !== MESSAGE_SCHEMA || s.content.kind !== 'voicemail' || !s.content.audio || seen.has(s.signature)) continue;
		seen.add(s.signature);
		out.push(s);
	}
	return out;
}

/** Save a copy, in the format it was recorded in. */
export function saveCopy(audio: string, name: string) {
	const a = document.createElement('a');
	a.href = audio;
	const ext = audio.startsWith('data:audio/mp4') ? 'm4a' : audio.startsWith('data:audio/ogg') ? 'ogg' : 'webm';
	a.download = `${name}.${ext}`;
	a.click();
}
