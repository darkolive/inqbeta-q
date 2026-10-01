/*
 * A card is what you show, to whom, for what.
 *
 * Darren, 2026-09-19:
 *
 *   > "This is where the cards come in. Your business card is what information
 *   > you share. Friends card is what information you share. Contact card — if
 *   > you want to send me an email, here's my encrypted key. Anything that comes
 *   > to communicate with you looks at what you have for that purpose, and
 *   > that's all it ever accesses."
 *
 * A CARD NAMES PREDICATES, NOT VALUES. It is a list of question ids and a list
 * of channels — never a copy of your answers. So a card made once keeps telling
 * the truth: change your answer and everyone holding the card sees the new one,
 * the way a business card with a phone number on it does not, and the way you
 * would want it to.
 *
 * MAKING A CARD IS THE CONSENT. There is no fifth `use` for "may go on a card".
 * A card is a signed statement naming exactly what you are showing and to what
 * purpose — the decision is the card, and recording it twice would only invite
 * the two records to disagree. Delete the card and the showing stops.
 *
 * WHAT A CARD IS NOT. It is not the giving of a card to a person: that has an
 * audience, and an audience means a UCAN delegation (permissions.ts `grant`),
 * scoped to the card and revocable on its own. This file is the definition;
 * handing it over is a separate, signed act.
 *
 * A CARD IS ANSWERS. Darren, 2026-09-19: "can it be done in the same as
 * everything else, which is a question and an answer?" He was right, and this
 * file was the one place not doing it. `cardFromAnswers` reads a card out of an
 * ordinary answer set, so a card is declared the way everything else is — and a
 * NEW KIND of card is a question set somebody writes, not code somebody ships.
 *
 * `Card` stays as the resolved shape `cardView` consumes, because the guarantee
 * that nothing unnamed leaves is worth more than one fewer type.
 *
 * See docs/decisions/adr-q-002 §4.
 */
import { canonical, sha256 } from './canonical';
import type { AnswerSet, AnswerValue, QuestionSet } from './questions';
import { isAnswerSet, newestPerSet } from './questions';

export const CARD_SOURCE = 'inqbeta:card/1';

/**
 * The details you keep for yourself (Darren, 1 October 2026: "you get to choose
 * what is shown on those address cards and what is just for you").
 *
 * Answered in your profile as a list of question ids. `cardView` honours it
 * above any card: a detail marked just for you never leaves, whatever a card
 * — even an older one — names. One function decides what leaves, so this is
 * where the rule lives.
 */
export const JUST_FOR_ME = 'q:profile/just-for-me';

export interface Card {
	source: typeof CARD_SOURCE;
	/** Whose card. */
	did: string;
	/** The first 16 of the card's own hash — stable while the card is. */
	id: string;
	/** What the person calls it: "Business", "Friends". */
	name: string;
	/** Question ids shown by this card. Predicates, never values. */
	shows: string[];
	/** Channel ids reachable for this purpose. */
	channels: string[];
	at: string;
}

/** The card's own name, from what it is rather than when it was made. */
export async function cardId(params: { did: string; name: string; shows: string[]; channels: string[] }): Promise<string> {
	const hash = await sha256(
		canonical({
			did: params.did,
			name: params.name.trim(),
			/* Sorted, so the same card described in a different order is the same card. */
			shows: [...new Set(params.shows)].sort(),
			channels: [...new Set(params.channels)].sort()
		})
	);
	return hash.slice(0, 16);
}

export async function buildCard(params: {
	did: string;
	name: string;
	shows: string[];
	channels?: string[];
	at?: string;
}): Promise<Card> {
	const name = params.name.trim();
	if (!name) throw new Error('A card needs a name.');
	const shows = [...new Set(params.shows)].sort();
	const channels = [...new Set(params.channels ?? [])].sort();
	if (!shows.length && !channels.length) throw new Error('A card that shows nothing is not a card.');
	return {
		source: CARD_SOURCE,
		did: params.did,
		id: await cardId({ did: params.did, name, shows, channels }),
		name,
		shows,
		channels,
		at: params.at ?? new Date().toISOString()
	};
}

export function isCard(body: unknown): body is Card {
	const c = body as Card;
	return (
		!!c &&
		typeof c === 'object' &&
		c.source === CARD_SOURCE &&
		typeof c.did === 'string' &&
		typeof c.name === 'string' &&
		Array.isArray(c.shows) &&
		Array.isArray(c.channels)
	);
}

/* ------------------------------------------------------------------ *
 * What a card actually exposes
 * ------------------------------------------------------------------ */

export interface CardView {
	cardId: string;
	name: string;
	/** Whose it is. A card without this is not attributable to anyone. */
	of: string;
	/** Only the questions the card names, and only those with an answer. */
	shown: { question: string; value: AnswerValue }[];
	/** Named by the card, answered by nobody. Absent, not blank. */
	missing: string[];
	/** Channel ids. Opening one still needs the channel receipt itself. */
	channels: string[];
	/**
	 * How many answered questions this card does NOT show.
	 *
	 * A count, never the questions. It is here so a person can see the size of
	 * what they are holding back, which is the thing a card is for.
	 */
	withheld: number;
}

/**
 * Exactly what a holder of this card can see, and nothing else.
 *
 * Everything a card exposes comes through here — pages, exports and anything
 * handed to another person. Nothing else should walk the answers, because the
 * whole guarantee is that one function decides what leaves.
 *
 * Newest answering wins, so a card follows an answer as it changes rather than
 * freezing what was true the day it was made.
 */
export function cardView(card: Card, answers: AnswerSet[]): CardView {
	const mine = answers.filter((a) => a.did === card.did);

	/* Newest answering of each question set, then newest value per predicate. */
	const current = new Map<string, { value: AnswerValue; at: string }>();
	for (const set of newestPerSet(mine)) {
		for (const [predicate, answer] of Object.entries(set.answers)) {
			const seen = current.get(predicate);
			if (!seen || set.at > seen.at) current.set(predicate, { value: answer.value, at: set.at });
		}
	}

	/* Just for you: never shown, whatever the card names. The list itself is never shown either. */
	const kept = new Set([JUST_FOR_ME, ...asList(current.get(JUST_FOR_ME)?.value)]);
	const shows = new Set(card.shows.filter((q) => !kept.has(q)));
	const shown: { question: string; value: AnswerValue }[] = [];
	const missing: string[] = [];

	for (const question of card.shows) {
		if (kept.has(question)) continue;
		const answer = current.get(question);
		if (answer) shown.push({ question, value: answer.value });
		else missing.push(question);
	}

	let withheld = 0;
	for (const predicate of current.keys()) if (predicate !== JUST_FOR_ME && !shows.has(predicate)) withheld++;

	return { cardId: card.id, name: card.name, of: card.did, shown, missing, channels: card.channels, withheld };
}

/* ------------------------------------------------------------------ *
 * A card, read out of answers
 * ------------------------------------------------------------------ */

/**
 * The three questions a card is.
 *
 * Named here so the set that asks them and the reader that resolves them cannot
 * drift apart. A federation declaring its own kind of card asks these, plus
 * whatever else it needs — the extra answers ride along in the same receipt and
 * are simply not read by this function.
 */
export const CARD_QUESTIONS = {
	name: 'q:card/name',
	shows: 'q:card/shows',
	channels: 'q:card/channels'
} as const;

const asList = (v: AnswerValue | undefined): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : [];

/**
 * Read a card out of an answer set.
 *
 * Returns null rather than throwing when the answers are not a card: an answer
 * set that does not answer these questions is an ordinary answer set, which is
 * not a fault.
 */
export async function cardFromAnswers(answers: AnswerSet): Promise<Card | null> {
	const name = answers.answers[CARD_QUESTIONS.name]?.value;
	if (typeof name !== 'string' || !name.trim()) return null;

	const shows = asList(answers.answers[CARD_QUESTIONS.shows]?.value);
	const channels = asList(answers.answers[CARD_QUESTIONS.channels]?.value);
	if (!shows.length && !channels.length) return null;

	return buildCard({ did: answers.did, name, shows, channels, at: answers.at });
}

/** The set a card is answered through. A federation's own kind would differ. */
export const CARD_SET_ID = 'q/a-card';

/**
 * A card, from whichever shape it was written in.
 *
 * Cards were once receipts of their own and are now answer sets. Both are read
 * here, for ever: a receipt already written keeps its own signature and its own
 * time, and rewriting it to a newer taste would be the one thing an append-only
 * folder must not do. New cards are written the new way; old ones are not
 * touched.
 *
 * Returns null when the content is neither, which is not a fault — most files
 * in a folder are not cards.
 */
export async function readCard(content: unknown): Promise<Card | null> {
	if (isCard(content)) {
		const c = content as Card;
		/* Rebuilt rather than trusted, so an old receipt and a new one that say
		 * the same thing come out with the same id. */
		return buildCard({ did: c.did, name: c.name, shows: c.shows, channels: c.channels, at: c.at });
	}
	if (isAnswerSet(content)) return cardFromAnswers(content);
	return null;
}

/** Is this answer set a card? Synchronous, for a list that has not resolved one yet. */
export function looksLikeCard(content: unknown): boolean {
	if (isCard(content)) return true;
	if (!isAnswerSet(content)) return false;
	const a = content as AnswerSet;
	return a.setId === CARD_SET_ID || CARD_QUESTIONS.name in a.answers;
}

/**
 * Question ids named here that no declared set actually asks.
 *
 * A card, or a preset, names predicates by hand. A mistyped one does not fail
 * — it quietly shows less than was intended, which is the worst way for a card
 * to be wrong. This turns it into something a test can catch before anybody
 * hands the card to anyone.
 */
export function unknownQuestions(shows: string[], sets: QuestionSet[]): string[] {
	const asked = new Set(sets.flatMap((s) => s.questions.map((q) => q.id)));
	return shows.filter((id) => !asked.has(id));
}

/** The newest card of each name. Earlier ones stay as evidence of what was shown before. */
export function newestPerCard(cards: Card[]): Card[] {
	const by = new Map<string, Card>();
	for (const c of cards) {
		const seen = by.get(c.name);
		if (!seen || c.at > seen.at) by.set(c.name, c);
	}
	return [...by.values()].sort((a, b) => (a.at < b.at ? 1 : -1));
}
