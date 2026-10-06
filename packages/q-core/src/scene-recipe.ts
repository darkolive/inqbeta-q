/*
 * Scene recipes: how a made story moves (ADR-Q-033; 6 October 2026).
 *
 * Darren, on seeing his first real book play as stills: "what it's not doing
 * in the slideshow is giving animations … that's the sort of point of what
 * you want to pay for … a simple draft experience where you're just seeing
 * stills, but to really feel it … we want to see those moving parts and
 * charts moving."
 *
 * So a draft is stills, and "Bring it to life" asks the AI to choreograph
 * each slide: which picture pieces are on the stage, where, and what they do
 * over the slide's time. Q's player performs it, drawn in the browser with
 * the same pieces and the same timing as Q's own hand-made stories: no video
 * to render, nothing to wait for.
 *
 * A recipe is data, never code: a few actors (known pieces only), a few moves
 * from a small vocabulary, and at most one chart of shapes. `recipeOf` makes
 * anything that comes in fit that, and drops what doesn't. `stageAt` says
 * where everything is at any moment, so the same recipe draws the moving
 * picture, each slide's still (the end), and any point the slider is dragged
 * to.
 *
 * The stage is 100 wide and 100 high; the player draws it 640 by 300.
 *
 * Pure. No storage, no AI.
 */

export type Size = 'small' | 'medium' | 'large';
export type From = 'left' | 'right' | 'top' | 'bottom' | 'fade' | 'pop';

export interface Actor {
	/** A short name the moves use: "you", "them", "card". */
	id: string;
	/** A known picture piece (storybook PIECES). */
	piece: string;
	x: number;
	y: number;
	size: Size;
}

/*
 * The moves. `at` is when it starts, 0 to 1 through the slide; each takes
 * MOVE_TIME of the slide. Before its `enter`, an actor isn't there.
 */
export type Move =
	| { do: 'enter'; who: string; at: number; from?: From }
	| { do: 'leave'; who: string; at: number }
	/** Go to a new place. */
	| { do: 'move'; who: string; at: number; x: number; y: number }
	/** Travel from one actor to another (a card handed over). */
	| { do: 'pass'; who: string; from: string; to: string; at: number }
	/** A copy travels to another actor; the original stays (each keeps a copy). */
	| { do: 'copy'; who: string; to: string; at: number }
	/** A line draws itself between two actors (a connection, a share). */
	| { do: 'link'; a: string; b: string; at: number }
	/** A soft ring lights around it, and stays (this matters; it's working). */
	| { do: 'glow'; who: string; at: number }
	/** A little shake (no; wrong; refused). */
	| { do: 'shake'; who: string; at: number }
	/** It grows a little, and stays bigger (more; important). */
	| { do: 'grow'; who: string; at: number };
export type MoveKind = Move['do'];
export const MOVES: Record<MoveKind, string> = {
	enter: 'arrives (from the left, right, top, bottom, fading in, or popping up)',
	leave: 'fades away',
	move: 'goes to a new place (x, y)',
	pass: 'travels from one actor to another, like something handed over',
	copy: 'a copy travels to another actor while the original stays, like each keeping a copy',
	link: 'a line draws itself between two actors, like a connection or something shared',
	glow: 'a soft ring lights up around it and stays, like "this one" or "working"',
	shake: 'a small shake, like "no", "wrong" or "refused"',
	grow: 'grows a little and stays bigger, like "more" or "this matters"'
};

/** A chart of shapes, not figures: how things compare or change, drawn growing. */
export interface Chart {
	kind: 'bars' | 'line' | 'ring';
	/** Each 0 to 1: heights, points, or (for a ring) how full. At most CHART_MOST. */
	values: number[];
	x: number;
	y: number;
	at: number;
}

export interface Recipe {
	actors: Actor[];
	moves: Move[];
	chart?: Chart;
}

export const ACTORS_MOST = 6;
export const MOVES_MOST = 10;
export const CHART_MOST = 6;
/** How much of the slide each move takes. */
export const MOVE_TIME = 0.25;
export const CHART_TIME = 0.5;
export const SIZES: Record<Size, number> = { small: 64, medium: 104, large: 144 };

const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const idOf = (x: unknown) => (typeof x === 'string' ? x.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 16) : '');
const FROMS: From[] = ['left', 'right', 'top', 'bottom', 'fade', 'pop'];

/**
 * A recipe made safe: known pieces only, places on the stage, moves that name
 * actors that exist, at most one chart. Null when nothing is left to show.
 */
export function recipeOf(x: unknown, isPiece: (p: unknown) => boolean): Recipe | null {
	const r = (x ?? {}) as { actors?: unknown; moves?: unknown; chart?: unknown };
	const actors: Actor[] = [];
	for (const a of (Array.isArray(r.actors) ? r.actors : []) as Record<string, unknown>[]) {
		const id = idOf(a?.id);
		if (!id || !isPiece(a?.piece) || actors.some((b) => b.id === id)) continue;
		actors.push({ id, piece: a.piece as string, x: num(a.x, 8, 92, 50), y: num(a.y, 12, 88, 50), size: a.size === 'small' || a.size === 'large' ? a.size : 'medium' });
		if (actors.length >= ACTORS_MOST) break;
	}
	const has = (id: unknown) => actors.some((a) => a.id === idOf(id));
	const moves: Move[] = [];
	for (const m of (Array.isArray(r.moves) ? r.moves : []) as Record<string, unknown>[]) {
		const at = num(m?.at, 0, 1 - MOVE_TIME, 0);
		const who = idOf(m?.who);
		let move: Move | null = null;
		if (m?.do === 'enter' && has(who)) move = { do: 'enter', who, at, ...(FROMS.includes(m.from as From) ? { from: m.from as From } : {}) };
		else if (m?.do === 'leave' && has(who)) move = { do: 'leave', who, at };
		else if (m?.do === 'move' && has(who)) move = { do: 'move', who, at, x: num(m.x, 8, 92, 50), y: num(m.y, 12, 88, 50) };
		else if (m?.do === 'pass' && has(who) && has(m.from) && has(m.to) && idOf(m.from) !== idOf(m.to)) move = { do: 'pass', who, from: idOf(m.from), to: idOf(m.to), at };
		else if (m?.do === 'copy' && has(who) && has(m.to) && idOf(m.to) !== who) move = { do: 'copy', who, to: idOf(m.to), at };
		else if (m?.do === 'link' && has(m.a) && has(m.b) && idOf(m.a) !== idOf(m.b)) move = { do: 'link', a: idOf(m.a), b: idOf(m.b), at };
		else if ((m?.do === 'glow' || m?.do === 'shake' || m?.do === 'grow') && has(who)) move = { do: m.do, who, at };
		if (move) moves.push(move);
		if (moves.length >= MOVES_MOST) break;
	}
	moves.sort((a, b) => a.at - b.at);
	const c = r.chart as Record<string, unknown> | undefined;
	const values = (Array.isArray(c?.values) ? c.values : []).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).slice(0, CHART_MOST).map((v) => Math.min(1, Math.max(0, v)));
	const chart: Chart | undefined = c && (c.kind === 'bars' || c.kind === 'line' || c.kind === 'ring') && values.length ? { kind: c.kind, values: c.kind === 'ring' ? values.slice(0, 1) : values, x: num(c.x, 15, 85, 50), y: num(c.y, 20, 80, 50), at: num(c.at, 0, 1 - CHART_TIME, 0) } : undefined;
	if (!actors.length && !chart) return null;
	return { actors, moves, ...(chart ? { chart } : {}) };
}

/* ------------------------------------------------------------ the stage at a moment */

export interface ActorNow {
	id: string;
	piece: string;
	x: number;
	y: number;
	size: number;
	opacity: number;
	/** 0 to 1: the soft ring around it. */
	glow: number;
}
export interface Ghost {
	piece: string;
	x: number;
	y: number;
	size: number;
	opacity: number;
}
export interface LinkNow {
	ax: number;
	ay: number;
	bx: number;
	by: number;
	/** How much of the line is drawn, 0 to 1. */
	drawn: number;
}
export interface StageNow {
	actors: ActorNow[];
	/** Copies on their way, or arrived. */
	ghosts: Ghost[];
	links: LinkNow[];
	/** The chart, grown this far (0 to 1). */
	chart: (Chart & { grown: number }) | null;
}

/** Gentle in and out. */
export const ease = (q: number) => (q <= 0 ? 0 : q >= 1 ? 1 : q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2);
const local = (t: number, at: number) => Math.min(1, Math.max(0, (t - at) / MOVE_TIME));
const lerp = (a: number, b: number, q: number) => a + (b - a) * q;
const OFF: Record<From, [number, number]> = { left: [-30, 0], right: [30, 0], top: [0, -30], bottom: [0, 30], fade: [0, 0], pop: [0, 0] };

/**
 * Where everything is at moment `t` (0 to 1 through the slide). Moves apply in
 * order of when they start, each from where the last one left things.
 * `still` draws the end (a slide's still); with less motion asked for, the
 * player draws the end too.
 */
export function stageAt(r: Recipe, t: number): StageNow {
	const state = new Map<string, ActorNow>();
	const entering = new Set(r.moves.filter((m) => m.do === 'enter').map((m) => (m as { who: string }).who));
	for (const a of r.actors) state.set(a.id, { id: a.id, piece: a.piece, x: a.x, y: a.y, size: SIZES[a.size], opacity: entering.has(a.id) ? 0 : 1, glow: 0 });
	const ghosts: Ghost[] = [];
	const links: LinkNow[] = [];
	for (const m of r.moves) {
		const q = ease(local(t, m.at));
		if (m.do === 'link') {
			const a = state.get(m.a)!;
			const b = state.get(m.b)!;
			if (q > 0) links.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, drawn: q });
			continue;
		}
		const s = state.get(m.who)!;
		if (m.do === 'enter') {
			if (local(t, m.at) <= 0) continue;
			const [dx, dy] = OFF[m.from ?? 'fade'];
			s.opacity = q;
			s.x += dx * (1 - q);
			s.y += dy * (1 - q);
			if (m.from === 'pop') s.size *= 0.4 + 0.6 * q;
		} else if (m.do === 'leave') s.opacity *= 1 - q;
		else if (m.do === 'move') {
			s.x = lerp(s.x, m.x, q);
			s.y = lerp(s.y, m.y, q);
		} else if (m.do === 'pass') {
			if (local(t, m.at) <= 0) continue;
			const a = state.get(m.from)!;
			const b = state.get(m.to)!;
			/* It sets off beside the giver and ends beside the taker, a little above, so both stay seen. */
			s.x = lerp(a.x, b.x, q);
			s.y = lerp(a.y, b.y, q) - 14;
			s.opacity = Math.max(s.opacity, Math.min(1, q * 4));
		} else if (m.do === 'copy') {
			if (q <= 0) continue;
			const b = state.get(m.to)!;
			ghosts.push({ piece: s.piece, x: lerp(s.x, b.x, q), y: lerp(s.y, b.y, q) - 14 * q, size: s.size * 0.8, opacity: Math.min(1, q * 3) * s.opacity });
		} else if (m.do === 'glow') s.glow = Math.max(s.glow, q);
		else if (m.do === 'shake') s.x += Math.sin(local(t, m.at) * Math.PI * 6) * 3 * (1 - local(t, m.at));
		else if (m.do === 'grow') s.size *= 1 + 0.3 * q;
	}
	/* A line follows the actors it joins, wherever they've got to. */
	const joined = r.moves.filter((m): m is Extract<Move, { do: 'link' }> => m.do === 'link' && ease(local(t, m.at)) > 0);
	joined.forEach((m, i) => {
		const a = state.get(m.a)!;
		const b = state.get(m.b)!;
		Object.assign(links[i], { ax: a.x, ay: a.y, bx: b.x, by: b.y });
	});
	/* A chart takes twice as long as a move, so it can be watched growing. */
	const chart = r.chart ? { ...r.chart, grown: ease(Math.min(1, Math.max(0, (t - r.chart.at) / CHART_TIME))) } : null;
	return { actors: [...state.values()], ghosts, links, chart };
}

/* --------------------------------------------------------- practice (no AI, no cost) */

/*
 * A plain recipe from a slide's own piece and scene, so "Bring it to life"
 * can be tried for free: two of a kind face each other and something passes
 * between them; otherwise the piece arrives and glows. Never clever; enough
 * to see the stage work.
 */
export function practiceRecipe(piece: string | null, scene = ''): Recipe {
	const p = piece ?? 'image';
	const s = scene.toLowerCase();
	const two = /\b(two|both|each other|between|across from|side by side)\b/.test(s);
	if (two) {
		const who = /phone/.test(s) ? 'phone' : /laptop/.test(s) ? 'laptop' : 'person';
		const thing = p === who ? (/(document|receipt|card)/.test(s) ? 'card' : /(letter|envelope|message)/.test(s) ? 'envelope' : 'key') : p;
		return {
			actors: [
				{ id: 'one', piece: who, x: 22, y: 58, size: 'medium' },
				{ id: 'two', piece: who, x: 78, y: 58, size: 'medium' },
				{ id: 'thing', piece: thing, x: 22, y: 44, size: 'small' }
			],
			moves: [
				{ do: 'enter', who: 'one', at: 0, from: 'left' },
				{ do: 'enter', who: 'two', at: 0.1, from: 'right' },
				{ do: 'pass', who: 'thing', from: 'one', to: 'two', at: 0.35 },
				{ do: 'link', a: 'one', b: 'two', at: 0.6 },
				{ do: 'glow', who: 'two', at: 0.7 }
			]
		};
	}
	return { actors: [{ id: 'it', piece: p, x: 50, y: 50, size: 'large' }], moves: [{ do: 'enter', who: 'it', at: 0, from: 'pop' }, { do: 'glow', who: 'it', at: 0.5 }] };
}
