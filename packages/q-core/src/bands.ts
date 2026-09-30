/*
 * Where a thing should be, and where it is.
 *
 * Darren, 2026-09-20: "seven phases, each based on how cold the storage blob
 * was, on its time delay of use… every file in that time band that fits that
 * score can be bundled together."
 *
 * The shape is right. Four corrections were made in heat-bands.md and all four
 * live here as code rather than as prose.
 *
 * BANDS ARE DESTINATIONS, NOT A NUMBER. Seven was a good number looking for a
 * job. A band that lands nowhere new does nothing, so there are exactly as
 * many bands as there are kinds of place — which is `Tier` in lifecycle.ts,
 * reused rather than re-invented, because a second vocabulary for the same
 * four things would drift from the first within a week.
 *
 * THIS IS A RECONCILER, NOT A SCHEDULER. It never runs the archive job at
 * midnight. Every file has TWO bands — the one it SHOULD be in, computable
 * from timestamps alone, offline, always; and the one it IS in, knowable only
 * when a place answers. The engine narrows the gap when it can and reports it
 * honestly when it cannot. That is what survives a laptop shut mid-run, a
 * drive left in a drawer and a bucket that is not answering, which are the
 * three things that will actually happen.
 *
 * PROMOTE INSTANTLY, DEMOTE SLOWLY. If a file can drift between two bands on
 * each pass, bundles are rewritten for ever — bundle churn, which is how
 * tiering systems fail in practice. Touched is hot immediately and by any
 * distance. Cooling happens one band at a time and only after the current
 * band's dwell has fully elapsed.
 *
 * ONCE BUNDLED, STAY BUNDLED. Touching something cold makes a NEW hot copy. It
 * does not unpack the bundle, because the bundle is content-addressed and
 * rewriting it would break its name and every reference anyone holds to it.
 *
 * Pure. No clock but the one passed in, no places, no bytes.
 */
import type { Tier } from './lifecycle';

/** Coldest last. The order IS the band number, and there are four because there are four places. */
export const BANDS: Tier[] = ['here', 'synced', 'cold', 'archive'];

export function bandNumber(tier: Tier): number {
	return BANDS.indexOf(tier);
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * How long something sits in a band before it is due to cool.
 *
 * Defaults, not law: a federation keeping records to a retention schedule will
 * have its own, and these are the numbers a person with no policy gets.
 */
export const DWELL: Record<Tier, number> = {
	here: 7 * DAY,
	synced: 30 * DAY,
	cold: 365 * DAY,
	/* Nothing cools out of the coldest band. It is the last one. */
	archive: Infinity
};

/**
 * The band a thing should be in, from its age alone.
 *
 * Computable with no network, no folder and no permission — which is the whole
 * reason it is separate from where the thing actually is.
 */
export function shouldBe(lastTouchedAt: number, now = Date.now(), dwell = DWELL): Tier {
	let age = Math.max(0, now - lastTouchedAt);
	for (const tier of BANDS) {
		const stay = dwell[tier];
		if (!Number.isFinite(stay) || age < stay) return tier;
		age -= stay;
	}
	return 'archive';
}

/**
 * One pass's worth of movement.
 *
 * Warming is immediate and by any distance, because a person waiting for their
 * own file should never be told to come back tomorrow. Cooling is one band at
 * a time, so a file that has been left alone for years arrives at the archive
 * over several passes rather than in one rewrite of everything.
 */
export function oneStep(from: Tier, towards: Tier): Tier {
	const a = bandNumber(from);
	const b = bandNumber(towards);
	if (b <= a) return towards;
	return BANDS[a + 1];
}

export type MoveAct =
	/** Put a copy in this band. */
	| 'copy'
	/** Take the copy out of the band it is leaving. */
	| 'drop'
	/** Nothing to do. */
	| 'rest';

export interface Move {
	/** What the file is called by, to whatever holds it. */
	id: string;
	act: MoveAct;
	from: Tier;
	to: Tier;
	/** True when the place this needs is not answering, so the move is only planned. */
	blocked: boolean;
	says: string;
}

export interface Thing {
	id: string;
	/** When it was last opened or written. */
	touchedAt: number;
	/** Where it actually is, as last confirmed. */
	at: Tier;
	/** True once it is inside a bundle, which is never unpacked. */
	bundled?: boolean;
}

/**
 * What to do about one thing, now, given which bands can be reached.
 *
 * Never throws and never guesses: a band whose place is not answering produces
 * a blocked move, which is a thing to show a person rather than an error.
 */
export function reconcile(thing: Thing, reachable: Tier[], now = Date.now(), dwell = DWELL): Move {
	const want = shouldBe(thing.touchedAt, now, dwell);
	const to = oneStep(thing.at, want);

	if (to === thing.at) {
		return { id: thing.id, act: 'rest', from: thing.at, to, blocked: false, says: 'Where it should be.' };
	}

	const warming = bandNumber(to) < bandNumber(thing.at);
	const blocked = !reachable.includes(to);

	if (warming) {
		/* A cold copy stays where it is. Warming makes a new one rather than
		 * unpacking a bundle that other things point at by name. */
		return {
			id: thing.id,
			act: 'copy',
			from: thing.at,
			to,
			blocked,
			says: thing.bundled
				? blocked
					? 'Wanted closer to hand, but the bundle cannot be reached.'
					: 'Wanted closer to hand. A new copy, and the bundle is left alone.'
				: blocked
					? 'Wanted closer to hand, but that place is not answering.'
					: 'Wanted closer to hand.'
		};
	}

	return {
		id: thing.id,
		act: 'copy',
		from: thing.at,
		to,
		blocked,
		says: blocked ? `Due to move somewhere colder, and ${to === 'archive' ? 'nothing is plugged in' : 'that place is not answering'}.` : 'Due to move somewhere colder.'
	};
}

export interface Gap {
	/** Moves that can happen now. */
	ready: Move[];
	/** Moves that cannot, because a place is not answering. */
	waiting: Move[];
	/** One line, in the words a person would use. */
	says: string;
}

/**
 * Everything that is not where it should be.
 *
 * Reported as two lists on purpose. What is blocked is not a failure and must
 * not read as one — a drive in a drawer is a drive working correctly — but a
 * person should be able to see that six things have been waiting on it since
 * March.
 */
export function gapOf(things: Thing[], reachable: Tier[], now = Date.now(), dwell = DWELL): Gap {
	const moves = things.map((t) => reconcile(t, reachable, now, dwell)).filter((m) => m.act !== 'rest');
	const ready = moves.filter((m) => !m.blocked);
	const waiting = moves.filter((m) => m.blocked);

	if (!moves.length) return { ready, waiting, says: 'Everything is where it should be.' };
	if (!waiting.length) {
		return { ready, waiting, says: `${ready.length} ${ready.length === 1 ? 'thing' : 'things'} to move.` };
	}
	if (!ready.length) {
		return {
			ready,
			waiting,
			says: `${waiting.length} ${waiting.length === 1 ? 'thing is' : 'things are'} waiting on a place that is not answering.`
		};
	}
	return { ready, waiting, says: `${ready.length} to move, ${waiting.length} waiting on a place that is not answering.` };
}

/**
 * Whether a band keeps its contents in bundles.
 *
 * Cold means FEWER, LARGER objects — not smaller ones. Object stores bill a
 * minimum size per object whatever it really weighs, so ten thousand two-
 * kilobyte receipts are billed as ten thousand fifty-kilobyte ones. The
 * particles get smaller going colder; the containers get bigger.
 */
export function bundles(tier: Tier): boolean {
	return tier === 'cold' || tier === 'archive';
}

/** Below this, a bundle is not worth making and the things stay separate. */
export const BUNDLE_AT_LEAST = 16;

export interface Bundling {
	make: boolean;
	says: string;
}

export function shouldBundle(tier: Tier, howMany: number): Bundling {
	if (!bundles(tier)) return { make: false, says: 'Things here are kept one by one, so they can be opened one by one.' };
	if (howMany < BUNDLE_AT_LEAST) {
		return { make: false, says: `Not enough here to be worth bundling yet — ${howMany} of ${BUNDLE_AT_LEAST}.` };
	}
	return { make: true, says: `${howMany} things, kept as one. Each is still sealed on its own, so any one of them can be destroyed without touching the rest.` };
}
