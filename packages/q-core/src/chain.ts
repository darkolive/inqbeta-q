/*
 * What changed — a DID's history as a chain of answers.
 *
 * Darren, 2026-09-20: "the very first creation question is who are you? The
 * answer is my identity. So the next question then becomes what's next? And
 * the answer will be based on the answer to the previous question. So we have
 * a continual hashing versioning git path and all you're recording each time
 * is what changed."
 *
 * That is event sourcing over a Merkle chain, and it is right. Genesis has no
 * parent and answers WHO ARE YOU. Everything after answers WHAT'S NEXT and
 * records only the difference. Current state is the fold. Nothing changed is
 * the identity element — the last thing it was.
 *
 * AND 42. The joke is better than it looks. The answer was useless because
 * nobody had kept the question. That is the whole argument for storing
 * question-and-answer pairs rather than values: an answer without its question
 * is 42. Every step here carries what it was asked.
 *
 * THREE THINGS THAT ARE NOT OBVIOUS, and are why this is a file.
 *
 * ONE. A HASH CHAIN IS NOT A BLOCKCHAIN. It proves nobody edited the middle
 * without redoing the end. It does NOT prove there is only one chain. The
 * signer holds the key, so they can sign two different "what's next" from the
 * same parent and show one to you and one to somebody else. That is
 * equivocation, and it is the precise thing consensus exists to prevent. So
 * the chain authenticates A history, not THE history — until somebody else has
 * witnessed the head. Same anchor as a revocation needs.
 *
 * TWO. "WHAT'S NEXT" BRANCHES. Two devices, both offline, both answer. So this
 * is a DAG, not a line. Which is good news, because a merge is itself a
 * receipt answering "which of these do you keep" — and that makes the decision
 * auditable instead of silent.
 *
 * THREE. FOLDING FROM GENESIS GETS SLOWER FOREVER. Git keeps trees; event
 * stores keep snapshots. Without checkpoints a twenty-year identity takes
 * minutes to open. A checkpoint SHORTCUTS history; it never replaces it, or
 * the holder could forge their own past by checkpointing a lie.
 *
 * Pure. No signing, no storage.
 */

export type Value = string | number | boolean | string[] | null;

export interface Step {
	/** This step's own content address. */
	id: string;
	/** The step before it. Null only for genesis. */
	parent: string | null;
	/** Position in the chain. Genesis is 0. */
	seq: number;
	/** The question this step answers. Genesis asks who you are; everything else asks what's next. */
	asks: string;
	/**
	 * What changed, and only what changed. A key set to null unsets it.
	 * Empty means nothing changed — which is a real, recordable event.
	 */
	changed: Record<string, Value>;
	at: string;
}

export const GENESIS_QUESTION = 'q:who/are-you';
export const NEXT_QUESTION = 'q:what/next';

export interface Broken {
	at: number;
	says: string;
}

/**
 * Whether this is a chain, or a pile of steps that look like one.
 *
 * Returns the first thing wrong, because after the first broken link nothing
 * downstream can be trusted and listing the rest is noise.
 */
export function checkChain(steps: Step[]): Broken | null {
	if (!steps.length) return { at: 0, says: 'There is no history here at all.' };

	const [first, ...rest] = steps;
	if (first.parent !== null) return { at: 0, says: 'The first step claims something came before it.' };
	if (first.seq !== 0) return { at: 0, says: 'The first step is not numbered as the first.' };
	if (first.asks !== GENESIS_QUESTION) {
		return { at: 0, says: 'The first step answers something other than who you are.' };
	}

	let previous = first;
	for (const [i, step] of rest.entries()) {
		const n = i + 1;
		if (step.parent !== previous.id) {
			return { at: n, says: `Step ${n} does not follow the one before it. The history has been cut or rewritten.` };
		}
		if (step.seq !== previous.seq + 1) {
			return { at: n, says: `Step ${n} is numbered out of order.` };
		}
		if (step.parent === null) {
			return { at: n, says: `Step ${n} claims to be a beginning, and there can only be one.` };
		}
		previous = step;
	}
	return null;
}

/**
 * The current state: every change applied in order.
 *
 * A key set to null is removed rather than stored as null, because "answered
 * nothing" and "never asked" should not read the same on a screen.
 */
export function fold(steps: Step[]): Record<string, Exclude<Value, null>> {
	const state: Record<string, Exclude<Value, null>> = {};
	for (const step of steps) {
		for (const [k, v] of Object.entries(step.changed)) {
			if (v === null) delete state[k];
			else state[k] = v;
		}
	}
	return state;
}

/** Nothing changed is a fact worth recording: it says someone looked and it still held. */
export function nothingChanged(step: Step): boolean {
	return Object.keys(step.changed).length === 0;
}

export interface Fork {
	/** The step both branches claim to follow. */
	from: string;
	says: string;
}

/**
 * Two steps claiming the same parent.
 *
 * Signed by the same key this is equivocation — the holder telling two
 * different stories — and no amount of hashing catches it from inside. Signed
 * by two devices it is an ordinary offline branch, and needs a merge.
 *
 * Q cannot tell which from the steps alone, so it reports the fact and says
 * what would settle it, rather than guessing at intent.
 */
export function forkAt(a: Step, b: Step): Fork | null {
	if (a.id === b.id) return null;
	if (a.parent !== b.parent) return null;
	return {
		from: a.parent ?? '(the beginning)',
		says: 'Two histories carry on from the same point. Either two devices wrote while apart, or the same key told two stories.'
	};
}

/** A merge is a step like any other — which is what makes the decision auditable. */
export function isMerge(step: Step & { alsoFollows?: string }): boolean {
	return typeof step.alsoFollows === 'string' && step.alsoFollows.length > 0;
}

/** Fold from genesis every time and a long life becomes slow to open. */
export const CHECKPOINT_EVERY = 500;

export function needsCheckpoint(sinceLastCheckpoint: number): boolean {
	return sinceLastCheckpoint >= CHECKPOINT_EVERY;
}

/**
 * Confidence in an answer, as it ages.
 *
 * The incubator's renewal map already has the right distinction, and it is
 * sharper than "decay":
 *
 *   decaying — social or interpretive trust and confidence lose strength over
 *   time EVEN WHEN RECORDS PERSIST. trust signal ≠ permanent trust.
 *
 * So the record never decays. The confidence does. This is Euler — e^(-t/τ),
 * a half-life — and it NEVER REACHES ZERO, on purpose. "We no longer rely on
 * this" and "this never happened" are different sentences, and a curve that
 * bottoms out at nothing lets a screen confuse them.
 */
export function confidence(answeredAt: number, halfLifeMs: number, now = Date.now()): number {
	if (halfLifeMs <= 0) return 1;
	const age = Math.max(0, now - answeredAt);
	return Math.pow(2, -age / halfLifeMs);
}

/**
 * That number as a sentence, because a person cannot act on 0.31.
 *
 * Never says an answer is wrong — only how long since anybody confirmed it.
 * That distinction is the whole point of the taxonomy it comes from.
 */
export function howSure(c: number): string {
	if (c >= 0.75) return 'Recently confirmed.';
	if (c >= 0.5) return 'Still stands, and it has been a while.';
	if (c >= 0.25) return 'Nobody has confirmed this lately. It may still be true.';
	return 'This was true when it was said. Nothing since says whether it still is.';
}
