/*
 * The book as data (ADR-Q-033 Part 2, the story engine; 4 October 2026).
 *
 * A story book is records inside records, with the player's one rule at
 * every level, and nothing else:
 *
 *   the book    a title and a subtext
 *   a story     its title only
 *   a slide     a title and a subtext (and, for a made book, one picture
 *               piece drawn big above the words: "icon + words", Darren's
 *               choice for the first draft of the engine)
 *
 * HOW IT'S KEPT. Every step of making a book is a receipt: the question that
 * was asked, the answer given, and what the answer made. Steps are chained
 * per record: the book has its own chain (its idea, its order of stories,
 * ready), and each story has its own (its storyboard, each draft, each redo,
 * each accepted suggestion). So changing one story writes only to that
 * story's chain, and its history reads back on its own. As in chain.ts, a
 * step carries what it was asked: an answer without its question is 42.
 *
 * A step records the whole of what it touched (the story as it now stands,
 * or the book's own fields), not a diff: stories are small, and a step that
 * can be read alone is worth more here than the bytes.
 *
 * Hashed, not yet signed: the first draft keeps a book on this device. When
 * books move into the vault, each step is sealed as a receipt (seal.ts) with
 * this same content.
 *
 * Pure. No storage, no AI.
 */
import { canonical, sha256 } from './canonical';

/* ------------------------------------------------------------------ the rule */

/** Short, so each line can be said in one breath and read at a glance. */
export const TITLE_MOST = 70;
export const SUBTEXT_MOST = 220;
/** One idea per slide; a story that needs more is two stories. */
export const SLIDES_MOST = 8;
export const STORIES_MOST = 12;

/*
 * The picture pieces a slide can show: the story pieces every Q story is drawn
 * with (lib/components/story), then a few of Q's own icons. Each has the words
 * a person picks it by.
 */
export const PIECES = {
	person: 'A person',
	phone: 'A phone',
	laptop: 'A laptop',
	screen: 'A screen',
	cloud: 'A cloud',
	folder: 'A folder',
	key: 'A key',
	padlock: 'A padlock',
	envelope: 'A letter',
	card: 'A card',
	coin: 'A coin',
	tick: 'A tick',
	cross: 'A cross',
	heart: 'A heart',
	map: 'A map',
	sun: 'The sun',
	message: 'A message',
	search: 'Looking for something',
	home: 'Home',
	bell: 'A bell',
	image: 'A picture'
} as const;
export type Piece = keyof typeof PIECES;
export const isPiece = (x: unknown): x is Piece => typeof x === 'string' && Object.hasOwn(PIECES, x);

export interface Slide {
	id: string;
	title: string;
	subtext: string;
	/** For Q's own icon style: the one piece drawn big above the words. */
	piece: Piece | null;
	/**
	 * What the picture shows, in the book's style: written by the AI as art
	 * direction (subject, setting, light, what moves), never the slide's
	 * words again. The picture made from it later (Darren, 5 October 2026:
	 * "photo style or gothic style or ink animation style").
	 */
	scene?: string;
	/** Written by the AI (or the practice drafter) and not yet kept by the person. */
	draft: boolean;
}
export interface Story {
	id: string;
	/** A story is its title only. */
	title: string;
	slides: Slide[];
}
export interface Book {
	id: string;
	title: string;
	subtext: string;
	/** Public (anyone, social media too) or members only. */
	open: boolean;
	/** The person said it flows, makes sense, is clear and covers everything. */
	ready: boolean;
	/** The stories, in order. */
	stories: Story[];
	/**
	 * What the AI reads to understand the idea (Darren, 5 October 2026: "a
	 * website, documents, some descriptive text, whatever it is that AI is
	 * going to read to draw from"). The brief, not the book: never shown in
	 * the player.
	 */
	refs: Ref[];
	/**
	 * Q's questions and the person's answers (Darren, 5 October 2026: "the
	 * questions aren't rigid questions. They are just helping perfect the
	 * prompt"). Asked by the AI, one at a time, each from what came before.
	 */
	brief: BriefAnswer[];
	/** How the storyboard looks: a preset, or the person's own words. Null until chosen. */
	style: Style | null;
}

/* ------------------------------------------------------------------ the brief */

export interface BriefAnswer {
	/** The question, as Q asked it. */
	asks: string;
	/** Why Q asked it, in one line (shown small, so the person knows what it's for). */
	why?: string;
	/** What they said. Empty with `free` when they said "you decide". */
	answer: string;
	/** "You decide": the AI has free rein here. */
	free?: boolean;
}
/** The most questions Q asks before it goes on (the person can stop sooner). */
export const BRIEF_MOST = 6;
export const ANSWER_MOST = 1200;

/* ------------------------------------------------------------------ the look */

/*
 * The storyboard's look, chosen once for the book (Darren, 5 October 2026:
 * "this is where we work out the style theme of the storyboard … maybe we
 * offer preset styles to make it easier rather than let it get too
 * expressive"). Each preset is a few words for the person and a fuller line
 * of art direction for the AI. `icons` is drawn by Q itself today; the others
 * are described scene by scene, ready for pictures to be made.
 */
export const STYLES = {
	icons: { name: 'Q’s own icons', says: 'Simple, flat, friendly', direction: 'Q’s own flat icon style: one simple object or person on a soft circle, olive green and warm orange, no detail, no text.' },
	photo: { name: 'Real photographs', says: 'Real people and places', direction: 'Documentary photography: real people and places, natural light, honest and unposed, shallow depth of field, no text in the picture.' },
	ink: { name: 'Ink animation', says: 'Hand-drawn, loose, moving', direction: 'Hand-drawn ink animation: loose black brush lines on warm paper, a single spot colour, lines that draw themselves on, gentle movement.' },
	watercolour: { name: 'Watercolour', says: 'Soft, painted, calm', direction: 'Soft watercolour illustration: pale washes, bleeding edges, lots of white paper, calm and gentle.' },
	gothic: { name: 'Gothic', says: 'Dark, dramatic, candlelit', direction: 'Gothic: dark and dramatic, deep shadows, candlelight and moonlight, old stone and iron, rich blacks and deep reds.' },
	paper: { name: 'Cut paper', says: 'Layered, crafted, bright', direction: 'Cut-paper collage: layered coloured paper with soft shadows between layers, simple bold shapes, handmade.' },
	line: { name: 'Clean diagrams', says: 'Clear lines, how it works', direction: 'Clean explanatory line diagrams: thin even lines, a few labelled-free shapes and arrows, one accent colour, lots of space.' },
	comic: { name: 'Comic panels', says: 'Bold, expressive, fun', direction: 'Comic-book panels: bold ink outlines, flat bright colour, expressive faces and movement, no speech bubbles.' }
} as const;
export type StyleKey = keyof typeof STYLES;
export const isStyleKey = (x: unknown): x is StyleKey => typeof x === 'string' && Object.hasOwn(STYLES, x);
export interface Style {
	/** A preset, or 'own' for the person's own description. */
	key: StyleKey | 'own';
	/** Their own words, for 'own' (or to add to a preset: "but in black and white"). */
	own?: string;
}
export const STYLE_OWN_MOST = 400;
/** The art direction the AI gets for this style. */
export function directionOf(style: Style | null): string {
	if (!style) return STYLES.icons.direction;
	const own = tidy(style.own, STYLE_OWN_MOST);
	if (style.key === 'own') return own || STYLES.icons.direction;
	return own ? `${STYLES[style.key].direction} And: ${own}` : STYLES[style.key].direction;
}
/** Whether Q draws this style itself (its own icons), or describes each scene for pictures to come. */
export const drawsItself = (style: Style | null) => !style || style.key === 'icons';

/* ------------------------------------------------------------- the references */

export type RefKind =
	/** A web page, read by the host's server. */
	| 'link'
	/** Words typed or pasted in. */
	| 'text'
	/** Words said into the microphone. */
	| 'voice'
	/** A document (text, Markdown, a web page saved, a Word file). */
	| 'file';
export interface Ref {
	id: string;
	kind: RefKind;
	/** What the person calls it: the page's title, the file's name, "What I said". */
	name: string;
	/** The words the AI reads. */
	text: string;
	/** For a link, where it came from. */
	url?: string;
}
/** The most of one reference the AI reads, and of all of them together (characters; about four to a token). */
export const REF_MOST = 12_000;
export const REFS_MOST_TOTAL = 40_000;
export const REFS_MOST = 12;

/** A reference made safe to keep: a known kind, a name, its words trimmed to REF_MOST. Null when there are no words. */
export function refOf(x: Partial<Ref>, id: string): Ref | null {
	const kind: RefKind = x.kind === 'link' || x.kind === 'voice' || x.kind === 'file' ? x.kind : 'text';
	const text = (typeof x.text === 'string' ? x.text : '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, REF_MOST);
	if (!text) return null;
	const name = tidy(x.name, 120) || (kind === 'voice' ? 'What I said' : kind === 'link' ? 'A web page' : kind === 'file' ? 'A document' : 'Some notes');
	const url = kind === 'link' && typeof x.url === 'string' && /^https?:\/\//.test(x.url) ? x.url : undefined;
	return { id: typeof x.id === 'string' && x.id ? x.id : id, kind, name, text, ...(url ? { url } : {}) };
}
/** The references as the AI gets them: in order, until the total runs out. */
export function refsForAi(refs: Ref[]): Ref[] {
	let left = REFS_MOST_TOTAL;
	const out: Ref[] = [];
	for (const r of refs) {
		if (left <= 0) break;
		const text = r.text.slice(0, left);
		left -= text.length;
		out.push({ ...r, text });
	}
	return out;
}
/** About how many words, to show the person what Q read. */
export const wordsIn = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** One line, trimmed, inner runs of space made single, cut to `most`. */
export function tidy(text: unknown, most: number): string {
	const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
	if (s.length <= most) return s;
	const cut = s.slice(0, most);
	const space = cut.lastIndexOf(' ');
	return (space > most * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, '') + '…';
}

export const SCENE_MOST = 400;

/** A slide made to the rule: title and subtext, a known piece or none, and its scene if it has one. */
export function slideOf(x: Partial<Slide> & { id?: string }, id: string): Slide {
	const scene = tidy(x.scene, SCENE_MOST);
	return {
		id: typeof x.id === 'string' && x.id ? x.id : id,
		title: tidy(x.title, TITLE_MOST),
		subtext: tidy(x.subtext, SUBTEXT_MOST),
		piece: isPiece(x.piece) ? x.piece : null,
		...(scene ? { scene } : {}),
		draft: !!x.draft
	};
}

/** A story made to the rule: a title, and at most SLIDES_MOST slides. Anything else is dropped. */
export function storyOf(x: { id: string; title?: unknown; slides?: unknown }): Story {
	const slides = Array.isArray(x.slides) ? x.slides : [];
	return {
		id: x.id,
		title: tidy(x.title, TITLE_MOST),
		slides: slides.slice(0, SLIDES_MOST).map((s, i) => slideOf((s ?? {}) as Partial<Slide>, `${x.id}.${i + 1}`))
	};
}

export const emptyBook = (id: string): Book => ({ id, title: '', subtext: '', open: false, ready: false, stories: [], refs: [], brief: [], style: null });

/** A slide still waiting for words. */
export const isEmptySlide = (s: Slide) => !s.title && !s.subtext;

/** What the person needs to know before the book can play, in plain words. Empty when it holds. */
export function problemsOf(book: Book): string[] {
	const out: string[] = [];
	if (!book.title) out.push('The book needs a title.');
	if (!book.stories.length) out.push('The book needs at least one story.');
	for (const [i, s] of book.stories.entries()) {
		const name = s.title ? `“${s.title}”` : `Story ${i + 1}`;
		if (!s.title) out.push(`Story ${i + 1} needs a title.`);
		if (!s.slides.length) out.push(`${name} has no slides yet.`);
		const empty = s.slides.filter(isEmptySlide).length;
		if (empty) out.push(`${name} has ${empty === 1 ? 'a slide' : `${empty} slides`} with no words yet.`);
		const drafts = s.slides.filter((x) => x.draft && !isEmptySlide(x)).length;
		if (drafts) out.push(`${name} has ${drafts === 1 ? 'a draft slide' : `${drafts} draft slides`} not kept yet.`);
	}
	return out;
}

/** The stories that still need slides or words: what a first draft would write. */
export function needingWork(book: Book): Story[] {
	return book.stories.filter((s) => s.slides.length < 3 || s.slides.some(isEmptySlide));
}

/* ----------------------------------------------------------------- the steps */

export type StepKind =
	/** The main idea: the book's title and subtext. */
	| 'idea'
	/** What the AI reads: links, documents, words typed or said. */
	| 'refs'
	/** One of Q's questions answered (or left to Q). */
	| 'brief'
	/** The storyboard's look. */
	| 'style'
	/** Stories suggested by the AI (or practice), before the person uses them. */
	| 'outline'
	/** A draft slide put back as it was, or taken out. */
	| 'reject'
	/** The stories, in order (titles only). */
	| 'stories'
	/** A story's slides, written or edited by the person. */
	| 'storyboard'
	/** A first draft written by the AI (or practice). */
	| 'generate'
	/** One story redone, after the four questions. */
	| 'redo'
	/** A ripple suggestion accepted (left ones are recorded too, as nothing changed). */
	| 'ripple'
	/** Draft slides kept as the person's own. */
	| 'keep'
	/** Public or members only. */
	| 'open'
	/** It flows: ready to play. */
	| 'ready';

export interface Cost {
	/** Agreed before the call. */
	upTo: number;
	/** Settled at what was used. */
	used: number;
	/** Who paid: the host's key, or practice (no AI, no cost). */
	by: 'host' | 'practice';
}

export interface BookStep {
	/** This step's content address. */
	id: string;
	/** The step before it in the same chain; null for a chain's first step. */
	parent: string | null;
	/** Position in its chain, from 0. */
	seq: number;
	/** The book this belongs to. */
	book: string;
	/** Which chain: 'book', or a story's id. */
	chain: string;
	kind: StepKind;
	/** The question this step answers, in the words the person saw. */
	asks: string;
	/** What they answered (words, choices), as given. */
	answer: unknown;
	/** On the book's chain: the book's own fields after this step. */
	head?: { title: string; subtext: string; open: boolean; ready: boolean; order: string[]; refs?: Ref[]; brief?: BriefAnswer[]; style?: Style | null };
	/** On a story's chain: the story after this step; null when it was taken out. */
	story?: Story | null;
	cost?: Cost;
	at: string;
}

const BOOK_CHAIN = 'book';
const lastIn = (steps: BookStep[], chain: string) => steps.findLast((s) => s.chain === chain) ?? null;

async function addressOf(step: Omit<BookStep, 'id'>): Promise<string> {
	return sha256(canonical({ schema: 'inqbeta.storybook-step/1', ...step }));
}

/** Add a step to the end of its chain. Returns the new list (the old one is untouched). */
export async function addStep(steps: BookStep[], s: Omit<BookStep, 'id' | 'parent' | 'seq' | 'at'> & { at?: string }): Promise<BookStep[]> {
	const prev = lastIn(steps, s.chain);
	const body: Omit<BookStep, 'id'> = { ...s, parent: prev?.id ?? null, seq: prev ? prev.seq + 1 : 0, at: s.at ?? new Date().toISOString() };
	return [...steps, { ...body, id: await addressOf(body) }];
}

/** Whether every chain holds: each step's address matches its content and follows the one before. The first thing wrong, or null. */
export async function checkSteps(steps: BookStep[]): Promise<{ at: number; says: string } | null> {
	const heads = new Map<string, BookStep>();
	for (const [i, step] of steps.entries()) {
		const { id, ...body } = step;
		if ((await addressOf(body)) !== id) return { at: i, says: `Step ${i + 1} has been changed since it was made.` };
		const prev = heads.get(step.chain) ?? null;
		if (step.parent !== (prev?.id ?? null)) return { at: i, says: `Step ${i + 1} doesn’t follow the one before it in its story.` };
		if (step.seq !== (prev ? prev.seq + 1 : 0)) return { at: i, says: `Step ${i + 1} is numbered out of order.` };
		if (steps[0] && step.book !== steps[0].book) return { at: i, says: `Step ${i + 1} belongs to another book.` };
		if (step.head) for (const k of step.head.order) if (!heads.get(k)?.story) return { at: i, says: `Step ${i + 1} lists a story that has no history before it.` };
		heads.set(step.chain, step);
	}
	return null;
}

/** The book as it stands: each chain's latest word. */
export function bookFrom(steps: BookStep[], id = steps[0]?.book ?? ''): Book {
	const book = emptyBook(id);
	const stories = new Map<string, Story>();
	let order: string[] = [];
	for (const s of steps) {
		if (s.chain === BOOK_CHAIN && s.head) {
			({ title: book.title, subtext: book.subtext, open: book.open, ready: book.ready, order } = s.head);
			book.refs = s.head.refs ?? [];
			book.brief = s.head.brief ?? [];
			book.style = s.head.style ?? null;
		} else if (s.chain !== BOOK_CHAIN && s.story !== undefined) {
			if (s.story === null) stories.delete(s.chain);
			else stories.set(s.chain, s.story);
		}
	}
	book.stories = order.map((k) => stories.get(k)).filter((x): x is Story => !!x);
	return book;
}

/** One story's history (or the book's own, with 'book'), oldest first. */
export const historyOf = (steps: BookStep[], chain: string) => steps.filter((s) => s.chain === chain);

const headOf = (b: Book, order = b.stories.map((s) => s.id)) => ({ title: b.title, subtext: b.subtext, open: b.open, ready: b.ready, order, refs: b.refs, brief: b.brief, style: b.style });

/** Make a fresh id for a story or book (short, random, URL-safe). */
export function freshId(prefix: string): string {
	const b = crypto.getRandomValues(new Uint8Array(6));
	return `${prefix}-${Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 10)}`;
}

/** The main idea: the book's title and subtext. Any change makes the book not ready again. */
export async function setIdea(steps: BookStep[], bookId: string, idea: { title: string; subtext: string }, asks: string): Promise<BookStep[]> {
	const b = bookFrom(steps, bookId);
	const title = tidy(idea.title, TITLE_MOST);
	const subtext = tidy(idea.subtext, SUBTEXT_MOST);
	return addStep(steps, { book: bookId, chain: BOOK_CHAIN, kind: 'idea', asks, answer: { title, subtext }, head: { ...headOf(b), title, subtext, ready: false } });
}

/**
 * The stories, in order, by title. An entry with an id renames (or keeps) that
 * story; one without starts a new story. A story left out is taken out, its
 * chain closed with a last step, so its history is still there to read.
 * Only stories whose titles changed get a step: the rest are untouched.
 */
export async function setStories(steps: BookStep[], bookId: string, list: { id?: string; title: string }[], asks: string): Promise<BookStep[]> {
	const b = bookFrom(steps, bookId);
	const now = new Map(b.stories.map((s) => [s.id, s]));
	let out = steps;
	const order: string[] = [];
	for (const item of list.slice(0, STORIES_MOST)) {
		const title = tidy(item.title, TITLE_MOST);
		if (!title) continue;
		const had = item.id ? now.get(item.id) : undefined;
		const id = had?.id ?? freshId('story');
		order.push(id);
		if (had && had.title === title) continue;
		const story: Story = had ? { ...had, title } : { id, title, slides: [] };
		out = await addStep(out, { book: bookId, chain: id, kind: 'stories', asks, answer: { title }, story });
	}
	for (const s of b.stories) if (!order.includes(s.id)) out = await addStep(out, { book: bookId, chain: s.id, kind: 'stories', asks, answer: { removed: s.title }, story: null });
	return addStep(out, { book: bookId, chain: BOOK_CHAIN, kind: 'stories', asks, answer: list.map((x) => x.title), head: { ...headOf(b, order), ready: false } });
}

/**
 * One story, as it now stands. Only that story's chain moves, and the book is
 * no longer marked ready (one step on the book's chain says so, if it was).
 */
export async function setStory(steps: BookStep[], bookId: string, story: Story, step: { kind: StepKind; asks: string; answer: unknown; cost?: Cost }): Promise<BookStep[]> {
	const clean = storyOf(story);
	let out = await addStep(steps, { book: bookId, chain: story.id, kind: step.kind, asks: step.asks, answer: step.answer, story: clean, cost: step.cost });
	const b = bookFrom(out, bookId);
	if (b.ready) out = await addStep(out, { book: bookId, chain: BOOK_CHAIN, kind: step.kind, asks: 'A story changed, so the book is checked again.', answer: null, head: { ...headOf(b), ready: false } });
	return out;
}

/** What the AI reads, as it now stands (each one made safe; at most REFS_MOST). */
export async function setRefs(steps: BookStep[], bookId: string, refs: Partial<Ref>[], asks: string, answer: unknown): Promise<BookStep[]> {
	const b = bookFrom(steps, bookId);
	const clean = refs
		.map((r, i) => refOf(r, `ref-${i + 1}`))
		.filter((r): r is Ref => !!r)
		.slice(0, REFS_MOST);
	return addStep(steps, { book: bookId, chain: BOOK_CHAIN, kind: 'refs', asks, answer, head: { ...headOf(b), refs: clean } });
}

/** Q's questions as answered so far (each tidied; at most BRIEF_MOST). */
export async function setBrief(steps: BookStep[], bookId: string, brief: BriefAnswer[], asks: string, answer: unknown, cost?: Cost): Promise<BookStep[]> {
	const b = bookFrom(steps, bookId);
	const clean = brief.slice(0, BRIEF_MOST).map((a) => ({ asks: tidy(a.asks, 300), ...(a.why ? { why: tidy(a.why, 200) } : {}), answer: (typeof a.answer === 'string' ? a.answer : '').trim().slice(0, ANSWER_MOST), ...(a.free ? { free: true } : {}) })).filter((a) => a.asks);
	return addStep(steps, { book: bookId, chain: BOOK_CHAIN, kind: 'brief', asks, answer, head: { ...headOf(b), brief: clean }, cost });
}

/** The storyboard's look. */
export async function setStyle(steps: BookStep[], bookId: string, style: Style, asks: string): Promise<BookStep[]> {
	const b = bookFrom(steps, bookId);
	const clean: Style = style.key === 'own' || isStyleKey(style.key) ? { key: style.key, ...(tidy(style.own, STYLE_OWN_MOST) ? { own: tidy(style.own, STYLE_OWN_MOST) } : {}) } : { key: 'icons' };
	return addStep(steps, { book: bookId, chain: BOOK_CHAIN, kind: 'style', asks, answer: clean, head: { ...headOf(b), style: clean } });
}

/** Stories the AI suggested, recorded as offered (the person then uses, changes or asks again). */
export async function noteOutline(steps: BookStep[], bookId: string, titles: string[], asks: string, answer: unknown, cost?: Cost): Promise<BookStep[]> {
	const b = bookFrom(steps, bookId);
	return addStep(steps, { book: bookId, chain: BOOK_CHAIN, kind: 'outline', asks, answer: { said: answer, suggested: titles }, head: headOf(b), cost });
}

/** Public or members only. */
export async function setOpen(steps: BookStep[], bookId: string, open: boolean, asks: string): Promise<BookStep[]> {
	const b = bookFrom(steps, bookId);
	return addStep(steps, { book: bookId, chain: BOOK_CHAIN, kind: 'open', asks, answer: open, head: { ...headOf(b), open } });
}

/** It flows: ready. Refused while there are problems. */
export async function setReady(steps: BookStep[], bookId: string, asks: string, answer: unknown): Promise<BookStep[]> {
	const b = bookFrom(steps, bookId);
	const problems = problemsOf(b);
	if (problems.length) throw new Error(problems[0]);
	return addStep(steps, { book: bookId, chain: BOOK_CHAIN, kind: 'ready', asks, answer, head: { ...headOf(b), ready: true } });
}

/** Draft slides kept as the person's own (all of a story's, or the ones named). */
export function keepDrafts(story: Story, ids?: string[]): Story {
	return { ...story, slides: story.slides.map((s) => (!ids || ids.includes(s.id) ? { ...s, draft: false } : s)) };
}

/**
 * Reject one draft slide: put it back as it last was before the AI touched
 * it, or, if the AI made it, take it out. `history` is the story's own chain.
 */
export function rejectDraft(story: Story, slideId: string, history: BookStep[]): Story {
	const slide = story.slides.find((s) => s.id === slideId);
	if (!slide?.draft) return story;
	for (const step of [...history].reverse()) {
		const was = step.story?.slides.find((s) => s.id === slideId);
		if (was && !was.draft) return { ...story, slides: story.slides.map((s) => (s.id === slideId ? { ...was } : s)) };
	}
	return { ...story, slides: story.slides.filter((s) => s.id !== slideId) };
}
/** Reject every draft slide in a story. */
export function rejectDrafts(story: Story, history: BookStep[]): Story {
	return story.slides.filter((s) => s.draft).reduce((st, s) => rejectDraft(st, s.id, history), story);
}

/* ------------------------------------------------------ redo and the ripple */

/** The four questions a redo asks first, one at a time (ADR-Q-033 Part 2, step 5). */
export const REDO_QUESTIONS = [
	{ key: 'happy', asks: 'What are you happy with?' },
	{ key: 'wrong', asks: 'What isn’t right?' },
	{ key: 'change', asks: 'What must change?' },
	{ key: 'keep', asks: 'What must not change?' }
] as const;
export type RedoAnswers = Partial<Record<(typeof REDO_QUESTIONS)[number]['key'], string>>;

/**
 * A suggested change to another story, so the whole book still flows after a
 * redo. `slide` names the slide it rewrites, or is null to add a slide at the
 * end. Shown one by one; each accepted or left.
 */
export interface Suggestion {
	id: string;
	story: string;
	slide: string | null;
	title: string;
	subtext: string;
	piece: Piece | null;
	scene?: string;
	/** Why, in one plain line. */
	why: string;
}

/** A story with one suggestion applied (as a draft, until kept). Unknown story: unchanged. */
export function applySuggestion(story: Story, s: Suggestion): Story {
	if (s.story !== story.id) return story;
	const slide = slideOf({ title: s.title, subtext: s.subtext, piece: s.piece, scene: s.scene, draft: true }, `${story.id}.${story.slides.length + 1}`);
	const i = s.slide ? story.slides.findIndex((x) => x.id === s.slide) : -1;
	if (i >= 0) return { ...story, slides: story.slides.map((x, k) => (k === i ? slideOf({ ...slide, id: x.id, piece: slide.piece ?? x.piece, scene: slide.scene ?? x.scene }, x.id) : x)) };
	if (story.slides.length >= SLIDES_MOST) return story;
	return { ...story, slides: [...story.slides, { ...slide, id: uniqueSlideId(story) }] };
}

/** A slide id not yet used in this story. */
export function uniqueSlideId(story: Story): string {
	const used = new Set(story.slides.map((s) => s.id));
	let n = story.slides.length + 1;
	while (used.has(`${story.id}.${n}`)) n++;
	return `${story.id}.${n}`;
}

/* ------------------------------------------------- practice (no AI, no cost) */

/*
 * The practice drafter: what the engine does when there is no AI key, so every
 * step can be tried (and proved in the test rig) without spending anything.
 * It never pretends to be clever: its words say plainly what to write.
 */
const PRACTICE: { title: string; subtext: (story: string) => string; piece: Piece }[] = [
	{ title: 'What it is', subtext: (s) => `Say in one line what “${s}” is about.`, piece: 'search' },
	{ title: 'Why it matters', subtext: (s) => `Say who “${s}” helps, and why they’d care.`, piece: 'heart' },
	{ title: 'What to do', subtext: (s) => `Say the one thing to do after “${s}”.`, piece: 'tick' }
];

/** A first draft, by practice: fills empty slides, and brings each story to three. Slides the person wrote are untouched. */
export function practiceDraft(book: Book): Story[] {
	return needingWork(book).map((story) => {
		const slides = story.slides.map((s, i) => (isEmptySlide(s) ? { ...s, ...draftLine(story.title, i), draft: true } : s));
		while (slides.length < 3) slides.push({ id: uniqueSlideId({ ...story, slides }), ...draftLine(story.title, slides.length), draft: true });
		return { ...story, slides };
	});
}
function draftLine(story: string, i: number): Pick<Slide, 'title' | 'subtext' | 'piece' | 'scene'> {
	const p = PRACTICE[i % PRACTICE.length];
	return { title: p.title, subtext: p.subtext(story), piece: p.piece, scene: `A picture for “${p.title}”: describe what the reader would see.` };
}

/*
 * Q's questions, by practice: the questions a writer would want answered
 * before starting, asked in order, skipping none. The AI asks its own,
 * shaped by what it read and what came before; these are the fallback.
 */
const PRACTICE_QUESTIONS: { asks: string; why: string; options: string[] }[] = [
	{ asks: 'Who will watch this, and what do they already know?', why: 'So it starts where they are.', options: ['Complete beginners', 'People who know a little', 'People who know a lot'] },
	{ asks: 'When they reach the end, what should they feel, or do?', why: 'So every story leads there.', options: ['Understand it', 'Feel hopeful', 'Take a first step', 'Tell someone else'] },
	{ asks: 'How should it sound?', why: 'So the words fit the people watching.', options: ['Warm and friendly', 'Calm and clear', 'Bold and urgent', 'Playful'] },
	{ asks: 'Is there anything it must say, or must never say?', why: 'So nothing important is missed, and nothing wrong slips in.', options: [] },
	{ asks: 'Anything else Q should know?', why: 'Last chance before Q starts.', options: [] }
];
/** The next question, by practice, or null when the brief has enough. */
export function practiceAsk(book: Book): { asks: string; why: string; options: string[] } | null {
	const asked = new Set(book.brief.map((a) => a.asks));
	return PRACTICE_QUESTIONS.find((q) => !asked.has(q.asks)) ?? null;
}

/** Suggested stories, by practice: six plain parts any book can start from. */
export function practiceOutline(book: Book): string[] {
	const about = book.title ? `: ${book.title}` : '';
	return ['Where it starts', 'The problem', 'Why it matters', 'A better way', 'What it takes', 'What to do next'].map((t, i) => (i === 0 ? tidy(t + about, TITLE_MOST) : t));
}

/** A redo, by practice: keeps the slides, and adds what must change as a new draft slide. */
export function practiceRedo(story: Story, answers: RedoAnswers): Story {
	const change = tidy(answers.change, SUBTEXT_MOST);
	if (!change) return { ...story, slides: story.slides.map((s) => ({ ...s })) };
	const words = change.replace(/[.!?…]+$/, '').split(' ');
	const title = tidy(words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : ''), TITLE_MOST);
	const slides = story.slides.length >= SLIDES_MOST ? story.slides.slice(0, SLIDES_MOST - 1) : story.slides;
	return { ...story, slides: [...slides, { id: uniqueSlideId(story), title, subtext: change, piece: 'tick', scene: `A picture for “${title}”.`, draft: true }] };
}

/** A ripple review, by practice: the story after the changed one is asked to follow on from it. */
export function practiceRipple(book: Book, changed: string): Suggestion[] {
	const i = book.stories.findIndex((s) => s.id === changed);
	const next = book.stories[i + 1];
	if (i < 0 || !next) return [];
	const first = next.slides[0];
	if (first?.subtext.startsWith('Following on from')) return [];
	return [
		{
			id: `${next.id}:follow`,
			story: next.id,
			slide: first?.id ?? null,
			title: first?.title || `After “${book.stories[i].title}”`,
			subtext: `Following on from “${book.stories[i].title}”: ${first?.subtext || 'say how this story carries on from the last.'}`,
			piece: first?.piece ?? 'map',
			why: `“${book.stories[i].title}” changed, so the next story picks up where it now ends.`
		}
	];
}
