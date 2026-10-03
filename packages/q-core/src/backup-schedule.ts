/*
 * When each copy happens (ADR-Q-028 §6, 3 October 2026).
 *
 * Darren: "Each host sets when that happens. So is it quarterly, once a day,
 * four times a day, on every save? That again can go in your settings, when
 * you want your backup to happen as a user."
 *
 * The choices, and the plain rules that say whether a copy is due. A download
 * can't happen on its own — browsers don't save files without you — so when
 * one is due, Q asks once, calmly, and does it in one tap.
 */
export type CloudEvery = 'five-minutes' | 'four-times-a-day' | 'daily';
export type BucketEvery = 'every-save' | 'five-minutes';
export type DownloadEvery = 'weekly' | 'monthly' | 'quarterly' | 'never';

export interface BackupChoices {
	/** Google Drive, Dropbox, OneDrive. */
	cloud: CloudEvery;
	/** Your own bucket. */
	bucket: BucketEvery;
	/** Your host's pass-through, when your cloud can't take something. */
	relay: 'on' | 'off';
	/** A sealed file in your downloads. */
	download: DownloadEvery;
}

export const DEFAULT_CHOICES: BackupChoices = { cloud: 'five-minutes', bucket: 'every-save', relay: 'on', download: 'monthly' };

export const CHOICES = {
	cloud: [
		{ id: 'five-minutes', words: 'Every five minutes, and just after anything new' },
		{ id: 'four-times-a-day', words: 'Four times a day' },
		{ id: 'daily', words: 'Once a day' }
	],
	bucket: [
		{ id: 'every-save', words: 'On every save' },
		{ id: 'five-minutes', words: 'Every five minutes' }
	],
	relay: [
		{ id: 'on', words: 'On: when your cloud can’t take something, your host holds it until it can' },
		{ id: 'off', words: 'Off: what’s new waits on this device until your cloud is back' }
	],
	download: [
		{ id: 'weekly', words: 'Once a week' },
		{ id: 'monthly', words: 'Once a month' },
		{ id: 'quarterly', words: 'Once a quarter' },
		{ id: 'never', words: 'Never (Q won’t ask)' }
	]
} as const satisfies Record<keyof BackupChoices, readonly { id: string; words: string }[]>;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const GAP: Record<CloudEvery, number> = { 'five-minutes': 0, 'four-times-a-day': 6 * HOUR, daily: DAY };
const DOWNLOAD_GAP: Record<DownloadEvery, number> = { weekly: 7 * DAY, monthly: 30 * DAY, quarterly: 91 * DAY, never: Infinity };

/** Choices from anything (a saved copy, an old version): every field checked, the rest defaults. */
export function choicesFrom(raw: unknown): BackupChoices {
	const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const pick = <K extends keyof BackupChoices>(k: K): BackupChoices[K] => (CHOICES[k] as readonly { id: string }[]).some((c) => c.id === o[k]) ? (o[k] as BackupChoices[K]) : DEFAULT_CHOICES[k];
	return { cloud: pick('cloud'), bucket: pick('bucket'), relay: pick('relay'), download: pick('download') };
}

/**
 * Is a cloud copy due? Every five minutes: always (the timer and new writes
 * decide). Four times a day, or daily: once that long has passed since the
 * last copy, whatever woke the sync. Signing out always carries everything.
 */
export function cloudDue(lastAt: number, every: CloudEvery, now = Date.now(), signingOut = false): boolean {
	return signingOut || now - lastAt >= GAP[every];
}

/** Your bucket: on every save it goes whenever anything new is written; otherwise on the five-minute timer. */
export function bucketDue(every: BucketEvery, why: 'write' | 'timer' | 'visible' | 'signing-out'): boolean {
	return every === 'every-save' || why !== 'write';
}

/** Is a download due? Never for 'never'; otherwise once the gap has passed since the last one (or there's never been one). */
export function downloadDue(lastAt: number, every: DownloadEvery, now = Date.now()): boolean {
	return every !== 'never' && now - lastAt >= DOWNLOAD_GAP[every];
}
