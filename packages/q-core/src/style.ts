/*
 * How a block looks — as a closed set of tokens, never as CSS.
 *
 * Darren, 2026-09-20, pointing at Elementor and Tailwind: get the builder
 * towards that.
 *
 * WHAT ELEMENTOR GIVES, AND WHICH HALF WE CAN HAVE. Its structure — sections,
 * columns, widgets, per-element controls, a template library — is exactly the
 * shape of this. Its STYLE panel is the half that cannot come, and the reason
 * is not taste.
 *
 *   ARBITRARY CSS IS BEHAVIOUR. It does not look like code and it does things.
 *
 *   background: url(…)   a beacon. Tells its host every time the page is
 *                        opened, from where, how often — the same thing an
 *                        <img> URL does, and blocks.ts already refuses that.
 *   position / z-index   can cover, hide and reposition. A page that can
 *                        overlay its own controls can be made to say one thing
 *                        and do another.
 *   attribute selectors  + url() have been used to read values out of a page.
 *   any literal colour   breaks light and dark silently. roles.css takes care
 *                        to pair every token so "light and dark follow without
 *                        a dark: anywhere" — one #3a7bd5 in a template and that
 *                        is gone, on somebody else's screen, in a mode the
 *                        author never looked at.
 *
 * WHICH IS WHERE TAILWIND'S ACTUAL IDEA COMES IN, and it is not the utility
 * classes. It is the CONSTRAINED SCALE: spacing is 1, 2, 4, 8 — never 13px. A
 * closed scale is what makes a thousand people's pages look like one system
 * instead of a thousand accidents.
 *
 * So a block carries TOKENS from closed scales, and this file maps them to
 * classes written out in full. It gives most of what a style panel is for —
 * padding, gaps, alignment, emphasis, edges, framing — with no arbitrary
 * values, no beacons, and light and dark still following on their own.
 *
 * AND roles.css HOLDS A LINE WORTH KEEPING: a role says what a thing IS, never
 * how big. So there is no font-size token here. Emphasis is chosen from the
 * type roles Q already has, which is why a heading block asks for large /
 * medium / small rather than for 32px.
 *
 * WHERE THE CLASSES LIVE, AND WHY NOT HERE. Tailwind finds the classes it must
 * generate by reading SOURCE TEXT, and app.css points it at apps/q and
 * packages/q-ui — not at this package. A class table in q-core would silently
 * never be generated: a page that looks right in dev and collapses in a build.
 *
 * So the tokens and the rule live here, and the classes live in q-ui beside
 * roles.ts, where presentation belongs and where Tailwind reads. style.test.ts
 * reaches across and asserts q-ui covers every token on every scale, so the two
 * cannot drift apart without a test going red.
 *
 * Pure. No DOM.
 */

export type Pad = 'none' | 'tight' | 'normal' | 'loose';
export type Spacing = 'none' | 'tight' | 'normal' | 'loose';
export type Align = 'start' | 'centre' | 'end';
export type Tone = 'plain' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';
export type Edge = 'square' | 'soft' | 'round';
export type Frame = 'none' | 'outline' | 'filled';

export interface Style {
	pad?: Pad;
	gap?: Spacing;
	align?: Align;
	tone?: Tone;
	edge?: Edge;
	frame?: Frame;
}

export const SCALES = {
	pad: ['none', 'tight', 'normal', 'loose'] as Pad[],
	gap: ['none', 'tight', 'normal', 'loose'] as Spacing[],
	align: ['start', 'centre', 'end'] as Align[],
	tone: ['plain', 'primary', 'secondary', 'success', 'warning', 'error'] as Tone[],
	edge: ['square', 'soft', 'round'] as Edge[],
	frame: ['none', 'outline', 'filled'] as Frame[]
};

/** What each token is called where somebody chooses it. */
export const CALLED: Record<keyof typeof SCALES, Record<string, string>> = {
	pad: { none: 'None', tight: 'A little', normal: 'Normal', loose: 'Roomy' },
	gap: { none: 'None', tight: 'A little', normal: 'Normal', loose: 'Roomy' },
	align: { start: 'Left', centre: 'Centred', end: 'Right' },
	tone: {
		plain: 'Plain', primary: 'Main', secondary: 'Second', success: 'Good',
		warning: 'Needs attention', error: 'Bad'
	},
	edge: { square: 'Square', soft: 'Slightly rounded', round: 'Rounded' },
	frame: { none: 'No box', outline: 'Outlined', filled: 'Filled' }
};

/** Field names that mean somebody is trying to write CSS rather than choose a token. */
const RAW = [
	'css', 'style', 'colour', 'color', 'background', 'backgroundimage', 'font', 'fontsize',
	'width', 'height', 'margin', 'padding', 'position', 'zindex', 'transform', 'filter', 'shadow'
];

export interface StyleCheck {
	ok: boolean;
	says: string;
	refused: string[];
}

/**
 * Whether this is a style or a stylesheet.
 *
 * Refuses raw CSS by field name, and any token not on its scale — a made-up
 * value would fall through classesFor to nothing, which is a block that
 * silently ignores what its author asked for.
 */
export function checkStyle(style: Record<string, unknown>): StyleCheck {
	const refused = Object.keys(style).filter((k) => RAW.includes(k.toLowerCase()));
	if (refused.length) {
		return {
			ok: false,
			says: 'You choose from what Q has rather than writing your own. It is what keeps every page readable in dark mode, on a phone, and by somebody using a screen reader.',
			refused
		};
	}
	for (const [key, value] of Object.entries(style)) {
		const scale = SCALES[key as keyof typeof SCALES];
		if (!scale) return { ok: false, says: `There is no setting called “${key}”.`, refused: [] };
		if (!(scale as string[]).includes(String(value))) {
			return { ok: false, says: `“${String(value)}” is not one of the choices for ${key}.`, refused: [] };
		}
	}
	return { ok: true, says: '', refused: [] };
}

/** The style scales, asked as questions — so the panel is generated like every other. */
export function styleQuestions(): {
	id: string;
	answer: 'choice';
	asks: Record<string, string>;
	choices: { id: string; label: Record<string, string> }[];
	optional: true;
}[] {
	const ASKS: Record<keyof typeof SCALES, string> = {
		pad: 'How much room inside it?',
		gap: 'How much space between things?',
		align: 'Which way is it lined up?',
		tone: 'What colour does it lean on?',
		edge: 'How are its corners?',
		frame: 'Is it in a box?'
	};
	return (Object.keys(SCALES) as (keyof typeof SCALES)[]).map((key) => ({
		id: `q:style/${key}`,
		answer: 'choice' as const,
		asks: { 'en-GB': ASKS[key] },
		choices: (SCALES[key] as string[]).map((v) => ({ id: v, label: { 'en-GB': CALLED[key][v] } })),
		optional: true as const
	}));
}

/** Pull a Style out of a block's settings. Anything unrecognised is dropped, never guessed. */
export function styleOf(settings: Record<string, unknown> = {}): Style {
	const out: Record<string, string> = {};
	for (const key of Object.keys(SCALES) as (keyof typeof SCALES)[]) {
		const v = settings[`q:style/${key}`];
		if (typeof v === 'string' && (SCALES[key] as string[]).includes(v)) out[key] = v;
	}
	return out as Style;
}
