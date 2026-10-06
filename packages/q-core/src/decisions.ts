/*
 * A recorded decision (ADR-Q-038 §8, "evidence travels with the action"), 6
 * October 2026. Until the Plans block brings votes, a decision is minuted:
 * the secretary or chair, in role, signs what was decided, how (a meeting, a
 * vote, a budget already agreed, a standing rule), when, and, for money, the
 * most it allows. A spend or cash-out from the federation's account names the
 * decision that allows it; the engine checks it's there, the right kind, and
 * enough, counting what has already been spent under it.
 *
 * Who decided (the minute) and who actioned it (two office holders) are both
 * on the record, and are different signatures.
 *
 * Pure: no storage, no window.
 */
import { checkReceipt, sealWith, type SealedReceipt } from './seal';
import { actingCovers, type Acting } from './inrole';
import type { Identity } from './passkey';

export const DECISION_SCHEMA = 'inqbeta.decision/1';
export const DECISION_HOW = [
	{ id: 'meeting', called: 'Agreed at a meeting' },
	{ id: 'vote', called: 'Voted on by the members' },
	{ id: 'budget', called: 'A budget line already agreed' },
	{ id: 'rule', called: 'A standing rule' }
] as const;
export type DecisionHow = (typeof DECISION_HOW)[number]['id'];

export interface Decision {
	schema: typeof DECISION_SCHEMA;
	source: 'inqbeta:q/decisions';
	federation: string;
	/** What was decided, in plain words. */
	says: string;
	how: DecisionHow;
	/** When it was decided (the meeting's date), ISO. */
	decidedOn: string;
	/** For money: the most it allows, in credits, and until when. */
	upTo?: number;
	until?: string;
	/** The minute-taker's office proof. */
	acting: Acting;
	at: string;
}
export type DecisionReceipt = SealedReceipt & { content: Decision };

/** The secretary or chair, in role, minutes a decision. */
export async function minuteDecision(
	who: Pick<Identity, 'did' | 'publicKey' | 'signing'>,
	acting: Acting,
	o: { says: string; how: DecisionHow; decidedOn: string; upTo?: number; until?: string },
	now = new Date()
): Promise<DecisionReceipt> {
	if (!o.says.trim()) throw new Error('Say what was decided.');
	if (!DECISION_HOW.some((h) => h.id === o.how)) throw new Error('Say how it was decided.');
	if (o.upTo !== undefined && !(o.upTo > 0)) throw new Error('A money decision allows more than nothing.');
	const content: Decision = {
		schema: DECISION_SCHEMA,
		source: 'inqbeta:q/decisions',
		federation: acting.federation,
		says: o.says.trim(),
		how: o.how,
		decidedOn: o.decidedOn,
		...(o.upTo !== undefined ? { upTo: o.upTo } : {}),
		...(o.until ? { until: o.until } : {}),
		acting,
		at: now.toISOString()
	};
	return (await sealWith(who, content)) as DecisionReceipt;
}

type Check = { ok: true; says: string } | { ok: false; says: string };

/** Is this decision sound evidence for spending `credits` from this federation now? */
export async function decisionCovers(x: unknown, o: { federation: string; credits?: number; spentSoFar?: number; founder?: string; now?: Date; revoked?: Set<string> }): Promise<Check> {
	const now = o.now ?? new Date();
	const r = x as DecisionReceipt;
	const c = r?.content;
	if (c?.schema !== DECISION_SCHEMA) return { ok: false, says: 'There’s no recorded decision for this.' };
	if (!(await checkReceipt(r)).ok) return { ok: false, says: 'The decision isn’t signed by who it says.' };
	if (c.federation !== o.federation) return { ok: false, says: 'That decision is another federation’s.' };
	const m = await actingCovers(r.did, c.acting, { federation: o.federation, cmd: '/fed/minutes', founder: o.founder, now: new Date(c.at), revoked: o.revoked });
	if (!m.ok) return { ok: false, says: `The decision wasn’t minuted in role: ${m.says}` };
	if (c.until && Date.parse(c.until) <= now.getTime()) return { ok: false, says: `That decision ran out on ${c.until.slice(0, 10)}.` };
	const spent = o.spentSoFar ?? 0;
	if (o.credits !== undefined && c.upTo !== undefined && spent + o.credits > c.upTo)
		return { ok: false, says: spent ? `The decision allows up to ${c.upTo} credits; ${spent} are already spent under it, and this is ${o.credits} more.` : `The decision allows up to ${c.upTo} credits; this is ${o.credits}.` };
	if (o.credits !== undefined && c.upTo === undefined && c.how !== 'rule') return { ok: false, says: 'The decision doesn’t say how much it allows.' };
	return { ok: true, says: `${DECISION_HOW.find((h) => h.id === c.how)?.called}: ${c.says}` };
}
