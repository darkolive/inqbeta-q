/*
 * Your calls (2 October 2026): one line per call, newest first, drawn from the
 * call receipts already in your vault (ADR-Q-004). Who, when, which way, and
 * how long. Never what was said, because it was never written down.
 */
import { isCallChain } from '@inqbeta/q-core/calls';
import type { Ledger } from './ledger';
import { oneRowPerCall } from './receipts';
import { voicemailsIn } from './voicemail';
import type { Signed } from './messages';

export interface CallLogRow {
	call: string;
	/** The other person's DID ('' when a link call was never answered). */
	other: string;
	outgoing: boolean;
	answered: boolean;
	at: string;
	seconds: number;
	/** A voice message left after it wasn't answered (ADR-Q-022). */
	voicemail?: Signed;
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
	/* Voice messages join the call they followed; one for a call you never saw ring is its own line. */
	for (const v of voicemailsIn(ledger?.receipts ?? [])) {
		const row = v.content.call ? rows.find((r) => r.call === v.content.call) : undefined;
		if (row) row.voicemail = v;
		else {
			const mine = v.did === me;
			rows.push({ call: v.content.call ?? v.contentHash, other: mine ? v.content.to : v.did, outgoing: mine, answered: false, at: v.content.at, seconds: 0, voicemail: v });
		}
	}
	return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** "4 minutes", "40 seconds". */
export function howLong(s: number): string {
	if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
	const m = Math.round(s / 60);
	return m < 60 ? `${m} minute${m === 1 ? '' : 's'}` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
