/*
 * The story engine's AI (ADR-Q-033 Part 2; 4 October 2026). Localhost first,
 * as Services is: the deployed Q answers that AI isn't here yet, and the
 * Origin is checked, so nobody else can spend the host's key.
 *
 *   GET                         whether AI is on here, the model, and the rates
 *   (jobs: ask · outline · draft · redo · ripple; q-core story-ai.ts holds the prompt)
 *   POST { job, quote: true }   what the job costs at most, in credits (no call)
 *   POST { job, agreed }        run it, if it costs no more than agreed: the
 *                               suggested stories, the draft, the redone story
 *                               or the suggestions, made to the rule, and what
 *                               it really used
 *   POST { read: url }          a web page's words, for a reference (no AI, no
 *                               cost): what the person will see Q read
 *
 * The key is the host's AI_GATEWAY_API_KEY (Services → AI, Vercel AI Gateway),
 * read on the server and never sent to the page. The model is STORY_MODEL
 * (default below); STORY_GATEWAY points the call elsewhere (a test double).
 * The rates are STORY_PENCE_PER_M_IN / _OUT (pence for a million tokens),
 * turned into credits at the mint's own rate.
 *
 * Not charged yet: the receipt records what was agreed and used, and moving
 * the credits through the mint is the next step (plan, "What a story costs").
 */
import { DEFAULT_CURRENCY, currencyFrom, minorPerCredit } from '@inqbeta/q-core/currency';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { storyOf, emptyBook, unitOf, refOf, isStyleKey, tidy, REFS_MOST, REF_MOST, BRIEF_MOST, ANSWER_MOST, STYLE_OWN_MOST, type Book, type Ref } from '@inqbeta/q-core/storybook';
import { htmlToText } from '@inqbeta/q-core/doc-text';
import { artFromReply, artMessagesFor, artUpTo, ART_OUT, REVIEW_AT, type ArtTask } from '@inqbeta/q-core/art-ai';
import { animateFromReply, askFromReply, creditsFor, draftFromReply, outlineFromReply, jsonIn, messagesFor, mostOut, redoFromReply, rippleFromReply, upToFor, type Rates, type StoryTask } from '@inqbeta/q-core/story-ai';

export const prerender = false;

const GATEWAY = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const MODEL = 'anthropic/claude-sonnet-4.5';

function door(request: Request, url: URL) {
	if (!dev) error(404, 'The story engine’s AI runs on the host’s own computer for now.');
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Only Q itself may do this.');
}

const keyOf = () => (env.AI_GATEWAY_API_KEY ?? '').trim();
const modelOf = () => (env.STORY_MODEL ?? '').trim() || MODEL;
/*
 * The polished build's model ("Make it final"): set STORY_MODEL_FINAL to the
 * strongest model the gateway offers, and its prices in STORY_FINAL_PENCE_PER_M_IN
 * and _OUT. Unset, it is the story model at the story model's prices.
 */
const finalModelOf = () => (env.STORY_MODEL_FINAL ?? '').trim() || modelOf();
const num = (x: string | undefined, d: number) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : d);

async function ratesOf(fetcher: typeof fetch): Promise<Rates> {
	/* One credit is one unit of the mint's currency. The model's prices are set in pence, so they're only right for a pound-mint: other currencies need a rate (ADR-Q-042 §3a). */
	let currency = DEFAULT_CURRENCY;
	try {
		const m = (await (await fetcher('/api/mint')).json()) as { currency?: string };
		currency = currencyFrom(m?.currency);
	} catch {
		/* no mint here yet: a credit is a pound */
	}
	return { inPerM: num(env.STORY_PENCE_PER_M_IN, 240), outPerM: num(env.STORY_PENCE_PER_M_OUT, 1200), minorPerCredit: minorPerCredit(currency) };
}
async function finalRatesOf(fetcher: typeof fetch): Promise<Rates> {
	const r = await ratesOf(fetcher);
	if (!(env.STORY_MODEL_FINAL ?? '').trim()) return r;
	return { ...r, inPerM: num(env.STORY_FINAL_PENCE_PER_M_IN, 1200), outPerM: num(env.STORY_FINAL_PENCE_PER_M_OUT, 6000) };
}
/* An art job from the page: the book made to the rule, frames only as small pictures. */
function artJobIn(j: Record<string, unknown>): ArtTask | null {
	const book = bookIn(j.book);
	const story = typeof j.story === 'string' ? j.story : '';
	const slide = typeof j.slide === 'string' ? j.slide : '';
	if (j.task === 'final' && story) return { task: 'final', book, story };
	if (j.task === 'art' && story && slide) return { task: 'art', book, story, slide, ...(typeof j.before === 'string' ? { before: j.before.slice(0, 120_000) } : {}) };
	if (j.task === 'art-review' && story && slide && typeof j.svg === 'string') {
		const frames = (Array.isArray(j.frames) ? j.frames : [])
			.filter((f): f is { at: number; image: string } => typeof f?.at === 'number' && typeof f?.image === 'string' && f.image.length < 400_000)
			.slice(0, REVIEW_AT.length);
		const dropped = (Array.isArray(j.dropped) ? j.dropped : []).filter((d): d is string => typeof d === 'string').slice(0, 20).map((d) => d.slice(0, 80));
		return { task: 'art-review', book, story, slide, svg: j.svg.slice(0, 120_000), frames, dropped, round: typeof j.round === 'number' ? j.round : 1 };
	}
	return null;
}

/* The book from the page, made to the rule again: nothing else gets in. */
function bookIn(x: unknown): Book {
	const b = (x ?? {}) as Partial<Book>;
	const book = emptyBook(typeof b.id === 'string' ? b.id : 'book');
	book.title = typeof b.title === 'string' ? b.title : '';
	book.subtext = typeof b.subtext === 'string' ? b.subtext : '';
	book.stories = (Array.isArray(b.stories) ? b.stories : []).filter((s) => typeof s?.id === 'string').map((s) => storyOf(s));
	book.refs = (Array.isArray(b.refs) ? b.refs : [])
		.slice(0, REFS_MOST)
		.map((r, i) => refOf(r ?? {}, `ref-${i + 1}`))
		.filter((r): r is Ref => !!r);
	book.brief = (Array.isArray(b.brief) ? b.brief : [])
		.slice(0, BRIEF_MOST)
		.filter((a) => typeof a?.asks === 'string')
		.map((a) => ({ asks: tidy(a.asks, 300), answer: typeof a.answer === 'string' ? a.answer.slice(0, ANSWER_MOST) : '', ...(a.free ? { free: true } : {}) }));
	const st = b.style as { key?: unknown; own?: unknown } | null | undefined;
	book.style = st && (st.key === 'own' || isStyleKey(st.key)) ? { key: st.key as 'own', ...(typeof st.own === 'string' && st.own.trim() ? { own: tidy(st.own, STYLE_OWN_MOST) } : {}) } : null;
	/* A course unit's card (ADR-Q-033, courses): without it the AI would write an ordinary book. */
	book.course = b.course && typeof b.course === 'object' ? unitOf(b.course) : null;
	return book;
}
function jobIn(x: unknown): StoryTask {
	const j = (x ?? {}) as Record<string, unknown>;
	const book = bookIn(j.book);
	if (j.task === 'ask') return { task: 'ask', book };
	if (j.task === 'outline') return { task: 'outline', book, more: typeof j.more === 'string' ? j.more : undefined, current: Array.isArray(j.current) ? j.current.filter((x): x is string => typeof x === 'string').slice(0, 12) : undefined };
	if (j.task === 'draft') return { task: 'draft', book };
	if (j.task === 'redo' && typeof j.story === 'string') return { task: 'redo', book, story: j.story, answers: (j.answers ?? {}) as Record<string, string> };
	if (j.task === 'ripple' && typeof j.changed === 'string') return { task: 'ripple', book, changed: j.changed };
	if (j.task === 'animate' && typeof j.story === 'string') return { task: 'animate', book, story: j.story };
	error(400, 'That isn’t a job the story engine does.');
}

export const GET: RequestHandler = async ({ request, url, fetch }) => {
	if (!dev) return json({ ai: false, says: 'The AI runs on the host’s own computer for now. You can practise every step here.' });
	door(request, url);
	return json({ ai: !!keyOf(), model: modelOf(), finalModel: finalModelOf(), rates: await ratesOf(fetch), says: keyOf() ? '' : 'No AI key yet: set one in Services → AI. You can practise every step meanwhile.' });
};

export const POST: RequestHandler = async ({ request, url, fetch }) => {
	door(request, url);
	const body = (await request.json().catch(() => null)) as { job?: unknown; quote?: boolean; agreed?: number; read?: unknown } | null;
	if (typeof body?.read === 'string') return json(await readPage(body.read));
	const raw = (body?.job ?? {}) as Record<string, unknown>;
	if (raw.task === 'art' || raw.task === 'art-review' || raw.task === 'final') return artJob(raw, body ?? {}, fetch);
	const job = jobIn(body?.job);
	const rates = await ratesOf(fetch);
	const upTo = upToFor(job, rates);
	if (body?.quote) return json({ ok: true, upTo });

	const key = keyOf();
	if (!key) error(409, 'No AI key yet: set one in Services → AI.');
	if (typeof body?.agreed !== 'number' || body.agreed + 1e-9 < upTo) error(409, `This costs up to ${upTo} credits, more than was agreed. Agree again.`);

	const res = await fetch((env.STORY_GATEWAY ?? '').trim() || GATEWAY, {
		method: 'POST',
		headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
		body: JSON.stringify({ model: modelOf(), messages: messagesFor(job), max_tokens: mostOut(job), temperature: 0.4 }),
		signal: AbortSignal.timeout(120_000)
	}).catch((e) => error(502, `The AI couldn’t be reached: ${e instanceof Error ? e.message : e}`));
	if (!res.ok) error(502, `The AI said no (${res.status}). ${(await res.text().catch(() => '')).slice(0, 200)}`);
	const out = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
	const text = out.choices?.[0]?.message?.content ?? '';
	const used = Math.min(upTo, creditsFor(out.usage?.prompt_tokens ?? 0, out.usage?.completion_tokens ?? 0, rates));

	try {
		const reply = jsonIn(text);
		const result =
			job.task === 'ask' ? { next: askFromReply(job.book, reply) }
			: job.task === 'outline' ? { outline: outlineFromReply(reply) }
			: job.task === 'draft' ? { stories: draftFromReply(job.book, reply) }
			: job.task === 'redo' ? { story: redoFromReply(job.book, job.story, reply) }
			: job.task === 'animate' ? { story: animateFromReply(job.book, job.story, reply) }
			: { suggestions: rippleFromReply(job.book, job.changed, reply) };
		return json({ ok: true, upTo, used, model: modelOf(), ...result });
	} catch (e) {
		return json({ ok: false, upTo, used, says: e instanceof Error ? e.message : 'The AI’s answer couldn’t be read.' }, { status: 502 });
	}
};

/*
 * A web page's words, for a reference. Only http(s); at most 2 MB read; a
 * page that isn't HTML or text is refused plainly. What comes back is what
 * the AI will read, so the person sees it first.
 */
async function readPage(raw: string): Promise<{ ok: boolean; name?: string; text?: string; url?: string; says?: string }> {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return { ok: false, says: 'That doesn’t look like a web address. It starts with https://' };
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, says: 'Only web pages (https://…) can be read.' };
	try {
		const res = await fetch(url, { headers: { accept: 'text/html,text/plain;q=0.9', 'user-agent': 'Q story engine (inqbeta.com)' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
		if (!res.ok) return { ok: false, says: `That page said no (${res.status}). Copy its words and paste them in instead.` };
		const type = res.headers.get('content-type') ?? '';
		if (/pdf/i.test(type)) return { ok: false, says: 'That link is a PDF, which Q can’t read yet. Open it, copy the words, and paste them in.' };
		if (!/html|text\/plain|xml/i.test(type)) return { ok: false, says: 'That link isn’t a web page Q can read. Copy its words and paste them in.' };
		const reader = res.body?.getReader();
		const parts: Uint8Array[] = [];
		let size = 0;
		while (reader) {
			const { done, value } = await reader.read();
			if (done || !value) break;
			parts.push(value);
			size += value.length;
			if (size > 2_000_000) {
				await reader.cancel();
				break;
			}
		}
		const all = new Uint8Array(size);
		let at = 0;
		for (const p of parts) (all.set(p, at), (at += p.length));
		const body = new TextDecoder().decode(all);
		const page = /html|xml/i.test(type) ? htmlToText(body) : { title: '', text: body };
		if (!page.text.trim()) return { ok: false, says: 'Q couldn’t find any words on that page. Copy them and paste them in instead.' };
		return { ok: true, name: page.title || url.hostname, text: page.text.slice(0, REF_MOST), url: url.href };
	} catch (e) {
		return { ok: false, says: `That page couldn’t be reached (${e instanceof Error ? e.message : e}). Copy its words and paste them in instead.` };
	}
}


/*
 * The polished build (ADR-Q-033, "Make it final"): one slide drawn, or
 * reviewed from its frames, by the stronger model. "final" is only ever
 * quoted: the whole story's most, agreed once; each call then carries what's
 * left of that agreement.
 */
async function artJob(raw: Record<string, unknown>, body: { quote?: boolean; agreed?: number }, fetcher: typeof fetch) {
	const job = artJobIn(raw);
	if (!job) error(400, 'That isn’t a job the story engine does.');
	const rates = await finalRatesOf(fetcher);
	const upTo = artUpTo(job, rates);
	if (body.quote) return json({ ok: true, upTo, model: finalModelOf() });
	if (job.task === 'final') error(400, 'The whole story is agreed, then drawn slide by slide.');
	const key = keyOf();
	if (!key) error(409, 'No AI key yet: set one in Services → AI.');
	if (typeof body.agreed !== 'number' || body.agreed + 1e-9 < upTo) error(409, `This slide could cost up to ${upTo} credits, more than is left of what was agreed. Agree again.`);
	const res = await fetcher((env.STORY_GATEWAY ?? '').trim() || GATEWAY, {
		method: 'POST',
		headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
		body: JSON.stringify({ model: finalModelOf(), messages: artMessagesFor(job), max_tokens: ART_OUT, temperature: job.task === 'art' ? 0.7 : 0.4 }),
		signal: AbortSignal.timeout(300_000)
	}).catch((e) => error(502, `The AI couldn’t be reached: ${e instanceof Error ? e.message : e}`));
	if (!res.ok) error(502, `The AI said no (${res.status}). ${(await res.text().catch(() => '')).slice(0, 200)}`);
	const out = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
	const text = out.choices?.[0]?.message?.content ?? '';
	const used = Math.min(upTo, creditsFor(out.usage?.prompt_tokens ?? 0, out.usage?.completion_tokens ?? 0, rates));
	try {
		return json({ ok: true, upTo, used, model: finalModelOf(), art: artFromReply(text) });
	} catch (e) {
		return json({ ok: false, upTo, used, says: e instanceof Error ? e.message : 'The AI’s picture couldn’t be read.' }, { status: 502 });
	}
}
