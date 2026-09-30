/*
 * Read, wrote, reviewed — what has been done to a thing, and which of it is
 * worth keeping.
 *
 * Darren, 2026-09-20: "the actions of read, wrote, reviewed. All of that comes
 * into this category, doesn't it?" Yes. bands.ts needs a touchedAt and nothing
 * in Q has one — receipts carry `at`, which is when they were WRITTEN, a
 * different fact that would band a monthly-checked invoice by its age.
 *
 * THE PROBLEM THAT SHAPES THIS FILE. A signed touch record is bigger than most
 * of the things it would describe. An answer set is a few hundred bytes; a
 * signed, sealed receipt saying "opened" is about the same. Read something a
 * hundred times and the record of reading outweighs the thing read by two
 * orders of magnitude — in the bundles, in the sync, in the archive, for ever.
 * A design that writes a receipt per glance collapses under its own bookkeeping.
 *
 * SO THE THREE ACTS ARE NOT ONE KIND OF THING:
 *
 *   READING IS A FACT ABOUT YOU. Nobody else needs it, nobody else could check
 *   it, and it is by volume the largest thing in the system. Kept as a local
 *   count on the device that did it. Disposable, never travels, never signed.
 *
 *   REVIEWING IS A CLAIM ABOUT THE THING. "I looked at this and it still
 *   holds" is an assertion somebody might rely on, it is rare, and it resets
 *   the confidence clock in chain.ts. That earns a signed receipt.
 *
 *   WRITING ALREADY EXISTS. A change is a new answering with its own signature
 *   and time (chain.ts). Recording it again here would be a second copy of a
 *   fact, free to drift from the first. It is DERIVED, not stored.
 *
 * WHAT IS DELIBERATELY NOT HERE. 'shown' — that a card went to someone — is a
 * real act and belongs to the question of what is in circulation, not to where
 * a thing is kept. It wants a delegation receipt, not a touch, and putting it
 * here would blur two different questions into one list.
 *
 * Pure. No storage, no signing.
 */
import { confidence } from './chain';

export type TouchAct =
	/** Opened, looked at. A fact about the person, not about the thing. */
	| 'read'
	/** Changed. Derived from the answering that changed it; never stored twice. */
	| 'wrote'
	/** Looked at and found to still hold. A claim, and the only one worth signing. */
	| 'reviewed';

export const ACTS: { act: TouchAct; asks: string; kept: 'local' | 'signed' | 'derived' }[] = [
	{ act: 'read', asks: 'When did you last open this?', kept: 'local' },
	{ act: 'wrote', asks: 'When did this last change?', kept: 'derived' },
	{ act: 'reviewed', asks: 'When did you last check this still holds?', kept: 'signed' }
];

/**
 * Whether an act is worth a receipt.
 *
 * The one rule that keeps the bookkeeping smaller than the books.
 */
export function worthKeeping(act: TouchAct): boolean {
	return act === 'reviewed';
}

/** A local tally for one thing on one device. Disposable by design. */
export interface Reads {
	/** What was read. A content address or a place id. */
	of: string;
	times: number;
	firstAt: number;
	lastAt: number;
}

/**
 * Note a read.
 *
 * Collapses into the existing tally rather than appending, because a hundred
 * opens are one fact with a count — and because this is the only thing in Q
 * that is allowed to be overwritten. It is allowed precisely because nothing
 * depends on it being true: losing it bands something conservatively, which is
 * the safe direction.
 */
export function noteRead(tally: Reads | null, of: string, at = Date.now()): Reads {
	if (!tally) return { of, times: 1, firstAt: at, lastAt: at };
	return { of, times: tally.times + 1, firstAt: Math.min(tally.firstAt, at), lastAt: Math.max(tally.lastAt, at) };
}

/** A review, as a claim. Signed and stored like any other receipt. */
export interface Review {
	of: string;
	by: string;
	at: string;
	/** Optional, free text. What a controlled vocabulary would cost is in revocation.ts. */
	note?: string;
}

export const REVIEW_QUESTIONS = {
	of: 'q:review/of',
	stillHolds: 'q:review/still-holds',
	note: 'q:review/note'
} as const;

export interface Touched {
	/** The one bands.ts wants: the most recent of any act. */
	at: number;
	/** Which act it was, so a screen can say why. */
	by: TouchAct;
}

/**
 * When a thing was last touched at all, and by which act.
 *
 * Written as one function because the three acts live in three different
 * places, and every caller wanting "when was this last used" would otherwise
 * have to remember all three and get the precedence right.
 */
export function lastTouched(of: {
	writtenAt: number;
	reads?: Reads | null;
	reviewedAt?: number | null;
}): Touched {
	let at = of.writtenAt;
	let by: TouchAct = 'wrote';
	if (of.reads && of.reads.lastAt > at) {
		at = of.reads.lastAt;
		by = 'read';
	}
	if (of.reviewedAt && of.reviewedAt > at) {
		at = of.reviewedAt;
		by = 'reviewed';
	}
	return { at, by };
}

/**
 * Why a thing is where it is, in a sentence.
 *
 * A band engine that cannot explain itself is a band engine nobody trusts. If
 * something is in the archive, a person should be able to ask why and be told
 * what they did and when, not shown a score.
 */
export function whyThere(touched: Touched, now = Date.now()): string {
	const days = Math.floor((now - touched.at) / (24 * 60 * 60 * 1000));
	const when =
		days < 1 ? 'today' : days === 1 ? 'yesterday' : days < 60 ? `${days} days ago` : `${Math.floor(days / 30)} months ago`;
	switch (touched.by) {
		case 'read':
			return `You last opened this ${when}.`;
		case 'reviewed':
			return `You last checked this still holds ${when}.`;
		case 'wrote':
			return `This last changed ${when}, and nobody has opened it since.`;
	}
}

/**
 * How much a review is still worth.
 *
 * A review resets the decay in chain.ts — that is the whole point of
 * distinguishing it from a read. Reading something does not make it true
 * again; saying you checked it does.
 */
export function stillWorth(reviewedAt: number | null, halfLifeMs: number, now = Date.now()): number {
	return reviewedAt === null ? 0 : confidence(reviewedAt, halfLifeMs, now);
}
