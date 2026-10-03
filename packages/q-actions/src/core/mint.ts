/*
 * The mint — Q core (ADR-Q-027, 3 October 2026). Three steps, each decided
 * here before it's kept:
 *
 *   credits.mint     credits made by a mint, citing the value that came in
 *   credits.cashout  a holder asks for pounds for credits they hold
 *   credits.burn     the mint destroys them and records the payout
 *
 * mintFacts reads the mint's books (q-core booksOf) and gives the engine
 * plain facts. booksOf decides what the receipts mean; these rules decide
 * whether a step may be made. The tests hold them to the same answers.
 */
import { ACTION_SCHEMA, type ActionDefinition, type Rule } from '../actions';
import { CEDAR_VERSION } from '../version';
import { booksOf, spendable, type MintReceipt } from '@inqbeta/q-core/mint';

type MintAction = 'credits.mint' | 'credits.cashout' | 'credits.burn';

const facts = (id: MintAction) => `entity Person;
entity Federation;
entity Mint;

action "${id}" appliesTo {
  principal: [Person],
  resource: [Mint],
  context: {
    signer: Person,
    mint: Person,
    holder: Person,
    credits: Long,
    valueInPence: Long,
    citesValueIn: Bool,
    creditsValuePence: Long,
    spendable: Long,
    answersAsk: Bool,
    askAlreadyPaid: Bool,
    matchesAsk: Bool,
    payoutRecorded: Bool,
    payoutPence: Long,
    cashReserve: Long,
    live: Bool,
    moneyConfirmed: Bool,
    approvedByAI: Bool,
    datedBeforePrevious: Bool,
  }
};`;

const on = (id: string) => `principal, action == Action::"${id}", resource`;
const rule = (id: MintAction, kind: Rule['kind'], slug: string, says: string, when: string): [string, Rule] => [
	`${id}/${kind}/${slug}`,
	{ kind, says, checked: 'enforced', policy: `@id("${id}/${kind}/${slug}")\nforbid (${on(id)})\nwhen { ${when} };` }
];
const permit = (id: MintAction, says: string, who: 'mint' | 'holder'): [string, Rule] => [
	`${id}/may/record`,
	{ kind: 'may', says, checked: 'enforced', policy: `@id("${id}/may/record")\npermit (${on(id)})\nwhen { context.signer == context.${who} };` }
];
const common = (id: MintAction) => [
	rule(id, 'cannot', 'nothing', 'Move less than one credit', 'context.credits < 1'),
	rule(id, 'cannot', 'ai-approval', 'Be approved by an AI', 'context.approvedByAI'),
	rule(id, 'cannot', 'backdate', 'Be dated earlier than the mint’s last step', 'context.datedBeforePrevious')
];
const define = (id: MintAction, says: string, rules: [string, Rule][]): ActionDefinition => ({
	schema: ACTION_SCHEMA,
	id,
	version: '1.0.0',
	by: 'q:core',
	says,
	engine: { cedar: CEDAR_VERSION },
	facts: facts(id),
	rules: Object.fromEntries(rules)
});

export const CREDITS_MINT = define('credits.mint', 'A mint makes credits, only for value that came in.', [
	permit('credits.mint', 'Record credits made, signed by the mint', 'mint'),
	rule('credits.mint', 'must', 'value-in', 'Cite the value that came in: the payment, or the capital', '!context.citesValueIn || context.valueInPence < 1'),
	rule('credits.mint', 'cannot', 'beyond-value', 'Make more credits than the value that came in', 'context.citesValueIn && context.valueInPence >= 1 && context.creditsValuePence > context.valueInPence'),
	rule('credits.mint', 'cannot', 'live-unconfirmed', 'Make real credits before the payment is confirmed', 'context.live && !context.moneyConfirmed'),
	...common('credits.mint')
]);

export const CREDITS_CASHOUT = define('credits.cashout', 'A holder asks for pounds for credits they hold.', [
	permit('credits.cashout', 'Record an ask to cash out, signed by the holder', 'holder'),
	rule('credits.cashout', 'cannot', 'beyond-held', 'Ask for more than you hold and haven’t already asked for', 'context.credits > context.spendable'),
	...common('credits.cashout')
]);

export const CREDITS_BURN = define('credits.burn', 'A mint destroys credits a holder cashed out, and records the payout.', [
	permit('credits.burn', 'Record credits destroyed, signed by the mint', 'mint'),
	rule('credits.burn', 'must', 'answer-ask', 'Answer the holder’s own ask to cash out', '!context.answersAsk'),
	rule('credits.burn', 'cannot', 'pay-twice', 'Pay out the same ask twice', 'context.askAlreadyPaid'),
	rule('credits.burn', 'must', 'match-ask', 'Destroy exactly what was asked: the same holder, the same credits', '!context.matchesAsk'),
	rule('credits.burn', 'must', 'record-payout', 'Record the payout: its reference, and the published value of the credits', '!context.payoutRecorded || context.payoutPence != context.creditsValuePence'),
	rule('credits.burn', 'cannot', 'beyond-held', 'Destroy more than the holder holds', 'context.credits > context.spendable'),
	rule('credits.burn', 'cannot', 'beyond-reserve', 'Pay out more than the cash reserve holds', 'context.payoutPence > context.cashReserve'),
	rule('credits.burn', 'cannot', 'live-unconfirmed', 'Destroy real credits before the payout is confirmed', 'context.live && !context.moneyConfirmed'),
	...common('credits.burn')
]);

export const MINT_ACTIONS = [CREDITS_MINT, CREDITS_CASHOUT, CREDITS_BURN];

/**
 * Which action a mint step is, and its facts, given the receipts before it.
 * `pencePerCredit` is the mint's published backing. `moneyConfirmed` comes
 * from the payment provider (real money only; test mode never needs it).
 */
export function mintFacts(prior: { json?: unknown; holds?: string }[], next: MintReceipt, pencePerCredit: number, o: { moneyConfirmed?: boolean; approvedByAI?: boolean } = {}) {
	const c = next.content;
	const b = booksOf(prior, c.mint, c.mode, pencePerCredit);
	const person = (id: string) => ({ __entity: { type: 'Person', id: id || 'nobody' } });
	const holder = c.kind === 'mint' ? (c.to ?? '') : (c.from ?? '');
	const asks = prior.map((r) => r.json).filter((j): j is MintReceipt => (j as MintReceipt | undefined)?.content?.kind === 'cashout');
	const ask = c.kind === 'burn' && c.asks ? asks.find((a) => a.contentHash === c.asks && a.content.mint === c.mint) : undefined;
	const paid = new Set(prior.map((r) => r.json as MintReceipt | undefined).filter((j) => j?.content?.kind === 'burn' && j.did === c.mint).map((j) => j!.content.asks));
	const lastAt = prior.map((r) => r.json as MintReceipt | undefined).filter((j) => j?.content?.mint === c.mint).map((j) => j!.content.at).sort().at(-1);
	/* For a burn, what's held counts the ask it answers as still theirs to destroy. */
	const canMove = c.kind === 'burn' ? (b.holders.get(holder) ?? 0) : spendable(b, holder);
	const facts = {
		signer: person(next.did),
		mint: person(c.mint),
		holder: person(holder),
		credits: c.credits,
		valueInPence: (c.pence ?? 0) + (c.capital?.pence ?? 0),
		citesValueIn: !!c.cites?.length,
		creditsValuePence: c.credits * pencePerCredit,
		spendable: canMove,
		answersAsk: !!ask && ask.did === ask.content.from,
		askAlreadyPaid: !!c.asks && paid.has(c.asks),
		matchesAsk: !!ask && ask.content.from === c.from && ask.content.credits === c.credits,
		payoutRecorded: !!c.payout,
		payoutPence: c.kind === 'burn' ? (c.pence ?? 0) : 0,
		cashReserve: b.cashReserve,
		live: c.mode === 'live',
		moneyConfirmed: !!o.moneyConfirmed,
		approvedByAI: !!o.approvedByAI,
		datedBeforePrevious: !!lastAt && c.at < lastAt
	};
	const action: MintAction = c.kind === 'mint' ? 'credits.mint' : c.kind === 'cashout' ? 'credits.cashout' : 'credits.burn';
	return { action, facts, books: b };
}
