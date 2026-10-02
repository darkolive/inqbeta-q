/*
 * Your use, drawn from your own receipts (ADR-Q-017 §5, 2 October 2026).
 *
 * Nothing is asked of a server: every message you sent and every call you
 * made is a signed receipt in your vault, so the count comes from evidence.
 * Sizes are what your Q sent, near enough: the sealed post is about the size
 * of the signed message once compressed.
 *
 * The free allowance is published by the storage itself (GET /terms on the
 * gate), so Q shows the host's real terms, not a number written in here.
 */
import { MESSAGE_SCHEMA } from '@inqbeta/q-core/inbox';
import { isCallChain } from '@inqbeta/q-core/calls';
import type { Ledger } from './ledger';
import type { Signed } from './messages';
import { oneRowPerCall } from './receipts';
import { readHome } from './home';

export interface Usage {
	messages: number;
	voicemails: number;
	voiceSeconds: number;
	/** Bytes you sent through storage today, and this month. */
	bytesToday: number;
	bytesMonth: number;
	callsDirect: number;
	callsRelayed: number;
	relayedMinutes: number;
}

export interface StorageTerms {
	postBytes: number;
	inboxHoldsBytes: number;
	sendBytesPerDay: number;
	postDays: number;
}

export function usageFrom(ledger: Ledger | null, me: string, now = new Date()): Usage {
	const month = now.toISOString().slice(0, 7);
	const day = now.toISOString().slice(0, 10);
	const u: Usage = { messages: 0, voicemails: 0, voiceSeconds: 0, bytesToday: 0, bytesMonth: 0, callsDirect: 0, callsRelayed: 0, relayedMinutes: 0 };
	const seen = new Set<string>();
	for (const r of ledger?.receipts ?? []) {
		const m = r.json as Signed | undefined;
		if (m?.content?.schema !== MESSAGE_SCHEMA || m.did !== me || seen.has(m.signature) || !m.content.at?.startsWith(month)) continue;
		seen.add(m.signature);
		const bytes = JSON.stringify(m).length;
		u.bytesMonth += bytes;
		if (m.content.at.startsWith(day)) u.bytesToday += bytes;
		if (m.content.kind === 'message') u.messages++;
		if (m.content.kind === 'voicemail') {
			u.voicemails++;
			u.voiceSeconds += m.content.seconds ?? 0;
		}
	}
	for (const r of oneRowPerCall(ledger?.receipts ?? [])) {
		if (!isCallChain(r.json)) continue;
		const steps = r.json.steps;
		const placed = steps[0];
		if (!placed?.content?.at?.startsWith(month) || !steps.some((s) => s.did === me)) continue;
		const accepted = steps.find((s) => s.content.event === 'call.accepted');
		if (!accepted) continue;
		const ends = steps.filter((s) => s.content.event === 'call.ended');
		const relayed = ends.some((s) => s.content.route === 'relayed');
		const last = Math.max(0, ...ends.map((s) => Date.parse(s.content.at)));
		const minutes = last ? Math.max(0, Math.ceil((last - Date.parse(accepted.content.at)) / 60000)) : 0;
		if (relayed) {
			u.callsRelayed++;
			u.relayedMinutes += minutes;
		} else u.callsDirect++;
	}
	return u;
}

/** The storage's published free allowance, or null when it can't be reached. */
export async function readTerms(): Promise<StorageTerms | null> {
	const h = await readHome().catch(() => null);
	const storage = h?.ok ? h.services.storage?.replace(/\/$/, '') : undefined;
	if (!storage) return null;
	try {
		const r = await fetch(`${storage}/terms`, { signal: AbortSignal.timeout(8000) });
		const t = (await r.json()) as Partial<StorageTerms> & { schema?: string };
		return r.ok && t.schema === 'inqbeta.storage-terms/1' && typeof t.sendBytesPerDay === 'number' ? (t as StorageTerms) : null;
	} catch {
		return null;
	}
}

/** "1.2 MB", "340 KB". */
export function sizeOf(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
