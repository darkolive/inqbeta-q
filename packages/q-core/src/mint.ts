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
 *   cash + capital ≥ circulation × pence per credit   (every credit is backed)
 *
 * Facts only: Q records pounds paid in and out; it never moves money.
 */
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
	at: string;
	/** What the rules said when it was made. */
	checked?: { action: string; rules: string[] };
}

export type MintReceipt = SealedReceipt & { content: MintEvent };

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
	/** Receipts left out, and why. */
	problems: string[];
}

const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

/**
 * The books of one mint, in one mode, from receipts (any order, copies fine).
 * `pencePerCredit` is the mint's published backing: what a credit costs and
 * what cashing it out pays.
 */
export function booksOf(receipts: { json?: unknown; holds?: string }[], mint: string, mode: MintMode, pencePerCredit: number): Books {
	const b: Books = { mint, mode, minted: 0, destroyed: 0, circulation: 0, cashIn: 0, cashOut: 0, cashReserve: 0, capitalReserve: 0, holders: new Map(), asked: new Map(), reconciled: true, backed: true, problems: [] };
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
			if (c.credits * pencePerCredit > valueIn) { reject(r, 'more credits than the value that came in.'); continue; }
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
	for (const chain of byAgreement.values()) {
		for (const e of standingOf(chain).settled.flat()) {
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
		if (!c.payout || (c.pence ?? 0) !== c.credits * pencePerCredit) { reject(r, 'a burn records the payout: its reference, and the published value of the credits.'); continue; }
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
	b.backed = b.cashReserve + b.capitalReserve >= b.circulation * pencePerCredit;
	if (!b.reconciled) b.problems.push(`The books don’t reconcile: holders have ${held}, but ${b.circulation} are in circulation.`);
	if (!b.backed) b.problems.push('The reserves don’t cover the credits in circulation.');
	return b;
}

/** What a holder can still spend, offer or cash out: what they hold, less what they've asked to cash out. */
export function spendable(b: Books, did: string): number {
	return Math.max(0, (b.holders.get(did) ?? 0) - (b.asked.get(did) ?? 0));
}
