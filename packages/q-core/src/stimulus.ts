/*
 * The stimulus valve (ADR-Q-043), 6 October 2026.
 *
 * Idle capacity, released free, smoothly: the valve is shut at the target
 * use and opens as use falls, never snapping. What it releases is a capacity
 * gift, not a credit: no pound behind it, never cashed out, never handed on,
 * never across a treaty, gone with its window (ADR-Q-042 §10).
 *
 *   I        = capacity − used            idle in the booking window
 *   gap      = max(0, U* − U)             how far use is below target
 *   v        = 1 − e^(−k · gap)           the valve
 *   release  = v × max(0, I − slack)      what's safe to give this window
 *
 * Who gets it: programmes (a funder, or the federation's own good causes),
 * each with a filter, a budget for the cost of service, a gift per person and
 * a standing queue. Shared in proportion to remaining budgets; the open
 * programme takes the rest; one each before anyone gets two.
 *
 * Pure: no storage, no window. Not legal, financial or tax advice.
 */
import { checkReceipt, sealWith, type SealedReceipt } from './seal';
import type { Identity } from './passkey';

/** Settings a federation signs, like the safety valve's. Defaults proposed, to confirm. */
export interface ValveSettings {
	/** Target use, 0–1. */
	target: number;
	/** How quickly it opens. */
	k: number;
	/** Kept back, as a share of capacity. */
	slackShare: number;
}
export const VALVE_DEFAULTS: ValveSettings = { target: 0.8, k: 3, slackShare: 0.2 };

export interface ValveReading {
	capacity: number;
	used: number;
	use: number;
	idle: number;
	slack: number;
	gap: number;
	valve: number;
	/** What's safe to give this window, in the capacity's own unit. */
	release: number;
}

export function valveRelease(capacity: number, used: number, s: ValveSettings = VALVE_DEFAULTS): ValveReading {
	if (!(capacity > 0) || used < 0) throw new Error('Capacity is more than nothing, and use isn’t negative.');
	if (!(s.target > 0 && s.target <= 1) || !(s.k > 0) || !(s.slackShare >= 0 && s.slackShare < 1)) throw new Error('The valve’s settings are out of range.');
	const u = Math.min(1, used / capacity);
	const idle = Math.max(0, capacity - used);
	const slack = capacity * s.slackShare;
	const gap = Math.max(0, s.target - u);
	const valve = 1 - Math.exp(-s.k * gap);
	return { capacity, used, use: u, idle, slack, gap, valve, release: valve * Math.max(0, idle - slack) };
}

export interface Programme {
	id: string;
	/** Who funds it: a funder's DID, or the federation itself. */
	funder: string;
	/** Remaining budget for the cost of service, in minor units; null for the federation's open programme (no budget limit beyond the release). */
	budget: number | null;
	/** The gift per person, in the capacity's unit. */
	gift: number;
	/** Eligible people, in the order they joined; anyone served goes to the back. */
	queue: string[];
}

export interface Allocation {
	programme: string;
	share: number;
	served: string[];
	/** What it costs the programme's budget, in minor units. */
	costs: number;
}

/**
 * Share a release between programmes and serve their queues.
 * `costPerUnit` is the variable cost of service per unit, in minor units.
 */
export function allocate(release: number, programmes: Programme[], costPerUnit: number): Allocation[] {
	const funded = programmes.filter((p) => p.budget !== null && p.budget > 0);
	const open = programmes.filter((p) => p.budget === null);
	const total = funded.reduce((n, p) => n + p.budget!, 0);
	/* What each funded programme's budget could pay for, and its share of the release in proportion to budgets. */
	const out: Allocation[] = [];
	let left = release;
	for (const p of funded) {
		const share = total ? (release * p.budget!) / total : 0;
		const affordable = costPerUnit > 0 ? p.budget! / (p.gift * costPerUnit) : Infinity;
		const slots = Math.max(0, Math.min(Math.floor(share / p.gift + 1e-9), Math.floor(affordable + 1e-9), p.queue.length));
		const used = slots * p.gift;
		left -= used;
		out.push({ programme: p.id, share: used, served: p.queue.slice(0, slots), costs: Math.round(used * costPerUnit) });
	}
	/* The open programme takes what's left. */
	for (const p of open) {
		const slots = Math.max(0, Math.min(Math.floor(left / p.gift + 1e-9), p.queue.length));
		const used = slots * p.gift;
		left -= used;
		out.push({ programme: p.id, share: used, served: p.queue.slice(0, slots), costs: Math.round(used * costPerUnit) });
	}
	return out;
}

/** The queue after a round: those served go to the back, so it spreads before it repeats. */
export const nextQueue = (queue: string[], served: string[]) => [...queue.filter((q) => !served.includes(q)), ...served];

/* ---- The capacity gift (ADR-Q-042 §10) ---- */

export const GIFT_SCHEMA = 'inqbeta.capacity-gift/1';
export type GiftKind = 'used' | 'passing' | 'held';
export interface CapacityGift {
	schema: typeof GIFT_SCHEMA;
	source: 'inqbeta:q/stimulus';
	federation: string;
	/** What capacity: "storage", "the studio", "evening class seats". */
	capacity: string;
	kind: GiftKind;
	amount: number;
	unit: string;
	recipient: string;
	programme: string;
	/** "Eligible under programme P" only: never the characteristic behind it. */
	eligibleUnder: string;
	/** The window it can be used in; it lapses at the end. Held gifts have a term and notice. */
	from: string;
	to: string;
	noticeDays?: number;
	/** The figures the valve was worked from, so anyone can check it opened no further than the rule. */
	valve: ValveReading & ValveSettings;
	at: string;
}
export type CapacityGiftReceipt = SealedReceipt & { content: CapacityGift };

export async function giveCapacity(federation: Pick<Identity, 'did' | 'publicKey' | 'signing'>, g: Omit<CapacityGift, 'schema' | 'source' | 'federation' | 'at'>, now = new Date()): Promise<CapacityGiftReceipt> {
	if (!(g.amount > 0)) throw new Error('A gift is of something.');
	if (Date.parse(g.to) <= Date.parse(g.from)) throw new Error('A gift has a window it ends with.');
	if (g.kind === 'held' && !(g.noticeDays && g.noticeDays > 0)) throw new Error('A held gift gives notice before it ends.');
	return (await sealWith(federation, { schema: GIFT_SCHEMA, source: 'inqbeta:q/stimulus', federation: federation.did, ...g, at: now.toISOString() } satisfies CapacityGift)) as CapacityGiftReceipt;
}

/** May this gift be used now, by this person, for this capacity? It is never a coin: no transfer, no cash-out, no treaty. */
export async function giftUsable(x: unknown, o: { by: string; federation: string; capacity: string; now?: Date }): Promise<{ ok: true } | { ok: false; says: string }> {
	const r = x as CapacityGiftReceipt;
	const c = r?.content;
	const now = (o.now ?? new Date()).getTime();
	if (c?.schema !== GIFT_SCHEMA) return { ok: false, says: 'This isn’t a capacity gift.' };
	if (r.did !== c.federation || !(await checkReceipt(r)).ok) return { ok: false, says: 'The federation didn’t sign this gift.' };
	if (c.federation !== o.federation) return { ok: false, says: 'A gift is used only where it was given: it never crosses to another federation.' };
	if (c.recipient !== o.by) return { ok: false, says: 'A gift is for the person it was given to: it can’t be handed on.' };
	if (c.capacity !== o.capacity) return { ok: false, says: `This gift is for ${c.capacity} only.` };
	if (now < Date.parse(c.from) || now >= Date.parse(c.to)) return { ok: false, says: 'This gift’s window has passed: unused gifts go back to idle capacity.' };
	return { ok: true };
}
