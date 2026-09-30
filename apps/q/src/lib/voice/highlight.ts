/*
 * Words lit as they are read — the same colour as a sign-in tile under the
 * pointer (preset-filled-secondary-50-950), so the page has one "this one"
 * colour. Each word fades in as it is said and fades out behind the voice,
 * which reads as the light moving along the line. With reduced motion there
 * is no fade: the word is simply lit.
 *
 * The page's text belongs to Svelte, which keeps hold of its text nodes to
 * update them (a language change, say). So a word is wrapped by swapping each
 * text node for spans and putting THE SAME NODE back afterwards — never a copy
 * — and nothing is wrapped until reading starts. The brand Q (QMark: a picture
 * and a hidden letter) is lit on the picture itself, since the letter is not
 * visible.
 */

import { hasCJK, splitRun, wordsOf } from './words.js';

/** Written out whole so Tailwind finds them in the source. */
const BASE = ['rounded-base', 'transition-colors', 'duration-300', 'motion-reduce:transition-none', 'box-decoration-clone'];
const NOW = ['preset-filled-secondary-50-950'];
/* A hair of colour either side of a word, taken back by the margin so nothing moves. */
const ROOM = ['px-0.5', '-mx-0.5'];

/** One word: the elements that show it (a word can span an element boundary: "Knipe</a>,"). */
export type Word = Element[];

type Undo = () => void;

/** Wrap every word in `el`; returns the words in reading order and how to put the page back. */
export function wrapWords(el: HTMLElement): { words: Word[]; undo: Undo } {
	const undos: Undo[] = [];
	const words: Word[] = [];
	let open: Word | null = null;
	const close = () => {
		if (open?.length) words.push(open);
		open = null;
	};

	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

	for (const node of nodes) {
		const parent = node.parentElement;
		/* The brand Q: light the picture, not the hidden letter. */
		const pic = parent?.classList.contains('sr-only') ? parent.previousElementSibling : null;
		if (pic instanceof HTMLImageElement && node.data.trim()) {
			close();
			pic.classList.add(...BASE);
			undos.push(() => pic.classList.remove(...BASE, ...NOW));
			/* Left open, so "Q’s" is one word: the picture and the "’s" after it. */
			open = [pic];
			continue;
		}
		/* Text hidden INSIDE the line is not read and not lit. A line that is itself
		 * inside something hidden (the picture story's other scenes, waiting their
		 * turn) is still wrapped, so it lights when it is shown. */
		const hidden = parent?.closest('.sr-only');
		if (hidden && hidden !== el && el.contains(hidden)) continue;

		const parts = node.data.split(/(\s+)/);
		if (parts.length === 1 && !parts[0]) continue;
		const frag = document.createDocumentFragment();
		const made: Node[] = [];
		for (const part of parts) {
			if (!part) continue;
			if (/^\s+$/.test(part)) {
				close();
				const t = document.createTextNode(part);
				frag.append(t);
				made.push(t);
			} else {
				/* Chinese has no spaces: its words come from the segmenter (voice/words). */
				const pieces = hasCJK(part) ? splitRun(part) : [part];
				pieces.forEach((piece) => {
					const span = document.createElement('span');
					span.className = [...BASE, ...ROOM].join(' ');
					span.textContent = piece;
					frag.append(span);
					made.push(span);
					/* Each Chinese word stands alone; a Latin run may continue a word across elements. */
					if (hasCJK(part)) close();
					(open ??= []).push(span);
				});
			}
		}
		node.replaceWith(frag);
		undos.push(() => {
			made[0]?.parentNode?.insertBefore(node, made[0]);
			for (const m of made) m.parentNode?.removeChild(m);
		});
	}
	close();
	return { words, undo: () => undos.reverse().forEach((u) => u()) };
}

let lit: Word | null = null;

/** Light one word (or none); the one before fades out. */
export function light(word: Word | null) {
	if (word === lit) return;
	for (const e of lit ?? []) e.classList.remove(...NOW);
	for (const e of word ?? []) e.classList.add(...NOW);
	lit = word;
}

/**
 * Which word is being said at `t` seconds into a recording, given each word's
 * [start, end]. Between words the last one stays lit, so the light never
 * flickers off mid-sentence.
 */
export function wordAt(times: [number, number][], t: number): number {
	let i = -1;
	for (let k = 0; k < times.length && times[k][0] <= t; k++) i = k;
	return i;
}

/**
 * The page and the recording can disagree on how many words a line has (the
 * script says "C-I-C", the page "CIC"). Map by position rather than stop.
 */
export function shown(i: number, heard: number, onPage: number): number {
	if (i < 0 || !onPage) return -1;
	if (heard === onPage || heard <= 1) return Math.min(i, onPage - 1);
	return Math.min(onPage - 1, Math.round((i * (onPage - 1)) / (heard - 1)));
}

/**
 * Timings when a recording has none of its own: each word's share of the
 * line's length, by letters, with a beat after punctuation — near enough to
 * follow, until real timings are made (npm run voice -- --align).
 */
export function estimate(text: string, seconds: number): [number, number][] {
	const words = wordsOf(text);
	const weight = words.map((w) => w.length + (/[.!?]$/.test(w) ? 6 : /[,;:—)]$/.test(w) ? 3 : 1));
	const total = weight.reduce((a, b) => a + b, 0) || 1;
	let t = 0;
	return words.map((_, i) => {
		const d = (weight[i] / total) * seconds;
		const span: [number, number] = [t, t + d];
		t += d;
		return span;
	});
}

/** How many words come before character `c` of `text` (for the browser voice's boundaries). */
export function wordIndexAt(text: string, c: number): number {
	return wordsOf(text.slice(0, c)).length;
}
