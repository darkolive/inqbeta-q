/*
 * Your calls (2 October 2026): one line per call, newest first, drawn from the
 * call receipts already in your vault (ADR-Q-004). Who, when, which way, and
 * how long. Never what was said, because it was never written down.
 */
import { isCallChain } from '@inqbeta/q-core/calls';
import type { Ledger } from './ledger';
import { oneRowPerCall } from './receipts';

export interface CallLogRow {
	call: string;
	/** The other person's DID ('' when a link call was never answered). */
	other: string;
	outgoing: boolean;
	answered: boolean;
	at: string;
	seconds: number;
}

export function callLog(ledger: Ledger | null, me: string): CallLogRow[] {
	const rows: CallLogRow[] = [];
	for (const r of oneRowPerCall(ledger?.receipts ?? [])) {
		if (!isCallChain(r.json)) continue;
		const steps = r.json.steps;
		const placed = steps[0];
		if (!placed?.content?.call) continue;
		const accepted = steps.find((s) => s.content.event === 'call.accepted');
		const outgoing = placed.did === me;
		const other = outgoing ? (accepted?.did ?? placed.content.to ?? '') : placed.did;
		const ends = steps.filter((s) => s.content.event === 'call.ended').map((s) => Date.parse(s.content.at));
		const seconds = accepted && ends.length ? Math.max(0, Math.round((Math.max(...ends) - Date.parse(accepted.content.at)) / 1000)) : 0;
		rows.push({ call: placed.content.call, other, outgoing, answered: !!accepted, at: placed.content.at, seconds });
	}
	return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** "4 minutes", "40 seconds". */
export function howLong(s: number): string {
	if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
	const m = Math.round(s / 60);
	return m < 60 ? `${m} minute${m === 1 ? '' : 's'}` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
