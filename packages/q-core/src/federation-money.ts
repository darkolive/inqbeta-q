/*
 * The federation's own account, read from its mint's books (ADR-Q-038 §8;
 * 6 October 2026, C4): what it holds, the banking card it's paid into, the
 * decisions minuted for spending, what each has had spent under it, and the
 * cash-outs asked and waiting for a second office holder.
 *
 * Pure: no storage, no window.
 */
import { isFedMoney, spendable, type Books, type FedMoneyReceipt, type MintMode } from './mint';
import { hashCosigned, type Cosigned } from './cosign';
import type { DecisionReceipt } from './decisions';
import type { BankingCardReceipt } from './treaties';

export interface FederationAccount {
	federation: string;
	/** Its credits with this bank, and what it can still move (less what's asked). */
	holds: number;
	spendable: number;
	card: { hash: string; ends: string; receipt: BankingCardReceipt } | null;
	decisions: { hash: string; receipt: DecisionReceipt; spent: number }[];
	/** Asked by one office holder, waiting for a second. */
	waiting: { hash: string; cosigned: Cosigned; credits: number; decision: string | null }[];
	/** Agreed by two and paid out. */
	done: { hash: string; cosigned: Cosigned; credits: number; at: string }[];
}

export async function federationAccount(ledger: unknown[], b: Books, o: { mint: string; mode: MintMode; federation: string }): Promise<FederationAccount> {
	const mine = ledger.filter((x): x is FedMoneyReceipt => isFedMoney(x) && x.did === o.mint && x.content.mint === o.mint && x.content.mode === o.mode && x.content.federation === o.federation).sort((a, b2) => a.content.at.localeCompare(b2.content.at));
	const cards = mine.filter((x) => x.content.kind === 'bank-card');
	const last = cards.at(-1);
	const card = last ? { hash: (last.content.record as BankingCardReceipt).contentHash, ends: (last.content.record as BankingCardReceipt).content.ends, receipt: last.content.record as BankingCardReceipt } : null;
	const agreed = mine.filter((x) => x.content.kind === 'agreed');
	const agreedHashes = new Set(await Promise.all(agreed.map((a) => hashCosigned(a.content.record as Cosigned))));
	const decisions = mine
		.filter((x) => x.content.kind === 'decision')
		.map((x) => {
			const receipt = x.content.record as DecisionReceipt;
			const spent = agreed.filter((a) => a.content.decision === receipt.contentHash).reduce((n, a) => n + (a.content.credits ?? 0), 0);
			return { hash: receipt.contentHash, receipt, spent };
		});
	const waiting: FederationAccount['waiting'] = [];
	for (const x of mine.filter((m) => m.content.kind === 'asked')) {
		const c = x.content.record as Cosigned;
		const h = await hashCosigned(c);
		if (!agreedHashes.has(h) && !waiting.some((w) => w.hash === h)) waiting.push({ hash: h, cosigned: c, credits: x.content.credits ?? 0, decision: x.content.decision ?? null });
	}
	const done = await Promise.all(agreed.map(async (a) => ({ hash: await hashCosigned(a.content.record as Cosigned), cosigned: a.content.record as Cosigned, credits: a.content.credits ?? 0, at: a.content.at })));
	const holds = b.holders.get(o.federation) ?? 0;
	const asked = waiting.reduce((n, w) => n + w.credits, 0);
	return { federation: o.federation, holds, spendable: Math.max(0, spendable(b, o.federation) - asked), card, decisions, waiting, done };
}
