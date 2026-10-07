/*
 * Vouchers (ADR-Q-044), 7 October 2026: what you see is what you get.
 *
 * The coin says what pays; the voucher says what you get. A voucher is the
 * issuer's signed promise ("I vouch for this"): what it is, in words and
 * pictures signed in by their hashes; what kind of thing it is; how many
 * exist; its price, or that it's given; whether it can be passed on, and
 * what it can be exchanged for; and when it ends.
 *
 *   voucher        the master, signed by the issuer (ADR-Q-019's words)
 *   voucher held   a numbered copy in someone's vault, "12 of 50", signed by
 *                  whoever passed it on and by whoever received it, naming the
 *                  copy before it, so a holder's copy chains back to the issuer
 *   redemption     handed back for the thing, signed by holder and redeemer
 *
 * Four kinds: an original (one of one, can't be copied: title passes), an
 * edition (one of many: you own your copy), copyable (a file, a song: a
 * licence and a numbered copy, never title), consumable (an hour, a month:
 * redeemed, not owned). "If it can be copied, it can't be title-owned": a
 * digital thing is never an original.
 *
 * Three backings: paid (the buyer's credits held by agreement until it's
 * redeemed), given from credits (the giver's credits held behind it in its
 * own bank: a grant), given from capacity (idle capacity, with nothing behind
 * it in credits: a capacity gift, ADR-Q-043). The holder never holds credits,
 * so nothing given can be cashed out.
 *
 * Pure: no storage, no window. Not legal, consumer-law or tax advice.
 */
import { canonical, sha256, unb64url } from './canonical';
import { publicKeyFrom, toDid } from './did';
import { checkReceipt, sealWith, type SealedReceipt, type Signer } from './seal';
import type { Identity } from './passkey';

export const VOUCHER_SCHEMA = 'inqbeta.voucher/1';
export const VOUCHER_HELD_SCHEMA = 'inqbeta.voucher-held/1';
export const REDEEMED_SCHEMA = 'inqbeta.voucher-redeemed/1';

export type VoucherKind = 'original' | 'edition' | 'copyable' | 'consumable';
export type Medium = 'physical' | 'digital' | 'service' | 'capacity';
export type Moves = 'bound' | 'giftable' | 'sellable';

export const KINDS: Record<VoucherKind, { called: string; gets: string }> = {
	original: { called: 'Original', gets: 'Title passes: you become its owner.' },
	edition: { called: 'Edition', gets: 'Your own copy, outright; the maker keeps the design.' },
	copyable: { called: 'Copyable', gets: 'A licence and a numbered, signed copy. Never title.' },
	consumable: { called: 'Consumable', gets: 'Redeemed for the thing, then it’s spent.' }
};
export const MOVES: Record<Moves, string> = {
	bound: 'Only the named holder can use it: it can’t be sold, given or swapped.',
	giftable: 'It can be given away, never sold.',
	sellable: 'It can be sold on.'
};

export interface Picture {
	/** The picture's SHA-256: what you see can't change after the sale. */
	hash: string;
	type: string;
	alt: string;
}
export type Price =
	| { paid: true; credits: number; mint: string; currency: string }
	| { paid: false; from: 'credits'; worth: number; mint: string; currency: string }
	| { paid: false; from: 'capacity'; worth: number; unit: string };
export interface Realm {
	/** Itself only, or these kinds of offer, from providers the issuer accepts. */
	kinds: string[] | 'itself';
	/** Providers accepted by the issuer (DIDs), beyond those in treaty with it. */
	accepted: string[];
}
export interface Voucher {
	schema: typeof VOUCHER_SCHEMA;
	source: 'inqbeta:q/vouchers';
	issuer: string;
	/** Who redeems it, if not the issuer. */
	redeemer?: string;
	title: string;
	words: string;
	pictures: Picture[];
	medium: Medium;
	kind: VoucherKind;
	/** How many exist: 1 for an original, N for an edition, null for open. */
	of: number | null;
	price: Price;
	moves: Moves;
	/** For a sellable voucher: the most a holder may ask, in the price's credits. */
	resaleUpTo?: number;
	realm: Realm;
	/** For copyable kinds: the licence that comes with a copy, in the issuer's words. */
	licence?: string;
	/** When it ends, and what then: unspent given credits return; paid ones are refunded; capacity lapses. */
	ends?: { at: string; then: 'return' | 'refund' | 'lapse' };
	/** For given vouchers: who may hold it, as attestations (ADR-Q-036 §3): never the characteristic itself. */
	eligibleUnder?: string;
	/** For a capacity gift (ADR-Q-043): what capacity, how it's held, and the valve's figures it was worked from. */
	capacity?: { what: string; held: 'used' | 'passing' | 'held'; noticeDays?: number; valve?: Record<string, number> };
	at: string;
}
export type VoucherReceipt = SealedReceipt & { content: Voucher };

/** What would make this voucher wrong, in one sentence; null if it holds. */
export function voucherProblem(v: Omit<Voucher, 'schema' | 'source' | 'issuer' | 'at'>): string | null {
	if (!v.title.trim()) return 'Say what it is.';
	if ((v.medium === 'digital') && (v.kind === 'original' || v.kind === 'edition')) return 'If it can be copied, it can’t be title-owned: a digital thing is copyable, or consumable.';
	if (v.kind === 'original' && v.of !== 1) return 'An original is one of one.';
	if (v.kind === 'original' && v.medium !== 'physical') return 'Only a physical thing can be an original.';
	if (v.kind === 'edition' && !(Number.isInteger(v.of) && (v.of ?? 0) >= 2)) return 'An edition says how many: two or more.';
	if (v.of !== null && !(Number.isInteger(v.of) && v.of >= 1)) return 'How many exist is a whole number, or open.';
	if (v.medium === 'capacity' && v.kind !== 'consumable') return 'Capacity is used, not owned: it’s consumable.';
	if (v.kind === 'copyable' && !v.licence?.trim()) return 'A copyable thing comes with a licence: say what the holder may do.';
	if (v.price.paid) {
		if (!(Number.isInteger(v.price.credits) && v.price.credits >= 1)) return 'A price is a whole number of credits.';
		if (v.ends?.then === 'lapse' || v.ends?.then === 'return') return 'A paid voucher can’t simply lapse: it’s refunded when it ends, or it doesn’t end.';
	} else {
		if (!(v.price.worth > 0)) return 'Say what a given voucher is worth.';
		if (!v.ends) return 'A given voucher says when it ends.';
		if (v.price.from === 'credits' && v.ends.then !== 'return') return 'Unspent given credits return to the giver when it ends.';
		if (v.price.from === 'capacity') {
			if (v.medium !== 'capacity') return 'A capacity gift is of capacity.';
			if (v.moves !== 'bound') return 'A capacity gift is for the person it was given to: bound.';
			if (v.ends.then !== 'lapse') return 'Unused capacity goes back to idle: it lapses.';
			if (!v.capacity?.what.trim()) return 'Say what capacity it is.';
			if (v.capacity.held === 'held' && !(v.capacity.noticeDays && v.capacity.noticeDays > 0)) return 'A held gift gives notice before it ends.';
		}
		if (v.moves === 'sellable') return 'A given voucher can’t be sold.';
	}
	if (v.moves !== 'sellable' && v.resaleUpTo !== undefined) return 'Only a sellable voucher has a resale limit.';
	if (v.realm.kinds !== 'itself' && !v.realm.kinds.length) return 'Name what it can be exchanged for, or say itself only.';
	for (const p of v.pictures) if (!/^[0-9a-f]{64}$/.test(p.hash) || !p.alt.trim()) return 'Each picture is signed in by its hash, with words for a screen reader.';
	return null;
}

export async function makeVoucher(issuer: Pick<Identity, 'did' | 'publicKey' | 'signing'>, v: Omit<Voucher, 'schema' | 'source' | 'issuer' | 'at'>, now = new Date()): Promise<VoucherReceipt> {
	const p = voucherProblem(v);
	if (p) throw new Error(p);
	const content: Voucher = { schema: VOUCHER_SCHEMA, source: 'inqbeta:q/vouchers', issuer: issuer.did, ...v, title: v.title.trim(), words: v.words.trim(), at: now.toISOString() };
	return (await sealWith(issuer, content)) as VoucherReceipt;
}

export async function checkVoucher(x: unknown): Promise<{ ok: true } | { ok: false; says: string }> {
	const r = x as VoucherReceipt;
	if (r?.content?.schema !== VOUCHER_SCHEMA) return { ok: false, says: 'This isn’t a voucher.' };
	if (r.did !== r.content.issuer || !(await checkReceipt(r)).ok) return { ok: false, says: 'The issuer didn’t sign this voucher.' };
	const p = voucherProblem(r.content);
	return p ? { ok: false, says: p } : { ok: true };
}

/** Does this voucher pass title to its holder? Only an original does. */
export const passesTitle = (v: Pick<Voucher, 'kind'>) => v.kind === 'original';

/* ---- The voucher held: numbered copies, chained ---- */

type Sig = { by: 'from' | 'holder'; did: string; signature: string };
export interface HeldStatement {
	schema: typeof VOUCHER_HELD_SCHEMA;
	/** The master, by content hash. */
	voucher: string;
	/** Its number, 1 to `of`. */
	number: number;
	holder: string;
	/** Who passed it on: the issuer for a first copy, else the holder before. */
	from: string;
	/** The copy before this one, by hash; null for a first copy. */
	previous: string | null;
	/** How it came: issued, sold, given, swapped; and the receipt that carries it (a trade, a decision). */
	how: 'issued' | 'sold' | 'given' | 'swapped';
	via?: string;
	/** For a sale on: the price asked. */
	price?: number;
	/** Title passes with an original. */
	title: boolean;
	at: string;
}
export type VoucherHeld = HeldStatement & { signatures: Sig[] };

const unsigned = <T extends { signatures: unknown[] }>(x: T) => {
	const { signatures: _s, ...rest } = x;
	return rest;
};
async function verify(did: string, doc: unknown, signature: string): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(did), { name: 'Ed25519' }, false, ['verify']);
		return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(signature), new TextEncoder().encode(canonical(doc)));
	} catch {
		return false;
	}
}
/** Is this copy signed by who passed it on ('from') or by who holds it ('holder')? */
export async function heldSignedBy(h: VoucherHeld, by: 'from' | 'holder'): Promise<boolean> {
	const did = by === 'from' ? h.from : h.holder;
	const sig = h.signatures?.find((x) => x.by === by && x.did === did);
	return !!sig && (await verify(did, unsigned(h), sig.signature));
}
export const hashHeld = async (h: VoucherHeld) => `held:sha256:${await sha256(canonical(unsigned(h)))}`;

/** The issuer hands out copy `number` to `holder`. */
export async function issueCopy(issuer: Signer, v: VoucherReceipt, o: { number: number; holder: string; via?: string }, now = new Date()): Promise<VoucherHeld> {
	if (toDid(issuer.did) !== v.content.issuer) throw new Error('Only the issuer hands out its vouchers.');
	if (!Number.isInteger(o.number) || o.number < 1 || (v.content.of !== null && o.number > v.content.of)) throw new Error(`There are only ${v.content.of} of these.`);
	const st: HeldStatement = { schema: VOUCHER_HELD_SCHEMA, voucher: v.contentHash, number: o.number, holder: o.holder, from: v.content.issuer, previous: null, how: 'issued', ...(o.via ? { via: o.via } : {}), title: passesTitle(v.content), at: now.toISOString() };
	return { ...st, signatures: [{ by: 'from', did: st.from, signature: await issuer.signCanonical(st) }] };
}

/** The holder passes their copy on: given, or sold if the voucher allows. */
export async function passOn(prev: VoucherHeld, v: VoucherReceipt, holder: Signer, o: { to: string; how: 'given' | 'sold' | 'swapped'; via?: string; price?: number }, now = new Date()): Promise<VoucherHeld> {
	if (toDid(holder.did) !== prev.holder) throw new Error('Only its holder can pass it on.');
	const why = moveProblem(v.content, o.how, o.price);
	if (why) throw new Error(why);
	const st: HeldStatement = { schema: VOUCHER_HELD_SCHEMA, voucher: prev.voucher, number: prev.number, holder: o.to, from: prev.holder, previous: await hashHeld(prev), how: o.how, ...(o.via ? { via: o.via } : {}), ...(o.price !== undefined ? { price: o.price } : {}), title: passesTitle(v.content), at: now.toISOString() };
	return { ...st, signatures: [{ by: 'from', did: st.from, signature: await holder.signCanonical(st) }] };
}

/** The receiver signs that they have it. */
export async function receive(h: VoucherHeld, holder: Signer): Promise<VoucherHeld> {
	if (toDid(holder.did) !== h.holder) throw new Error('Only the person it’s for receives it.');
	return { ...h, signatures: [...h.signatures.filter((s) => s.by === 'from'), { by: 'holder', did: h.holder, signature: await holder.signCanonical(unsigned(h)) }] };
}

/** Why this move isn't allowed by the voucher's terms; null if it is. */
export function moveProblem(v: Pick<Voucher, 'moves' | 'resaleUpTo'>, how: 'given' | 'sold' | 'swapped', price?: number): string | null {
	if (v.moves === 'bound') return 'This voucher is bound to its holder: it can’t be sold, given or swapped.';
	if (how === 'sold' && v.moves !== 'sellable') return 'This voucher can be given away, never sold.';
	if (how === 'sold' && v.resaleUpTo !== undefined && (price ?? 0) > v.resaleUpTo) return `The issuer set the most it can be sold on for: ${v.resaleUpTo} credits.`;
	return null;
}

export interface Holding {
	number: number;
	holder: string;
	/** The newest copy of this number. */
	latest: VoucherHeld;
	chain: VoucherHeld[];
	redeemed: boolean;
}
export interface EditionState {
	of: number | null;
	issued: number;
	left: number | null;
	holdings: Holding[];
	problems: string[];
}

/**
 * Read every copy of a voucher: each one signed by whoever passed it and whoever
 * received it, each move allowed by the terms, no number issued twice or past
 * the edition. Copies that don't hold are left out, with why.
 */
export async function editionOf(v: VoucherReceipt, copies: VoucherHeld[], redemptions: Redemption[] = []): Promise<EditionState> {
	const problems: string[] = [];
	const sound: VoucherHeld[] = [];
	for (const h of copies) {
		if (h?.schema !== VOUCHER_HELD_SCHEMA || h.voucher !== v.contentHash) continue;
		const st = unsigned(h);
		const f = h.signatures.find((s) => s.by === 'from' && s.did === h.from);
		const r = h.signatures.find((s) => s.by === 'holder' && s.did === h.holder);
		if (!f || !(await verify(f.did, st, f.signature))) { problems.push(`Copy ${h.number}: not signed by who passed it on.`); continue; }
		if (!r || !(await verify(r.did, st, r.signature))) { problems.push(`Copy ${h.number} to ${h.holder.slice(-6)}: not received yet.`); continue; }
		if (h.title !== passesTitle(v.content)) { problems.push(`Copy ${h.number}: it claims title wrongly.`); continue; }
		sound.push(h);
	}
	const hashes = new Map(await Promise.all(sound.map(async (h) => [await hashHeld(h), h] as const)));
	const holdings: Holding[] = [];
	const firsts = sound.filter((h) => h.previous === null).sort((a, b) => a.at.localeCompare(b.at));
	const seen = new Set<number>();
	for (const first of firsts) {
		if (first.from !== v.content.issuer || first.how !== 'issued') { problems.push(`Copy ${first.number}: a first copy comes from the issuer.`); continue; }
		if (v.content.of !== null && first.number > v.content.of) { problems.push(`Copy ${first.number} of ${v.content.of}: past the edition.`); continue; }
		if (seen.has(first.number)) { problems.push(`Copy ${first.number}: issued twice.`); continue; }
		seen.add(first.number);
		/* Follow the chain: each next copy names the one before and comes from its holder. */
		const chain = [first];
		for (;;) {
			const last = chain.at(-1)!;
			const lastHash = [...hashes.entries()].find(([, h]) => h === last)![0];
			const next = sound.filter((h) => h.previous === lastHash);
			if (!next.length) break;
			if (next.length > 1) { problems.push(`Copy ${first.number}: passed on twice from the same holder.`); break; }
			const n = next[0];
			if (n.from !== last.holder || n.number !== last.number) { problems.push(`Copy ${first.number}: a move not from its holder.`); break; }
			const why = moveProblem(v.content, n.how === 'issued' ? 'given' : n.how, n.price);
			if (why) { problems.push(`Copy ${first.number}: ${why}`); break; }
			chain.push(n);
		}
		const latest = chain.at(-1)!;
		const redeemed = redemptions.some((r) => r.voucher === v.contentHash && r.number === first.number);
		holdings.push({ number: first.number, holder: latest.holder, latest, chain, redeemed });
	}
	const issued = holdings.length;
	return { of: v.content.of, issued, left: v.content.of === null ? null : Math.max(0, v.content.of - issued), holdings, problems };
}

/** The next free number, or null if the edition is sold out. */
export function nextNumber(e: Pick<EditionState, 'of' | 'holdings'>): number | null {
	const taken = new Set(e.holdings.map((h) => h.number));
	for (let n = 1; e.of === null || n <= e.of; n++) if (!taken.has(n)) return n;
	return null;
}

/* ---- Redeeming ---- */

export interface RedemptionStatement {
	schema: typeof REDEEMED_SCHEMA;
	voucher: string;
	number: number;
	holder: string;
	redeemer: string;
	/** What it was exchanged for: itself, or a kind in its realm. */
	for: string;
	at: string;
}
export type Redemption = RedemptionStatement & { signatures: { by: 'holder' | 'redeemer'; did: string; signature: string }[] };

/** Why `redeemer` can't redeem this voucher for `forKind`; null if it can. `inTreaty` is whether the redeemer is in treaty with the issuer. */
export function redeemProblem(v: Voucher, o: { redeemer: string; forKind: string; inTreaty?: boolean; now?: Date }): string | null {
	const now = (o.now ?? new Date()).getTime();
	if (v.ends && Date.parse(v.ends.at) <= now) return 'This voucher has ended.';
	const own = o.redeemer === v.issuer || o.redeemer === v.redeemer;
	if (v.realm.kinds === 'itself') return own && o.forKind === 'itself' ? null : 'This voucher is for itself only, from whoever vouched for it.';
	if (own && o.forKind === 'itself') return null;
	if (!v.realm.kinds.includes(o.forKind)) return `It can be exchanged for ${v.realm.kinds.join(', ')}: not ${o.forKind}.`;
	if (!own && !o.inTreaty && !v.realm.accepted.includes(o.redeemer)) return 'That provider isn’t accepted by the issuer, by treaty or on its list.';
	return null;
}

export async function askRedeem(holding: Holding, holder: Signer, o: { redeemer: string; forKind: string }, now = new Date()): Promise<Redemption> {
	if (toDid(holder.did) !== holding.holder) throw new Error('Only its holder redeems it.');
	if (holding.redeemed) throw new Error('This copy has already been redeemed.');
	const st: RedemptionStatement = { schema: REDEEMED_SCHEMA, voucher: holding.latest.voucher, number: holding.number, holder: holding.holder, redeemer: o.redeemer, for: o.forKind, at: now.toISOString() };
	return { ...st, signatures: [{ by: 'holder', did: st.holder, signature: await holder.signCanonical(st) }] };
}
export async function acceptRedeem(r: Redemption, redeemer: Signer): Promise<Redemption> {
	if (toDid(redeemer.did) !== r.redeemer) throw new Error('Only the named redeemer accepts it.');
	return { ...r, signatures: [...r.signatures.filter((s) => s.by === 'holder'), { by: 'redeemer', did: r.redeemer, signature: await redeemer.signCanonical(unsigned(r)) }] };
}
export async function redemptionSigned(r: Redemption): Promise<boolean> {
	const st = unsigned(r);
	const h = r.signatures.find((s) => s.by === 'holder' && s.did === r.holder);
	const d = r.signatures.find((s) => s.by === 'redeemer' && s.did === r.redeemer);
	return !!h && !!d && (await verify(h.did, st, h.signature)) && (await verify(d.did, st, d.signature));
}
