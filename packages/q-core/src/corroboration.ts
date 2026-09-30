/*
 * How much stands behind a claim — and why it is not a RAID array.
 *
 * Darren, 2026-09-20: "trust signal increases as the source number increases…
 * what's the RAID system of thinking about it. We can score that way."
 *
 * The instinct is right and the metaphor is the one to drop, for a reason
 * worth keeping written down.
 *
 * RAID PROTECTS AGAINST HONEST FAILURE. A disk dies of its own accord, at
 * random, independently of the others. That is the whole model. It does not
 * protect against a disk that LIES, and it barely protects against disks that
 * fail TOGETHER — same batch, same power supply, same fire.
 *
 * Trust is the second case, not the first. A witness can be wrong, can be
 * bought, and can be the same party signing twice under different names. So:
 *
 *   COUNTING SIGNATURES MEASURES REDUNDANCY. COUNTING ORIGINS MEASURES TRUST.
 *
 * Which is this morning's rule again, one domain over. places.ts already says
 * two folders in one Dropbox are one copy wearing two coats, and every place
 * carries a `fate` — what would have to go wrong for it to be lost — so that
 * waysToSurvive() counts fates rather than folders.
 *
 *   Three attestations from one operator are one witness wearing three coats.
 *
 * Same function, different word. A source carries an `origin`: who would have
 * to be wrong, or lying, for this to be wrong. Sources sharing an origin count
 * once. And a source that only knows because another told it is not a second
 * origin at all — it is the first one, repeated.
 *
 * WHY THIS RETURNS SENTENCES AND NOT A SCORE. A number gets acted on without
 * its reasons. The incubator's renewal map is explicit — trust signal is not
 * permanent trust, and it decays in social meaning even when the bytes
 * persist — and State-of-the-Kernel is blunter: the kernel records, flags and
 * constrains; it does not judge. "Trust: 0.72" is a judgement. "Three
 * independent: you, your accountant, and the bank" is a record. So the number
 * exists for sorting, and the sentence is what a person is shown.
 *
 * Pure. No network, no signatures — seal.checkReceipt does that, and a source
 * that has not been checked should never reach this.
 */
import { confidence } from './chain';
import { rung, type Assurance } from './assurance';

export interface Source {
	/** Who says so. A DID. */
	by: string;
	/**
	 * Who would have to be wrong for this to be wrong.
	 *
	 * Usually the signer, but not always: two auditors at one firm share an
	 * origin, and a copy of a claim shares the origin of what it copied. Q
	 * cannot work this out — it is declared, like a place's fate.
	 */
	origin: string;
	/** When this source said it. */
	at: number;
	/** How sure that saying was. assurance.ts. */
	held: Assurance;
	/** What it is called in a sentence. "your accountant", "the bank". */
	called: string;
}

/**
 * One source per origin — the strongest and freshest of each.
 *
 * Collapsing rather than summing is the whole point. Ten signatures from one
 * party must not out-weigh two from two.
 */
export function independent(sources: Source[]): Source[] {
	const best = new Map<string, Source>();
	for (const s of sources) {
		const seen = best.get(s.origin);
		if (!seen || rung(s.held) > rung(seen.held) || (rung(s.held) === rung(seen.held) && s.at > seen.at)) {
			best.set(s.origin, s);
		}
	}
	return [...best.values()].sort((a, b) => b.at - a.at);
}

/** How much one source is worth on its own: its standing, faded by its age. */
export function weightOf(source: Source, halfLifeMs: number, now = Date.now()): number {
	/* 'none' is somebody's note to themselves and supports nothing. */
	const standing = rung(source.held) / rung('witnessed');
	return standing * confidence(source.at, halfLifeMs, now);
}

/**
 * The most this can ever say.
 *
 * Not a stylistic limit. Multiplying enough small numbers underflows: fifty
 * sources at 0.99 each give 1 - 1e-100, which IS exactly 1 in a double. The
 * property "never certain" was written in a comment and was not true until a
 * test went looking for it. So it is enforced here rather than hoped for.
 */
export const MOST_SURE = 0.999;

/**
 * How much stands behind this, from 0 to MOST_SURE.
 *
 * Independent sources multiply rather than add: if each could be wrong on its
 * own, the chance they are ALL wrong is the product, so three decent
 * independent sources beat ten copies of one by a distance.
 *
 * It never reaches 1. "We are very sure" and "this is certain" are different
 * sentences, and a scale that tops out lets a screen confuse them — the same
 * rule confidence() follows in chain.ts.
 */
export function support(sources: Source[], halfLifeMs: number, now = Date.now()): number {
	const ones = independent(sources);
	if (!ones.length) return 0;
	let wrong = 1;
	for (const s of ones) wrong *= 1 - Math.min(0.99, weightOf(s, halfLifeMs, now));
	return Math.min(MOST_SURE, 1 - wrong);
}

export type Corroboration =
	/** Nobody has said anything. */
	| 'unsupported'
	/** One voice. Could be right; nothing else says so. */
	| 'one voice'
	/** Two that do not depend on each other. */
	| 'corroborated'
	/** Three or more, independent. */
	| 'well attested';

export function corroborationOf(sources: Source[]): Corroboration {
	const n = independent(sources).length;
	if (!n) return 'unsupported';
	if (n === 1) return 'one voice';
	if (n === 2) return 'corroborated';
	return 'well attested';
}

export interface Support {
	standing: Corroboration;
	/** For sorting and thresholds. Never shown on its own. */
	score: number;
	/** How many independent origins, and how many signatures collapsed into them. */
	origins: number;
	signatures: number;
	/** One line, naming who — because a number without its reasons gets acted on. */
	says: string;
}

/**
 * What stands behind a claim, said the way a person would say it.
 *
 * Names the sources. Never returns a verdict, and never uses the word trust:
 * this records who said what and when, and leaves the judging to whoever has
 * to make the decision.
 */
export function supportFor(sources: Source[], halfLifeMs: number, now = Date.now()): Support {
	const ones = independent(sources);
	const standing = corroborationOf(sources);
	const score = support(sources, halfLifeMs, now);
	const named = ones.map((s) => s.called);

	const collapsed = sources.length - ones.length;
	const aside = collapsed
		? ` ${collapsed} other ${collapsed === 1 ? 'signature' : 'signatures'} came from ${collapsed === 1 ? 'a source' : 'sources'} already counted.`
		: '';

	if (!ones.length) {
		return { standing, score, origins: 0, signatures: sources.length, says: 'Nothing stands behind this yet.' };
	}
	if (ones.length === 1) {
		return {
			standing,
			score,
			origins: 1,
			signatures: sources.length,
			says: `Only ${named[0]} says so.${aside}`
		};
	}
	const list = named.length > 3 ? `${named.slice(0, 3).join(', ')} and ${named.length - 3} more` : named.join(', ');
	return {
		standing,
		score,
		origins: ones.length,
		signatures: sources.length,
		says: `${ones.length} independent: ${list}.${aside}`
	};
}
