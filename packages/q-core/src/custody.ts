/*
 * Custody (ADR-Q-028 §4, 3 October 2026): nothing is let go until it's held
 * somewhere else.
 *
 * Darren: "That's the receipt chain, isn't it? You cannot settle, i.e. delete,
 * until you have confirmation that it's held somewhere else. And until you've
 * heard it's elsewhere, you're still holding on to it, in good faith."
 *
 * Two receipts, about one sealed vault file, named by its content hash:
 *
 *   held      signed by a pass-through (the host's relay, a node hired by the
 *             hour): "I hold this file, this big, until at the latest then."
 *             Until your Q has this, it keeps the file.
 *   arrived   signed by you: your Q read the file back from where you keep
 *             things (your cloud, your full-copy bucket), checked it matches
 *             its name, and says so. Only on this does a pass-through delete.
 *
 * The receipts are also the meter: how much passed through, and for how long,
 * worked out from receipts both sides already hold (usageOf), so nobody has
 * to trust the other's figures — and the data to price pass-through, and so
 * minting, from (ADR-Q-027).
 */
import type { SealedReceipt } from './seal';
import type { Identity } from './passkey';
import { canonical, b64url, sha256 } from './canonical';
import { inboxIdFor } from './inbox';

export const CUSTODY_SCHEMA = 'inqbeta.custody/1';
export const CUSTODY_SOURCE = 'inqbeta:q/custody';

export interface Custody {
	schema: typeof CUSTODY_SCHEMA;
	source: typeof CUSTODY_SOURCE;
	kind: 'held' | 'arrived';
	/** The file: the hex SHA-256 of its sealed bytes (its content name, without .dsv). */
	item: string;
	bytes: number;
	/** Where it is: a pass-through's address, or the place you keep things ('google-drive', 's3:<bucket>'). */
	where: string;
	at: string;
	/** held: let go at the latest by then, whether or not it arrived. */
	until?: string;
	/** arrived: the pass-through this releases, by its address. */
	releases?: string;
}

export type CustodyReceipt = SealedReceipt & { content: Custody };

const HEX64 = /^[0-9a-f]{64}$/;

export function isCustody(x: unknown): x is CustodyReceipt {
	const c = (x as CustodyReceipt | null)?.content;
	return !!c && c.schema === CUSTODY_SCHEMA && (c.kind === 'held' || c.kind === 'arrived') && typeof (x as CustodyReceipt).did === 'string';
}

/** What's wrong with a custody receipt's content, in words. */
export function problemsWithCustody(c: Custody): string[] {
	const p: string[] = [];
	if (!HEX64.test(c.item)) p.push('It must name the file by its content hash.');
	if (!Number.isInteger(c.bytes) || c.bytes < 1) p.push('It must say how big the file is.');
	if (!c.where?.trim()) p.push('It must say where the file is.');
	if (!Number.isFinite(Date.parse(c.at))) p.push('It must say when.');
	if (c.kind === 'held' && !(c.until && Date.parse(c.until) > Date.parse(c.at))) p.push('A pass-through must say when it will let go at the latest.');
	if (c.kind === 'arrived' && !c.releases?.trim()) p.push('An arrival must say which pass-through it releases.');
	if (c.kind === 'arrived' && c.releases === c.where) p.push('It must have arrived somewhere other than the pass-through.');
	return p;
}

/**
 * May whoever holds this file at `relay` let it go now? Only on the owner's
 * signed arrival elsewhere, or once its own held receipt's time is up.
 */
export function mayLetGo(item: string, relay: string, owner: string, receipts: CustodyReceipt[], now = Date.now()): { ok: true; because: 'arrived' | 'time-up' } | { ok: false; says: string } {
	const mine = receipts.filter((r) => isCustody(r) && r.content.item === item);
	if (mine.some((r) => r.did === owner && r.content.kind === 'arrived' && r.content.releases === relay && !problemsWithCustody(r.content).length)) return { ok: true, because: 'arrived' };
	const held = mine.filter((r) => r.content.kind === 'held' && r.content.where === relay);
	if (held.length && held.every((r) => r.content.until && now > Date.parse(r.content.until))) return { ok: true, because: 'time-up' };
	return { ok: false, says: 'Not until it’s held somewhere else.' };
}

/** May your browser let this file go? Only once something has signed that it holds it. */
export const mayForget = (item: string, receipts: CustodyReceipt[], now = Date.now()) =>
	receipts.some((r) => isCustody(r) && r.content.item === item && ((r.content.kind === 'held' && Date.parse(r.content.until ?? '') > now) || r.content.kind === 'arrived'));

export interface Usage {
	/** Files that passed through. */
	items: number;
	bytes: number;
	/** Bytes × hours held: what pass-through is priced in. */
	byteHours: number;
	/** Still held, not yet arrived. */
	open: number;
	/** How long files were held, on average, in hours (arrived ones only). */
	meanHours: number;
}

/**
 * How much passed through a pass-through, and for how long, from the
 * receipts: each held file counts from its held receipt to its arrival (or
 * now, or its time limit, whichever is first).
 */
export function usageOf(receipts: CustodyReceipt[], relay: string, now = Date.now()): Usage {
	const held = new Map<string, Custody>();
	const arrived = new Map<string, number>();
	for (const r of receipts) {
		if (!isCustody(r)) continue;
		const c = r.content;
		if (c.kind === 'held' && c.where === relay && !held.has(c.item)) held.set(c.item, c);
		if (c.kind === 'arrived' && c.releases === relay) arrived.set(c.item, Math.min(arrived.get(c.item) ?? Infinity, Date.parse(c.at)));
	}
	let bytes = 0;
	let byteHours = 0;
	let open = 0;
	let doneHours = 0;
	let done = 0;
	for (const [item, c] of held) {
		const from = Date.parse(c.at);
		const end = Math.min(arrived.get(item) ?? now, Date.parse(c.until ?? '') || now);
		const hours = Math.max(0, end - from) / 3_600_000;
		bytes += c.bytes;
		byteHours += c.bytes * hours;
		if (arrived.has(item)) {
			done++;
			doneHours += hours;
		} else open++;
	}
	return { items: held.size, bytes, byteHours, open, meanHours: done ? doneHours / done : 0 };
}

/* Your relay space at a pass-through: named by a key only your passkey can make, like your inbox. */
const RELAY_PHRASE = { schema: 'inqbeta.relay-key/1', note: 'Your space at a pass-through. Made from your vault key; the same every time.' };
export async function relayOf(identity: Pick<Identity, 'vault'>): Promise<{ id: string; key: string }> {
	const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, identity.vault, new TextEncoder().encode(canonical(RELAY_PHRASE))));
	const key = await sha256(b64url(sealed));
	return { id: await inboxIdFor(key), key };
}
