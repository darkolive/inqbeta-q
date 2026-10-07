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
import { hashTreaty, noticeSigned, treatyParts, treatyStanding, type BankingCardReceipt, type Ending, type PartnerHealth, type Side, type Standing, type Treaty, type TreatyParts } from './treaties';

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

/* ---- Treaties (ADR-Q-042; 7 October 2026, E5) ---- */

export interface TreatyOnFile {
	hash: string;
	treaty: Treaty;
	/** Which side this federation is. */
	side: 'a' | 'b';
	partner: Side;
	/** Each holder's office proof, as filed: checked by the mint that filed it. */
	actingA: unknown;
	actingB: unknown;
	parts: TreatyParts;
	/** When it was first filed here, and when it was filed signed by both. */
	filed: string;
	inForceSince: string | null;
	ending: Ending | null;
	standing: Standing;
}

/** Every treaty this federation's mint has filed: the latest record of each, the further-signed one first, with its standing. */
export async function federationTreaties(ledger: unknown[], o: { mint: string; mode: MintMode; federation: string; health?: Record<string, PartnerHealth>; now?: Date }): Promise<TreatyOnFile[]> {
	const mine = ledger.filter((x): x is FedMoneyReceipt => isFedMoney(x) && x.did === o.mint && x.content.mint === o.mint && x.content.mode === o.mode && x.content.federation === o.federation).sort((a, b) => a.content.at.localeCompare(b.content.at));
	const byHash = new Map<string, { treaty: Treaty; actingA: unknown; actingB: unknown; parts: TreatyParts; filed: string; inForceSince: string | null }>();
	for (const x of mine.filter((m) => m.content.kind === 'treaty')) {
		const r = x.content.record as { treaty?: Treaty; actingA?: unknown; actingB?: unknown };
		if (!r?.treaty) continue;
		const t = r.treaty;
		if (t.a?.federation !== o.federation && t.b?.federation !== o.federation) continue;
		const hash = await hashTreaty(t);
		const parts = await treatyParts(t);
		const was = byHash.get(hash);
		const both = parts.signedByA && parts.signedByB;
		if (was && !(both && !was.inForceSince)) continue;
		byHash.set(hash, { treaty: t, actingA: r.actingA ?? was?.actingA ?? null, actingB: r.actingB ?? was?.actingB ?? null, parts, filed: was?.filed ?? x.content.at, inForceSince: both ? x.content.at : null });
	}
	const notices = mine.filter((m) => m.content.kind === 'treaty-notice').map((m) => m.content.record as Ending);
	const out: TreatyOnFile[] = [];
	for (const [hash, f] of byHash) {
		const side = f.treaty.a.federation === o.federation ? 'a' : 'b';
		let ending: Ending | null = null;
		for (const n of notices) if (n?.treaty === hash && (await noticeSigned(n, f.treaty)) && (!ending || n.on < ending.on)) ending = n;
		const health = { a: o.health?.[f.treaty.a.federation], b: o.health?.[f.treaty.b.federation] };
		const standing = treatyStanding(f.treaty, f.parts, { inForceSince: f.inForceSince ?? f.filed, settlements: [], health, ending }, o.now);
		out.push({ hash, treaty: f.treaty, side, partner: side === 'a' ? f.treaty.b : f.treaty.a, actingA: f.actingA, actingB: f.actingB, parts: f.parts, filed: f.filed, inForceSince: f.inForceSince, ending, standing });
	}
	return out.sort((a, b) => b.filed.localeCompare(a.filed));
}

/** The federations this one is in treaty with now: providers its vouchers' realms accept by treaty (ADR-Q-044 §5). */
export const inTreatyWith = (ts: TreatyOnFile[]) => ts.filter((t) => t.standing.state === 'in-force' || t.standing.state === 'ending').map((t) => t.partner.federation);
