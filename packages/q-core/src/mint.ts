/*
 * Minting against reserves (ADR-Q-027, 3 October 2026).
 *
 * Darren: "When a federation is created, its minting opening balance is zero.
 * If nothing changes, it remains zero … a £100 purchase, then 100 credits
 * [are] minted, and cash balance 100 … every time a minted credit is cashed
 * out it destroys … The receipt of it still exists, but it needs to evaporate
 * so that the system reconciles … the reconciliation works from balances, and
 * that can't work if something still exists but is unaccounted for."
 *
 * Every host or federation may have a mint: its own credits, named by its
 * DID. Three receipts:
 *
 *   mint      signed by the mint      credits made, citing the value that came in
 *                                     (pounds paid, or capital held)
 *   cashout   signed by the holder    asking for pounds for credits they hold
 *   burn      signed by the mint      the credits destroyed and the pounds paid,
 *                                     naming the ask and the payout's reference
 *
 * A burn holds only with its ask (same holder, same credits, same mint, not
 * burned before): nothing is destroyed without the payout recorded, and no
 * payout without the burn. Between members, credits move by agreement
 * settlements (ADR-Q-025) that name the mint; the totals never change.
 *
 * The books, added up from receipts, must always reconcile:
 *
 *   circulation  = minted − destroyed
 *   Σ holders    = circulation            (every credit is somewhere)
 *   cash + capital ≥ circulation × one unit of the currency   (every credit is backed)
 *
 * Amounts (`pence`) are minor units of the mint's currency: pence for a
 * pound-mint, cents for a euro-mint (ADR-Q-042 §3). The field keeps its name
 * because receipts already signed carry it.
 *
 * Facts only: Q records pounds paid in and out; it never moves money.
 */
import { minorPerCredit } from './currency';
import type { SealedReceipt } from './seal';
import { isAgreementStep, standingOf, type AgreementReceipt } from './agreements';

export const MINT_SCHEMA = 'inqbeta.mint/1';
export const MINT_SOURCE = 'inqbeta:q/mint';

export type MintMode = 'test' | 'live';
export type MintKind = 'mint' | 'cashout' | 'burn';

export interface MintEvent {
	schema: typeof MINT_SCHEMA;
	source: typeof MINT_SOURCE;
	/** Whose credits: the mint's DID (a host's or a federation's). */
	mint: string;
	kind: MintKind;
	credits: number;
	mode: MintMode;
	/** mint: who receives the new credits. */
	to?: string;
	/** cashout, burn: whose credits. */
	from?: string;
	/** mint: value in. burn: pounds paid out. */
	pence?: number;
	/** mint: capital that stands behind the credits (a building, a grant), valued in pence, with its record. */
	capital?: { pence: number; ref: string };
	/** mint: the payment provider's receipt, or the capital record. */
	cites?: string[];
	/** burn: the ask it answers, by content hash. */
	asks?: string;
	/** burn: the payout's reference (a bank or provider reference). */
	payout?: string;
	/**
	 * cashout, burn: where the pounds go — the holder's cashing-out account,
	 * by its receipt (inqbeta.payout-account/1) and its last four digits. Paid
	 * as a standing order, never to anything typed in at the time (ADR-Q-035).
	 */
	account?: { receipt: string; ends: string };
	at: string;
	/** What the rules said when it was made. */
	checked?: { action: string; rules: string[] };
}

export type MintReceipt = SealedReceipt & { content: MintEvent };

/* ---- Reconciliation (ADR-Q-035, 5 October 2026) ----
 *
 * The bank's books, added up and signed by the mint at a moment, at its
 * treasurer's request: a receipt anyone can hold. How long ago it was signed,
 * and how much has moved since, say how carefully the house keeps its books.
 */
export const RECONCILED_SCHEMA = 'inqbeta.mint-reconciled/1';
export const RECONCILE_ASK_SCHEMA = 'inqbeta.mint-reconcile-ask/1';

export interface Reconciliation {
	schema: typeof RECONCILED_SCHEMA;
	source: typeof MINT_SOURCE;
	mint: string;
	mode: MintMode;
	/** The books as they stood when it was signed. */
	books: { minted: number; destroyed: number; circulation: number; cashReserve: number; capitalReserve: number; holders: number; reconciled: boolean; backed: boolean };
	/** How many of the mint's own receipts it covers, and the latest of them, by content hash. */
	covers: { count: number; latest: string | null };
	/** Who asked for it: the treasurer, by DID; and their ask, by content hash. */
	by: string;
	/** The office they asked in (ADR-Q-038): treasurer, or caretaker. Absent on reconciliations from before offices. */
	byOffice?: string;
	/** An interest they declared on taking up the office, if any (ADR-Q-038 §6). */
	byInterest?: string;
	asks: string;
	at: string;
}
export type ReconciliationReceipt = SealedReceipt & { content: Reconciliation };

export function isReconciliation(x: unknown): x is ReconciliationReceipt {
	const c = (x as ReconciliationReceipt | null)?.content;
	return c?.schema === RECONCILED_SCHEMA && typeof c.mint === 'string' && typeof c.at === 'string' && typeof c.by === 'string';
}

export function isMintEvent(x: unknown): x is MintReceipt {
	const c = (x as MintReceipt | null)?.content;
	return c?.schema === MINT_SCHEMA && typeof c.mint === 'string' && Number.isInteger(c.credits) && c.credits > 0;
}

export interface Books {
	mint: string;
	mode: MintMode;
	minted: number;
	destroyed: number;
	circulation: number;
	/** Pence in (mints) and out (burns). */
	cashIn: number;
	cashOut: number;
	cashReserve: number;
	capitalReserve: number;
	/** Every holder's credits. */
	holders: Map<string, number>;
	/** Asks waiting for their burn: credits held back from spending. */
	asked: Map<string, number>;
	/** Does every credit exist somewhere, and is every credit backed? */
	reconciled: boolean;
	backed: boolean;
	/**
	 * Drift (ADR-Q-027 addendum, 5 October): 1 − (cash + capital at book
	 * value) ÷ credits out, in the currency. 0 is fully matched; above 0 means
	 * something is wrong (a missed payment, an unrecorded spend). Never below 0.
	 */
	drift: number;
	/** Receipts left out, and why. */
	problems: string[];
}

const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

/**
 * The books of one mint, in one mode, from receipts (any order, copies fine).
 * `currency` is the mint's (ISO 4217): one credit costs, and cashes out for,
 * one whole unit of it (ADR-Q-042 §3).
 */
export function booksOf(receipts: { json?: unknown; holds?: string }[], mint: string, mode: MintMode, currency: string): Books {
	const unit = minorPerCredit(currency);
	const b: Books = { mint, mode, minted: 0, destroyed: 0, circulation: 0, cashIn: 0, cashOut: 0, cashReserve: 0, capitalReserve: 0, holders: new Map(), asked: new Map(), reconciled: true, backed: true, drift: 0, problems: [] };
	const events = new Map<string, MintReceipt>();
	const steps: AgreementReceipt[] = [];
	for (const r of receipts) {
		if (r.holds === 'no') continue;
		if (isMintEvent(r.json) && r.json.content.mint === mint && r.json.content.mode === mode) events.set(r.json.contentHash, r.json);
		else if (isAgreementStep(r.json)) steps.push(r.json);
	}
	const sorted = [...events.values()].sort((x, y) => x.content.at.localeCompare(y.content.at));
	const asks = new Map<string, MintReceipt>();
	const burned = new Set<string>();
	const reject = (r: MintReceipt, why: string) => b.problems.push(`${r.content.kind} (${r.content.at}): ${why}`);

	/* Mints and asks first, then burns against them, so order in time decides nothing a signature doesn't. */
	for (const r of sorted) {
		const c = r.content;
		if (c.kind === 'mint') {
			if (r.did !== mint) { reject(r, 'only the mint can make its credits.'); continue; }
			if (!c.to) { reject(r, 'a mint names who receives the credits.'); continue; }
			const valueIn = (c.pence ?? 0) + (c.capital?.pence ?? 0);
			if (!c.cites?.length || valueIn <= 0) { reject(r, 'no credit without value in: cite the payment or the capital.'); continue; }
			if (c.credits * unit > valueIn) { reject(r, 'more credits than the value that came in.'); continue; }
			b.minted += c.credits;
			b.cashIn += c.pence ?? 0;
			b.capitalReserve += c.capital?.pence ?? 0;
			add(b.holders, c.to, c.credits);
		} else if (c.kind === 'cashout') {
			if (!c.from || r.did !== c.from) { reject(r, 'only the holder can ask to cash out their credits.'); continue; }
			asks.set(r.contentHash, r);
		}
	}

	/* Credits moved between members by agreements, in this mint. */
	const byAgreement = new Map<string, AgreementReceipt[]>();
	for (const s of steps) byAgreement.set(s.content.agreement, [...(byAgreement.get(s.content.agreement) ?? []), s]);
	/*
	 * A purchase from a shop (ADR-Q-026) has its own id, "<listing>.<n>", and
	 * reads with the shop offer it took: without it the purchase has no terms,
	 * and its settlements would move nobody's credits.
	 */
	const listingOf = (chain: AgreementReceipt[]) => {
		const taken = chain.find((s) => s.content.step === 'taken');
		const dot = taken ? taken.content.agreement.lastIndexOf('.') : -1;
		if (!taken || dot < 0) return [];
		return (byAgreement.get(taken.content.agreement.slice(0, dot)) ?? []).filter((s) => s.contentHash === taken.content.parent);
	};
	for (const chain of byAgreement.values()) {
		for (const e of standingOf([...listingOf(chain), ...chain]).settled.flat()) {
			if (!('credits' in e.value) || e.value.mode !== mode || (e.value.mint ?? '') !== mint) continue;
			add(b.holders, e.from, -e.value.credits);
			add(b.holders, e.to, e.value.credits);
		}
	}

	for (const r of sorted) {
		const c = r.content;
		if (c.kind !== 'burn') continue;
		if (r.did !== mint) { reject(r, 'only the mint can destroy its credits.'); continue; }
		const ask = c.asks ? asks.get(c.asks) : undefined;
		if (!ask) { reject(r, 'a burn answers a holder’s ask to cash out.'); continue; }
		if (burned.has(ask.contentHash)) { reject(r, 'that ask has already been paid.'); continue; }
		if (ask.content.from !== c.from || ask.content.credits !== c.credits) { reject(r, 'the burn must match the ask: the same holder, the same credits.'); continue; }
		if (!c.payout || (c.pence ?? 0) !== c.credits * unit) { reject(r, 'a burn records the payout: its reference, and the published value of the credits.'); continue; }
		if ((b.holders.get(c.from!) ?? 0) < c.credits) { reject(r, 'the holder doesn’t hold that many credits.'); continue; }
		if (b.cashIn - b.cashOut < (c.pence ?? 0)) { reject(r, 'the cash reserve can’t pay that out.'); continue; }
		burned.add(ask.contentHash);
		b.destroyed += c.credits;
		b.cashOut += c.pence ?? 0;
		add(b.holders, c.from!, -c.credits);
	}
	for (const [hash, ask] of asks) if (!burned.has(hash)) add(b.asked, ask.content.from!, ask.content.credits);

	b.circulation = b.minted - b.destroyed;
	b.cashReserve = b.cashIn - b.cashOut;
	for (const [k, v] of b.holders) if (v === 0) b.holders.delete(k);
	const held = [...b.holders.values()].reduce((n, v) => n + v, 0);
	b.reconciled = held === b.circulation && [...b.holders.values()].every((v) => v >= 0);
	b.backed = b.cashReserve + b.capitalReserve >= b.circulation * unit;
	b.drift = driftOf(b.cashReserve + b.capitalReserve, b.circulation * unit);
	if (!b.reconciled) b.problems.push(`The books don’t reconcile: holders have ${held}, but ${b.circulation} are in circulation.`);
	if (!b.backed) b.problems.push('The reserves don’t cover the credits in circulation.');
	return b;
}

/** What a holder can still spend, offer or cash out: what they hold, less what they've asked to cash out. */
export function spendable(b: Books, did: string): number {
	return Math.max(0, (b.holders.get(did) ?? 0) - (b.asked.get(did) ?? 0));
}

/* ---- Drift and the safety valve (ADR-Q-027 addendum, 5 October 2026; jobs D2, D3) ---- */

/** Warn above this drift. */
export const DRIFT_WARN = 0.1;
/** Above this drift, cash-outs pause; buying stays open, because it heals drift. */
export const DRIFT_VALVE = 0.2;
/** Books not reconciled for this long count as unknown: treated as over the valve. */
export const UNRECONCILED_DAYS = 30;

/** 1 − backing ÷ owed, never below 0; 0 when nothing is owed. */
export const driftOf = (backing: number, owed: number): number => (owed > 0 ? Math.max(0, 1 - backing / owed) : 0);

export interface Valve {
	/** Cash-outs paused. */
	shut: boolean;
	/** Drift over the warning line. */
	warn: boolean;
	drift: number;
	/** The books haven't been reconciled for too long, so their state is unknown. */
	unknown: boolean;
	/** One plain sentence. */
	says: string;
}

/**
 * Whether the safety valve is shut. `lastReconciledAt` is the bank's latest
 * signed reconciliation; `openedAt` its first entry, for a bank never
 * reconciled (a new bank has 30 days to do its first).
 */
export function valveOf(b: Pick<Books, 'drift' | 'circulation'>, o: { lastReconciledAt?: string | null; openedAt?: string | null; now?: Date } = {}): Valve {
	const now = (o.now ?? new Date()).getTime();
	const since = o.lastReconciledAt ?? o.openedAt ?? null;
	const unknown = b.circulation > 0 && !!since && now - Date.parse(since) > UNRECONCILED_DAYS * 86_400_000;
	const pct = Math.round(b.drift * 100);
	if (unknown) return { shut: true, warn: true, drift: b.drift, unknown, says: `Cash-outs are paused: the bank hasn’t reconciled its books for over ${UNRECONCILED_DAYS} days. They reopen once it does. Buying stays open.` };
	if (b.drift > DRIFT_VALVE) return { shut: true, warn: true, drift: b.drift, unknown, says: `Cash-outs are paused: ${pct}% of the credits out aren’t matched by money held (over ${DRIFT_VALVE * 100}%). Buying stays open, and brings it back.` };
	if (b.drift > DRIFT_WARN) return { shut: false, warn: true, drift: b.drift, unknown, says: `${pct}% of the credits out aren’t matched by money held. Over ${DRIFT_VALVE * 100}%, cash-outs pause.` };
	return { shut: false, warn: false, drift: b.drift, unknown, says: b.drift > 0 ? `${pct}% drift: within bounds.` : 'Every credit is matched by money held.' };
}
