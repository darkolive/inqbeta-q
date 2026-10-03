/*
 * Your backup choices (ADR-Q-028 §6): when each copy happens. Kept in this
 * browser for quickness and in your vault with your other settings, so they
 * come back on any device that opens your vault.
 */
import { choicesFrom, DEFAULT_CHOICES, type BackupChoices } from '@inqbeta/q-core/backup-schedule';

const KEY = 'q.backups';

function read(): BackupChoices {
	try {
		return choicesFrom(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
	} catch {
		return DEFAULT_CHOICES;
	}
}

export const backups = $state<{ choices: BackupChoices }>({ choices: typeof window === 'undefined' ? DEFAULT_CHOICES : read() });

export function choose<K extends keyof BackupChoices>(k: K, v: BackupChoices[K]) {
	backups.choices = { ...backups.choices, [k]: v };
	try {
		localStorage.setItem(KEY, JSON.stringify(backups.choices));
	} catch {
		/* the vault copy still keeps them */
	}
}

/** Put back what your vault remembers, after signing in. */
export function restoreBackups(raw: unknown) {
	if (!raw) return;
	backups.choices = choicesFrom(raw);
	try {
		localStorage.setItem(KEY, JSON.stringify(backups.choices));
	} catch {
		/* fine */
	}
}

/** Now, outside any component (the sync reads it). */
export const currentChoices = (): BackupChoices => backups.choices;
