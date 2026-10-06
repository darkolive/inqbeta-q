/*
 * The voice for a story's video (ADR-Q-033, export as video; 6 October 2026).
 *
 * Darren: "export … a video version of that story with the downloaded voice
 * from ElevenLabs speaking it … a really nice promo piece then that you could
 * put on social media."
 *
 * On the host's own computer only, with the host's ElevenLabs key
 * (Services → Voice), as the story engine's AI is:
 *
 *   GET                 the voices on the host's ElevenLabs account
 *   POST {lines, quote} what recording these lines would cost, in credits
 *   POST {lines, voice, agreed}
 *                       each line recorded, with when each word is said
 *                       (the with-timestamps call Q's own voice build uses)
 *
 * Nothing is kept here: the page keeps the recordings with the book.
 */
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

export const prerender = false;

const API_DEFAULT = 'https://api.elevenlabs.io';
/* VOICE_API points at a stand-in for testing, as STORY_GATEWAY does for the AI. */
const apiOf = () => (env.VOICE_API ?? '').trim() || API_DEFAULT;
/* The same model and format as Q's own front door (scripts/build-voice.mjs). */
const MODEL = 'eleven_v3';
const FORMAT = 'mp3_44100_128';
const LINE_MOST = 600;
const LINES_MOST = 20;

function door(request: Request, url: URL) {
	if (!dev) error(404, 'Recording runs on the host’s own computer for now.');
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Only Q itself may do this.');
}
const keyOf = () => (env.ELEVENLABS_API_KEY ?? '').trim();
/* Pence for a thousand characters (ElevenLabs bills by characters); one credit is a pound. */
const penceOf = () => (Number(env.VOICE_PENCE_PER_1K) > 0 ? Number(env.VOICE_PENCE_PER_1K) : 30);
const creditsFor = (chars: number) => Math.max(0.01, Math.ceil(((chars / 1000) * penceOf()) / 100 * 100) / 100);

export const GET: RequestHandler = async ({ request, url, fetch }) => {
	door(request, url);
	const key = keyOf();
	if (!key) return json({ ok: false, voices: [], says: 'No ElevenLabs key yet: set one in Services → Voice.' });
	const res = await fetch(`${apiOf()}/v1/voices`, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
	if (!res?.ok) return json({ ok: false, voices: [], says: `ElevenLabs didn’t answer (${res?.status ?? 'no connection'}).` });
	const d = (await res.json()) as { voices?: { voice_id?: string; name?: string; category?: string; labels?: Record<string, string> }[] };
	const voices = (d.voices ?? [])
		.filter((v) => typeof v.voice_id === 'string' && typeof v.name === 'string')
		.map((v) => ({ id: v.voice_id!, name: v.name!, own: v.category === 'cloned' || v.category === 'professional', about: [v.labels?.accent, v.labels?.gender, v.labels?.description].filter(Boolean).join(', ') }))
		.sort((a, b) => Number(b.own) - Number(a.own) || a.name.localeCompare(b.name));
	return json({ ok: true, voices, house: (env.ELEVENLABS_VOICE_ID ?? '').trim() || null });
};

/* When each word is said, from the characters' timings (as scripts/build-voice.mjs). */
function wordsFrom(a: { characters?: string[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] } | undefined): [number, number][] {
	const ch = a?.characters ?? [];
	const st = a?.character_start_times_seconds ?? [];
	const en = a?.character_end_times_seconds ?? [];
	const out: [number, number][] = [];
	let cur: [number, number] | null = null;
	let tag = false;
	for (let i = 0; i < ch.length; i++) {
		const c = ch[i];
		if (c === '[') tag = true;
		if (tag) {
			if (c === ']') tag = false;
			if (cur) (out.push(cur), (cur = null));
			continue;
		}
		if (/\s/.test(c)) {
			if (cur) (out.push(cur), (cur = null));
		} else if (cur) cur[1] = en[i];
		else cur = [st[i], en[i]];
	}
	if (cur) out.push(cur);
	return out.map(([s, e]) => [Math.round(s * 1000) / 1000, Math.round(e * 1000) / 1000]);
}

export const POST: RequestHandler = async ({ request, url, fetch }) => {
	door(request, url);
	const body = (await request.json().catch(() => null)) as { lines?: unknown; voice?: unknown; quote?: boolean; agreed?: number } | null;
	const lines = (Array.isArray(body?.lines) ? body.lines : []).filter((l): l is string => typeof l === 'string').map((l) => l.replace(/\s+/g, ' ').trim().slice(0, LINE_MOST)).slice(0, LINES_MOST);
	if (!lines.length) error(400, 'Nothing to record.');
	const upTo = creditsFor(lines.reduce((n, l) => n + l.length, 0));
	if (body?.quote) return json({ ok: true, upTo });
	const key = keyOf();
	if (!key) error(409, 'No ElevenLabs key yet: set one in Services → Voice.');
	const voice = typeof body?.voice === 'string' && /^[A-Za-z0-9]{8,40}$/.test(body.voice) ? body.voice : (env.ELEVENLABS_VOICE_ID ?? '').trim();
	if (!voice) error(409, 'Choose a voice first.');
	if (typeof body?.agreed !== 'number' || body.agreed + 1e-9 < upTo) error(409, `Recording costs up to ${upTo} credits, more than was agreed. Agree again.`);
	const out: { audio: string; words: [number, number][] }[] = [];
	for (const text of lines) {
		const res = await fetch(`${apiOf()}/v1/text-to-speech/${voice}/with-timestamps?output_format=${FORMAT}`, {
			method: 'POST',
			headers: { 'xi-api-key': key, 'content-type': 'application/json' },
			/* A breath at the end so the last word isn't cut (as Q's own voice build). */
			body: JSON.stringify({ text: `${text} [short pause]`, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
			signal: AbortSignal.timeout(120_000)
		}).catch((e) => error(502, `ElevenLabs couldn’t be reached: ${e instanceof Error ? e.message : e}`));
		if (!res.ok) error(502, `ElevenLabs said no (${res.status}). ${(await res.text().catch(() => '')).slice(0, 200)}`);
		const d = (await res.json()) as { audio_base64?: string; alignment?: Parameters<typeof wordsFrom>[0] };
		if (!d.audio_base64) error(502, 'ElevenLabs sent no audio.');
		out.push({ audio: d.audio_base64, words: wordsFrom(d.alignment) });
	}
	return json({ ok: true, upTo, used: upTo, recordings: out });
};
