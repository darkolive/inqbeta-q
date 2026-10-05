/*
 * The door (ADR-Q-034): who may act on a host while it's in test.
 *
 * Darren wants to look at inqbeta.com live "knowing nobody else is
 * interfering". While the host is in test, its servers (the mint, the gate's
 * store and relay, the bellboy) only answer:
 *
 *   - the founder's ROOT, the key on his own computer;
 *   - a key LINKED to that root (links.ts: both signed, checked offline);
 *   - a key holding a TESTER PASS: a receipt signed by the root, naming one
 *     DID and an end date. Taking it back is a receipt too.
 *
 * Going live (publishing the host) opens the door to everyone: the same
 * switch that turns the mint from test to live.
 *
 * This is the first check, made at every server door, of WHO MAY ACT. Offices
 * and in-role receipts (ADR-Q-007, ADR-Q-038) are the same shape: a signed
 * statement from the federation's key, checked at the same doors.
 *
 * Reading stays open (the front door, stories, a coin's check). Only acting
 * asks the door. Pure: no storage, no network, no clock but `now`.
 */
import { checkReceipt, sealWith, type SealedReceipt } from './seal';
import type { Identity } from './passkey';
import { rootOf, type Link } from './links';
import { toDid } from './did';

export const TESTER_PASS_SCHEMA = 'inqbeta.tester-pass/1';
/** How long a pass lasts unless Darren says otherwise (decided 5 October). */
export const PASS_DAYS = 30;
const DAY = 86_400_000;

export interface TesterPass {
	schema: typeof TESTER_PASS_SCHEMA;
	source: 'inqbeta:door';
	/** Given, or taken back. */
	event: 'pass.given' | 'pass.taken';
	/** The host (federation DID) whose door this is. */
	host: string;
	/** Who may come in. */
	holder: string;
	/** When a given pass runs out. */
	until?: string;
	at: string;
}

type RootIdentity = Pick<Identity, 'did' | 'publicKey' | 'signing'>;

/** On localhost, the root gives someone a pass for `days` (30 unless said). */
export async function givePass(root: RootIdentity, o: { host: string; holder: string; days?: number; now?: number }): Promise<SealedReceipt> {
	const now = o.now ?? Date.now();
	const days = Math.max(1, Math.min(365, Math.round(o.days ?? PASS_DAYS)));
	const pass: TesterPass = {
		schema: TESTER_PASS_SCHEMA,
		source: 'inqbeta:door',
		event: 'pass.given',
		host: o.host,
		holder: toDid(o.holder),
		until: new Date(now + days * DAY).toISOString(),
		at: new Date(now).toISOString()
	};
	return sealWith(root, pass);
}

/** On localhost, the root takes a pass back. Forward only. */
export async function takePass(root: RootIdentity, o: { host: string; holder: string; now?: number }): Promise<SealedReceipt> {
	const pass: TesterPass = {
		schema: TESTER_PASS_SCHEMA,
		source: 'inqbeta:door',
		event: 'pass.taken',
		host: o.host,
		holder: toDid(o.holder),
		at: new Date(o.now ?? Date.now()).toISOString()
	};
	return sealWith(root, pass);
}

export interface PassHeld {
	holder: string;
	/** Still in date and not taken back. */
	current: boolean;
	until: string | null;
	/** The newest receipt about this holder, given or taken. */
	at: string;
	event: TesterPass['event'];
}

const isPass = (c: unknown): c is TesterPass => {
	const p = c as TesterPass;
	return !!p && p.schema === TESTER_PASS_SCHEMA && (p.event === 'pass.given' || p.event === 'pass.taken') && typeof p.host === 'string' && typeof p.holder === 'string' && typeof p.at === 'string';
};

/**
 * The passes for this host, one per holder: the newest receipt wins, so a
 * pass taken back stays taken until a newer one is given. Only receipts that
 * check out and were signed by the root count; anything else is ignored.
 */
export async function passList(receipts: unknown[], o: { root: string; host: string; now?: number }): Promise<Map<string, PassHeld>> {
	const now = o.now ?? Date.now();
	const root = toDid(o.root);
	const newest = new Map<string, TesterPass>();
	for (const r of receipts) {
		const c = (r as SealedReceipt)?.content;
		if (!isPass(c) || c.host !== o.host) continue;
		if (toDid((r as SealedReceipt).did) !== root) continue;
		if (!(await checkReceipt(r)).ok) continue;
		const was = newest.get(c.holder);
		if (!was || c.at > was.at) newest.set(c.holder, c);
	}
	const out = new Map<string, PassHeld>();
	for (const [holder, p] of newest) {
		const until = p.event === 'pass.given' ? (p.until ?? null) : null;
		out.set(holder, { holder, current: p.event === 'pass.given' && !!until && Date.parse(until) > now, until, at: p.at, event: p.event });
	}
	return out;
}

export type LetIn =
	| { in: true; as: 'open' | 'root' | 'linked' | 'pass'; until?: string }
	| { in: false; says: string };

/** What a refused person is told, in one sentence. */
export const OPENING_SOON = 'This site is opening soon. Ask its founder for a tester pass.';

/**
 * May `did` act on this host now? `links` are the root's link receipts (the
 * request carries its own, or the host publishes them); `passes` the list's
 * receipts. A host that's live lets everyone in.
 */
export async function isLetIn(
	did: string,
	o: { root: string; host: string; mode: 'test' | 'live'; links?: Link[]; passes?: unknown[]; now?: number }
): Promise<LetIn> {
	if (o.mode === 'live') return { in: true, as: 'open' };
	let who: string;
	try {
		who = toDid(did);
	} catch {
		return { in: false, says: OPENING_SOON };
	}
	const root = toDid(o.root);
	if (who === root) return { in: true, as: 'root' };
	const now = o.now ?? Date.now();
	if (o.links?.length) {
		const r = await rootOf(who, o.links, new Date(now).toISOString());
		if (r?.root === root) return { in: true, as: 'linked' };
	}
	if (o.passes?.length) {
		const held = (await passList(o.passes, { root, host: o.host, now })).get(who);
		if (held?.current) return { in: true, as: 'pass', until: held.until ?? undefined };
	}
	return { in: false, says: OPENING_SOON };
}
