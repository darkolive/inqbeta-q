/*
 * Buying a voucher (ADR-Q-044 §6, build step 3; 7 October 2026).
 *
 * A paid voucher is sold through a shop offer (ADR-Q-026): the issuer lists it
 * at its price, as many times as the edition allows, and each buyer takes it.
 * Taking it is the trade: both have signed, and the buyer's credits are held
 * by agreement (ADR-Q-025, `committedBy`) — not paid over yet.
 *
 *   taken       the buyer's credits are held
 *   issued      the issuer hands out a numbered copy, naming the taking (`via`)
 *   received    the buyer signs for it
 *   redeemed    holder and issuer (or an accepted provider) both sign
 *   released    both sign the settlement: the credits go to the issuer
 *
 * Until it's redeemed, the voucher is the buyer's protection: if what arrives
 * isn't what the pictures showed, the signed voucher is the evidence, and the
 * credits haven't moved. If the issuer can't deliver, it cancels the taking
 * before anything is settled, and nothing moves (the refund).
 *
 * Pure: no storage, no window.
 */
import { entriesFor, remainingOf, type Entry, type Standing, type Terms } from './agreements';
import type { Holding, Voucher, VoucherHeld, VoucherReceipt } from './vouchers';

/** How the voucher is named in an agreement: the thing the issuer gives. */
export const voucherThing = (v: Pick<VoucherReceipt, 'contentHash'> & { content: Pick<Voucher, 'title'> }) => `Voucher: ${v.content.title} (${v.contentHash})`;

/** The shop offer's terms: the issuer gives the voucher; whoever takes it gives the price, in the issuer's mint's credits. */
export function listingTerms(v: VoucherReceipt, mode: 'test' | 'live'): Terms {
	const p = v.content.price;
	if (!p.paid) throw new Error('A given voucher isn’t sold: it’s given to whoever qualifies.');
	return { kind: 'swap', a: v.content.issuer, b: '', aGives: { thing: voucherThing(v) }, bGives: { credits: p.credits, mode, mint: p.mint }, doneWhen: 'The voucher is redeemed.' };
}

/** How many times the shop offer can be taken: the edition, or an issuer's own limit for copyable and consumable vouchers. */
export function listingLimit(v: Voucher, own?: number): number {
	if (v.of !== null) return v.of;
	if (!own || !Number.isInteger(own) || own < 1) throw new Error('Say how many you’ll sell: a copyable or consumable voucher has no edition to count.');
	return own;
}

/** Is this agreement a sale of this voucher, on its own terms? */
export function isSaleOf(v: VoucherReceipt, s: Pick<Standing, 'terms' | 'takenFrom'>): boolean {
	const t = s.terms;
	const p = v.content.price;
	return !!t && !!s.takenFrom && p.paid && t.a === v.content.issuer && !!t.b && 'thing' in t.aGives && t.aGives.thing === voucherThing(v) && 'credits' in t.bGives && t.bGives.credits === p.credits && t.bGives.mint === p.mint;
}

/** Was this first copy paid for: issued to the buyer of an agreed sale of this voucher, naming it, and that sale not used for another copy? */
export function paidFor(v: VoucherReceipt, copy: Pick<VoucherHeld, 'number' | 'holder' | 'via' | 'previous' | 'how'>, sales: Standing[], others: Pick<VoucherHeld, 'number' | 'via' | 'previous'>[] = []): boolean {
	if (!v.content.price.paid) return true;
	if (copy.previous !== null || copy.how !== 'issued' || !copy.via) return false;
	const sale = sales.find((s) => s.agreement === copy.via);
	if (!sale || !isSaleOf(v, sale) || sale.terms!.b !== copy.holder) return false;
	if (sale.phase !== 'agreed' && sale.phase !== 'complete') return false;
	return !others.some((o) => o.previous === null && o.via === copy.via && o.number !== copy.number);
}

export type SaleState = 'taken' | 'issued' | 'received' | 'redeemed' | 'released' | 'cancelled' | 'refund-due';
export interface Sale {
	agreement: string;
	buyer: string;
	credits: number;
	state: SaleState;
	says: string;
	/** The buyer's copy, once issued and received. */
	holding: Holding | null;
	/** What the settlement says, once it's time to release the credits. */
	release: Entry[] | null;
}

/**
 * Where one sale stands, from the agreement, the copies the buyer holds, and
 * whether they've been redeemed. `issuedTo` is true when a first copy naming
 * this sale exists, received or not.
 */
export function saleOf(v: VoucherReceipt, s: Standing, holdings: Holding[], o: { issuedTo?: boolean; now?: Date } = {}): Sale | null {
	if (!isSaleOf(v, s)) return null;
	const t = s.terms!;
	const credits = 'credits' in t.bGives ? t.bGives.credits : 0;
	const holding = holdings.find((h) => h.chain[0]?.via === s.agreement) ?? null;
	const base = { agreement: s.agreement, buyer: t.b, credits, holding, release: null };
	const ended = !!v.content.ends && Date.parse(v.content.ends.at) <= (o.now ?? new Date()).getTime();
	if (s.phase === 'ended') return { ...base, state: 'cancelled', says: 'Cancelled before anything was settled: the credits held were never paid over.' };
	if (s.phase === 'complete') return { ...base, state: 'released', says: `Redeemed and settled: ${credits} credits paid to the issuer.` };
	if (holding?.redeemed) return { ...base, state: 'redeemed', says: s.pending ? 'Redeemed. The settlement waits for the other side to sign.' : 'Redeemed. Both sign the settlement, and the credits held go to the issuer.', release: remainingOf(s).length ? remainingOf(s) : entriesFor(t) };
	if (ended) return { ...base, state: 'refund-due', says: 'It ended unredeemed. The issuer cancels the sale, and the credits held go back to being the buyer’s to spend.' };
	if (holding) return { ...base, state: 'received', says: `Copy ${holding.number} is held. ${credits} credits stay held until it’s redeemed.` };
	if (o.issuedTo) return { ...base, state: 'issued', says: 'Issued: waiting for the buyer to sign for it.' };
	return { ...base, state: 'taken', says: `Bought. ${credits} credits are held until the voucher is redeemed. The issuer hands out a copy next.` };
}

/** Is a release (the settlement) right for this sale now? Only once redeemed, and only for exactly what was agreed. */
export function releaseProblem(sale: Sale | null, entries: Entry[]): string | null {
	if (!sale) return 'That isn’t a sale of this voucher.';
	if (sale.state !== 'redeemed') return sale.state === 'released' ? 'It’s already settled.' : 'The credits stay held until the voucher is redeemed.';
	const key = (e: Entry) => JSON.stringify([e.from, e.to, e.value]);
	const want = new Set(sale.release!.map(key));
	return entries.length === want.size && entries.every((e) => want.has(key(e))) ? null : 'Settle exactly what was agreed: the voucher one way, the credits the other.';
}
