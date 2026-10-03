/*
 * Exchanges, read from the head (ADR-Q-029, 3 October 2026).
 *
 * Darren: "As we're finding with the hashing of the hash, the end of the
 * story is much more efficient than the beginning in telling the whole story."
 *
 * Every step of an exchange (an agreement, a purchase, a call answered, a
 * request approved) names the step before it by its hash. So the latest
 * step's hash commits to everything before it: holding the head is enough to
 * rebuild the whole story, walking back parent by parent, and to know nothing
 * in the middle was changed, dropped or slipped in.
 *
 * chain.ts's caution holds: a head proves A history, not THE history, until
 * the other side has signed onto it too. Exchanges have both sides sign the
 * steps that count (agreeing, settling), so a head both have answered is the
 * story both agreed.
 */

/** Anything that names the step before it by hash. */
export interface Linked {
	contentHash: string;
	content: { parent: string | null; at: string };
}

export interface FromHead<T extends Linked> {
	/** The story, first step first, every one linked to the one before. */
	chain: T[];
	/** Whether the walk reached a first step (one with no parent). */
	whole: boolean;
	/** What couldn't be followed, in words. */
	problems: string[];
}

/**
 * The story behind a head: from the given step back to the first, parent by
 * parent. A parent that isn't among the steps, or a loop, is named and the
 * walk stops there; nothing is guessed.
 */
export function fromHead<T extends Linked>(steps: T[], head: string): FromHead<T> {
	const byHash = new Map(steps.map((s) => [s.contentHash, s]));
	const chain: T[] = [];
	const seen = new Set<string>();
	const problems: string[] = [];
	let at: string | null = head;
	while (at) {
		if (seen.has(at)) {
			problems.push('The steps go round in a loop.');
			break;
		}
		seen.add(at);
		const step = byHash.get(at);
		if (!step) {
			problems.push(chain.length ? 'A step it follows is missing.' : 'That step isn’t here.');
			break;
		}
		chain.unshift(step);
		at = step.content.parent;
	}
	return { chain, whole: !problems.length && chain.length > 0 && chain[0].content.parent === null, problems };
}

/**
 * The ends: steps no other step follows. One end is a single story; more
 * than one means it branched (two answers to the same step), which is worth
 * saying out loud rather than picking one quietly.
 */
export function headsOf<T extends Linked>(steps: T[]): T[] {
	const followed = new Set(steps.map((s) => s.content.parent).filter((p): p is string => !!p));
	return steps.filter((s) => !followed.has(s.contentHash)).sort((a, b) => a.content.at.localeCompare(b.content.at));
}
