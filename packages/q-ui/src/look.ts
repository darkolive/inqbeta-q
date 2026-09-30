/*
 * Tokens → classes.
 *
 * The companion to q-core/style.ts, and it lives HERE for a mechanical reason:
 * Tailwind generates classes by reading source text, and app.css points it at
 * apps/q and packages/q-ui. A class table in q-core would never be generated —
 * a page that looks right in dev and collapses in a build.
 *
 * It also belongs here on principle. q-core holds the rule — which tokens
 * exist, and that anything else is refused. q-ui holds what they look like,
 * beside roles.ts, which does exactly the same job for type.
 *
 * EVERY CLASS IS WRITTEN OUT IN FULL. Nothing on this page may be assembled
 * from a variable, for the same reason.
 *
 * q-core's style.test.ts reaches across and asserts this file covers every
 * token on every scale, so the two cannot drift without a test going red.
 */

export interface Look {
	pad?: string;
	gap?: string;
	align?: string;
	tone?: string;
	edge?: string;
	frame?: string;
}

const PAD: Record<string, string> = { none: '', tight: 'p-2', normal: 'p-4', loose: 'p-8' };
const GAP: Record<string, string> = { none: 'gap-0', tight: 'gap-2', normal: 'gap-4', loose: 'gap-8' };
const ALIGN: Record<string, string> = { start: 'text-left', centre: 'text-center', end: 'text-right' };
const EDGE: Record<string, string> = { square: '', soft: 'rounded', round: 'rounded-2xl' };

/*
 * Tone and frame together, because Skeleton pairs the two: a "filled success"
 * is one token, not a colour plus a fill. Every one is a paired token, so light
 * and dark follow without a `dark:` anywhere — the promise roles.css makes.
 */
const FRAME: Record<string, Record<string, string>> = {
	none: {
		plain: '', primary: 'text-primary-700-300', secondary: 'text-secondary-700-300',
		success: 'text-success-700-300', warning: 'text-warning-700-300', error: 'text-error-700-300'
	},
	outline: {
		plain: 'preset-outlined-surface-200-800', primary: 'preset-outlined-primary-500',
		secondary: 'preset-outlined-secondary-500', success: 'preset-outlined-success-500',
		warning: 'preset-outlined-warning-500', error: 'preset-outlined-error-500'
	},
	filled: {
		plain: 'preset-tonal-surface', primary: 'preset-tonal-primary',
		secondary: 'preset-tonal-secondary', success: 'preset-tonal-success',
		warning: 'preset-tonal-warning', error: 'preset-tonal-error'
	}
};

/** Every token this file knows, so a test elsewhere can check none is missing. */
export const COVERS = {
	pad: Object.keys(PAD),
	gap: Object.keys(GAP),
	align: Object.keys(ALIGN),
	edge: Object.keys(EDGE),
	frame: Object.keys(FRAME),
	tone: Object.keys(FRAME.none)
};

/** The classes for a look. Deterministic and in a fixed order, so it is comparable. */
export function classesFor(look: Look = {}): string {
	const frame = look.frame ?? 'none';
	const tone = look.tone ?? 'plain';
	return [
		PAD[look.pad ?? (frame === 'none' ? 'none' : 'normal')] ?? '',
		GAP[look.gap ?? 'normal'] ?? '',
		ALIGN[look.align ?? 'start'] ?? '',
		EDGE[look.edge ?? (frame === 'none' ? 'square' : 'soft')] ?? '',
		FRAME[frame]?.[tone] ?? ''
	]
		.filter(Boolean)
		.join(' ');
}

/** Pull a Look out of a block's settings. Anything unrecognised is dropped, never guessed. */
export function lookOf(settings: Record<string, unknown> = {}): Look {
	const out: Look = {};
	for (const key of ['pad', 'gap', 'align', 'tone', 'edge', 'frame'] as const) {
		const v = settings[`q:style/${key}`];
		if (typeof v === 'string') out[key] = v;
	}
	return out;
}

/**
 * How wide a block sits, as grid classes.
 *
 * Four, written out in full, here rather than in each component — one
 * definition, and Tailwind reads this file. Every one reflows to the whole row
 * on a phone, which is why there is no separate "responsive" setting to get
 * wrong.
 */
export const WIDTH: Record<string, string> = {
	full: 'col-span-12',
	half: 'col-span-12 sm:col-span-6',
	third: 'col-span-12 sm:col-span-4',
	quarter: 'col-span-12 sm:col-span-6 lg:col-span-3'
};

/** The classes for a width, falling back to the whole row rather than to nothing. */
export function widthClass(width?: string): string {
	return WIDTH[width ?? 'full'] ?? WIDTH.full;
}
