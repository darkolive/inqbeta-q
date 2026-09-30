/*
 * What a page may be made of — a closed vocabulary, and nothing that runs.
 *
 * Darren asked whether a drag-and-drop library is worth adopting for building
 * UI receipts. It is, eventually, and this is what has to exist first: today a
 * builder would be dragging strings.
 *
 * WHAT WAS THERE BEFORE. ui-receipts.ts declared block NAMES — header,
 * federation-list, recent-activity, custom — with `props?: Record<string,
 * any>`, and a renderPage() that returned JSON.stringify. Nothing rendered
 * anything, so "the UI is a receipt" was a list of names and the shape of a
 * block was whatever anybody put in it. It was deleted on 2026-09-20; pages
 * written in it are still read.
 *
 * TWO DECISIONS, BOTH MADE HERE RATHER THAN DISCOVERED LATER.
 *
 * ONE: THE VOCABULARY IS CLOSED. Every block kind below has a declared shape
 * and `checkBlock` refuses anything else. An open vocabulary means a page can
 * name a block nothing renders, which fails silently in the worst place — on
 * somebody else's screen, showing less than the author intended, saying
 * nothing. 'custom' is gone on purpose: it was an escape hatch nobody had
 * walked through, and the thing that eventually wants to go in it is a script.
 *
 * TWO: A TEMPLATE CARRIES NO BEHAVIOUR. This is the one that matters. A
 * template is a receipt, and receipts TRAVEL — a federation's template lands
 * in a person's folder and renders against their own answers. A template
 * carrying triggers, handlers, or a URL that fetches is third-party code
 * running against a person's data, which is ADR-Q-002's open question arriving
 * dressed as a design system. checkBlock refuses behaviour by name, one test
 * each.
 *
 * AND AN IMAGE IS A CONTENT ADDRESS, NEVER A URL. A remote URL in a template
 * is a beacon: it tells whoever hosts it the moment a person opened the page,
 * from which address, how often. A template should not be able to watch
 * somebody read it.
 *
 * WHAT A BLOCK NAMES. Predicates, never values — the same rule as cards.ts. A
 * block says "show q:person/called"; it never carries what the answer was. So
 * a template can be handed to anyone without carrying anything about anyone.
 *
 * TWO FREEDOMS, AND ONLY ONE OF THEM IS A RISK.
 *
 * Darren, 2026-09-20: "100% control, freedom to customize and design and make
 * whatever their imagination lets them… everything has a setting so everything
 * can be customized from a UI point."
 *
 * Yes — and the closed vocabulary does not stand in the way of any of it,
 * because ARRANGEMENT and EXECUTION are different freedoms:
 *
 *   arrangement   what blocks, in what order, how wide, with what settings,
 *                 repeated as often as you like. Unlimited, and the thing
 *                 people actually mean by designing their own dashboard.
 *   execution     what a block DOES when somebody opens the page. Zero, for
 *                 everyone, always — because a template travels and lands in
 *                 a stranger's folder.
 *
 * A closed set is not a small set. The web has about a hundred elements and
 * nobody says HTML limits imagination. What was missing was not more KINDS, it
 * was settings — so every kind now declares its own, AS QUESTIONS, and the
 * settings panel is the same renderer that draws every other question set in
 * Q. A plugin is then a declared block kind with its own questions, and
 * customising one is answering them. Which means a customised page is answers,
 * and answers are a receipt.
 *
 * Pure. No rendering. q-ui draws these; this says which exist and what they
 * may hold.
 */
import { QUESTION_SET_SCHEMA, type QuestionSet } from './questions';
import { styleQuestions } from './style';
import { BEHAVIOUR_FIELDS } from './behaviour';
import { CORE_COMPONENTS, checkComponentSettings, findComponent, pin, type ComponentManifest } from './components';

/*
 * FURNITURE AND CONTENT — the distinction Darren's list makes necessary.
 *
 * He asked for a table, a header with sign-in and search and the accessibility
 * controls, a side menu, a drawer, a card, a hero and a blog layout. Those are
 * the right starting points, and three of them DO things.
 *
 * Which looks like it breaks "a template carries no behaviour" and does not,
 * because two different things were being called blocks:
 *
 *   FURNITURE   header, menu, drawer. Q's own chrome. It signs you in, it
 *               searches, it reads aloud. A template NAMES it; a template never
 *               implements it. The behaviour lives in Q, in one place, and a
 *               page only chooses where it sits.
 *   CONTENT     hero, table, card, blog and the rest. Arrangement of things,
 *               with nothing to run.
 *
 * So a block can be interactive — as long as Q wrote the interaction. It can
 * never be interactive because a template said so. Furniture settings are
 * closed toggles about which PARTS show, never about what they point at: a
 * header cannot be told where sign-in goes or what search searches, because
 * that is aiming Q's own chrome at somebody else's target.
 */
export type BlockKind =
	/** A line of your own words. */
	| 'heading'
	/** A paragraph of them. */
	| 'text'
	/** Named questions, shown with whatever the reader is allowed to see. */
	| 'answers'
	/** One of your cards, by name. */
	| 'card'
	/** Where your work is kept. */
	| 'places'
	/** What has been written, as a list. */
	| 'receipts'
	/** People you hold contact receipts for. */
	| 'contacts'
	/** Federations you belong to. */
	| 'federations'
	/** A picture, by content address. */
	| 'image'
	/** A gap. */
	| 'space'
	/*
	 * PUBLICATION KINDS — added 2026-09-23 so an article (a Dark Olive project
	 * write-up, a blog post) can be built from blocks and look exactly as it
	 * did when it was markdown. Arrangement only, like every other kind; the
	 * one that touches another site (embed) names a provider and an id, never a
	 * URL, and the site's own renderer decides how — and whether — to load it.
	 */
	/** A big picture with the title set over it. */
	| 'cover'
	/** Labelled facts in a band: Role, Location, With, Date. */
	| 'facts'
	/** A partner's mark beside one line of what was done. */
	| 'standfirst'
	/** A picture with words for those who cannot see it, and an optional caption. */
	| 'figure'
	/** A film or a recording from a known provider, by id. Loaded only as the site allows. */
	| 'embed'
	/** Somebody else's words, set apart. */
	| 'quote'
	/** A note to yourself — a TODO, a reminder. Kept with the page, never drawn. */
	| 'note'
	/* LIBRARY, 2026-09-24 — the components a publication reaches for, each
	 * filtered through "nothing that runs". */
	/** A line across the page. */
	| 'divider'
	/** A button that goes somewhere — a page on the site, or another site. */
	| 'button'
	/** Rows and columns of answers, or of anything else in a list. */
	| 'table'
	/** A big opening statement: a line, some words, and somewhere to go. */
	| 'hero'
	/** Posts, newest first, the way a blog reads. */
	| 'blog'
	/** FURNITURE: Q's own header — sign in, search, the accessibility controls. */
	| 'header'
	/** FURNITURE: Q's own side menu. */
	| 'menu'
	/** FURNITURE: Q's own drawer, for things kept out of the way until wanted. */
	| 'drawer'
	/**
	 * A group of other blocks, with its own look.
	 *
	 * The only kind that holds children, and one is enough: blocks inside a
	 * section flow by their widths, so a row of three cards is a section with
	 * three thirds in it. A separate 'row' kind would be a second way to say
	 * the same thing, and two ways to say one thing is how a layout model
	 * starts arguing with itself.
	 */
	| 'section'
	/**
	 * A component from the library, pinned to one version (ADR-Q-006).
	 *
	 * The block is still data: which component (`q:sign-in@1.0.0`) and the
	 * answers to its questions. The code lives in the library, described by a
	 * manifest in components.ts that says what it may touch. So a block can be
	 * interactive because an approved component is — never because the block
	 * said so. Furniture (header, menu, drawer) is the same idea, kept as its
	 * own kinds because it came first.
	 */
	| 'component';

/**
 * Which kinds are Q's own chrome rather than arrangement.
 *
 * A function rather than a list in a comment, so the one place that decides is
 * testable and a new kind has to declare which it is.
 */
export function isFurniture(kind: BlockKind): boolean {
	return kind === 'header' || kind === 'menu' || kind === 'drawer';
}

/** Which kinds may hold others. Exactly one, and a function so it is testable. */
export function holdsOthers(kind: BlockKind): boolean {
	return kind === 'section';
}

/**
 * How deep blocks may nest.
 *
 * A cap rather than none. Unbounded nesting is a page that takes a long time
 * to draw and a builder nobody can navigate, and a template arriving from
 * somebody else with two thousand levels in it is a page that hangs a tab. A
 * page, a section, and a section inside it is as far as any dashboard needs to
 * go — past that the answer is another page.
 */
export const DEEPEST = 3;

export const BLOCKS: { kind: BlockKind; called: string; holds: string }[] = [
	{ kind: 'heading', called: 'Heading', holds: 'A line of text.' },
	{ kind: 'text', called: 'Words', holds: 'A paragraph.' },
	{ kind: 'answers', called: 'Answers', holds: 'The questions to show — never the answers themselves.' },
	{ kind: 'card', called: 'A card', holds: 'The name of one of your cards.' },
	{ kind: 'places', called: 'Where things are kept', holds: 'Nothing. It shows what you have.' },
	{ kind: 'receipts', called: 'Receipts', holds: 'How many to show.' },
	{ kind: 'contacts', called: 'People', holds: 'Nothing. It shows who you hold receipts for.' },
	{ kind: 'federations', called: 'Federations', holds: 'Nothing. It shows where you belong.' },
	{ kind: 'image', called: 'A picture', holds: 'A content address. Never a link to somewhere else.' },
	{ kind: 'space', called: 'A gap', holds: 'Nothing.' },
	{ kind: 'table', called: 'A table', holds: 'Which columns, and what goes in the rows.' },
	{ kind: 'hero', called: 'A hero', holds: 'A big line, some words, and a card to hand over.' },
	{ kind: 'blog', called: 'Posts', holds: 'How many, and whether to show the opening lines.' },
	{ kind: 'header', called: 'The header', holds: 'Which parts of Q’s own header to show.' },
	{ kind: 'menu', called: 'The side menu', holds: 'Whether it starts open.' },
	{ kind: 'drawer', called: 'A drawer', holds: 'What it is called when shut.' },
	{ kind: 'section', called: 'A group', holds: 'Other blocks, laid out by their widths.' },
	{ kind: 'cover', called: 'A cover', holds: 'A picture, a title and a line under it.' },
	{ kind: 'facts', called: 'Facts', holds: 'Labelled facts, one per line: “Role: Production Management”.' },
	{ kind: 'standfirst', called: 'A standfirst', holds: 'One line of what was done, and a partner’s mark beside it.' },
	{ kind: 'figure', called: 'A figure', holds: 'A picture you hold, what it shows, and a caption.' },
	{ kind: 'embed', called: 'A film or recording', holds: 'Which provider, and its id. Never a link.' },
	{ kind: 'quote', called: 'A quote', holds: 'Somebody else’s words.' },
	{ kind: 'note', called: 'A note to yourself', holds: 'Words nobody else sees. Never drawn, never published.' },
	{ kind: 'divider', called: 'A line', holds: 'Nothing. A rule across the page.' },
	{ kind: 'button', called: 'A button', holds: 'What it says, and where it goes.' },
	{ kind: 'component', called: 'A component', holds: 'Which component from the library, pinned to one version, and its own settings.' }
];

/** Where an embed may come from. Closed: the site's renderer knows how to load each one. */
export const PROVIDERS = ['youtube', 'vimeo', 'dailymotion', 'soundcloud'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** How a group lays out what is in it. */
export const ARRANGEMENTS = ['grid', 'aside', 'profile', 'gallery', 'disclosure', 'columns'] as const;

export interface Block {
	kind: BlockKind;
	/** Stable within a page, so a reorder is a reorder and not a rewrite. */
	id: string;
	/** For 'heading' and 'text'. */
	says?: string;
	/** For 'answers' — question ids. Predicates, never values. */
	shows?: string[];
	/** For 'card' — a card's name. */
	card?: string;
	/** For 'image' — `content://sha256/…`. */
	at?: string;
	/** For 'receipts' — how many. */
	howMany?: number;
	/** How much of the row it takes. Closed, because a grid engine is a grid engine. */
	width?: Width;
	/** Answers to this block's own settings questions. */
	settings?: Record<string, string | number | boolean | string[]>;
	/** Blocks inside this one. Only a section may have them. */
	children?: Block[];
	/** For 'component' — `q:sign-in@1.0.0`: which one, and exactly which version. */
	component?: string;
}

/**
 * How wide a block sits.
 *
 * Four values rather than a number, on purpose. A free width is a layout
 * engine, a layout engine is a rendering engine, and a rendering engine is the
 * thing a template must not carry. Four is enough for any dashboard anybody
 * has ever wanted and it reflows on a phone without anybody thinking about it.
 */
export type Width = 'full' | 'half' | 'third' | 'quarter';

export const WIDTHS: { width: Width; called: string }[] = [
	{ width: 'full', called: 'The whole row' },
	{ width: 'half', called: 'Half' },
	{ width: 'third', called: 'A third' },
	{ width: 'quarter', called: 'A quarter' }
];

const WIDTH_SET = new Set<string>(WIDTHS.map((w) => w.width));

/* Settings every block has, whatever kind it is. */
const COMMON = (): QuestionSet['questions'] => [
	{
		id: 'q:block/width',
		answer: 'choice',
		asks: { 'en-GB': 'How wide?' },
		choices: WIDTHS.map((w) => ({ id: w.width, label: { 'en-GB': w.called } })),
		optional: true
	},
	{
		id: 'q:block/heading',
		answer: 'text',
		asks: { 'en-GB': 'A heading above it?' },
		optional: true
	},
	/* Every block gets the same look-and-feel choices, from closed scales.
	 * Declared here rather than per kind so a new block kind is customisable
	 * the moment it exists. */
	...styleQuestions()
];

const setOf = (kind: BlockKind, questions: QuestionSet['questions']): QuestionSet => ({
	schema: QUESTION_SET_SCHEMA,
	id: `q/block-${kind}`,
	title: { 'en-GB': BLOCKS.find((b) => b.kind === kind)?.called ?? kind },
	questions: [...questions, ...COMMON()]
});

/**
 * What can be changed about each kind, asked as questions.
 *
 * Declared rather than hand-written into a settings panel, so the panel is
 * GENERATED — by the same renderer that draws every other question set in Q.
 * A federation adding a block adds a question set and nothing else, and every
 * block ever made is customisable the moment it exists rather than when
 * somebody remembers to build its form.
 */
export const SETTINGS: Record<BlockKind, QuestionSet> = {
	heading: setOf('heading', [
		{ id: 'q:block/says', answer: 'text', asks: { 'en-GB': 'What should it say?' } },
		/* Where it sits in the outline, for articles that go deeper than three
		 * sizes. 2 to 6: the page's own title is the only 1. */
		{ id: 'q:block/level', answer: 'number', asks: { 'en-GB': 'Heading level (2–6)?' }, optional: true },
		{
			id: 'q:block/size',
			answer: 'choice',
			asks: { 'en-GB': 'How big?' },
			choices: [
				{ id: 'large', label: { 'en-GB': 'Large' } },
				{ id: 'medium', label: { 'en-GB': 'Medium' } },
				{ id: 'small', label: { 'en-GB': 'Small' } }
			],
			optional: true
		}
	]),
	text: setOf('text', [{ id: 'q:block/says', answer: 'longtext', asks: { 'en-GB': 'What should it say?' } }]),
	answers: setOf('answers', [
		{ id: 'q:block/shows', answer: 'questions', asks: { 'en-GB': 'Which questions?' } },
		{ id: 'q:block/labels', answer: 'boolean', asks: { 'en-GB': 'Show the questions as well as the answers?' }, optional: true }
	]),
	card: setOf('card', [{ id: 'q:block/card', answer: 'text', asks: { 'en-GB': 'Which card?' } }]),
	places: setOf('places', [
		{ id: 'q:block/safety', answer: 'boolean', asks: { 'en-GB': 'Show how safe things are?' }, optional: true }
	]),
	receipts: setOf('receipts', [
		{ id: 'q:block/how-many', answer: 'number', asks: { 'en-GB': 'How many to show?' }, optional: true }
	]),
	contacts: setOf('contacts', []),
	federations: setOf('federations', []),
	image: setOf('image', [{ id: 'q:block/at', answer: 'text', asks: { 'en-GB': 'Which picture?' } }]),
	table: setOf('table', [
		{ id: 'q:block/shows', answer: 'questions', asks: { 'en-GB': 'Which columns?' } },
		{ id: 'q:block/rows', answer: 'choice', asks: { 'en-GB': 'What goes in the rows?' },
			choices: [
				{ id: 'answers', label: { 'en-GB': 'Your answers' } },
				{ id: 'receipts', label: { 'en-GB': 'Receipts' } },
				{ id: 'places', label: { 'en-GB': 'Places' } },
				{ id: 'contacts', label: { 'en-GB': 'People' } }
			],
			optional: true },
		{ id: 'q:block/how-many', answer: 'number', asks: { 'en-GB': 'How many rows at most?' }, optional: true }
	]),
	hero: setOf('hero', [
		{ id: 'q:block/says', answer: 'text', asks: { 'en-GB': 'The big line' } },
		{ id: 'q:block/under', answer: 'longtext', asks: { 'en-GB': 'And underneath it?' }, optional: true },
		{ id: 'q:block/at', answer: 'text', asks: { 'en-GB': 'A picture behind it?' }, optional: true },
		{ id: 'q:block/card', answer: 'text', asks: { 'en-GB': 'A card to hand over?' }, optional: true }
	]),
	blog: setOf('blog', [
		{ id: 'q:block/how-many', answer: 'number', asks: { 'en-GB': 'How many posts?' }, optional: true },
		{ id: 'q:block/labels', answer: 'boolean', asks: { 'en-GB': 'Show the opening lines?' }, optional: true }
	]),
	/*
	 * Furniture settings are toggles about which PARTS show. Never about what
	 * they point at — a header that could be told where sign-in goes would be
	 * Q's own chrome aimed at somebody else's target, which is the whole thing
	 * the no-behaviour rule exists to stop.
	 */
	header: setOf('header', [
		{ id: 'q:block/sign-in', answer: 'boolean', asks: { 'en-GB': 'Show signing in?' }, optional: true },
		{ id: 'q:block/search', answer: 'boolean', asks: { 'en-GB': 'Show search?' }, optional: true },
		{ id: 'q:block/reading', answer: 'boolean', asks: { 'en-GB': 'Show the reading and contrast controls?' }, optional: true }
	]),
	menu: setOf('menu', [
		{ id: 'q:block/open', answer: 'boolean', asks: { 'en-GB': 'Start open?' }, optional: true }
	]),
	drawer: setOf('drawer', [
		{ id: 'q:block/says', answer: 'text', asks: { 'en-GB': 'What is it called when it is shut?' } },
		{ id: 'q:block/open', answer: 'boolean', asks: { 'en-GB': 'Start open?' }, optional: true }
	]),
	section: setOf('section', [
		{
			id: 'q:block/arrange',
			answer: 'choice',
			asks: { 'en-GB': 'How are the things in it laid out?' },
			choices: [
				{ id: 'grid', label: { 'en-GB': 'Side by side, by their widths' } },
				{ id: 'aside', label: { 'en-GB': 'A picture, with the words beside it' } },
				{ id: 'profile', label: { 'en-GB': 'A portrait, with a whole section beside it' } },
				{ id: 'gallery', label: { 'en-GB': 'A gallery — pictures in rows' } },
				{ id: 'disclosure', label: { 'en-GB': 'Folded away — open to read (an accordion)' } },
				{ id: 'columns', label: { 'en-GB': 'Columns' } }
			],
			optional: true
		},
		{ id: 'q:block/says', answer: 'text', asks: { 'en-GB': 'What it says when folded (accordions)' }, optional: true },
		{
			id: 'q:block/columns',
			answer: 'choice',
			asks: { 'en-GB': 'How many columns?' },
			choices: [
				{ id: '2', label: { 'en-GB': 'Two' } },
				{ id: '3', label: { 'en-GB': 'Three' } }
			],
			optional: true
		}
	]),
	cover: setOf('cover', [
		{ id: 'q:block/says', answer: 'text', asks: { 'en-GB': 'The title' } },
		{ id: 'q:block/under', answer: 'text', asks: { 'en-GB': 'A line under it?' }, optional: true },
		{ id: 'q:block/at', answer: 'text', asks: { 'en-GB': 'The picture' }, optional: true },
		{ id: 'q:block/alt', answer: 'longtext', asks: { 'en-GB': 'What is in the picture?' }, optional: true }
	]),
	facts: setOf('facts', [
		{ id: 'q:block/facts', answer: 'longtext', asks: { 'en-GB': 'One per line — “Role: Production Management”' } }
	]),
	standfirst: setOf('standfirst', [
		{ id: 'q:block/says', answer: 'longtext', asks: { 'en-GB': 'What was done, in one line' } },
		{ id: 'q:block/at', answer: 'text', asks: { 'en-GB': 'A partner’s mark?' }, optional: true },
		{ id: 'q:block/alt', answer: 'longtext', asks: { 'en-GB': 'What does the mark show?' }, optional: true }
	]),
	figure: setOf('figure', [
		{ id: 'q:block/at', answer: 'text', asks: { 'en-GB': 'Which picture?' } },
		{ id: 'q:block/alt', answer: 'longtext', asks: { 'en-GB': 'What is in it, for somebody who cannot see it?' } },
		{ id: 'q:block/caption', answer: 'text', asks: { 'en-GB': 'A caption or credit?' }, optional: true }
	]),
	embed: setOf('embed', [
		{
			id: 'q:block/provider',
			answer: 'choice',
			asks: { 'en-GB': 'From where?' },
			choices: [
				{ id: 'youtube', label: { 'en-GB': 'YouTube' } },
				{ id: 'vimeo', label: { 'en-GB': 'Vimeo' } },
				{ id: 'dailymotion', label: { 'en-GB': 'Dailymotion' } },
				{ id: 'soundcloud', label: { 'en-GB': 'SoundCloud' } }
			]
		},
		{ id: 'q:block/media', answer: 'text', asks: { 'en-GB': 'Its id there' } },
		{ id: 'q:block/says', answer: 'text', asks: { 'en-GB': 'What it is called' }, optional: true },
		{ id: 'q:block/caption', answer: 'text', asks: { 'en-GB': 'Who made it?' }, optional: true },
		{
			id: 'q:block/size',
			answer: 'choice',
			asks: { 'en-GB': 'In the words, or the film at the end?' },
			choices: [
				{ id: 'inline', label: { 'en-GB': 'In the words' } },
				{ id: 'feature', label: { 'en-GB': 'The film at the end' } }
			],
			optional: true
		}
	]),
	quote: setOf('quote', [{ id: 'q:block/says', answer: 'longtext', asks: { 'en-GB': 'The words' } }]),
	note: setOf('note', [{ id: 'q:block/says', answer: 'longtext', asks: { 'en-GB': 'The note' } }]),
	divider: setOf('divider', []),
	button: setOf('button', [
		{ id: 'q:block/says', answer: 'text', asks: { 'en-GB': 'What it says' } },
		/* `to`, not `href`: a block never names a behaviour field (BEHAVIOUR_FIELDS).
		 * Where it goes is checked like any link in words — see inline.ts. */
		{ id: 'q:block/to', answer: 'text', asks: { 'en-GB': 'Where it goes — a page on the site (/our-work) or a whole address' } }
	]),
	component: setOf('component', [
		{
			id: 'q:block/component',
			answer: 'choice',
			asks: { 'en-GB': 'Which component?' },
			choices: CORE_COMPONENTS.map((m) => ({ id: pin(m), label: { 'en-GB': `${m.called} (${m.version})` } }))
		}
	]),
	space: setOf('space', [
		{
			id: 'q:block/size',
			answer: 'choice',
			asks: { 'en-GB': 'How much of a gap?' },
			choices: [
				{ id: 'small', label: { 'en-GB': 'A little' } },
				{ id: 'large', label: { 'en-GB': 'A lot' } }
			],
			optional: true
		}
	])
};

/* Moved to behaviour.ts so components.ts can use it too; re-exported so nothing changes. */
export { BEHAVIOUR_FIELDS };

export interface BlockCheck {
	ok: boolean;
	/** One line, in the words a person would use. Shown, not paraphrased. */
	says: string;
	/** Fields that were present and must not have been. */
	refused: string[];
}

const KINDS = new Set<string>(BLOCKS.map((b) => b.kind));

/**
 * `library` is the components this page may use: Q's own, plus any a
 * federation has approved. Defaults to Q's own.
 */
export function checkBlock(block: Record<string, unknown>, library: ComponentManifest[] = CORE_COMPONENTS): BlockCheck {
	const refused = Object.keys(block).filter((k) => BEHAVIOUR_FIELDS.includes(k.toLowerCase()));
	if (refused.length) {
		return {
			ok: false,
			says: 'A template says what to show. It cannot say what to do, or where to fetch from — it lands in somebody else’s folder and runs against their own things.',
			refused
		};
	}
	if (typeof block.kind !== 'string' || !KINDS.has(block.kind)) {
		return {
			ok: false,
			says: `There is no such block as “${String(block.kind)}”. A page naming one nothing draws would show less than it meant to, and say nothing about it.`,
			refused: []
		};
	}
	if (typeof block.id !== 'string' || !block.id.trim()) {
		return { ok: false, says: 'Every block needs a name of its own, so moving one is a move and not a rewrite.', refused: [] };
	}

	const kind = block.kind as BlockKind;
	if ((kind === 'heading' || kind === 'text') && !said(block)) {
		return { ok: false, says: 'There is nothing written in this one.', refused: [] };
	}
	if (kind === 'card' && typeof fieldOf(block, 'card') !== 'string') {
		return { ok: false, says: 'Which card should this show?', refused: [] };
	}
	if (kind === 'hero' && !said(block)) {
		return { ok: false, says: 'A hero needs its big line.', refused: [] };
	}
	if (kind === 'drawer' && !said(block)) {
		return { ok: false, says: 'A drawer needs a name, or nobody knows what is in it before opening it.', refused: [] };
	}
	if (kind === 'answers' || kind === 'table') {
		const shows = fieldOf(block, 'shows');
		if (!Array.isArray(shows) || !shows.length || shows.some((s) => typeof s !== 'string')) {
			return {
				ok: false,
				says: kind === 'table' ? 'Which columns should this show?' : 'Which questions should this show?',
				refused: []
			};
		}
	}
	if (block.children !== undefined) {
		if (!Array.isArray(block.children)) {
			return { ok: false, says: 'What is inside this is not a list of blocks.', refused: [] };
		}
		if (!holdsOthers(kind)) {
			return {
				ok: false,
				says: `A ${BLOCKS.find((b) => b.kind === kind)?.called ?? kind} cannot hold other blocks. Put them in a group.`,
				refused: []
			};
		}
	}
	if (block.width !== undefined && !WIDTH_SET.has(String(block.width))) {
		return { ok: false, says: `There is no width called “${String(block.width)}”.`, refused: [] };
	}
	if ((kind === 'cover' || kind === 'standfirst' || kind === 'quote' || kind === 'note') && !said(block)) {
		return {
			ok: false,
			says: kind === 'cover' ? 'A cover needs its title.' : 'There is nothing written in this one.',
			refused: []
		};
	}
	if (kind === 'figure') {
		if (!looksLikeContent(fieldOf(block, 'at'))) {
			return { ok: false, says: 'A figure needs a picture you hold.', refused: [] };
		}
		const alt = fieldOf(block, 'alt');
		if (typeof alt !== 'string' || !alt.trim()) {
			return {
				ok: false,
				says: 'Say what is in the picture. Somebody who cannot see it is reading this page too.',
				refused: []
			};
		}
	}
	if ((kind === 'cover' || kind === 'standfirst') && fieldOf(block, 'at') !== undefined && !looksLikeContent(fieldOf(block, 'at'))) {
		return {
			ok: false,
			says: 'A picture has to be one you hold. A link to somewhere else tells whoever hosts it every time this page is opened.',
			refused: []
		};
	}
	if (kind === 'facts') {
		const facts = factsOf(block);
		if (!facts.length) return { ok: false, says: 'Write at least one fact, as “Label: what it is”.', refused: [] };
	}
	if (kind === 'embed') {
		const provider = fieldOf(block, 'provider');
		const media = fieldOf(block, 'media');
		if (!(PROVIDERS as readonly unknown[]).includes(provider)) {
			return { ok: false, says: 'Films and recordings come from YouTube, Vimeo, Dailymotion or SoundCloud.', refused: [] };
		}
		/* An id, never a link: the site's renderer builds the address, so a page
		 * cannot aim an embed at anywhere else. */
		if (
			typeof media !== 'string' ||
			!/^[A-Za-z0-9_.\-]+(\/[A-Za-z0-9_.\-]+)*$/.test(media) ||
			media.split('/').some((p) => p === '.' || p === '..')
		) {
			return { ok: false, says: 'Give the id it has there, not a link to it.', refused: [] };
		}
	}
	if (kind === 'button') {
		if (!said(block)) return { ok: false, says: 'A button needs words on it.', refused: [] };
		const to = fieldOf(block, 'to');
		/* The same rule as a link in a sentence: somewhere a person chooses to
		 * go, never something that runs. */
		if (typeof to !== 'string' || !/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(to.trim()))
			return { ok: false, says: 'Where does it go? A page on the site (starting with /) or a whole address (https://…).', refused: [] };
	}
	if (kind === 'section') {
		const cols = fieldOf(block, 'columns');
		if (cols !== undefined && cols !== '2' && cols !== '3') return { ok: false, says: 'Two or three columns.', refused: [] };
		const arrange = fieldOf(block, 'arrange');
		if (arrange !== undefined && !(ARRANGEMENTS as readonly unknown[]).includes(arrange)) {
			return { ok: false, says: `There is no layout called “${String(arrange)}”.`, refused: [] };
		}
	}
	if (kind === 'component') {
		const named = fieldOf(block, 'component');
		const m = findComponent(named, library);
		if (!m) {
			return {
				ok: false,
				says: typeof named === 'string' && named
					? `There is no component “${named}” in this library. A component is named with its exact version, like “q:sign-in@1.0.0”.`
					: 'Which component should this be?',
				refused: []
			};
		}
		if (m.tier === 'draft') {
			return { ok: false, says: `${m.called} is still a draft. It can be previewed, not put on a page.`, refused: [] };
		}
		const settings = (block.settings ?? {}) as Record<string, unknown>;
		const wrongs = checkComponentSettings(m, settings);
		if (wrongs.length) return { ok: false, says: wrongs[0], refused: [] };
	}
	if (kind === 'image' && !looksLikeContent(fieldOf(block, 'at'))) {
		return {
			ok: false,
			says: 'A picture has to be one you hold. A link to somewhere else tells whoever hosts it every time this page is opened.',
			refused: []
		};
	}
	return { ok: true, says: '', refused: [] };
}

/**
 * A block's value for one field, wherever it was put.
 *
 * TWO SPELLINGS, ONE READER. A block can carry `says` directly or as
 * `settings['q:block/says']` — the first is how code builds one, the second is
 * what the settings panel writes, because the panel is generated from a
 * question set and answers are keyed by question id.
 *
 * Both are allowed. What is not allowed is each caller choosing. checkBlock
 * read only the direct spelling while the builder wrote only the settings one,
 * so every heading, every paragraph and every answers block made in the
 * builder failed to publish — with a message about nothing being written in a
 * block that plainly had words in it. Found by Darren on 2026-09-20, after 302
 * tests had passed, because every one of those tests used the shape code
 * builds and none used the shape the builder builds.
 *
 * So: one function, used by checkBlock, readsOf and publish alike.
 */
export function fieldOf(block: Record<string, unknown>, field: string): unknown {
	const direct = block[field];
	if (direct !== undefined && direct !== null && direct !== '') return direct;
	const settings = (block.settings ?? {}) as Record<string, unknown>;
	return settings[`q:block/${field}`];
}

/**
 * A facts block's facts, in order. Written one per line as “Label: value”,
 * because that is how a person would write them down, and it reads the same
 * in the source as on the page.
 */
export function factsOf(block: Record<string, unknown>): { label: string; value: string }[] {
	const raw = fieldOf(block, 'facts');
	const lines = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/\r?\n/) : [];
	return lines
		.map((l) => {
			const at = l.indexOf(':');
			return at > 0 ? { label: l.slice(0, at).trim(), value: l.slice(at + 1).trim() } : null;
		})
		.filter((f): f is { label: string; value: string } => !!f && !!f.label && !!f.value);
}

/** Whether a block has words on it, wherever they were set. */
function said(block: Record<string, unknown>): boolean {
	const v = fieldOf(block, 'says');
	return typeof v === 'string' && !!v.trim();
}

/** `content://sha256/<hex>` — something in the folder, not something on the web. */
export function looksLikeContent(at: unknown): boolean {
	return typeof at === 'string' && /^content:\/\/sha256\/[0-9a-f]{64}$/.test(at);
}

export interface TemplateCheck {
	ok: boolean;
	says: string;
	/** Which block, and what was wrong with it. Indexed from 1, for a person. */
	wrong: { at: number; says: string; refused: string[] }[];
}

/**
 * Whether a whole page can be handed to somebody.
 *
 * Reports every block that is wrong rather than the first, because an author
 * fixing a template one refusal at a time will stop before the end.
 */
export function checkTemplate(blocks: Record<string, unknown>[], library: ComponentManifest[] = CORE_COMPONENTS): TemplateCheck {
	if (!Array.isArray(blocks) || !blocks.length) {
		return { ok: false, says: 'There is nothing on this page.', wrong: [] };
	}

	const wrong: { at: number; says: string; refused: string[] }[] = [];
	const ids: string[] = [];
	let counted = 0;

	/* Walked rather than mapped, so a block buried three deep is checked as
	 * hard as one at the top. Numbering runs through the whole tree in the
	 * order somebody reads it. */
	const walk = (list: Record<string, unknown>[], depth: number) => {
		for (const b of list) {
			counted += 1;
			const at = counted;
			if (depth > DEEPEST) {
				wrong.push({
					at,
					says: `This is buried more than ${DEEPEST} groups deep. Past that, what you want is another page.`,
					refused: []
				});
				continue;
			}
			const r = checkBlock(b, library);
			if (!r.ok) wrong.push({ at, says: r.says, refused: r.refused });
			if (typeof b.id === 'string') ids.push(b.id);
			if (Array.isArray(b.children)) walk(b.children as Record<string, unknown>[], depth + 1);
		}
	};
	walk(blocks, 1);

	/* Names are unique across the WHOLE page, not within a group. Two blocks
	 * called the same thing in different groups would make move() ambiguous and
	 * a reorder would pick whichever it found first. */
	if (new Set(ids).size !== ids.length) {
		wrong.push({ at: 0, says: 'Two blocks share a name, so moving one would move both.', refused: [] });
	}

	if (wrong.length) {
		return { ok: false, says: `${wrong.length} ${wrong.length === 1 ? 'block needs' : 'blocks need'} attention.`, wrong };
	}
	return { ok: true, says: 'This can be handed to anyone.', wrong: [] };
}

/**
 * Move a block, by id.
 *
 * Here rather than in a component because reordering is the one thing a
 * builder does, and a page whose order depends on which library is installed
 * is a page that changes when the library does. Whatever drags the blocks —
 * a mouse, a keyboard, a drag library — ends up calling this.
 */
export function move(blocks: Block[], id: string, to: number): Block[] {
	const from = blocks.findIndex((b) => b.id === id);
	if (from >= 0) {
		const at = Math.max(0, Math.min(blocks.length - 1, to));
		if (at === from) return blocks;
		const out = [...blocks];
		const [moved] = out.splice(from, 1);
		out.splice(at, 0, moved);
		return out;
	}
	/* Not at this level — look inside the groups. A block is reordered among
	 * its own siblings, wherever it lives. */
	let changed = false;
	const out = blocks.map((b) => {
		if (changed || !b.children?.length) return b;
		const inner = move(b.children, id, to);
		if (inner === b.children) return b;
		changed = true;
		return { ...b, children: inner };
	});
	return changed ? out : blocks;
}

/** Take a block out of wherever it is. Returns what was taken and what is left. */
function lift(blocks: Block[], id: string): { taken: Block | null; rest: Block[] } {
	const at = blocks.findIndex((b) => b.id === id);
	if (at >= 0) {
		const rest = [...blocks];
		const [taken] = rest.splice(at, 1);
		return { taken, rest };
	}
	let taken: Block | null = null;
	const rest = blocks.map((b) => {
		if (taken || !b.children?.length) return b;
		const inner = lift(b.children, id);
		if (!inner.taken) return b;
		taken = inner.taken;
		return { ...b, children: inner.rest };
	});
	return { taken, rest };
}

function putInto(blocks: Block[], into: string | null, block: Block, at: number): Block[] {
	if (into === null) {
		const out = [...blocks];
		out.splice(Math.max(0, Math.min(out.length, at)), 0, block);
		return out;
	}
	return blocks.map((b) => {
		if (b.id === into) {
			const kids = [...(b.children ?? [])];
			kids.splice(Math.max(0, Math.min(kids.length, at)), 0, block);
			return { ...b, children: kids };
		}
		return b.children?.length ? { ...b, children: putInto(b.children, into, block, at) } : b;
	});
}

/**
 * Move a block into a different group — what dragging actually does.
 *
 * Refuses to put a group inside itself or inside its own child, because that
 * is how a tree becomes a loop and a renderer becomes a hung tab. `move` above
 * reorders among siblings; this one changes who the siblings are.
 */
export function reparent(blocks: Block[], id: string, into: string | null, at = 0): Block[] {
	if (id === into) return blocks;
	const { taken, rest } = lift(blocks, id);
	if (!taken) return blocks;
	if (into !== null && contains(taken, into)) return blocks;
	if (into !== null && !holdsInTree(rest, into)) return blocks;
	return putInto(rest, into, taken, at);
}

function contains(block: Block, id: string): boolean {
	return (block.children ?? []).some((c) => c.id === id || contains(c, id));
}

function holdsInTree(blocks: Block[], id: string): boolean {
	for (const b of blocks) {
		if (b.id === id) return holdsOthers(b.kind);
		if (b.children?.length && holdsInTree(b.children, id)) return true;
	}
	return false;
}

/* ------------------------------------------------------------------ *
 * Plugins — a block somebody else declared.
 *
 * Darren, 2026-09-20: "have little plugins pre-made that fit in, but
 * everything has a setting so everything can be customized."
 *
 * A plugin is DATA DESCRIBING WHAT TO SHOW, never code. It names a kind, says
 * which of Q's renderers draws it, declares its own settings as a question
 * set, and stops. Q's own renderers do the drawing, against the answers.
 *
 * WHY THIS IS NOT A LOOPHOLE IN THE CLOSED VOCABULARY. The vocabulary of what
 * a block can DO stays shut — a plugin picks one of the ten `draws` and cannot
 * introduce an eleventh. What it opens is naming, settings and arrangement,
 * which is where the imagination actually lives. A federation can ship
 * "Evidence for this course" without shipping a line of anything that runs.
 *
 * THE TEST THAT MATTERS: a plugin that carries behaviour is refused exactly
 * like a block that does, and a plugin claiming a renderer that does not exist
 * is refused rather than silently drawing nothing.
 * ------------------------------------------------------------------ */

export interface Plugin {
	/** `dostudy:evidence` — who it is from, and what it is. */
	id: string;
	/** What it is called on a palette. */
	called: string;
	/** One line, so somebody choosing knows what they are getting. */
	does: string;
	/** Which of Q's renderers draws it. One of the ten, never a new one. */
	draws: BlockKind;
	/** Who declared it. A DID. */
	by: string;
	/** Its own settings, asked as questions like everything else. */
	settings: QuestionSet;
}

export interface PluginCheck {
	ok: boolean;
	says: string;
	refused: string[];
}

export function checkPlugin(plugin: Record<string, unknown>): PluginCheck {
	const refused = Object.keys(plugin).filter((k) => BEHAVIOUR_FIELDS.includes(k.toLowerCase()));
	if (refused.length) {
		return {
			ok: false,
			says: 'A plugin says what to show and what can be changed about it. Anything that runs would run on somebody else’s things.',
			refused
		};
	}
	if (typeof plugin.draws !== 'string' || !KINDS.has(plugin.draws)) {
		return {
			ok: false,
			says: `This wants to be drawn by “${String(plugin.draws)}”, and there is nothing that draws that.`,
			refused: []
		};
	}
	for (const field of ['id', 'called', 'does', 'by'] as const) {
		if (typeof plugin[field] !== 'string' || !(plugin[field] as string).trim()) {
			return { ok: false, says: `A plugin has to say its ${field === 'by' ? 'author' : field}.`, refused: [] };
		}
	}
	const settings = plugin.settings as QuestionSet | undefined;
	if (!settings || settings.schema !== QUESTION_SET_SCHEMA || !Array.isArray(settings.questions)) {
		return { ok: false, says: 'A plugin declares what can be changed about it, as questions.', refused: [] };
	}
	/* Questions are data, but a question is where somebody would try to smuggle
	 * a link. Check each one the way a block is checked. */
	for (const q of settings.questions as unknown as Record<string, unknown>[]) {
		const bad = Object.keys(q).filter((k) => BEHAVIOUR_FIELDS.includes(k.toLowerCase()));
		if (bad.length) {
			return { ok: false, says: 'One of its settings carries something that runs.', refused: bad };
		}
	}
	return { ok: true, says: 'This can be offered to anyone.', refused: [] };
}

/**
 * The settings to ask for one block: its kind's, and — for a component — the
 * component's own questions after them. What a settings panel should draw.
 */
export function settingsFor(block: Pick<Block, 'kind' | 'settings' | 'component'>, library: ComponentManifest[] = CORE_COMPONENTS): QuestionSet {
	const base = SETTINGS[block.kind];
	if (block.kind !== 'component') return base;
	const m = findComponent(fieldOf(block as Record<string, unknown>, 'component'), library);
	return m ? { ...base, questions: [...base.questions.slice(0, 1), ...m.settings.questions, ...base.questions.slice(1)] } : base;
}
