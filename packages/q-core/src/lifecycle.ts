/*
 * Where a thing lives as it ages, and how much of that Q can actually check.
 *
 * Darren, 2026-09-20: "if something is active, it's in the cache, in memory,
 * where you are now… then where does it sync… then your storage farm, cold
 * storage, that's your S3… then your archive, which is a year plus. This lives
 * on this hard drive, this SSD offline facility, last time synced."
 *
 * Four places, in the order a thing moves through them. That is ordinary
 * records practice and it is right. Three things about it are not obvious and
 * are the reason this file exists rather than a paragraph in a document.
 *
 * ONE. CHECKED IS NOT THE SAME AS TOLD. Q can ask a bucket whether a blob is
 * there and get an answer. It cannot ask a drive in a cupboard. An archive
 * copy is something Q was TOLD about once and has believed ever since, and a
 * screen that draws both with the same tick is lying by omission. Every place
 * here reports which kind it is.
 *
 * TWO. COUNTING COPIES IS NOT MEASURING SAFETY. Two folders inside the same
 * Dropbox are one copy wearing two coats: one account suspension takes both.
 * What matters is how many INDEPENDENT ways a thing could survive, which is
 * the old 3-2-1 rule said properly — several copies, more than one kind of
 * medium, at least one of them not in this room.
 *
 * THREE. AGE DECIDES RETENTION, NEED DECIDES PLACEMENT. They look like one
 * question and they are two. A receipt from 2019 someone opens every week is
 * not archive material however old it is. So age is an input here, never the
 * whole rule.
 *
 * Pure. No buckets, no drives, no clock but the one passed in.
 */

export type Tier =
	/** This device, now. Where a thing is captured and where the real version lives. */
	| 'here'
	/** A folder that copies itself — iCloud Drive, Dropbox, OneDrive. Warm, automatic. */
	| 'synced'
	/** A bucket or a federation's cluster. Online, reachable, not opened daily. */
	| 'cold'
	/** Offline media. Has to be plugged in to be anything at all. */
	| 'archive';

export const TIERS: { tier: Tier; called: string; forWhat: string }[] = [
	{ tier: 'here', called: 'On this device', forWhat: 'What you are working on. The real version is always this one.' },
	{ tier: 'synced', called: 'A folder that syncs', forWhat: 'So losing this device does not lose the week.' },
	{ tier: 'cold', called: 'A bucket or a federation', forWhat: 'Things you are keeping rather than using. Reachable when you ask.' },
	{ tier: 'archive', called: 'A drive you unplug', forWhat: 'Records you must keep and expect never to open. Safe from anything online.' }
];

/**
 * Whether Q can find out for itself that a copy is still there.
 *
 * False for exactly one tier, and that one difference is the reason a person
 * can trust the other three.
 */
export function canBeChecked(tier: Tier): boolean {
	return tier !== 'archive';
}

export interface Place {
	id: string;
	/** What the person calls it. Shown as given. */
	name: string;
	tier: Tier;
	/**
	 * What would have to go wrong for this copy to be lost. Places that share a
	 * fate share a key: two folders in one Dropbox are both 'dropbox', and count
	 * once. Q cannot work this out — it is asked, like `synced` in keeping.ts.
	 */
	fate: string;
	/** When Q last confirmed the copy was there. Null when never, or never possible. */
	lastChecked: number | null;
}

export type Confidence =
	/** Asked recently, and it answered. */
	| 'checked'
	/** Could be asked, and has not been lately. */
	| 'stale'
	/** Cannot be asked at all. Believed, on the person's word. */
	| 'told';

/** A cold copy unconfirmed for longer than this is not something to rely on. */
export const CHECK_GOES_STALE_MS = 30 * 24 * 60 * 60 * 1000;

/** An archive copy unconfirmed for longer than this needs plugging in and looking at. */
export const ARCHIVE_GOES_UNSEEN_MS = 365 * 24 * 60 * 60 * 1000;

export interface PlaceStanding {
	confidence: Confidence;
	/** One line, in the words a person would use. Shown, not paraphrased. */
	says: string;
}

export function standingOfPlace(place: Place, now = Date.now()): PlaceStanding {
	if (!canBeChecked(place.tier)) {
		if (place.lastChecked === null) {
			return { confidence: 'told', says: `${place.name} has never been checked. Q is taking your word for it.` };
		}
		const since = now - place.lastChecked;
		const months = Math.floor(since / (30 * 24 * 60 * 60 * 1000));
		if (since >= ARCHIVE_GOES_UNSEEN_MS) {
			return {
				confidence: 'told',
				says: `${place.name} has not been seen for ${months} months. Q cannot reach it, so this is a memory, not a fact.`
			};
		}
		return {
			confidence: 'told',
			says: `${place.name} was last plugged in ${months < 1 ? 'this month' : `${months} months ago`}. Q cannot check it from here.`
		};
	}
	if (place.lastChecked === null) {
		return { confidence: 'stale', says: `${place.name} has not been checked yet.` };
	}
	if (now - place.lastChecked >= CHECK_GOES_STALE_MS) {
		return { confidence: 'stale', says: `${place.name} has not been checked in over a month.` };
	}
	return { confidence: 'checked', says: `${place.name} answered, and the copy is there.` };
}

/**
 * How many genuinely independent ways a thing could survive.
 *
 * Places that share a fate count once, because they fail once.
 */
export function waysToSurvive(places: Place[]): number {
	return new Set(places.map((p) => p.fate)).size;
}

export type SafetyLevel = 'fine' | 'warn' | 'danger';

export interface Safety {
	level: SafetyLevel;
	ways: number;
	says: string;
	fix: string;
}

/**
 * Whether what is kept is actually safe, rather than merely numerous.
 *
 * Three copies, more than one kind of place, and at least one that is not this
 * device. A person who has three folders on one laptop has one copy and a
 * false sense of it.
 */
export function howSafe(places: Place[], now = Date.now()): Safety {
	const ways = waysToSurvive(places);
	const offThisDevice = places.filter((p) => p.tier !== 'here');
	const offWays = new Set(offThisDevice.map((p) => p.fate)).size;

	if (ways === 0) {
		return { level: 'danger', ways, says: 'This is kept nowhere.', fix: 'Choose a folder to keep it in.' };
	}
	if (offWays === 0) {
		return {
			level: 'danger',
			ways,
			says: `Everything is on this device. ${places.length > 1 ? `The ${places.length} copies would all go together.` : 'There is one copy.'}`,
			fix: 'Add somewhere that is not this computer — a folder that syncs is the easiest.'
		};
	}
	if (ways < 3) {
		return {
			level: 'warn',
			ways,
			says: `There are ${ways} independent ${ways === 1 ? 'way' : 'ways'} this survives.`,
			fix: 'Three is the number worth aiming for, and one of them somewhere you unplug.'
		};
	}

	const unseen = places.filter((p) => standingOfPlace(p, now).confidence !== 'checked');
	if (unseen.length === places.length) {
		return {
			level: 'warn',
			ways,
			says: `There are ${ways} independent ways this survives, and none of them has been confirmed lately.`,
			fix: 'Check one, so at least one of these is a fact rather than a hope.'
		};
	}
	return {
		level: 'fine',
		ways,
		says: `There are ${ways} independent ways this survives.`,
		fix: ''
	};
}

export interface ArchiveRule {
	/** Things older than this belong on something you unplug. */
	afterMs: number;
	/** When the archive drive was last written to. Null when it never has been. */
	lastWrittenAt: number | null;
}

export interface Due {
	/** True when there is something to do now. */
	due: boolean;
	says: string;
	fix: string;
}

/**
 * Whether it is time to plug the archive drive in.
 *
 * The point of a reminder is that it escalates. A drive that was due in
 * January and is still not done in June must not keep saying the same
 * untroubled sentence, or it becomes wallpaper and the records are gone.
 */
export function archiveDue({ afterMs, lastWrittenAt }: ArchiveRule, now = Date.now()): Due {
	if (lastWrittenAt === null) {
		return {
			due: true,
			says: 'Nothing has ever been written to an archive drive.',
			fix: 'Plug one in and write the first one, before there is a year of it to do at once.'
		};
	}
	const since = now - lastWrittenAt;
	if (since < afterMs) return { due: false, says: 'The archive is up to date.', fix: '' };

	const overdueBy = since - afterMs;
	const months = Math.floor(overdueBy / (30 * 24 * 60 * 60 * 1000));
	if (months >= 6) {
		return {
			due: true,
			says: `The archive is ${months} months overdue. Anything from since then exists only where you are working.`,
			fix: 'Plug the drive in. This one has waited long enough to be the thing that goes wrong.'
		};
	}
	return {
		due: true,
		says: months < 1 ? 'The archive is due.' : `The archive is ${months} ${months === 1 ? 'month' : 'months'} overdue.`,
		fix: 'Plug the drive in when you can.'
	};
}

/**
 * What a federation can give back, and what it cannot.
 *
 * Darren: "you can rebuild your receipts from a record of a receipt on the
 * federation." True, and worth being exact about, because the difference
 * decides whether a promise is keepable.
 *
 * A federation holding only records — CIDs, times, question-set addresses,
 * acknowledgements — can rebuild your CATALOGUE: what you had, when, and where
 * to fetch it. It cannot rebuild the CONTENT, because it never had it. For
 * proving something existed on a date, the catalogue is often the whole point.
 * For getting the thing back, it is a shopping list.
 */
export type Rebuildable = 'catalogue' | 'everything' | 'nothing';

export function whatComesBack(holds: { records: boolean; blobs: boolean }): { can: Rebuildable; says: string } {
	if (holds.blobs && holds.records) {
		return { can: 'everything', says: 'They hold sealed copies as well as the records, so everything comes back.' };
	}
	if (holds.records) {
		return {
			can: 'catalogue',
			says: 'They hold the records but not the contents, so you get back what you had and where to find it — not the things themselves.'
		};
	}
	return { can: 'nothing', says: 'They hold nothing of yours.' };
}
