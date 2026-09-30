/*
 * The two settings a person can change from anywhere — light or dark, and
 * reading the page aloud — held once, so the switches in the header and on
 * the home page are always the same switch.
 */
import { apply, read, write, type Mode } from '$lib/theme';

let mode = $state<Mode>('light');

export const theme = {
	get dark() {
		return mode === 'dark';
	},
	/** On load: the remembered choice, else the device's (lib/theme). */
	start() {
		mode = read();
		apply(mode);
	},
	set(dark: boolean) {
		mode = dark ? 'dark' : 'light';
		write(mode);
		apply(mode);
	}
};

/*
 * Read aloud — in the recorded voice, with the browser's as the fallback.
 *
 * The same idea as Dark Olive's spoken web, for Q. Every line a page wants
 * read is marked `data-read="<i18n key>"`. Each key has a performance script
 * (lib/voice/scripts, with its [expression] tags) recorded by `npm run voice`
 * into static/voice/<lang>/. Switching this on:
 *
 *   1. reads the language's manifest,
 *   2. DOWNLOADS every recording the page needs into this browser's Cache
 *      Storage ("q-voice") — kept there, so the second time is instant and
 *      works offline; Leave No Trace clears it with everything else,
 *   3. plays the lines in page order, as ONE continuous track.
 *
 * WHY ONE TRACK (29 September). Played as separate <audio> files, each line
 * ended in a dip: the element stops, the next one spins up, and ElevenLabs'
 * files start and end on ragged silence (0 to 0.4 s, and some end mid-breath).
 * So every recording is decoded with the Web Audio API, trimmed to the voice,
 * given a few milliseconds' fade at each edge so nothing clicks, and scheduled
 * on one clock with the same short breath (GAP) between every line.
 *
 * WHY IT STARTS QUICKLY. The manifest comes from the kept copy first (fresh
 * one fetched behind it), every recording is fetched at once rather than one
 * after another, and the first line plays as soon as IT is ready.
 *
 * A line is played from its recording only if the recording was made from
 * the script as it is now, in the voice and model the manifest names — the
 * hash proves it. Otherwise (not recorded yet, or the words have changed) the
 * browser's own voice reads it. Never the wrong words.
 *
 * Nothing leaves this site: the recordings are Q's own static files.
 * Switching off stops at once; it switches itself off at the end.
 */
import { SCRIPTS } from '$lib/voice/scripts';
import { voiceHash, stripTags } from '$lib/voice/voice-text.js';
import { language } from '$lib/i18n/index.svelte';

const VOICE_CACHE = 'q-voice';

type Manifest = {
	model: string;
	voice: { id: string; name: string } | null;
	items: Record<string, { hash: string; file: string }>;
};
type Line = { text: string; file?: string };

/** The breath between one line and the next, in seconds. */
const GAP = 0.35;
/** Fades at each edge of a line, in seconds: long enough not to click, too short to hear. */
const FADE_IN = 0.008;
const FADE_OUT = 0.09;
/** Quieter than this counts as silence when trimming (about -45 dB). */
const QUIET = 0.0056;

let speaking = $state(false);
let fetching = $state(false);
/** Whose voice is reading, when it is a recording — the page says so. */
let recorded = $state<string | null>(null);
/*
 * How much of this page can be read aloud — said under the switches, so it is
 * apparent (Darren, 29 September: "sorry, this page has no audio … or only
 * partial audio … would also be a useful cue").
 *   full     every marked line has a recording
 *   partial  some lines have recordings; the rest are read by the browser's voice
 *   none     nothing on this page is marked to be read: nothing is read
 * Pages opt in by marking lines `data-read`; a page that has not yet is not
 * read in a robot voice from top to bottom — it says so instead.
 */
let coverage = $state<'full' | 'partial' | 'none' | null>(null);
let coverageTimer: ReturnType<typeof setTimeout> | undefined;

let run = 0;
let ctx: AudioContext | null = null;

async function voiceCache() {
	return typeof caches === 'undefined' ? null : caches.open(VOICE_CACHE);
}

/** The manifest: the kept copy at once if there is one (refreshed behind it), else fetched. */
async function manifestFor(lang: string): Promise<Manifest | null> {
	const url = `/voice/${lang}/manifest.json`;
	const cache = await voiceCache();
	const fresh = fetch(url, { cache: 'no-cache' })
		.then(async (res) => {
			if (!res.ok) return null;
			if (cache) await cache.put(url, res.clone());
			return (await res.json()) as Manifest;
		})
		.catch(() => null);
	const kept = await cache?.match(url);
	if (kept) return (await kept.json()) as Manifest;
	return fresh;
}

/** One recording's bytes, from Cache Storage, or downloaded and kept there. */
async function bytes(file: string): Promise<ArrayBuffer | null> {
	const cache = await voiceCache();
	let res = await cache?.match(file);
	if (!res) {
		try {
			const got = await fetch(file);
			if (!got.ok) return null;
			if (cache) await cache.put(file, got.clone());
			res = got;
		} catch {
			return null;
		}
	}
	return res.arrayBuffer();
}

/*
 * Where the voice starts and ends, in samples.
 *
 * Measured in 10 ms steps of loudness (RMS), not sample by sample: a single
 * stray sample must not decide where a line ends. And ElevenLabs' files often
 * finish with a BLIP — a few milliseconds of noise after the voice has
 * stopped. Trimming back to the last loud sample kept the silence before that
 * blip and the blip itself, which was heard as a tick after a gap. A short
 * burst (30 ms or less) after 60 ms or more of quiet is treated as not voice.
 */
function voiced(data: Float32Array, rate: number): [number, number] {
	const step = Math.round(rate * 0.01);
	const loud = (i: number) => {
		let sum = 0;
		const end = Math.min(data.length, i + step);
		for (let j = i; j < end; j++) sum += data[j] * data[j];
		return Math.sqrt(sum / Math.max(1, end - i)) >= QUIET;
	};
	const wins = Math.ceil(data.length / step);
	let a = 0;
	while (a < wins && !loud(a * step)) a++;
	let z = wins - 1;
	for (;;) {
		while (z > a && !loud(z * step)) z--;
		/* A blip at the very end? Step over it and the quiet before it. */
		let y = z;
		while (y > a && loud(y * step)) y--;
		let q = y;
		while (q > a && !loud(q * step)) q--;
		if (z - y <= 3 && y - q >= 6 && z >= wins - 4) z = q;
		else break;
	}
	/* A hair of room either side, so a soft first or last consonant survives. */
	const pad = Math.round(0.02 * rate);
	return [Math.max(0, a * step - pad), Math.min(data.length - 1, (z + 1) * step + pad)];
}

/** Decoded and trimmed to the voice: no ragged silence at either end. */
async function buffer(file: string, ac: AudioContext): Promise<AudioBuffer | null> {
	const raw = await bytes(file);
	if (!raw) return null;
	let b: AudioBuffer;
	try {
		b = await ac.decodeAudioData(raw);
	} catch {
		return null;
	}
	const [first, last] = voiced(b.getChannelData(0), b.sampleRate);
	const out = ac.createBuffer(b.numberOfChannels, last - first + 1, b.sampleRate);
	for (let c = 0; c < b.numberOfChannels; c++) out.copyToChannel(b.getChannelData(c).subarray(first, last + 1), c);
	return out;
}

/* Recordings a manifest no longer names are removed, so the cache holds only
 * what the current words need. */
async function prune(lang: string, m: Manifest) {
	const cache = await voiceCache();
	if (!cache) return;
	const want = new Set(Object.values(m.items).map((i) => i.file));
	for (const req of await cache.keys()) {
		const path = new URL(req.url).pathname;
		if (path.startsWith(`/voice/${lang}/`) && path.endsWith('.mp3') && !want.has(path)) await cache.delete(req);
	}
}

/** Put one line on the clock at `at`, faded in and out; returns when it ends. */
function schedule(ac: AudioContext, b: AudioBuffer, at: number): number {
	const src = ac.createBufferSource();
	const gain = ac.createGain();
	src.buffer = b;
	src.connect(gain).connect(ac.destination);
	const end = at + b.duration;
	gain.gain.setValueAtTime(0, at);
	gain.gain.linearRampToValueAtTime(1, at + FADE_IN);
	gain.gain.setValueAtTime(1, Math.max(at + FADE_IN, end - FADE_OUT));
	gain.gain.linearRampToValueAtTime(0, end);
	src.start(at);
	return end;
}

/** Wait until the audio clock reaches `t`, or the read is stopped. */
function until(ac: AudioContext, t: number, id: number) {
	return new Promise<void>((done) => {
		const tick = () => (id !== run || ac.currentTime >= t ? done() : setTimeout(tick, 30));
		tick();
	});
}

function say(text: string, id: number) {
	return new Promise<void>((done) => {
		if (id !== run || !('speechSynthesis' in window) || !text) return done();
		const u = new SpeechSynthesisUtterance(text);
		u.lang = document.documentElement.lang;
		u.onend = u.onerror = () => done();
		speechSynthesis.speak(u);
	});
}

function stop() {
	run++;
	/* Closing the context silences everything scheduled on it at once. */
	void ctx?.close().catch(() => {});
	ctx = null;
	if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
	speaking = false;
	fetching = false;
	recorded = null;
	clearTimeout(coverageTimer);
	coverage = null;
}

async function start() {
	stop();
	const id = run;
	speaking = true;
	fetching = true;
	/* Made inside the click that switched it on, so the browser lets it play. */
	const ac = new AudioContext();
	ctx = ac;
	void ac.resume();

	const lang = language.current;
	const scripts = SCRIPTS[lang] as Record<string, string | undefined>;
	const m = await manifestFor(lang);
	if (id !== run) return;

	/* The page's lines, in order, each with its recording if it has a true one. */
	const lines: Line[] = [...document.querySelectorAll<HTMLElement>('[data-read]')].map((el) => {
		const key = el.dataset.read ?? '';
		const script = scripts[key];
		const entry = m?.items[key];
		const good = !!(script && entry && m?.voice && entry.hash === voiceHash(m.model, m.voice.id, script));
		return { text: script ? stripTags(script) : el.innerText.trim(), file: good ? entry!.file : undefined };
	});
	if (!lines.length) {
		/* Nothing here to read. Say so, switch off, and let the words fade. */
		stop();
		coverage = 'none';
		coverageTimer = setTimeout(() => (coverage = null), 6000);
		return;
	}
	coverage = lines.every((l) => l.file) ? 'full' : 'partial';
	if (m) void prune(lang, m);

	/* Every recording fetched and decoded at once; each line waits only for its own. */
	const ready = lines.map((l) => (l.file ? buffer(l.file, ac) : Promise.resolve(null)));
	if (lines.some((l) => l.file)) recorded = m?.voice?.name ?? null;

	let t = ac.currentTime;
	for (let i = 0; i < lines.length; i++) {
		const b = await ready[i];
		if (id !== run) return;
		if (i === 0) fetching = false;
		if (b) {
			t = schedule(ac, b, Math.max(t, ac.currentTime + 0.02)) + GAP;
		} else {
			/* No recording: the browser's voice, in turn, once the one before has finished. */
			await until(ac, t, id);
			await say(lines[i].text, id);
			t = ac.currentTime + GAP;
		}
	}
	await until(ac, t, id);
	if (id === run) stop();
}
export const speech = {
	get on() {
		return speaking;
	},
	/** Downloading the recordings, before the first word. */
	get fetching() {
		return fetching;
	},
	/** The voice's name when a recording is playing; null for the browser's voice. */
	/** How much of this page has audio — see `coverage` above. */
	get coverage() {
		return coverage;
	},
	get recorded() {
		return recorded;
	},
	get available() {
		return typeof window !== 'undefined';
	},
	set(on: boolean) {
		if (on) void start();
		else stop();
	}
};
