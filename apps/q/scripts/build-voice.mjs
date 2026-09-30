/*
 * Q's voice — record the front door with ElevenLabs, in every language.
 *
 * The same pipeline as Dark Olive's spoken web (apps/darkolive/scripts/
 * build-audio.mjs), for Q: pre-rendered at build, never at request time; one
 * file per line; keyed by a hash of the script, voice and model, so an edit
 * pays for one line and a stale file can never be played for words the page
 * no longer says.
 *
 * What is recorded: every line in src/lib/voice/scripts/<lang>.ts — the
 * performance scripts, with their [expression] tags. What the page shows lives
 * in src/lib/i18n; the scripts say how it is SAID.
 *
 *   npm run voice                 plan only: what would be made, and the cost
 *   npm run voice -- --dry        write manifests with no audio, spend nothing
 *   npm run voice -- --yes        record for real
 *   npm run voice -- --only cy    one language
 *   npm run voice -- --force      re-record even where audio exists
 *   npm run voice -- --model eleven_v4 --voice <id>
 *   npm run voice -- --clipped         list lines whose recording stops mid-sound
 *   npm run voice -- --clipped --yes   re-record just those (new take, extra breath)
 *   npm run voice -- --redo en:place.key.hint,cy:signin.title --yes
 *                                      re-take named lines — no ffmpeg needed
 *   npm run voice -- --align --yes     time every word of recordings that have no
 *                                      timings yet, so the page can light each word
 *                                      as it is said (ElevenLabs forced alignment,
 *                                      billed like speech-to-text: by audio length)
 *
 * New recordings are timed as they are made. Timings are kept with the file
 * they belong to and never re-bought while the file is unchanged.
 *
 * Money leaves the account only with --yes.
 *
 * Output (served from the site, cached in the browser when read aloud is on):
 *   static/voice/<lang>/<hash>.mp3
 *   static/voice/<lang>/manifest.json   { model, voice, items: { key: { hash, file, words? } } }
 *     words: each spoken word's [start, end] in seconds, from the start of the file
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { voiceHash, stripTags } from '../src/lib/voice/voice-text.js';
import en from '../src/lib/voice/scripts/en.ts';
import cy from '../src/lib/voice/scripts/cy.ts';
import fr from '../src/lib/voice/scripts/fr.ts';
import de from '../src/lib/voice/scripts/de.ts';
import es from '../src/lib/voice/scripts/es.ts';

const SCRIPTS = { en, cy, fr, de, es };
const OUT = 'static/voice';
const API = 'https://api.elevenlabs.io';
const RATE_PER_1K = 0.1;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const arg = (n, d = null) => {
	const i = argv.indexOf(`--${n}`);
	return i === -1 ? d : argv[i + 1];
};

/*
 * eleven_v3: the model the [expression] tags were written for, and it speaks
 * Welsh. `--model eleven_v4` to try the newer one; v4 takes the same tags.
 */
const MODEL = arg('model', 'eleven_v3');
const FORMAT = arg('format', 'mp3_44100_64');
const DRY = has('dry');
const GO = has('yes');
const FORCE = has('force');
const ONLY = arg('only');
const CLIPPED = has('clipped');
/* --redo lang:key,lang:key — re-take exactly these, however they sound. */
const ALIGN = has('align');
const REDO = new Set((arg('redo') ?? '').split(',').map((x) => x.trim()).filter(Boolean));
const RETAKING = CLIPPED || REDO.size > 0;
/* A fixed seed gives the same take every time; a re-take needs a new one. */
const SEED = Number(arg('seed', RETAKING ? String(Date.now() % 4294967295) : '20260929'));

/*
 * CLIPPED TAKES. eleven_v3 sometimes stops a line while the voice is still
 * sounding — the last word cut, no breath after it — and is heard as a dip
 * at the join. Found by decoding the file and measuring loudness in 10 ms
 * steps from the end: a finished line has trailed off; a cut one is still
 * above -35 dB in its last 30 ms. A blip of noise after the voice has
 * finished (common, and harmless — the player trims it) is stepped over, not
 * counted as a cut. Needs ffmpeg to decode (brew install ffmpeg).
 *
 * (The first version measured with ffmpeg's -sseof seek, which lands
 * imprecisely in an MP3 and missed most cuts. Decoding the whole file does not.)
 */
function clipped(file) {
	const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-f', 'f32le', '-'], {
		maxBuffer: 64 * 1024 * 1024
	});
	if (r.error) {
		console.error(
			'  --clipped needs ffmpeg to listen for cut-off endings (brew install ffmpeg).\n' +
				'  Or name the lines instead: --redo en:place.key.hint,cy:signin.title'
		);
		process.exit(1);
	}
	const buf = r.stdout;
	const data = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
	const step = 441; /* 10 ms at 44.1 kHz */
	const dbAt = (w) => {
		const end = data.length - w * step;
		let sum = 0;
		for (let i = Math.max(0, end - step); i < end; i++) sum += data[i] * data[i];
		const rms = Math.sqrt(sum / step);
		return rms > 0 ? 20 * Math.log10(rms) : -99;
	};
	let w = 0; /* windows counted back from the end */
	while (dbAt(w) < -45 && w < 3) w++;
	/* a blip: loud for 30 ms or less, then 60 ms or more of quiet before it */
	let y = w;
	while (dbAt(y) >= -45 && y - w <= 3) y++;
	let q = y;
	while (dbAt(q) < -45 && q - y < 6) q++;
	if (y - w <= 3 && q - y >= 6) return false;
	return w === 0 && dbAt(0) > -35;
}

/* This app's .env first, then Dark Olive's — the same voice narrates both. */
function fromEnv(name) {
	if (process.env[name]) return process.env[name].trim();
	for (const f of ['.env', '.env.local', '../darkolive/.env', '../darkolive/.env.local']) {
		if (!existsSync(f)) continue;
		const m = readFileSync(f, 'utf8').match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'm'));
		if (m) return m[1].trim().replace(/^["']|["']$/g, '');
	}
	return null;
}

const key = fromEnv('ELEVENLABS_API_KEY');
const voiceId = arg('voice') ?? fromEnv('ELEVENLABS_VOICE_ID');
/* What the listener is told the voice is. Say exactly this, or nothing. */
const voiceName = fromEnv('ELEVENLABS_VOICE_NAME') ?? "Darren's voice";

if (!DRY && (!voiceId || (GO && !key))) {
	console.error(
		'\n  Need ELEVENLABS_VOICE_ID (and ELEVENLABS_API_KEY to record) in apps/q/.env —' +
			'\n  or --voice <id>. --dry needs neither.\n'
	);
	if (GO) process.exit(1);
}

const langs = Object.keys(SCRIPTS).filter((l) => !ONLY || l === ONLY);
if (!langs.length) {
	console.error(`--only ${ONLY}: no such language. Have: ${Object.keys(SCRIPTS).join(', ')}`);
	process.exit(1);
}

// ------------------------------------------------------------ plan

const plan = langs.map((lang) => {
	const dir = join(OUT, lang);
	/* The last manifest says which file each line is in — a re-take has its own
	 * name, so a browser holding the old take in its cache fetches the new one. */
	let prev = {};
	try {
		prev = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).items ?? {};
	} catch {
		prev = {};
	}
	const items = Object.entries(SCRIPTS[lang]).map(([k, script]) => {
		const hash = voiceHash(MODEL, voiceId ?? 'dry', script);
		const kept = prev[k]?.hash === hash ? prev[k].file.split('/').pop() : `${hash}.mp3`;
		const file = join(dir, kept);
		let have = existsSync(file) && !FORCE;
		/* --clipped: a recording that stops mid-sound counts as missing. */
		if (have && (REDO.has(`${lang}:${k}`) || (CLIPPED && clipped(file)))) have = false;
		const retake = RETAKING && !have && existsSync(file);
		/* A re-take is written under a new name: same hash, new take. */
		/* Timings belong to one file: kept while that file is, dropped with it. */
		const words = have && prev[k]?.file?.split('/').pop() === kept ? prev[k].words : undefined;
		return { key: k, script, hash, file: retake ? join(dir, `${hash}-${SEED.toString(36)}.mp3`) : file, old: file, have, retake, words };
	});
	return { lang, dir, items };
});

const missing = plan.flatMap((p) => p.items.filter((i) => !i.have));
const chars = missing.reduce((n, i) => n + i.script.length, 0);

console.log(`\n  ${MODEL}, voice ${voiceId ?? '(none)'} — "${voiceName}"`);
for (const p of plan) {
	const n = p.items.filter((i) => !i.have).length;
	console.log(`    ${p.lang}  ${p.items.length} lines, ${n ? `${n} to record` : 'all recorded'}`);
	if (RETAKING) for (const i of p.items.filter((x) => x.retake)) console.log(`         re-take: ${i.key}`);
}
console.log(`  ${missing.length} lines to record — ${chars.toLocaleString()} characters, about $${((chars / 1000) * RATE_PER_1K).toFixed(2)}`);
const untimed = plan.flatMap((p) => p.items.filter((i) => i.have && !i.words));
if (untimed.length) {
	/* About 14 characters a second when spoken — only to say roughly how much audio. */
	const secs = untimed.reduce((n, i) => n + stripTags(i.script).length / 14, 0);
	console.log(`  ${untimed.length} recordings have no word timings (about ${Math.ceil(secs / 60)} min of audio)${ALIGN ? '' : ' — add --align to time them'}`);
}

if (!DRY && !GO) {
	console.log('\n  Nothing was recorded and nothing was spent.');
	console.log('  --dry   manifests only, so the page can be tried for free (browser voice)');
	console.log('  --yes   record for real\n');
	process.exit(0);
}

// ------------------------------------------------------------ record

function explain(status, body) {
	try {
		const d = JSON.parse(body).detail;
		if (d?.code === 'paid_plan_required') return 'that voice needs a paid plan.';
		if (d?.code === 'quota_exceeded') return 'the allowance for this period is used up — re-run after it resets; only the gaps are filled.';
		if (d?.code === 'voice_not_found') return 'no voice with that id on this account.';
		if (status === 401) return `the API key was rejected (401${d?.status ? `: ${d.status}` : ''}${d?.message ? ` — ${d.message}` : ''}).`;
		return `${status} ${d?.message ?? JSON.stringify(d).slice(0, 300)}`;
	} catch {
		return `${status} ${body.slice(0, 300)}`;
	}
}

async function record(script, lang, retake) {
	const res = await fetch(`${API}/v1/text-to-speech/${voiceId}?output_format=${FORMAT}`, {
		method: 'POST',
		headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
		body: JSON.stringify({
			/* Every take gets a breath at the end, so the model has room to finish
			 * the last word (v3 otherwise often cuts it). Not part of the hash: the
			 * words are the same. */
			text: `${script} [short pause]`,
			model_id: MODEL,
			language_code: lang,
			seed: SEED,
			/* v3 takes stability as 0 (creative), 0.5 (natural) or 1 (robust).
			 * Natural: the tags are followed without the read wandering. */
			voice_settings: { stability: 0.5, similarity_boost: 0.75 }
		})
	});
	if (!res.ok) throw new Error(explain(res.status, await res.text()));
	return Buffer.from(await res.arrayBuffer());
}

/*
 * Word timings for a recording: ElevenLabs forced alignment, given the file
 * and the words it says (the tags taken out — they are directions, not words).
 * Returns each word's [start, end], rounded to the millisecond.
 */
async function align(file, script) {
	const form = new FormData();
	form.append('file', new Blob([readFileSync(file)], { type: 'audio/mpeg' }), file.split('/').pop());
	form.append('text', stripTags(script));
	const res = await fetch(`${API}/v1/forced-alignment`, { method: 'POST', headers: { 'xi-api-key': key }, body: form });
	if (!res.ok) throw new Error(explain(res.status, await res.text()));
	const d = await res.json();
	const r = (n) => Math.round(n * 1000) / 1000;
	return (d.words ?? []).filter((w) => w.text?.trim()).map((w) => [r(w.start), r(w.end)]);
}

let spent = 0;
let timed = 0;
let noAlign = false;
for (const p of plan) {
	mkdirSync(p.dir, { recursive: true });
	const items = {};
	for (const i of p.items) {
		if (!DRY && !i.have) {
			process.stdout.write(`  ${p.lang} ${i.key} … `);
			try {
				writeFileSync(i.file, await record(i.script, p.lang, i.retake));
				spent += i.script.length;
				i.have = true;
				i.words = undefined;
				i.fresh = true;
				console.log('ok');
			} catch (e) {
				console.log(`FAILED — ${e.message}`);
				/* A failed re-take keeps the old take rather than losing the line. */
				if (i.retake) Object.assign(i, { file: i.old, have: true });
			}
		}
		/* New recordings are always timed; older ones when --align asks. */
		if (!DRY && GO && !noAlign && i.have && !i.words && (ALIGN || i.fresh)) {
			process.stdout.write(`  ${p.lang} ${i.key} timing words … `);
			try {
				i.words = await align(i.file, i.script);
				timed++;
				console.log(`${i.words.length} words`);
			} catch (e) {
				console.log(`FAILED — ${e.message} (the page estimates instead)`);
				/* A refused key will refuse every line: say why once, and stop asking. */
				if (/401|rejected|permission/i.test(e.message)) {
					noAlign = true;
					console.log(
						'\n  Timing is switched off for this run. The key records speech but may not be allowed' +
							'\n  to time it: in ElevenLabs, Developers → API keys → edit this key → give it' +
							'\n  Speech to Text (forced alignment is part of it). Then: npm run voice -- --align --yes\n'
					);
				}
			}
		}
		/* Only lines with audio go in the manifest; the rest are read by the
		 * browser's own voice from the words on screen. */
		if (!DRY && i.have) items[i.key] = { hash: i.hash, file: `/voice/${p.lang}/${i.file.split('/').pop()}`, ...(i.words ? { words: i.words } : {}) };
	}
	writeFileSync(
		join(p.dir, 'manifest.json'),
		JSON.stringify({ model: MODEL, voice: DRY ? null : { id: voiceId, name: voiceName }, items }, null, '\t') + '\n'
	);

	/* Prune: audio no line refers to any more. */
	if (!DRY) {
		const keep = new Set(p.items.filter((i) => i.have).map((i) => i.file.split('/').pop()));
		for (const name of readdirSync(p.dir)) {
			if (name.endsWith('.mp3') && !keep.has(name)) {
				rmSync(join(p.dir, name), { force: true });
				console.log(`  pruned ${p.lang}/${name}`);
			}
		}
	}
}

console.log(
	DRY
		? `\n  Dry run: empty manifests written, nothing recorded, nothing spent.\n  With read aloud on, every line falls back to the browser's voice.\n  (${plan.reduce((n, p) => n + p.items.length, 0)} lines checked; e.g. "${stripTags(plan[0].items[0]?.script ?? '')}")\n`
		: `\n  Recorded ${spent.toLocaleString()} characters, about $${((spent / 1000) * RATE_PER_1K).toFixed(2)}.${timed ? ` Timed the words of ${timed} recordings.` : ''}\n`
);
