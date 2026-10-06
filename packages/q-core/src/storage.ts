/*
 * Every key Q writes to a browser, in one place.
 *
 * Signing out used to clear the remembered DID and nothing else, which left a
 * person's address book, session and second-factor settings in localStorage for
 * whoever sat down next. That is not a tidiness problem; on a shared machine it
 * is the whole promise broken.
 *
 * The reason it happened is worth naming: each module reached for localStorage
 * on its own, so nothing could say what "everything" was. This file is that
 * list, and `test/storage.test.ts` reads the source and fails if a key is
 * written anywhere without appearing here. A key that nobody remembered to
 * clear can no longer be added quietly.
 *
 * IDENTITY vs DEVICE. Identity keys belong to whoever was signed in and go when
 * they leave. Device keys are how this browser is set up — the theme, where the
 * passkey lives — and survive, because clearing them punishes the next person
 * rather than protecting the last one.
 *
 * NOT HERE: the folder. Its handle lives in IndexedDB keyed by DID, and signing
 * out deliberately leaves it, so signing back in opens the same folder without
 * asking. Giving up a folder is `forgetFolder()` — a separate thing a person
 * does on purpose.
 */

export type KeyKind =
	/** Belongs to whoever was signed in. Cleared when they leave. */
	| 'identity'
	/** How this browser is set up. Survives sign-out. */
	| 'device';

export interface StoredKey {
	key: string;
	where: 'local' | 'session';
	kind: KeyKind;
	/** What it holds, so a reader can judge the classification rather than trust it. */
	holds: string;
}

export const STORED_KEYS: StoredKey[] = [
	{ key: 'dostudy-passkey-did', where: 'local', kind: 'identity', holds: 'the public DID, so the header can offer "touch to carry on"' },
	{ key: 'inqbeta-address-book', where: 'local', kind: 'identity', holds: 'contact cards received from other people' },
	{ key: 'inqbeta-session', where: 'local', kind: 'identity', holds: 'the read-level session and when it expires' },
	{ key: 'inqbeta-second-factor', where: 'local', kind: 'identity', holds: 'second-factor settings and a masked contact' },
	{ key: 'inqbeta-second-factor-pending', where: 'local', kind: 'identity', holds: 'a second-factor check part-way through' },
	{ key: 'inqbeta-zk-2fa', where: 'local', kind: 'identity', holds: 'the zero-knowledge 2FA contact hash' },
	{ key: 'inqbeta-zk-pending', where: 'local', kind: 'identity', holds: 'a zero-knowledge 2FA check part-way through' },
	{ key: 'q-vault-synced', where: 'local', kind: 'identity', holds: 'that the person said their vault folder syncs somewhere' },
	{ key: 'q-vault-downloaded', where: 'local', kind: 'identity', holds: 'when the whole vault was last downloaded as one sealed file, so Q knows when the next is due' },
	{ key: 'q.backups', where: 'local', kind: 'identity', holds: 'when each copy of the vault happens (cloud, bucket, host pass-through, download) — also kept in the vault' },
	{ key: 'q-vault-exported', where: 'local', kind: 'identity', holds: 'when the vault was last taken out of this browser' },
	{ key: 'q.announcements.read', where: 'local', kind: 'identity', holds: 'which federation announcements the person has opened (their ids only)' },
	{ key: 'q.notify', where: 'local', kind: 'identity', holds: 'the notifications card: what rings, what is quiet, what is off (ADR-Q-016 §6)' },
	{ key: 'q.office-keys', where: 'local', kind: 'identity', holds: 'the public key (DID) of each office you hold, so post arriving for it goes on its shelf in your folder sealed to the office (ADR-Q-038); forgotten when the office ends' },
	{ key: 'q.notify.hours', where: 'local', kind: 'identity', holds: 'office hours for post to an office you hold: days, hours and time zone (ADR-Q-038); also carried in your signed office-post notices' },
	{ key: 'q.tester', where: 'local', kind: 'device', holds: 'the name and device a tester gives on the Testing page, so each report needn’t ask again — a preference' },
	{ key: 'q.plugins', where: 'local', kind: 'identity', holds: 'which installed plugins show in the menu, and in what order — also kept in the vault' },
	{ key: 'q.call.choice', where: 'local', kind: 'device', holds: 'which camera and microphone this browser uses for calls — a preference' },
	{ key: 'q-nav-folded', where: 'local', kind: 'device', holds: 'whether the side menu is folded to icons — a preference' },
	{ key: 'q-nav-open', where: 'local', kind: 'device', holds: 'which groups of the side menu are open — a preference' },
	{ key: 'q-key-place', where: 'local', kind: 'device', holds: 'where this person keeps their passkey — a preference, not a secret' },
	{ key: 'inqbeta-q-mode', where: 'local', kind: 'device', holds: 'light or dark' },
	{ key: 'q-lang', where: 'local', kind: 'device', holds: 'which language Q is read in — a preference' },
	{ key: 'q-passkey-used', where: 'session', kind: 'identity', holds: 'which passkey signed in (its public id), so the vault pointer can be noted on it' },
	{ key: 'q.relay.custody', where: 'local', kind: 'identity', holds: 'custody receipts for vault files passing through the host’s relay: what it holds, and what has arrived elsewhere (ADR-Q-028)' },
	{ key: 'q.decks.hidden', where: 'local', kind: 'identity', holds: 'which story decks this person has put away, so they stay folded until opened again' },
	{ key: 'q.storybooks', where: 'local', kind: 'device', holds: 'story books being made in the story engine on this browser, each as its chain of steps (ADR-Q-033). Not tied to a sign-in until books move into the vault, so signing out never loses someone’s half-made book' },
	{ key: 'q.decks.voice', where: 'local', kind: 'device', holds: 'whether the stories are told aloud as they play (on or off) — a preference' },
	{ key: 'q.intro.closed', where: 'local', kind: 'identity', holds: 'which pages’ intro panels this person has closed, so they stay closed until “What is this page?” is pressed' },
	{ key: 'q.call.with', where: 'session', kind: 'identity', holds: 'for one page load: who a call answered from the ring came from, so the answer goes back to them' },
	{ key: 'q-google-oauth', where: 'session', kind: 'identity', holds: 'a Google Drive sign-in part-way through: the PKCE verifier and state, for one redirect' },
	{ key: 'q:acting', where: 'local', kind: 'identity', holds: 'which office this person has taken up, if any, for which federation, with its mandates and the signed take-up (ADR-Q-038), so the role band survives a reload; setting it down or signing out clears it' },
	{ key: 'q.door.names', where: 'local', kind: 'identity', holds: 'the names a host’s founder gave the people holding tester passes (ADR-Q-034), kept only on their own computer: the door itself only ever sees DIDs' },
	{ key: 'q-continuity', where: 'local', kind: 'device', holds: 'signed continuity envelopes (ADR-Q-005) — public by design, kept so a way-in passkey can sign in on this browser; survives sign-out' }
];

/**
 * Keys made up as they're written (a DID or a mint in the name). Each family
 * is declared by its prefix, and signing out clears every key that starts with
 * an identity prefix.
 */
export const STORED_PREFIXES: (Omit<StoredKey, 'key'> & { prefix: string })[] = [
	{ prefix: 'q:battery-said:', where: 'local', kind: 'identity', holds: 'which battery warning (half, a quarter, the last cell, empty) this person was last given for each coin, so the bell says each once (lib/battery-watch.ts)' }
];

/** Everything that goes when somebody signs out. */
export function identityKeys(): StoredKey[] {
	return STORED_KEYS.filter((k) => k.kind === 'identity');
}

/**
 * Clear what belonged to whoever was signed in.
 *
 * Each removal is tried on its own: a browser that refuses one must not stop
 * the rest being cleared, because a half-cleared browser is the worst outcome
 * of the three.
 */
export function clearIdentityStorage(): void {
	for (const k of identityKeys()) {
		try {
			(k.where === 'session' ? sessionStorage : localStorage).removeItem(k.key);
		} catch {
			/* Private window, blocked storage, or nothing to remove. */
		}
	}
	for (const p of STORED_PREFIXES.filter((x) => x.kind === 'identity')) {
		try {
			const store = p.where === 'session' ? sessionStorage : localStorage;
			const doomed: string[] = [];
			for (let i = 0; i < store.length; i++) {
				const k = store.key(i);
				if (k?.startsWith(p.prefix)) doomed.push(k);
			}
			for (const k of doomed) store.removeItem(k);
		} catch {
			/* as above */
		}
	}
}
