/*
 * Ways in — and why adding them is not the same as adding places.
 *
 * Darren, 2026-09-20: "building your own personal vault security is about you
 * adding channels. And that's not opening up more risk, it is actually opening
 * up more resilience… my verifying channels are going to be email, WhatsApp,
 * finger key thing, a ledger."
 *
 * Half right, and the half that is not is how accounts are actually taken. The
 * difference is worth a whole file, because it is the difference between a
 * vault and a vault with a back door somebody drew on it themselves.
 *
 *   A COPY IS AS STRONG AS ITS STRONGEST.
 *   A WAY IN IS AS STRONG AS ITS WEAKEST.
 *
 * Add a place and you add a sealed copy: nobody gains a route to become you,
 * and losing one costs nothing. Add a WAY IN and you add a route, and an
 * attacker only has to find the cheapest one. Hardware key, passkey, and a
 * phone number, any one of which gets you in, is a system protected by the
 * phone number — and NIST has classed SMS as a restricted authenticator in
 * SP 800-63B rev 4 for precisely this reason.
 *
 * So Darren's instinct is right about the PROBLEM — one passkey and a cleared
 * keychain is the largest real risk in Q today — and the answer is not more
 * doors. It is:
 *
 *   1. Separate NOTIFYING from LETTING IN. A channel that can only tell you
 *      something happened adds no risk at all. Add ten. channels.ts already
 *      distinguishes 'notify' from 'sign-in'; this file is about 'sign-in'.
 *   2. For the ones that do let you in, REQUIRE MORE THAN ONE AT ONCE. Two of
 *      three turns every added channel into a gain instead of a loss, because
 *      now the cheapest route costs two things rather than one. keys.ts
 *      already has MultiSigCondition; this says when to reach for it.
 *   3. Show the WEAKEST first. Ordering "most secure first" is comforting and
 *      backwards: the last one on that list is the one that decides.
 *
 * Pure. No authenticators, no crypto. This ranks and explains.
 */

export type WayIn =
	/** A physical key that must be held — YubiKey, Ledger. Cannot be phished from a distance. */
	| 'hardware'
	/** A passkey in a keychain. Needs the device and a fingerprint or face. */
	| 'passkey'
	/** Words on paper in a drawer. As strong as the drawer, and worthless once photographed. */
	| 'recovery-phrase'
	/** Something known. Reusable, guessable, and typed into whatever asks. */
	| 'password'
	/** Someone who vouches for you. As strong as their judgement under pressure. */
	| 'person'
	/** A code to an email account — which is itself protected by something on this list. */
	| 'email'
	/** WhatsApp, Signal, Telegram. Tied to a phone number, and so is its recovery. */
	| 'messenger'
	/** A text message. A phone number is not a possession; it is a customer-service decision. */
	| 'sms';

export interface Ranked {
	way: WayIn;
	/** Relative cost to an attacker. Only the ORDER means anything. */
	cost: number;
	/** What it actually takes to defeat it. Named, because vague risk is ignored risk. */
	because: string;
}

const RANKING: Record<WayIn, Ranked> = {
	hardware: { way: 'hardware', cost: 5, because: 'Someone would have to be in the room and take it.' },
	passkey: { way: 'passkey', cost: 4, because: 'Someone would need your device unlocked — or the account your keychain syncs through.' },
	'recovery-phrase': { way: 'recovery-phrase', cost: 3, because: 'Anyone who has seen the paper, or a photo of it, is in.' },
	password: { way: 'password', cost: 2, because: 'Guessed, reused elsewhere, or typed into a page that only looked like this one.' },
	person: { way: 'person', cost: 2, because: 'They can be convinced it is you. Being helpful is the weakness.' },
	email: { way: 'email', cost: 2, because: 'It is only as strong as the email account, which is usually protected by a password and a phone number.' },
	messenger: { way: 'messenger', cost: 1, because: 'Tied to a phone number, and so is getting the account back.' },
	sms: { way: 'sms', cost: 1, because: 'A phone number can be moved to another SIM by persuading a shop assistant.' }
};

export function rank(way: WayIn): Ranked {
	return RANKING[way];
}

/**
 * Weakest first, because the weakest is the one that decides.
 *
 * The comforting order is the wrong one. A list headed by a hardware key tells
 * a person they are safe; the truth is at the bottom.
 */
export function inOrder(ways: WayIn[]): Ranked[] {
	return [...new Set(ways)].map(rank).sort((a, b) => a.cost - b.cost || a.way.localeCompare(b.way));
}

/** The one that decides, when any single way is enough. Null when there are none. */
export function weakest(ways: WayIn[]): Ranked | null {
	return inOrder(ways)[0] ?? null;
}

/**
 * What it costs an attacker to get in.
 *
 * They will take the cheapest routes, so this is the sum of the `needed`
 * cheapest — not the average, and emphatically not the best one. With
 * `needed` of 1 it is simply the weakest, which is the whole point.
 */
export function costToBreak(ways: WayIn[], needed = 1): number {
	const ordered = inOrder(ways);
	if (!ordered.length || needed > ordered.length) return 0;
	return ordered.slice(0, Math.max(1, needed)).reduce((n, r) => n + r.cost, 0);
}

/** How many ways you could lose and still get in yourself. */
export function waysYouCanLose(ways: WayIn[], needed = 1): number {
	return Math.max(0, new Set(ways).size - Math.max(1, needed));
}

export interface Effect {
	/** True when this change makes it cheaper for someone else to get in. */
	weakens: boolean;
	says: string;
	fix: string;
}

/**
 * What adding a way in actually does — said at the moment of adding, because
 * that is the only moment the advice is free.
 *
 * This is the function that stops the whole idea going wrong. Adding a channel
 * for resilience is a good instinct; adding it without raising the threshold
 * is trading the strength of the vault for the convenience of getting back in.
 * A person is allowed to make that trade. They are not allowed to make it
 * without being told.
 */
export function effectOfAdding(existing: WayIn[], adding: WayIn, needed = 1): Effect {
	const before = costToBreak(existing, needed);
	const after = costToBreak([...existing, adding], needed);
	const lose = waysYouCanLose([...existing, adding], needed);

	if (!existing.length) {
		return {
			weakens: false,
			says: `${adding} is your only way in. Losing it loses everything.`,
			fix: 'Add a second, and then require two at once so the second is not a spare key under the mat.'
		};
	}
	if (after < before) {
		const w = weakest([...existing, adding])!;
		return {
			weakens: true,
			says: `Anyone getting in now only needs ${w.way}. ${w.because}`,
			fix: `Require two of your ${new Set([...existing, adding]).size} ways at once. Then this adds to your safety instead of subtracting from it.`
		};
	}
	return {
		weakens: false,
		says: `Nothing gets easier for anyone else, and you can now lose ${lose} and still get in.`,
		fix: ''
	};
}

export interface AccessStanding {
	level: 'fine' | 'warn' | 'danger';
	says: string;
	fix: string;
}

/**
 * Where a person's access stands: the two numbers that move in opposite
 * directions, reported together so neither can be read alone.
 */
export function howItStands(ways: WayIn[], needed = 1): AccessStanding {
	const n = new Set(ways).size;
	if (n === 0) {
		return { level: 'danger', says: 'There is no way into this vault.', fix: 'Add a passkey.' };
	}
	if (n === 1) {
		return {
			level: 'warn',
			says: `One way in, and no spare. ${rank([...ways][0]).because}`,
			fix: 'Add a second and require both, so you gain a spare without gaining a back door.'
		};
	}
	const lose = waysYouCanLose(ways, needed);
	if (needed <= 1) {
		const w = weakest(ways)!;
		return {
			level: w.cost <= 2 ? 'danger' : 'warn',
			says: `${n} ways in, any one of which is enough — so this vault is as strong as ${w.way}. ${w.because}`,
			fix: `Require two at once. You would still be able to lose ${Math.max(0, n - 2)} of them.`
		};
	}
	return {
		level: 'fine',
		says: `${needed} of ${n} needed, so you can lose ${lose} and still get in, and nobody else gets in with one.`,
		fix: ''
	};
}

/**
 * Whether a channel's purpose puts it on this list at all.
 *
 * Only signing in is a way in. Telling someone something happened is free, and
 * a person should be encouraged to add as many of those as they like — the
 * resilience Darren is after, at no cost to the lock.
 */
export function risksAccess(use: 'sign-in' | 'notify' | 'messages' | 'marketing'): boolean {
	return use === 'sign-in';
}
