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
import { hoursOk, inHours, type OfficeHours } from '@inqbeta/q-core/offices';

export type Reach = 'ring' | 'quiet' | 'off';

/**
 * 'people' (personal messages), 'offices' (post for an office you hold,
 * ADR-Q-038), or 'fed:<federation DID>' (a federation's news). Work and
 * business come with business cards (ADR-Q-039).
 */
export type Source = 'people' | 'offices' | `fed:${string}`;

/**
 * What each source may choose. 2 October 2026 (Darren): "it's either you get
 * notified of things from that source, or you don't." So: on (the bell rings
 * and counts) or off. A choice of "quiet" kept from before counts as on.
 */
export const CHOICES: Record<'people' | 'offices' | 'fed', Reach[]> = {
	people: ['ring', 'off'],
	offices: ['ring', 'off'],
	fed: ['ring', 'off']
};

export const SAYS: Record<Reach, { label: string; means: string }> = {
	ring: { label: 'Ring', means: 'The bell moves and counts it.' },
	quiet: { label: 'Quietly', means: 'It’s in the bell, but no count and no movement.' },
	off: { label: 'Off', means: 'Nothing arrives from them at all.' }
};

/* Belongs to whoever is signed in, so it goes when they sign out (q-core storage.ts). */
const KEY = 'q.notify';
const DEFAULTS = { people: 'ring', offices: 'ring', fed: 'ring' } as const;

function readAll(): Record<string, Reach> {
	try {
		return JSON.parse(localStorage.getItem('q.notify') ?? '{}') as Record<string, Reach>;
	} catch {
		return {};
	}
}

export function reachFor(source: Source, all: Record<string, Reach> = readAll()): Reach {
	const kind = source === 'people' ? 'people' : source === 'offices' ? 'offices' : 'fed';
	const chosen = all[source] === 'quiet' ? 'ring' : all[source];
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

/* ---- Office hours (ADR-Q-038, 6 October 2026) ----
 * When post for an office you hold rings. Out of hours it waits on the desk,
 * quietly; you can check in any time. Kept on this device, and carried in
 * your signed office-post notices, so whoever writes is told before they send.
 */
const HOURS_KEY = 'q.notify.hours';
export function officeHours(): OfficeHours | null {
	try {
		const h = JSON.parse(localStorage.getItem(HOURS_KEY) ?? 'null') as unknown;
		return hoursOk(h) ? h : null;
	} catch {
		return null;
	}
}
export function setOfficeHours(h: OfficeHours | null): void {
	try {
		if (h && hoursOk(h)) localStorage.setItem(HOURS_KEY, JSON.stringify(h));
		else localStorage.removeItem(HOURS_KEY);
	} catch {
		/* No storage: any time. */
	}
	window.dispatchEvent(new CustomEvent(KEY));
}
/** Should post for an office ring now? On, and in your hours. */
export const officePostRings = (now = new Date()) => reachFor('offices') === 'ring' && inHours(officeHours(), now);
