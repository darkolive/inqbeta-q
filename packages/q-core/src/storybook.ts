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
import { practiceRecipe, recipeOf, type Recipe } from './scene-recipe';

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
	/**
	 * In a course unit: this is the outcome's "Show it", one small concrete
	 * thing the learner makes or does and keeps as evidence (6 October 2026).
	 * Still a title and a subtext; always a story's last slide (storyOf moves it).
	 */
	show?: true;
	/**
	 * How the slide moves, once the story is brought to life (6 October
	 * 2026): Q's pieces on a stage and what they do, performed by the player.
	 * A draft is stills; this is the paid step. See scene-recipe.ts.
	 */
	motion?: Recipe;
}
export interface Story {
	id: string;
	/** A story is its title only. */
	title: string;
	slides: Slide[];
	/** In a course unit: the recap at the end, made from the outcomes (one slide each). */
	recap?: true;
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
	/**
	 * When the book is a course unit (6 October 2026): the title is the unit,
	 * the subtext its aim, each story one learning outcome, and this the
	 * unit card. Null for an ordinary book.
	 */
	course: Unit | null;
}

/* ------------------------------------------------------------- a course unit */

/*
 * The storyboard for courses (ADR-Q-033, 6 October 2026). Darren: "this is
 * all part of how the course is written, is mapping out what you're going to
 * learn when you're studying this unit. And being able to explain that from
 * an ADHD artist who's delivering a course."
 *
 *   the book     the unit: its title, and its aim as the subtext
 *   a story      one learning outcome, in the order it's learned; its first
 *                slide says why it matters, its last is "Show it"
 *   the recap    the last story, made from the outcomes, one slide each
 *
 * The unit card is small on purpose: how it's assessed is each outcome's
 * Show it, not another field.
 */
export interface Unit {
	/** "Level 2", "Beginners": however the maker says it. */
	level: string;
	/** About how long it takes to study: "About two hours". */
	time: string;
	/** What you need first: things to have, or know. */
	needFirst: string;
	/**
	 * How the teacher teaches, in their own words, typed or said ("I start
	 * with why. I draw it before I name it."). Every slide is written in it;
	 * the lines are recorded in their real voice later.
	 */
	voice: string;
}
export const UNIT_MOST = 120;
export const VOICE_MOST = 1200;
/** The recap story's fixed id, and the title it starts with. */
export const RECAP_ID = 'recap';
export const RECAP_TITLE = 'What you’ve learned';

/** A unit card made safe to keep. */
export function unitOf(x: Partial<Unit> | null | undefined): Unit {
	return { level: tidy(x?.level, UNIT_MOST), time: tidy(x?.time, UNIT_MOST), needFirst: tidy(x?.needFirst, UNIT_MOST), voice: (typeof x?.voice === 'string' ? x.voice : '').trim().slice(0, VOICE_MOST) };
}
/** The learning outcomes: every story but the recap (an ordinary book: every story). */
export const outcomesOf = (book: Book) => book.stories.filter((s) => !s.recap);
/** A course unit's outcomes can each have a recap slide, so there are at most as many as a story has slides. */
export const OUTCOMES_MOST = SLIDES_MOST;

/**
 * The recap's slide for one outcome: the outcome's title, and its own lines
 * said again in a row, so nothing has to be remembered. Its first picture.
 * A draft until the person keeps it.
 */
export function recapSlideOf(outcome: Story): Slide {
	const lines = outcome.slides.filter((s) => !s.show && s.title).map((s) => s.title.replace(/[.!?…]+$/, ''));
	const first = outcome.slides.find((s) => s.scene || s.piece);
	return slideOf({ title: outcome.title, subtext: lines.length ? `${lines.join('. ')}.` : '', scene: first?.scene, piece: first?.piece ?? null, draft: true }, `${RECAP_ID}.${outcome.id}`);
}
const sameWords = (a: Slide, b: Slide) => a.title === b.title && a.subtext === b.subtext && (a.scene ?? '') === (b.scene ?? '') && a.piece === b.piece;

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
	const motion = x.motion ? recipeOf(x.motion, isPiece) : null;
	return {
		id: typeof x.id === 'string' && x.id ? x.id : id,
		title: tidy(x.title, TITLE_MOST),
		subtext: tidy(x.subtext, SUBTEXT_MOST),
		piece: isPiece(x.piece) ? x.piece : null,
		...(scene ? { scene } : {}),
		draft: !!x.draft,
		...(x.show === true ? { show: true as const } : {}),
		...(motion ? { motion } : {})
	};
}

/** A story made to the rule: a title, and at most SLIDES_MOST slides. Anything else is dropped. */
export function storyOf(x: { id: string; title?: unknown; slides?: unknown; recap?: unknown }): Story {
	const recap = x.recap === true;
	const list = Array.isArray(x.slides) ? x.slides : [];
	let slides = list.slice(0, SLIDES_MOST).map((s, i) => slideOf((s ?? {}) as Partial<Slide>, `${x.id}.${i + 1}`));
	/* One Show it at most, and always last: the last one marked wins. A recap has none. */
	let show = -1;
	if (!recap) slides.forEach((s, i) => s.show && (show = i));
	slides = slides.map(({ show: _, ...s }, i) => (i === show ? { ...s, show: true as const } : s));
	if (show >= 0 && show !== slides.length - 1) slides = [...slides.slice(0, show), ...slides.slice(show + 1), slides[show]];
	return { id: x.id, title: tidy(x.title, TITLE_MOST), slides, ...(recap ? { recap: true as const } : {}) };
}

/** Make one slide the story's Show it (and no other), moved to the end. */
export function markShowIt(story: Story, slideId: string | null): Story {
	return storyOf({ ...story, slides: story.slides.map((s) => ({ ...s, show: s.id === slideId ? (true as const) : undefined })) });
}

export const emptyBook = (id: string): Book => ({ id, title: '', subtext: '', open: false, ready: false, stories: [], refs: [], brief: [], style: null, course: null });

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
		if (book.course && !s.recap && s.slides.length && !s.slides.at(-1)?.show) out.push(`${name} needs a Show it slide at the end.`);
	}
	return out;
}

/** The stories that still need slides or words: what a first draft would write. */
export function needingWork(book: Book): Story[] {
	return book.stories.filter((s) => !s.recap && (s.slides.length < 3 || s.slides.some(isEmptySlide) || (!!book.course && !s.slides.some((x) => x.show))));
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
	/** A course unit's card (or the book made ordinary again). */
	| 'course'
	/** The recap made again from the outcomes. */
	| 'recap'
	/** A story brought to life: each slide's movement (or taken back to stills). */
	| 'animate'
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
	head?: { title: string; subtext: string; open: boolean; ready: boolean; order: string[]; refs?: Ref[]; brief?: BriefAnswer[]; style?: Style | null; course?: Unit | null };
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
			book.course = s.head.course ?? null;
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

const headOf = (b: Book, order = b.stories.map((s) => s.id)) => ({ title: b.title, subtext: b.subtext, open: b.open, ready: b.ready, order, refs: b.refs, brief: b.brief, style: b.style, ...(b.course ? { course: b.course } : {}) });

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
	/* The recap is Q's to keep in place: it is never set here, and a unit has at most OUTCOMES_MOST outcomes. */
	const recap = b.stories.find((s) => s.recap);
	for (const item of list.filter((x) => x.id !== RECAP_ID).slice(0, b.course ? OUTCOMES_MOST : STORIES_MOST)) {
		const title = tidy(item.title, TITLE_MOST);
		if (!title) continue;
		const had = item.id ? now.get(item.id) : undefined;
		const id = had?.id ?? freshId('story');
		order.push(id);
		if (had && had.title === title) continue;
		const story: Story = had ? { ...had, title } : { id, title, slides: [] };
		out = await addStep(out, { book: bookId, chain: id, kind: 'stories', asks, answer: { title }, story });
	}
	if (recap) order.push(recap.id);
	for (const s of b.stories) if (!order.includes(s.id)) out = await addStep(out, { book: bookId, chain: s.id, kind: 'stories', asks, answer: { removed: s.title }, story: null });
	out = await addStep(out, { book: bookId, chain: BOOK_CHAIN, kind: 'stories', asks, answer: list.filter((x) => x.id !== RECAP_ID).map((x) => x.title), head: { ...headOf(b, order), ready: false } });
	return syncRecap(out, bookId);
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
	/* An outcome changed: only the recap's one slide for it is made again. */
	return clean.recap ? out : syncRecap(out, bookId, [clean.id]);
}

/**
 * The book as a course unit (a card), or an ordinary book again (null). A
 * unit gains its recap at the end; an ordinary book loses it (its history
 * stays). Not ready until checked again.
 */
export async function setCourse(steps: BookStep[], bookId: string, unit: Partial<Unit> | null, asks: string): Promise<BookStep[]> {
	const b = bookFrom(steps, bookId);
	const course = unit ? unitOf(unit) : null;
	const head = { ...headOf(b), ready: false };
	if (course) head.course = course;
	else delete (head as { course?: Unit }).course;
	const out = await addStep(steps, { book: bookId, chain: BOOK_CHAIN, kind: 'course', asks, answer: course ?? 'an ordinary book', head });
	return syncRecap(out, bookId);
}

/**
 * Keep a course unit's recap in step with its outcomes: one slide each, in
 * their order, always the last story. A slide is made again only for an
 * outcome named in `changed` (or one that has none yet), and only when its
 * words would differ, so a recap slide the person kept stays kept. Nothing is
 * written when nothing changed. An ordinary book has no recap.
 */
export async function syncRecap(steps: BookStep[], bookId: string, changed?: string[]): Promise<BookStep[]> {
	const b = bookFrom(steps, bookId);
	const had = b.stories.find((s) => s.recap) ?? null;
	const outcomes = outcomesOf(b);
	let out = steps;
	if (!b.course || !outcomes.length) {
		if (!had) return steps;
		out = await addStep(out, { book: bookId, chain: had.id, kind: 'recap', asks: b.course ? 'No outcomes yet, so no recap.' : 'An ordinary book has no recap.', answer: null, story: null });
		return addStep(out, { book: bookId, chain: BOOK_CHAIN, kind: 'recap', asks: 'The recap is taken out.', answer: null, head: headOf(b, outcomes.map((s) => s.id)) });
	}
	const before = new Map((had?.slides ?? []).map((s) => [s.id, s]));
	const slides = outcomes.slice(0, OUTCOMES_MOST).map((o) => {
		const made = recapSlideOf(o);
		const was = before.get(made.id);
		return was && was.title === made.title && (!changed?.includes(o.id) || sameWords(was, made)) ? was : made;
	});
	const recap: Story = storyOf({ id: RECAP_ID, title: had?.title || RECAP_TITLE, slides, recap: true });
	if (!had || canonical(had) !== canonical(recap)) out = await addStep(out, { book: bookId, chain: RECAP_ID, kind: 'recap', asks: 'The recap, made again from the outcomes.', answer: changed ?? 'all', story: recap });
	const order = [...outcomes.map((s) => s.id), RECAP_ID];
	if (b.stories.map((s) => s.id).join() !== order.join()) out = await addStep(out, { book: bookId, chain: BOOK_CHAIN, kind: 'recap', asks: 'The recap goes last.', answer: null, head: headOf(bookFrom(out, bookId), order) });
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
	const lines = book.course ? PRACTICE_COURSE : PRACTICE;
	return needingWork(book).map((story) => {
		const slides: Slide[] = story.slides.map((s, i) => (isEmptySlide(s) ? { ...s, ...draftLine(lines, story.title, i), draft: true } : s));
		while (slides.length < 3) slides.push({ id: uniqueSlideId({ ...story, slides }), ...draftLine(lines, story.title, slides.length), draft: true });
		/* A course outcome always ends with its Show it. */
		if (book.course && !slides.some((s) => s.show)) {
			const show = { ...draftLine(lines, story.title, 2), draft: true, show: true as const };
			if (slides.length < SLIDES_MOST) slides.push({ id: uniqueSlideId({ ...story, slides }), ...show });
			else slides[slides.length - 1] = { ...slides[slides.length - 1], show: true };
		}
		return storyOf({ ...story, slides });
	});
}
/* For a course outcome: why it matters first, what it is, then Show it (the ADHD-first house rules). */
const PRACTICE_COURSE: typeof PRACTICE = [
	{ title: 'Why it matters', subtext: (s) => `Say why someone would want to “${s.toLowerCase()}”, before any how.`, piece: 'heart' },
	{ title: 'What it is', subtext: (s) => `Show “${s.toLowerCase()}” in one picture, and name what it shows.`, piece: 'search' },
	{ title: 'Show it', subtext: (s) => `One small thing to make or do that shows you can “${s.toLowerCase()}”.`, piece: 'tick' }
];
function draftLine(lines: typeof PRACTICE, story: string, i: number): Pick<Slide, 'title' | 'subtext' | 'piece' | 'scene'> & { show?: true } {
	const p = lines[i % lines.length];
	return { title: p.title, subtext: tidy(p.subtext(story), SUBTEXT_MOST), piece: p.piece, scene: `A picture for “${p.title}”: describe what the reader would see.`, ...(lines === PRACTICE_COURSE && i % lines.length === 2 ? { show: true as const } : {}) };
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
/*
 * A course writer's five (6 October 2026), asked in this order when the
 * book is a course unit. The AI asks its own through the same lens.
 */
export const COURSE_QUESTIONS: { asks: string; why: string; options: string[] }[] = [
	{ asks: 'Who is this unit for?', why: 'So it starts where they are.', options: ['Complete beginners', 'Some experience', 'Confident already'] },
	{ asks: 'What can they already do before they start?', why: 'So nothing is explained twice, or skipped.', options: [] },
	{ asks: 'When they finish, what will they be able to do?', why: 'Each one becomes a story.', options: [] },
	{ asks: 'How will they show they can do it?', why: 'Each story ends with a Show it.', options: ['Make something', 'Do it and film it', 'Explain it out loud', 'Write a short note'] },
	{ asks: 'What usually trips people up?', why: 'So the unit gets there first.', options: [] }
];
/** The next question, by practice, or null when the brief has enough. */
export function practiceAsk(book: Book): { asks: string; why: string; options: string[] } | null {
	const asked = new Set(book.brief.map((a) => a.asks));
	return (book.course ? COURSE_QUESTIONS : PRACTICE_QUESTIONS).find((q) => !asked.has(q.asks)) ?? null;
}

/** Suggested stories, by practice: six plain parts any book can start from; for a unit, five outcomes. */
export function practiceOutline(book: Book): string[] {
	if (book.course) return ['Know what it’s for', 'See how it works', 'Try it once', 'Fix what trips you up', 'Make it your own'];
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
	if (i < 0 || !next || next.recap) return [];
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

/* ------------------------------------------------- Show it: the learner's evidence */

/*
 * What a learner keeps for an outcome's Show it (6 October 2026): their own
 * words (typed or said) and/or a file (a photo, a drawing, a clip), recorded
 * against the unit and the outcome. A file is kept by its fingerprint, so the
 * record says exactly which file it was without carrying it. Hashed, not yet
 * signed: when evidence moves into the vault, each record is sealed as a
 * receipt (seal.ts) with this same content, as books' steps will be.
 */
export interface EvidenceFile {
	name: string;
	type: string;
	size: number;
	/** SHA-256 of the file's bytes, hex. */
	sha256: string;
}
export interface Evidence {
	schema: 'inqbeta.evidence/1';
	/** This record's content address. */
	id: string;
	book: string;
	/** The unit's title, as it was. */
	unit: string;
	outcome: string;
	outcomeTitle: string;
	/** The Show it, as the learner saw it. */
	asked: { title: string; subtext: string };
	words?: string;
	file?: EvidenceFile;
	at: string;
}
export const EVIDENCE_WORDS_MOST = 2000;

/** A Show it's evidence, made safe and addressed. Throws when there's nothing to keep, or the story has no Show it. */
export async function evidenceOf(book: Book, outcome: Story, kept: { words?: string; file?: EvidenceFile }, at = new Date().toISOString()): Promise<Evidence> {
	const show = outcome.slides.find((s) => s.show);
	if (!show) throw new Error('This story has no Show it.');
	const words = (typeof kept.words === 'string' ? kept.words : '').trim().slice(0, EVIDENCE_WORDS_MOST);
	const f = kept.file;
	const file = f && /^[0-9a-f]{64}$/.test(f.sha256) ? { name: tidy(f.name, 200) || 'A file', type: tidy(f.type, 100), size: Math.max(0, Math.floor(f.size) || 0), sha256: f.sha256 } : undefined;
	if (!words && !file) throw new Error('Add some words or a file first.');
	const body: Omit<Evidence, 'id'> = { schema: 'inqbeta.evidence/1', book: book.id, unit: book.title, outcome: outcome.id, outcomeTitle: outcome.title, asked: { title: show.title, subtext: show.subtext }, ...(words ? { words } : {}), ...(file ? { file } : {}), at };
	return { ...body, id: await sha256(canonical(body)) };
}
/** Whether an evidence record is as it was made. */
export async function evidenceHolds(e: Evidence): Promise<boolean> {
	const { id, ...body } = e;
	return id === (await sha256(canonical(body)));
}

/* ------------------------------------------------------- bringing a story to life */

/** Whether any slide in the story moves. */
export const moves = (story: Story) => story.slides.some((s) => !!s.motion);
/** The story as stills again: every slide's movement taken off (its words untouched). */
export const stillsOf = (story: Story): Story => ({ ...story, slides: story.slides.map(({ motion: _, ...s }) => s) });
/** Bringing a story to life, by practice: a plain recipe for each slide from its piece and scene. */
export function practiceAnimate(story: Story): Story {
	return storyOf({ ...story, slides: story.slides.map((s) => ({ ...s, motion: practiceRecipe(s.piece, s.scene) })) });
}
