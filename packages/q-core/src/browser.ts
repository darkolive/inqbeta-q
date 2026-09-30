/*
 * What this browser can be trusted to do.
 *
 * REVISED 2026-09-23 (Darren): read-only Safari "ruined the whole experience".
 * The browser's own storage is the fastest, hottest place to work, so it is
 * where work is saved — and the durable copy is one button, "Back up now",
 * that takes the whole vault out. Seven days is the window; the button is the
 * answer, not a wall of warnings. What follows is the earlier reasoning, kept
 * for the record.
 *
 * Decided 2026-09-19, after a folder was lost: a browser that cannot keep a
 * folder is a READER. It opens your vault, shows you everything in it and
 * checks every signature — and it does not let you make anything, because
 * anything it made would live in a cache with a seven-day fuse and look exactly
 * as convincing as a real receipt while it lasted.
 *
 * Darren: "this will read but cannot write. Therefore what you do on here will
 * not be saved."
 *
 * Strictly, such a browser CAN write — into its own private storage, which
 * Safari's tracking prevention deletes after seven days of not opening the
 * site, and which a routine clean takes sooner. Calling that "writing" is the
 * lie that cost a folder. It cannot KEEP, and keeping is the only part that
 * matters to evidence.
 *
 * The check is on the capability, never on the name. Browsers gain features,
 * and a list of user-agent strings is wrong the moment one of them ships a
 * folder picker. `browserCan` takes what was detected so it can be tested; only
 * `thisBrowser` touches a window.
 */

export interface Features {
	/** `showDirectoryPicker` — a real folder, readable and writable, remembered. */
	directoryPicker: boolean;
	/** `input webkitdirectory` — a folder that can be read, once, now. */
	directoryInput: boolean;
	/** The browser's own private storage. Fast, and on a timer. */
	privateStorage: boolean;
}

export interface BrowserCan {
	/** Save work here. True wherever there is somewhere to write — a folder, or the browser's own storage. */
	keep: boolean;
	/** Open a vault and read what is in it. */
	read: boolean;
	/**
	 * What is saved here lives in the browser, not a folder on disk, so the
	 * copy that counts is the one taken out with "Back up now". The page shows
	 * that one button and otherwise gets out of the way.
	 */
	backup: boolean;
	/** One line for a person, in their words. */
	says: string;
	/** What to do about it, when there is something. */
	fix: string;
}

export function browserCan(f: Features): BrowserCan {
	if (f.directoryPicker) {
		return {
			keep: true,
			read: true,
			backup: false,
			says: 'This browser can keep a folder on your computer, so what you make here is saved.',
			fix: ''
		};
	}

	if (f.privateStorage) {
		return {
			keep: true,
			read: true,
			backup: true,
			says: 'Saved in this browser as you work. Press Back up now to take a copy out — Safari clears a site it has not seen for seven days.',
			fix: ''
		};
	}

	if (f.directoryInput) {
		return {
			keep: false,
			read: true,
			backup: false,
			says: 'This browser can open your vault and read it, but it has nowhere to save anything.',
			fix: 'Use Safari, Chrome or Edge to add anything.'
		};
	}

	return {
		keep: false,
		read: false,
		backup: false,
		says: 'This browser cannot work with files at all.',
		fix: 'Use Safari, Chrome or Edge.'
	};
}

/** What the browser this is running in can do. */
export function thisBrowser(): BrowserCan {
	if (typeof window === 'undefined') {
		return browserCan({ directoryPicker: false, directoryInput: false, privateStorage: false });
	}
	return browserCan({
		directoryPicker: typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function',
		/* Feature-detected the way the input itself reports it, not by name. */
		directoryInput: 'webkitdirectory' in document.createElement('input'),
		privateStorage: typeof navigator?.storage?.getDirectory === 'function'
	});
}
