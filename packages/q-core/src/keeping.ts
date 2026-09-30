/*
 * Whether a place is fit to keep things in, said plainly.
 *
 * Darren lost a folder to this on 2026-09-19. He cleared website data for
 * localhost and everything went. The warning was there — at the bottom of a
 * panel, in a hint, in the middle of a sentence about adding the page to the
 * Dock. Nobody reads that, and nobody should have to.
 *
 * WHAT SAFARI ACTUALLY DOES. Intelligent Tracking Prevention deletes all
 * script-writable storage — IndexedDB, localStorage, service workers, and the
 * origin-private file system with them — after SEVEN DAYS of no interaction
 * with the site. Not on a clean. On a schedule. A person who does not open Q
 * for a week loses everything in it, silently, with nothing to blame.
 *
 * That is not "risky". It means a browser that has no folder picker cannot be
 * a home for anyone's data, and Q must not present it as one. Browser storage
 * is a place to work, and the work has to leave.
 *
 * It would break a folder on disk too, if Safari had a picker: the HANDLE
 * lives in IndexedDB, and ITP takes that on the same schedule. Q would keep
 * the files and forget where they were.
 *
 * WHAT SURVIVES. The passkey — it lives in a keychain, not in the page. So an
 * identity comes back after any amount of clearing, and everything the browser
 * was holding does not. Worth knowing which half of the promise is real.
 *
 * A pure function with no browser in it, so the rules can be tested rather
 * than reworded by each screen that shows them.
 */

export type Keeping =
	/** A folder on this computer. The browser can forget where it is; it cannot delete it. */
	| 'disk'
	/** Inside the browser. Fast, and the working copy; "Back up now" is what makes it safe. */
	| 'browser'
	/**
	 * A cluster run by a federation someone belongs to. A copy, never the
	 * original: it is as current as the last push and no more.
	 */
	| 'federation'
	/**
	 * Rented space on a storage network — strangers' disks, sealed. A copy,
	 * never the original, and the only tier where nobody can be asked for
	 * anything.
	 */
	| 'network'
	/** Nowhere yet. */
	| 'none';

export type RiskLevel =
	/** Fit to keep things in. */
	| 'fine'
	/** Works, but something needs saying. */
	| 'warn'
	/** Will lose the person's work. Say so before they put anything in it. */
	| 'danger';

export interface Risk {
	level: RiskLevel;
	/** One line, in the words a person would use. Shown, not paraphrased. */
	says: string;
	/** What to do about it. Empty when there is nothing to do. */
	fix: string;
	/** True when this place cannot be relied on at all, whatever else is true. */
	temporary: boolean;
}

export interface Keeps {
	where: Keeping;
	/** Copy locations that are not this one. A second copy changes the answer. */
	copies: number;
	/**
	 * The person said this folder syncs somewhere — iCloud Drive, Dropbox,
	 * OneDrive.
	 *
	 * Q cannot work this out. A browser hands over a folder's NAME and nothing
	 * else: no path, no volume, no clue whether something is watching it. So it
	 * is asked rather than detected, and believed, because the person can see
	 * their own Finder and Q cannot.
	 */
	synced?: boolean;
	/** When "Back up now" last took the vault out of the browser. Only read for 'browser'. */
	backedUpAt?: number | null;
}

/**
 * Where to put a vault, and why.
 *
 * Offered at the moment somebody chooses, because that is the only moment the
 * advice is free. Afterwards it is a migration.
 */
export const WHERE_TO_KEEP: { name: string; why: string }[] = [
	{ name: 'iCloud Drive', why: 'On every Apple device you own, and it survives this computer.' },
	{ name: 'Dropbox, OneDrive or Google Drive', why: 'The same, if you already use one. Your files are sealed before they leave, so the company holding them cannot read any of it.' },
	{ name: 'Documents', why: 'Fine, and backed up by Time Machine — but only on this computer.' }
];

/**
 * Where not to, and why — worth saying, because one of these is what a folder
 * picker opens in by default on most sites.
 */
export const WHERE_NOT_TO_KEEP: { name: string; why: string }[] = [
	{ name: 'Downloads', why: 'People empty it. Some cleaning tools empty it for them.' },
	{ name: 'A USB stick you unplug', why: 'Q cannot write to what is not there, and will not know what it missed.' }
];

const DAY = 86_400_000;

export function riskOf({ where, copies, synced, backedUpAt = null }: Keeps, now = Date.now()): Risk {
	if (where === 'none') {
		return {
			level: 'warn',
			says: 'Nothing is being kept anywhere yet.',
			fix: 'Choose a folder, and what you save goes into it locked to your passkey.',
			temporary: false
		};
	}

	/* A remote copy is never the current one. The device in front of the person
	 * holds the original; everything out there is as good as the last push.
	 * Saying this plainly is the whole difference between a backup and a
	 * promise nobody checked. */
	if (where === 'federation' || where === 'network') {
		const who =
			where === 'federation'
				? 'A federation you belong to keeps a sealed copy. You can ask them to remove it, and they can refuse.'
				: 'Strangers keep a sealed copy. They cannot read it, and they will not delete it because you asked.';
		return {
			level: copies > 0 ? 'warn' : 'danger',
			says: `${who} It is only as current as the last time you pushed.`,
			fix:
				copies > 0
					? 'Keep the copy on this device current — that is the one that counts.'
					: 'This cannot be the only place. Keep a folder on this device; the one in front of you is the real one.',
			temporary: false
		};
	}

	if (where === 'browser') {
		/* Revised 2026-09-23. The browser is where the work is, and it is fast;
		 * the backup is what makes it safe. So the answer turns on one thing —
		 * how long since "Back up now" — and it is said calmly. The seven days
		 * are Safari's: a site not opened for a week is cleared. */
		const since = backedUpAt ? Math.floor((now - backedUpAt) / DAY) : null;
		if (since !== null && since < 7) {
			return {
				level: 'fine',
				says: `Saved in this browser, and backed up ${since === 0 ? 'today' : since === 1 ? 'yesterday' : `${since} days ago`}.`,
				fix: '',
				temporary: true
			};
		}
		return {
			level: 'warn',
			says:
				since === null
					? 'Saved in this browser, and not backed up yet.'
					: `Saved in this browser. The last backup was ${since} days ago.`,
			fix:
				copies > 0
					? 'Press Back up now to bring your copy up to date.'
					: 'Press Back up now and keep the file somewhere that is not a browser — iCloud Drive is ideal.',
			temporary: true
		};
	}

	const elsewhere = copies + (synced ? 1 : 0);
	if (elsewhere > 0) {
		const both = copies > 0 && synced;
		return {
			level: 'fine',
			says: synced
				? both
					? `Kept in a folder that syncs, with ${copies} other ${copies === 1 ? 'copy' : 'copies'} besides.`
					: 'Kept in a folder that syncs, so it is on your other devices too.'
				: `Kept in a folder on this computer, with ${copies} other ${copies === 1 ? 'copy' : 'copies'}.`,
			fix: '',
			temporary: false
		};
	}
	return {
		level: 'warn',
		says: 'Kept in a folder on this computer, and nowhere else.',
		fix: 'One copy is not a backup. Keep it in a folder that syncs — iCloud Drive, Dropbox, OneDrive — or add a copy location.',
		temporary: false
	};
}

/**
 * Whether a browser can be trusted to keep something at all.
 *
 * A browser with no folder picker has nowhere durable to put anything: its own
 * storage is on a timer, and a handle to a real folder would be on the same
 * timer. Said as its own function because it decides what Q offers a person,
 * not merely what it tells them.
 *
 * A federation cluster and a rented bucket are both false here too, and for a
 * different reason: they hold copies, not originals. The current version is
 * the one on the device in front of the person. Somewhere that can only ever
 * be behind is not somewhere work lives.
 */
export function canKeep(where: Keeping): boolean {
	/* 2026-09-23: the browser keeps the working copy; "Back up now" keeps it safe. */
	return where === 'disk' || where === 'browser';
}

/**
 * How far behind a remote copy is, said the way a person would say it.
 *
 * Needed because the promise Q makes is that the version in front of you is
 * the real one — which is only reassuring if Q is willing to admit how old
 * the other ones are. A backup nobody knows the age of is a guess.
 */
export function howStale(lastPushAt: number | null, now = Date.now()): string {
	if (lastPushAt === null) return 'Never pushed, so there is no copy out there yet.';
	const mins = Math.floor((now - lastPushAt) / 60_000);
	if (mins < 1) return 'Up to date as of just now.';
	if (mins < 60) return `Up to date as of ${mins} ${mins === 1 ? 'minute' : 'minutes'} ago.`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} behind what is on this device.`;
	const days = Math.floor(hours / 24);
	return `${days} ${days === 1 ? 'day' : 'days'} behind what is on this device.`;
}
