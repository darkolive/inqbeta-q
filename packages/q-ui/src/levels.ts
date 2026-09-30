/*
 * Heading levels follow the outline, not the look.
 *
 * A page starts at 1. Every <Section> makes the headings inside it one level
 * deeper. <Heading> reads the level from where it sits, so the same "title" can
 * be an h2 on one page and an h4 inside a card, and a screen reader's heading
 * list stays a true outline either way.
 */
import { getContext, setContext } from 'svelte';

const KEY = Symbol('q-heading-level');

export function currentLevel(): number {
	return getContext<number | undefined>(KEY) ?? 1;
}

export function provideLevel(level: number) {
	setContext(KEY, Math.min(6, Math.max(1, level)));
}
