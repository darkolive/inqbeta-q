/*
 * One moment of a story deck (4 October 2026). A deck's pictures are drawn
 * from this alone, so the same snippet draws the moving picture, each slide's
 * still, and any moment the slider is dragged to.
 */
export interface Frame {
	/** The scene, from 1. */
	scene: number;
	/** How far through this scene's movement, 0 to 1 (eased). */
	p: number;
	/** The opacity class for something shown from scene a to scene b. */
	on: (a: number, b?: number) => string;
	/** The transition class to put beside `on`. */
	fade: string;
	/** Scene a's movement: 0 before it, 0→1 during it, 1 after. */
	at: (a: number) => number;
	/** True for a slide's still: draw the scene as it ends. */
	still: boolean;
}

export interface DeckScene {
	title: string;
	says: string;
}

/** From a to b, t of the way (0 to 1). */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
/** Along a path of points, t of the way. */
export function along(points: [number, number][], t: number): [number, number] {
	if (points.length < 2) return points[0] ?? [0, 0];
	const k = Math.min(1, Math.max(0, t)) * (points.length - 1);
	const i = Math.min(points.length - 2, Math.floor(k));
	const f = k - i;
	return [lerp(points[i][0], points[i + 1][0], f), lerp(points[i][1], points[i + 1][1], f)];
}
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const fade = 'transition-opacity duration-500 motion-reduce:transition-none';

/** The frame at time t (seconds), for scenes of `seconds` each, of which the first 70% moves. */
export function frameAt(t: number, scenes: number, seconds: number, moves = true): Frame {
	const scene = Math.min(scenes, Math.floor(t / seconds) + 1);
	const into = t - (scene - 1) * seconds;
	const p = moves ? ease(Math.min(1, Math.max(0, into / (seconds * 0.7)))) : 1;
	return {
		scene,
		p,
		on: (a, b = scenes) => (scene >= a && scene <= b ? 'opacity-100' : 'opacity-0'),
		fade,
		at: (a) => (scene < a ? 0 : scene > a ? 1 : p),
		still: false
	};
}

/** A slide's still: scene n as it ends. */
export function stillOf(n: number, scenes: number): Frame {
	return {
		scene: n,
		p: 1,
		on: (a, b = scenes) => (n >= a && n <= b ? 'opacity-100' : 'opacity-0'),
		fade: '',
		at: (a) => (n < a ? 0 : 1),
		still: true
	};
}
