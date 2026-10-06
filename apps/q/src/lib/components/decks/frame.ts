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
	/**
	 * Seconds into this scene, unhurried by easing (6 October 2026: a slide
	 * drawn by the polished build keeps its own clock, in step with the
	 * voice). Infinity for a still, or with less motion asked for: the end.
	 */
	into: number;
}

export interface DeckScene {
	title: string;
	says: string;
	/** How it's said, with ElevenLabs tags; the title and words when absent. */
	voice?: string;
}

/*
 * How long each scene lasts (4 October 2026: Darren, "timestamp it … each
 * step won't be equal if one has more text and one has more animation … it
 * becomes dynamic"). As long as the voice takes to say it, plus a breath, and
 * never less than the pictures need. With no recording yet, the length is
 * estimated from the words (about 14 characters a second, as the voice
 * build reckons).
 */
export const BREATH = 1.2;
export const LEAST = 4.5;
export const sayingTime = (s: DeckScene) => (s.title.length + s.says.length) / 14;
export function sceneTimes(scenes: DeckScene[], spoken: (number | null)[] = []): number[] {
	return scenes.map((s, i) => Math.round(Math.max(LEAST, (spoken[i] ?? sayingTime(s)) + BREATH) * 10) / 10);
}
/** When each scene starts, from its lengths. */
export const startsOf = (times: number[]) => times.reduce<number[]>((a, x, i) => [...a, i ? a[i - 1] + times[i - 1] : 0], []);

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

/**
 * The frame at time t (seconds), for scenes of the given lengths, the first
 * 70% of each moving (at most 4 seconds of movement, so a long telling holds
 * its finished picture while the words are said).
 */
export function frameAt(t: number, times: number[], moves = true): Frame {
	const scenes = times.length;
	const starts = startsOf(times);
	let scene = 1;
	while (scene < scenes && t >= starts[scene]) scene++;
	const into = t - starts[scene - 1];
	const movement = Math.min(4, times[scene - 1] * 0.7);
	const p = moves ? ease(Math.min(1, Math.max(0, into / movement))) : 1;
	return {
		scene,
		p,
		on: (a, b = scenes) => (scene >= a && scene <= b ? 'opacity-100' : 'opacity-0'),
		fade,
		at: (a) => (scene < a ? 0 : scene > a ? 1 : p),
		still: false,
		into: moves ? Math.max(0, into) : Infinity
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
		still: true,
		into: Infinity
	};
}
