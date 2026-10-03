/*
 * Agreements, as chains of receipts (ADR-Q-025, 3 October 2026).
 *
 * Darren: "The agreement is first … that's the contract point. And then
 * there's a settlement afterwards, which is the accounting. The accounting is
 * the settlement period."
 *
 * Two phases. Each step is a receipt signed by ONE person (as with calls,
 * ADR-Q-004): "both sign" means two receipts that agree, never one person
 * signing for another.
 *
 *   AGREEING — the contract point
 *     proposed     by the proposer, with the terms           parent: none
 *     countered    by either side, new terms                 parent: the offer it answers
 *     agreed       by the other side to the latest terms     parent: that offer
 *     declined / withdrawn                                   parent: the open offer
 *     (an offer can also run out: `until`)
 *
 *   SETTLING — the accounting
 *     done         by whoever delivered, optional evidence   parent: agreed (or done)
 *     settled      by one side, with the entries             parent: agreed, done or a settlement
 *     settled      by the other, the SAME entries            parent: that settlement
 *
 * A settlement holds only when both have signed the same entries. Balances are
 * only ever added up from settlements that hold, so nothing has moved until
 * its record exists — the seam the Workhouse audit found is closed by
 * construction. "Complete" isn't written; it's read: everything agreed has
 * been settled. A variation is a counter after agreeing, then agreed again.
 *
 * Double entry: every entry is one value from one party to the other, so for
 * each kind of value what one gives the other receives. Settlements can come
 * in parts (a job in stages) but never add up to more than was agreed.
 *
 * Facts only, and nothing here moves value: Q records what people agreed and
 * settled. Pounds are a record for people's own accounts, never moved by Q.
 */
import type { SealedReceipt } from './seal';
import { canonical } from './canonical';

export const AGREEMENT_SCHEMA = 'inqbeta.agreement/1';
export const AGREEMENT_SOURCE = 'inqbeta:q/agreements';

export type AgreementKind = 'swap' | 'job' | 'treaty';
/** Something given: credits, pounds (a record, in pence), or a thing done or given, in words. */
/** Credits name their mint (ADR-Q-027): whose credits they are. Absent: the host's own. */
export type Value = { credits: number; mode: 'test' | 'live'; mint?: string } | { pence: number } | { thing: string };

export interface Terms {
	kind: AgreementKind;
	/**
	 * The two parties, fixed for the life of the agreement. An open offer
	 * (ADR-Q-026, shared by link) leaves `b` empty: the first person to answer
	 * it becomes `b`, and from then on it's between the two of them.
	 */
	a: string;
	b: string;
	/** What each gives the other. */
	aGives: Value;
	bGives: Value;
	/** Optional: when, where, and how both will know it's done. */
	when?: string;
	where?: string;
	doneWhen?: string;
	/** Business: pounds recorded for both sides' accounts (ADR-Q-023 §5). */
	business?: boolean;
}

export type StepName = 'proposed' | 'countered' | 'agreed' | 'declined' | 'withdrawn' | 'done' | 'settled' | 'taken';

/** One entry: one value from one party to the other. */
export interface Entry {
	from: string;
	to: string;
	value: Value;
}

export interface AgreementStep {
	schema: typeof AGREEMENT_SCHEMA;
	source: typeof AGREEMENT_SOURCE;
	/** The agreement's own id, the same on every step. */
	agreement: string;
	step: StepName;
	/** The step this follows, by content hash; null only for `proposed`. `taken` follows the standing offer. */
	parent: string | null;
	at: string;
	/** proposed, countered: the terms on offer. */
	terms?: Terms;
	/** proposed, countered: the offer runs out after this. */
	until?: string;
	/**
	 * proposed, open offers only: a standing offer (a shop listing) anyone can
	 * take, up to this many times. Each taking is its own agreement.
	 */
	limit?: number;
	/** done: evidence, as hashes of files in the vault. */
	evidence?: string[];
	/** settled: what's being settled. */
	entries?: Entry[];
	/** A short note in the person's own words. */
	note?: string;
	/** What the rules said when it was made: the action's hash and the rules that decided. */
	checked?: { action: string; rules: string[] };
}

export type AgreementReceipt = SealedReceipt & { content: AgreementStep };

export function isAgreementStep(x: unknown): x is AgreementReceipt {
	const c = (x as AgreementReceipt | null)?.content;
	return c?.schema === AGREEMENT_SCHEMA && typeof c.agreement === 'string' && typeof c.step === 'string';
}

/* ---- Values ---- */

const kindOf = (v: Value): 'credits' | 'pounds' | 'thing' => ('credits' in v ? 'credits' : 'pence' in v ? 'pounds' : 'thing');
const amountOf = (v: Value): number => ('credits' in v ? v.credits : 'pence' in v ? v.pence : 1);

export function valueText(v: Value): string {
	if ('credits' in v) return `${v.credits} ${v.mode === 'test' ? 'test ' : ''}credit${v.credits === 1 ? '' : 's'}`;
	if ('pence' in v) return `£${(v.pence / 100).toFixed(2)}`;
	return v.thing;
}

/** What's wrong with these terms, each a sentence. Empty when they're fine. */
export function problemsWithTerms(t: Terms): string[] {
	const p: string[] = [];
	if (!t.a || t.a === t.b) p.push('An agreement is between two different people.');
	for (const v of [t.aGives, t.bGives]) {
		if ('credits' in v && (!Number.isInteger(v.credits) || v.credits < 1)) p.push('Credits are whole numbers, at least one.');
		if ('pence' in v && (!Number.isInteger(v.pence) || v.pence < 1)) p.push('Pounds must be more than nothing.');
		if ('thing' in v && !v.thing.trim()) p.push('Say what will be done or given.');
	}
	const ka = kindOf(t.aGives);
	if (ka !== 'thing' && ka === kindOf(t.bGives)) p.push('Not the same kind both ways: credits for credits, or pounds for pounds, is a gift, not an agreement.');
	if ('pence' in t.aGives || 'pence' in t.bGives) if (!t.business) p.push('Pounds are recorded only on business agreements.');
	return p;
}

/** The entries that settle these terms in full: each side's give, from them to the other. */
export function entriesFor(t: Terms): Entry[] {
	return [
		{ from: t.a, to: t.b, value: t.aGives },
		{ from: t.b, to: t.a, value: t.bGives }
	];
}

/** What these entries mean for one person, per kind: credits and pounds as a net number, things as given and received. */
export function effectOf(entries: Entry[], did: string) {
	const out = { credits: { test: 0, live: 0 }, pence: 0, given: [] as string[], received: [] as string[] };
	for (const e of entries) {
		const sign = e.to === did ? 1 : e.from === did ? -1 : 0;
		if (!sign) continue;
		if ('credits' in e.value) out.credits[e.value.mode] += sign * e.value.credits;
		else if ('pence' in e.value) out.pence += sign * e.value.pence;
		else (sign > 0 ? out.received : out.given).push(e.value.thing);
	}
	return out;
}

/* Two lists of entries are the same if they say the same, in any order. */
const keyOf = (e: Entry) => JSON.stringify([e.from, e.to, kindOf(e.value), amountOf(e.value), 'credits' in e.value ? `${e.value.mode}:${e.value.mint ?? ''}` : '', 'thing' in e.value ? e.value.thing.trim() : '']);
export const sameEntries = (x: Entry[], y: Entry[]) => x.length === y.length && [...x.map(keyOf)].sort().join('|') === [...y.map(keyOf)].sort().join('|');

/* ---- Where an agreement stands ---- */

export type Phase = 'agreeing' | 'agreed' | 'complete' | 'ended';

export interface Standing {
	agreement: string;
	phase: Phase;
	/** How it ended, when it did. */
	ended?: 'declined' | 'withdrawn' | 'expired' | 'sold-out';
	/** The terms on the table (agreeing) or agreed (after). */
	terms: Terms | null;
	/** Who signed the terms on the table. */
	offeredBy?: string;
	/** Who should act next, if anyone. */
	waitingFor?: string;
	/** Settlements both have signed, oldest first. */
	settled: Entry[][];
	/** A settlement one side has signed, waiting for the other. */
	pending?: { by: string; entries: Entry[]; hash: string };
	/** Evidence offered with `done`. */
	evidence: string[];
	/** Steps that were ignored, and why. */
	problems: string[];
	/** The open offer's hash, and the latest step's hash and time: what a next step must follow. */
	offerHash?: string;
	lastHash?: string;
	lastAt?: string;
	/** A standing offer (shop listing): how many times it can be taken. */
	limit?: number;
	/** A taking of a standing offer: the listing's agreement id and hash. */
	takenFrom?: { agreement: string; hash: string };
}

const other = (t: Terms, did: string) => (did === t.a ? t.b : t.a);
const party = (t: Terms, did: string) => did === t.a || did === t.b;

/* Which agreed entry an entry belongs to: who to whom, what kind, and for things the words. */
const slotOf = (e: Entry) => [e.from, e.to, kindOf(e.value), 'credits' in e.value ? `${e.value.mode}:${e.value.mint ?? ''}` : '', 'thing' in e.value ? e.value.thing.trim() : ''].join('\u0000');

/** Why a new settlement doesn't fit what was agreed and already settled, or null if it does. */
function withinAgreed(agreed: Terms, settled: Entry[][], next: Entry[]): string | null {
	const want = new Map(entriesFor(agreed).map((w) => [slotOf(w), amountOf(w.value)]));
	const total = new Map<string, number>();
	for (const e of settled.flat()) total.set(slotOf(e), (total.get(slotOf(e)) ?? 0) + amountOf(e.value));
	for (const e of next) {
		if (!party(agreed, e.from) || !party(agreed, e.to) || e.from === e.to) return 'A settlement is between the two people who agreed.';
		const amount = amountOf(e.value);
		if (!Number.isInteger(amount) || amount < 1) return 'Each entry must be more than nothing.';
		const slot = slotOf(e);
		const limit = want.get(slot);
		if (limit === undefined) return 'A settlement can only settle what was agreed.';
		total.set(slot, (total.get(slot) ?? 0) + amount);
		if (total.get(slot)! > limit) return 'That settles more than was agreed.';
	}
	return null;
}

/** Why these entries wouldn't fit what's agreed and already settled, or null if they would. */
export function whySettlementDoesntFit(s: Standing, entries: Entry[]): string | null {
	if (s.phase !== 'agreed' || !s.terms) return 'Only an agreed agreement can be settled.';
	return withinAgreed(s.terms, s.settled, entries);
}

/** What's still to settle: each agreed entry, less what's been settled of it. */
export function remainingOf(s: Standing): Entry[] {
	if (!s.terms || s.phase === 'ended') return [];
	const done = new Map<string, number>();
	for (const e of s.settled.flat()) done.set(slotOf(e), (done.get(slotOf(e)) ?? 0) + amountOf(e.value));
	return entriesFor(s.terms).flatMap((w) => {
		const left = amountOf(w.value) - (done.get(slotOf(w)) ?? 0);
		if (left <= 0) return [];
		const value: Value = 'credits' in w.value ? { ...w.value, credits: left } : 'pence' in w.value ? { pence: left } : w.value;
		return [{ ...w, value }];
	});
}

function settledInFull(agreed: Terms, settled: Entry[][]): boolean {
	return entriesFor(agreed).every((w) => settled.flat().filter((e) => slotOf(e) === slotOf(w)).reduce((n, e) => n + amountOf(e.value), 0) >= amountOf(w.value));
}

/** Is this an open offer, still waiting for someone to answer it? */
export const isOpenOffer = (s: Standing) => s.phase === 'agreeing' && !!s.terms && !s.terms.b;

/** Is this a standing offer — a shop listing anyone can take, while it's open? */
export const isStandingOffer = (s: Standing) => isOpenOffer(s) && (s.limit ?? 0) >= 1;

/** A taking's agreement id: the listing's id, then the buyer's own part. */
export const takingId = (listing: string, part: string) => `${listing}.${part}`;

/**
 * How many are left in a standing offer, from the takings the maker knows of:
 * every taking counts unless the maker cancelled it as sold out.
 */
export function stockLeft(listing: Standing, takings: Standing[]): number {
	const limit = listing.limit ?? 0;
	const taken = takings.filter((t) => t.takenFrom?.hash === listing.offerHash && t.ended !== 'sold-out').length;
	return Math.max(0, limit - taken);
}

/**
 * Where an agreement stands, from its steps (any order, copies fine). Steps
 * that don't fit — wrong person, wrong moment, a parent that isn't there — are
 * left out and named in `problems`, never guessed around.
 */
export function standingOf(receipts: AgreementReceipt[], now = Date.now()): Standing {
	const seen = new Map<string, AgreementReceipt>();
	for (const r of receipts) if (isAgreementStep(r)) seen.set(r.contentHash, r);
	const steps = [...seen.values()].sort((x, y) => x.content.at.localeCompare(y.content.at) || x.signedAt.localeCompare(y.signedAt));
	const taking = steps.find((r) => r.content.step === 'taken');
	const s: Standing = { agreement: (taking ?? steps[0])?.content.agreement ?? '', phase: 'agreeing', terms: null, settled: [], evidence: [], problems: [] };
	let offerHash = '';
	let offerUntil: string | undefined;
	let agreed: Terms | null = null;
	let lastHash = '';
	const reject = (r: AgreementReceipt, why: string) => s.problems.push(`${r.content.step} (${r.content.at}): ${why}`);

	for (const r of steps) {
		const c = r.content;
		const by = r.did;
		/* A taking chain starts with the standing offer it takes, which has the listing's id. */
		const listingStep = c.step === 'proposed' && !!c.limit && s.agreement.startsWith(`${c.agreement}.`);
		if (c.agreement !== s.agreement && !listingStep) { reject(r, 'belongs to another agreement.'); continue; }
		/* An open offer: whoever answers it first (not its maker) becomes the other side. */
		if (s.terms && !s.terms.b && !s.limit && by !== s.terms.a && (c.step === 'agreed' || c.step === 'countered' || c.step === 'declined') && s.phase === 'agreeing') {
			s.terms = { ...s.terms, b: by };
		}
		if (s.phase === 'ended' || s.phase === 'complete') { reject(r, `the agreement had already ${s.phase === 'ended' ? 'ended' : 'been settled in full'}.`); continue; }
		if (s.phase === 'agreeing' && offerUntil && Date.parse(c.at) > Date.parse(offerUntil) && c.step !== 'proposed') {
			s.phase = 'ended';
			s.ended = 'expired';
			reject(r, 'the offer had run out.');
			continue;
		}
		switch (c.step) {
			case 'proposed': {
				if (s.terms) { reject(r, 'an agreement is proposed once.'); break; }
				if (c.parent !== null || !c.terms) { reject(r, 'a proposal starts the chain and carries terms.'); break; }
				if (!party(c.terms, by)) { reject(r, 'only one of the two people can propose.'); break; }
				const p = problemsWithTerms(c.terms);
				if (c.limit !== undefined && (!Number.isInteger(c.limit) || c.limit < 1 || c.terms.b)) p.push('A shop offer is open to anyone and can be taken a whole number of times.');
				if (p.length) { reject(r, p.join(' ')); break; }
				s.terms = c.terms;
				s.offeredBy = by;
				if (c.limit) s.limit = c.limit;
				if (listingStep) s.takenFrom = { agreement: c.agreement, hash: r.contentHash };
				offerHash = lastHash = r.contentHash;
				offerUntil = c.until;
				break;
			}
			case 'taken': {
				if (!s.limit || !s.terms || s.phase !== 'agreeing' || !s.takenFrom) { reject(r, 'only a shop offer can be taken.'); break; }
				if (c.parent !== offerHash || !c.terms) { reject(r, 'a taking names the shop offer and its terms.'); break; }
				if (by === s.terms.a) { reject(r, 'you can’t take your own shop offer.'); break; }
				if (canonical({ ...c.terms, b: '' }) !== canonical(s.terms) || c.terms.b !== by) { reject(r, 'a taking must be on the shop offer’s own terms, by the person taking it.'); break; }
				s.terms = agreed = c.terms;
				s.phase = 'agreed';
				lastHash = r.contentHash;
				break;
			}
			case 'countered': {
				if (s.limit && !agreed) { reject(r, 'a shop offer is taken as it stands, not countered.'); break; }
				const base = agreed ?? s.terms;
				if (!base || !c.terms) { reject(r, 'a counteroffer answers an offer, with new terms.'); break; }
				if (c.terms.a !== base.a || c.terms.b !== (base.b || by)) { reject(r, 'the two people can’t change.'); break; }
				if (!party(base, by)) { reject(r, 'only the two people can counter.'); break; }
				if (s.phase === 'agreeing' && by === s.offeredBy) { reject(r, 'you can’t counter your own offer; withdraw it instead.'); break; }
				if (c.parent !== (s.phase === 'agreeing' ? offerHash : lastHash)) { reject(r, 'it doesn’t answer the latest step.'); break; }
				const p = problemsWithTerms(c.terms);
				if (p.length) { reject(r, p.join(' ')); break; }
				/* After agreeing, a counter is a variation: the agreement stands until the variation is agreed. */
				s.terms = c.terms;
				s.offeredBy = by;
				offerHash = lastHash = r.contentHash;
				offerUntil = c.until;
				if (s.phase === 'agreed') s.phase = 'agreeing';
				break;
			}
			case 'agreed': {
				if (s.limit && !agreed) { reject(r, 'a shop offer is taken, not agreed to.'); break; }
				if (s.phase !== 'agreeing' || !s.terms) { reject(r, 'there was no offer to agree to.'); break; }
				if (c.parent !== offerHash) { reject(r, 'it must agree to the latest offer.'); break; }
				if (by === s.offeredBy) { reject(r, 'you can’t agree to your own offer.'); break; }
				if (!party(s.terms, by)) { reject(r, 'only the other person can agree.'); break; }
				agreed = s.terms;
				s.phase = 'agreed';
				lastHash = r.contentHash;
				break;
			}
			case 'declined':
			case 'withdrawn': {
				/* Sold out: the seller can cancel a taking before anything is settled. */
				if (s.takenFrom && s.phase === 'agreed' && agreed && c.step === 'declined' && by === agreed.a) {
					if (s.settled.length || s.pending) { reject(r, 'a taking can’t be cancelled once settling has begun.'); break; }
					if (c.parent !== lastHash) { reject(r, 'it doesn’t answer the latest step.'); break; }
					s.phase = 'ended';
					s.ended = 'sold-out';
					lastHash = r.contentHash;
					break;
				}
				if (s.limit && c.step === 'declined') { reject(r, 'a shop offer isn’t declined; just don’t take it.'); break; }
				if (s.phase !== 'agreeing' || !s.terms) { reject(r, 'only an open offer can be declined or withdrawn.'); break; }
				if (c.parent !== offerHash) { reject(r, 'it must answer the open offer.'); break; }
				if (c.step === 'withdrawn' ? by !== s.offeredBy : by === s.offeredBy || !party(s.terms, by)) {
					reject(r, c.step === 'withdrawn' ? 'only the person who made the offer can withdraw it.' : 'only the other person can decline.');
					break;
				}
				if (agreed) {
					/* Turning down a variation leaves the original agreement standing. */
					s.terms = agreed;
					s.phase = 'agreed';
				} else {
					s.phase = 'ended';
					s.ended = c.step;
				}
				lastHash = r.contentHash;
				break;
			}
			case 'done': {
				if (s.phase !== 'agreed' || !agreed || !party(agreed, by)) { reject(r, 'only someone in an agreed agreement can say it’s done.'); break; }
				s.evidence.push(...(c.evidence ?? []));
				lastHash = r.contentHash;
				break;
			}
			case 'settled': {
				if (s.phase !== 'agreed' || !agreed) { reject(r, 'only an agreed agreement can be settled.'); break; }
				if (!party(agreed, by) || !c.entries?.length) { reject(r, 'a settlement is signed by one of the two, with its entries.'); break; }
				if (s.pending && c.parent === s.pending.hash) {
					if (by === s.pending.by) { reject(r, 'the other person must confirm a settlement.'); break; }
					if (!sameEntries(c.entries, s.pending.entries)) { reject(r, 'the confirmation must settle exactly the same entries.'); break; }
					s.settled.push(s.pending.entries);
					s.pending = undefined;
					lastHash = r.contentHash;
					if (settledInFull(agreed, s.settled)) s.phase = 'complete';
					break;
				}
				if (s.pending) { reject(r, 'a settlement is already waiting to be confirmed.'); break; }
				const why = withinAgreed(agreed, s.settled, c.entries);
				if (why) { reject(r, why); break; }
				s.pending = { by, entries: c.entries, hash: r.contentHash };
				lastHash = r.contentHash;
				break;
			}
		}
	}
	s.offerHash = offerHash || undefined;
	s.lastHash = lastHash || undefined;
	s.lastAt = steps.at(-1)?.content.at;
	if (s.phase === 'agreeing' && offerUntil && now > Date.parse(offerUntil)) {
		s.phase = 'ended';
		s.ended = 'expired';
	}
	if (s.terms && s.offeredBy) {
		if (s.phase === 'agreeing') s.waitingFor = other(s.terms, s.offeredBy) || undefined;
		else if (s.phase === 'agreed' && s.pending) s.waitingFor = other(s.terms, s.pending.by) || undefined;
	}
	return s;
}

/**
 * Credits this person can't offer again (from Workhouse's exchange-value.ts):
 * what they give in an open offer they signed, and what they've agreed to
 * give but not yet settled.
 */
export function committedBy(s: Standing, did: string, mode: 'test' | 'live'): number {
	if (!s.terms || s.phase === 'ended' || s.phase === 'complete') return 0;
	const gives = did === s.terms.a ? s.terms.aGives : did === s.terms.b ? s.terms.bGives : null;
	if (!gives || !('credits' in gives) || gives.mode !== mode) return 0;
	if (s.phase === 'agreeing' && s.offeredBy !== did) return 0;
	const paid = s.settled.flat().filter((e) => e.from === did && 'credits' in e.value && e.value.mode === mode).reduce((n, e) => n + amountOf(e.value), 0);
	return Math.max(0, gives.credits - paid);
}

/* ---- Said from the reader's side (from Workhouse's sentences) ---- */

export function sayStep(r: AgreementReceipt, viewer: string, nameOf: (did: string) => string, terms?: Terms | null): string {
	const c = r.content;
	const who = (d: string) => (d === viewer ? 'you' : nameOf(d));
	const Who = (d: string) => (d === viewer ? 'You' : nameOf(d));
	const by = r.did;
	const t = c.terms ?? terms ?? null;
	const theirs = (d: string) => (t ? (d === t.a ? t.aGives : t.bGives) : null);
	const otherOf = (d: string) => (t ? other(t, d) : '');
	const offer = (d: string) => {
		const mine = theirs(d);
		const yours = theirs(otherOf(d));
		return mine && yours ? `${valueText(mine)} in exchange for ${valueText(yours)}` : 'an agreement';
	};
	switch (c.step) {
		case 'proposed':
			if (t && !t.b && c.limit) return `${Who(by)} put ${valueText(t.aGives)} in ${by === viewer ? 'your' : 'their'} shop for ${valueText(t.bGives)}, ${c.limit} available.`;
			return t && !t.b ? `${Who(by)} made an open offer of ${offer(by)}, shared by link.` : `${Who(by)} proposed an offer to ${who(otherOf(by))} of ${offer(by)}.`;
		case 'countered':
			return `${Who(by)} made a counteroffer: ${offer(by)}.`;
		case 'agreed':
			return `${Who(by)} accepted. ${t ? `${Who(t.a)} and ${who(t.b)} agreed: ${valueText(t.aGives)} in exchange for ${valueText(t.bGives)}.` : ''}`.trim();
		case 'taken':
			return t ? `${Who(by)} bought from ${who(t.a)}’s shop: ${valueText(t.aGives)} for ${valueText(t.bGives)}.` : `${Who(by)} bought from a shop.`;
		case 'declined':
			return `${Who(by)} declined.`;
		case 'withdrawn':
			return `${Who(by)} withdrew the offer.`;
		case 'done': {
			const n = c.evidence?.length ?? 0;
			return `${Who(by)} said it’s done${n ? `, with ${n} ${n === 1 ? 'picture or file' : 'pictures or files'}` : ''}.`;
		}
		case 'settled': {
			const list = (c.entries ?? []).map((e) => `${valueText(e.value)} from ${who(e.from)} to ${who(e.to)}`).join(', and ');
			return `${Who(by)} settled: ${list}.`;
		}
	}
}
