/*
 * The stimulus valve (ADR-Q-043), 6 October 2026.
 *
 * Idle capacity, released free, smoothly: the valve is shut at the target
 * use and opens as use falls, never snapping. What it releases is a capacity
 * gift, not a credit: no pound behind it, never cashed out, never handed on,
 * never across a treaty, gone with its window (ADR-Q-042 §10). Since ADR-Q-044 it
 * is a voucher: given, backed by capacity, bound, consumable, lapsing.
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
import { signerFor, type Identity } from './passkey';
import { checkVoucher, issueCopy, makeVoucher, redeemProblem, type VoucherHeld, type VoucherReceipt } from './vouchers';

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

/* ---- The capacity gift: a voucher (ADR-Q-044), backed by capacity, not credits ---- */

export type GiftKind = 'used' | 'passing' | 'held';
export interface CapacityGift {
	voucher: VoucherReceipt;
	/** The copy for the recipient: they sign to receive it. */
	held: VoucherHeld;
}

/** The federation gives idle capacity: a bound, consumable voucher with nothing behind it in credits, ending with its window. */
export async function giveCapacity(
	federation: Pick<Identity, 'did' | 'publicKey' | 'signing'>,
	g: { capacity: string; kind: GiftKind; amount: number; unit: string; recipient: string; programme: string; eligibleUnder: string; from: string; to: string; noticeDays?: number; valve: ValveReading & ValveSettings },
	now = new Date()
): Promise<CapacityGift> {
	if (!(g.amount > 0)) throw new Error('A gift is of something.');
	if (Date.parse(g.to) <= Date.parse(g.from)) throw new Error('A gift has a window it ends with.');
	const voucher = await makeVoucher(
		federation,
		{
			title: `${g.amount} ${g.unit} of ${g.capacity}`,
			words: `A gift of idle capacity, under ${g.programme}, from ${g.from.slice(0, 10)} to ${g.to.slice(0, 10)}.`,
			pictures: [],
			medium: 'capacity',
			kind: 'consumable',
			of: 1,
			price: { paid: false, from: 'capacity', worth: g.amount, unit: g.unit },
			moves: 'bound',
			realm: { kinds: 'itself', accepted: [] },
			ends: { at: g.to, then: 'lapse' },
			eligibleUnder: g.eligibleUnder,
			capacity: { what: g.capacity, held: g.kind, ...(g.noticeDays ? { noticeDays: g.noticeDays } : {}), valve: { ...g.valve } as unknown as Record<string, number> }
		},
		now
	);
	return { voucher, held: await issueCopy(signerFor(federation as Identity), voucher, { number: 1, holder: g.recipient, via: g.programme }, now) };
}

/** May this gift be used now, by this person, for this capacity? It is never a coin: no transfer, no cash-out, no treaty. */
export async function giftUsable(gift: CapacityGift, o: { by: string; federation: string; capacity: string; now?: Date }): Promise<{ ok: true } | { ok: false; says: string }> {
	const v = gift.voucher;
	if (!(await checkVoucher(v)).ok || v.content.medium !== 'capacity') return { ok: false, says: 'This isn’t a capacity gift.' };
	if (v.content.issuer !== o.federation) return { ok: false, says: 'A gift is used only where it was given: it never crosses to another federation.' };
	if (gift.held.voucher !== v.contentHash || gift.held.holder !== o.by) return { ok: false, says: 'A gift is for the person it was given to: it can’t be handed on.' };
	if (v.content.capacity?.what !== o.capacity) return { ok: false, says: `This gift is for ${v.content.capacity?.what} only.` };
	if ((o.now ?? new Date()).getTime() < Date.parse(gift.held.at)) return { ok: false, says: 'This gift hasn’t started yet.' };
	const why = redeemProblem(v.content, { redeemer: o.federation, forKind: 'itself', now: o.now });
	return why ? { ok: false, says: why.includes('ended') ? 'This gift’s window has passed: unused gifts go back to idle capacity.' : why } : { ok: true };
}
