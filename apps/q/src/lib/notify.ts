/*
 * Your notifications card (ADR-Q-016 §6, ADR-Q-015 §2).
 *
 * For each source, one of three answers:
 *   ring  — the bell moves and counts it
 *   quiet — it's listed in the bell, with no count and no movement
 *   off   — Q doesn't listen at all, so the noise never arrives
 *
 * It's decided on this device and kept here. Nobody else sees it, and a
 * federation can't tell who has turned it down or off.
 */
export type Reach = 'ring' | 'quiet' | 'off';

/** 'people', or 'fed:<federation DID>'. Card updates and system come later. */
export type Source = 'people' | `fed:${string}`;

/** What each source may choose. People can be quiet, never off: a message needs you. */
export const CHOICES: Record<'people' | 'fed', Reach[]> = {
	people: ['ring', 'quiet'],
	fed: ['ring', 'quiet', 'off']
};

export const SAYS: Record<Reach, { label: string; means: string }> = {
	ring: { label: 'Ring', means: 'The bell moves and counts it.' },
	quiet: { label: 'Quietly', means: 'It’s in the bell, but no count and no movement.' },
	off: { label: 'Off', means: 'Nothing arrives from them at all.' }
};

/* Belongs to whoever is signed in, so it goes when they sign out (q-core storage.ts). */
const KEY = 'q.notify';
const DEFAULTS = { people: 'ring', fed: 'quiet' } as const;

function readAll(): Record<string, Reach> {
	try {
		return JSON.parse(localStorage.getItem('q.notify') ?? '{}') as Record<string, Reach>;
	} catch {
		return {};
	}
}

export function reachFor(source: Source, all: Record<string, Reach> = readAll()): Reach {
	const kind = source === 'people' ? 'people' : 'fed';
	const chosen = all[source];
	return chosen && CHOICES[kind].includes(chosen) ? chosen : DEFAULTS[kind];
}

export function setReach(source: Source, reach: Reach): void {
	try {
		localStorage.setItem('q.notify', JSON.stringify({ ...readAll(), [source]: reach }));
	} catch {
		/* No storage: the default stands. */
	}
	window.dispatchEvent(new CustomEvent(KEY));
}

/** Put back what your vault remembers, after signing in. What this browser already says wins. */
export function restoreReach(kept: Record<string, Reach>): void {
	const now = readAll();
	const merged = { ...kept, ...now };
	if (JSON.stringify(merged) === JSON.stringify(now)) return;
	try {
		localStorage.setItem('q.notify', JSON.stringify(merged));
	} catch {
		return;
	}
	window.dispatchEvent(new CustomEvent(KEY));
}

/** Everything chosen on the card, as kept. */
export function allReach(): Record<string, Reach> {
	return readAll();
}

/** Calls you now, and again whenever the card changes (in this tab or another). */
export function watchReach(cb: (all: Record<string, Reach>) => void): () => void {
	const fire = () => cb(readAll());
	const onStorage = (e: StorageEvent) => e.key === KEY && fire();
	fire();
	window.addEventListener(KEY, fire);
	window.addEventListener('storage', onStorage);
	return () => {
		window.removeEventListener(KEY, fire);
		window.removeEventListener('storage', onStorage);
	};
}
