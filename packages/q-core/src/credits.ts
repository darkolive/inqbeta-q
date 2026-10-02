/*
 * Credits as receipts (ADR-Q-023, 2 October 2026).
 *
 * Every move — bought, spent, rewarded, traded — is a receipt its signers
 * keep. A balance is never a number a server holds: it's added up from the
 * moves in your vault, each one checked by its signature and by the credit
 * rules (q-actions core/credits.ts) when it was made.
 *
 * Test credits and real credits never mix: each move says which it is, and a
 * balance is always for one or the other.
 */
import type { SealedReceipt } from './seal';

export const CREDIT_SCHEMA = 'inqbeta.credit/1';
export type CreditKind = 'buy' | 'spend' | 'reward' | 'trade';
export type CreditMode = 'test' | 'live';

export interface Pack {
	id: string;
	name: string;
	credits: number;
	/** Unset in test mode: nothing is charged. */
	pricePence?: number;
}

/** The first pack, for trying the whole flow end to end (ADR-Q-020 §3). */
export const TEST_PACKS: Pack[] = [{ id: 'standard-10', name: 'Standard', credits: 10 }];

export interface CreditMove {
	schema: typeof CREDIT_SCHEMA;
	source: 'inqbeta:q/credits';
	kind: CreditKind;
	credits: number;
	mode: CreditMode;
	/** Whose wallet the credits go to (buy, reward, trade) or come from (spend). */
	to: string;
	/** Trade: who gives them. */
	from?: string;
	pack?: Pack;
	/** Spend: the usage receipt it pays for. Reward: the capacity receipts. */
	for?: string[];
	/** Business trades: the value in pounds at the time (ADR-Q-023 §5). */
	valuePence?: number;
	business?: boolean;
	at: string;
	/** The holder's previous move, so a wallet is a chain: contentHash, or null for the first. */
	follows: string | null;
	/** What the rules said when it was made: the action's hash and the rules that decided. */
	checked?: { action: string; rules: string[] };
}

export type CreditReceipt = SealedReceipt & { content: CreditMove };

export function isCreditMove(x: unknown): x is CreditReceipt {
	const c = (x as CreditReceipt | null)?.content;
	return c?.schema === CREDIT_SCHEMA && typeof c.credits === 'number' && Number.isInteger(c.credits);
}

/** Every move that touches this person, oldest first, each once. */
export function movesOf(receipts: { json?: unknown; holds?: string }[], did: string): CreditReceipt[] {
	const seen = new Set<string>();
	const out: CreditReceipt[] = [];
	for (const r of receipts) {
		if (r.holds === 'no' || !isCreditMove(r.json)) continue;
		const m = r.json;
		if (seen.has(m.signature) || (m.content.to !== did && m.content.from !== did)) continue;
		seen.add(m.signature);
		out.push(m);
	}
	return out.sort((a, b) => a.content.at.localeCompare(b.content.at));
}

/** What one move does to this person's balance. */
export function effectOn(m: CreditMove, did: string): number {
	if (m.kind === 'spend') return m.to === did ? -m.credits : 0;
	if (m.kind === 'trade') return (m.to === did ? m.credits : 0) - (m.from === did ? m.credits : 0);
	return m.to === did ? m.credits : 0;
}

/** A balance, added up from receipts. Test and real are always separate. */
export function balanceOf(receipts: { json?: unknown; holds?: string }[], did: string, mode: CreditMode): number {
	return movesOf(receipts, did)
		.filter((m) => m.content.mode === mode)
		.reduce((n, m) => n + effectOn(m.content, did), 0);
}

/** The last move in this person's chain, for `follows` and the backdating rule. */
export function lastMoveOf(receipts: { json?: unknown; holds?: string }[], did: string): CreditReceipt | undefined {
	return movesOf(receipts, did).at(-1);
}

const person = (did: string) => ({ __entity: { type: 'Person', id: did } });

/** The facts credits.buy is decided on. */
export function buyFacts(move: CreditMove, signers: string[], packs: Pack[], previousAt?: string) {
	const pack = packs.find((p) => p.id === move.pack?.id);
	return {
		buyer: person(move.to),
		signers: [...new Set(signers)].map(person),
		credits: move.credits,
		packPublished: !!pack && pack.credits === move.credits,
		priceMatchesPack: !!pack && (pack.pricePence ?? null) === (move.pack?.pricePence ?? null),
		live: move.mode === 'live',
		paymentConfirmed: false,
		datedBeforePrevious: !!previousAt && move.at < previousAt
	};
}

/** The facts credits.spend is decided on. */
export function spendFacts(move: CreditMove, signers: string[], balanceBefore: number, usage: { cited: boolean; signedByService: boolean }, liveService: boolean, previousAt?: string) {
	return {
		holder: person(move.to),
		signers: [...new Set(signers)].map(person),
		credits: move.credits,
		balanceBefore,
		citesUsage: usage.cited,
		usageSignedByService: usage.signedByService,
		testCredits: move.mode === 'test',
		liveService,
		datedBeforePrevious: !!previousAt && move.at < previousAt
	};
}
