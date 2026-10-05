/*
 * The battery, watched (5 October 2026, ADR-Q-035): a notice in your bell
 * as each coin's battery drains past a mark, once per mark. Darren: "you
 * should get in your bell when your battery is down towards the amber
 * halfway … and each phase follows by another warning going now you're
 * really getting low."
 *
 * Marks: half (amber), a quarter, the last cell (red), empty. Each is said
 * once on the way down; when the battery charges back above a mark, that
 * mark can be said again next time. Remembered in this browser only.
 */
export interface BatteryNotice {
	mint: string;
	phase: number;
	level: number;
	tone: 'warning' | 'error';
	says: string;
}

const MARKS = [
	{ at: 0.5, tone: 'warning', says: (c: string) => `Your ${c} battery is half down. Worth topping up before it gets low.` },
	{ at: 0.25, tone: 'warning', says: (c: string) => `Your ${c} battery is getting low: a quarter left above what’s committed.` },
	{ at: 0.1, tone: 'error', says: (c: string) => `Your ${c} battery is really low: the last cell. Get more credits soon.` },
	{ at: 0, tone: 'error', says: (c: string) => `Your ${c} battery is empty: everything you hold is committed. Add credits to cash out or commit more.` }
] as const;

const KEY = (did: string, mint: string) => `q:battery-said:${did}:${mint}`;
function said(did: string, mint: string): number {
	try {
		return Number(localStorage.getItem(KEY(did, mint)) ?? '-1');
	} catch {
		return -1;
	}
}
function remember(did: string, mint: string, phase: number) {
	try {
		localStorage.setItem(KEY(did, mint), String(phase));
	} catch {
		/* not kept: it may be said again */
	}
}

/**
 * The notice to put in the bell, if the battery has just passed a mark it
 * hasn't been warned about; null otherwise. `level` is 0 to 1 (enoughLevel).
 * `held` is 0 when there's nothing to watch.
 */
export function batteryNotice(did: string, mint: string, coin: string, level: number, held: number): BatteryNotice | null {
	if (!did || !mint || held <= 0) return null;
	/* The lowest mark the battery is at or below now (-1: above them all). */
	let phase = -1;
	MARKS.forEach((m, i) => {
		if (level <= m.at + 1e-9) phase = i;
	});
	const before = said(did, mint);
	if (phase < before) {
		/* Charged back up: forget the marks it's now above. */
		remember(did, mint, phase);
		return null;
	}
	if (phase === -1 || phase === before) return null;
	remember(did, mint, phase);
	const m = MARKS[phase];
	return { mint, phase, level, tone: m.tone, says: m.says(coin) };
}
