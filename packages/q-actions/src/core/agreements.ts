/*
 * Agreements — Q core (ADR-Q-025, 3 October 2026). Six steps, each a signed
 * receipt decided here before it's kept, and whenever anyone checks it after:
 *
 *   agreement.propose   an offer: what each side gives
 *   agreement.counter   new terms, answering the latest (after agreeing: a variation)
 *   agreement.agree     the other side agrees: the contract point
 *   agreement.end       declined by the other side, or withdrawn by the one who offered
 *   agreement.done      one side says it's done, with evidence
 *   agreement.settle    the accounting: one side signs the entries, the other confirms the same
 *
 * Cedar can't count or look things up, so agreementFacts (below) reads the
 * chain with q-core's standingOf and hands the engine plain facts. Many of the
 * same checks live in standingOf too: the engine decides whether a step may be
 * made; standingOf decides what a chain means. Both must agree, and the tests
 * hold them to it.
 */
import { ACTION_SCHEMA, type ActionDefinition, type Rule } from '../actions';
import { CEDAR_VERSION } from '../version';
import { sameEntries, standingOf, whySettlementDoesntFit, type AgreementReceipt, type Entry, type Standing, type Terms, type Value } from '@inqbeta/q-core/agreements';

const ACTIONS = ['agreement.propose', 'agreement.counter', 'agreement.agree', 'agreement.end', 'agreement.done', 'agreement.settle'] as const;
type AgreementAction = (typeof ACTIONS)[number];

/* One set of facts for every step, so the same chain reads the same way at each. */
const facts = (id: AgreementAction) => `entity Person;
entity Federation;
entity Agreement;

action "${id}" appliesTo {
  principal: [Person],
  resource: [Agreement],
  context: {
    actor: Person,
    signers: Set<Person>,
    actorIsParty: Bool,
    phase: String,
    followsLatest: Bool,
    ownOffer: Bool,
    offerExpired: Bool,
    partiesUnchanged: Bool,
    twoDifferentPeople: Bool,
    termsDescribed: Bool,
    sameKindBothWays: Bool,
    poundsWithoutBusiness: Bool,
    creditsPromised: Long,
    creditsAvailable: Long,
    crossFederation: Bool,
    underTreaty: Bool,
    withdrawing: Bool,
    hasEntries: Bool,
    withinAgreed: Bool,
    confirming: Bool,
    ownSettlement: Bool,
    sameEntriesAsPending: Bool,
    settlementWaiting: Bool,
    payerCredits: Long,
    payerBalance: Long,
    datedBeforePrevious: Bool,
  }
};`;

const on = (id: string) => `principal, action == Action::"${id}", resource`;
const forbid = (id: AgreementAction, slug: string, kind: Rule['kind'], says: string, when: string): [string, Rule] => [
	`${id}/${kind}/${slug}`,
	{ kind, says, checked: 'enforced', policy: `@id("${id}/${kind}/${slug}")\nforbid (${on(id)})\nwhen { ${when} };` }
];
const record = (id: AgreementAction, says: string): [string, Rule] => [
	`${id}/may/record`,
	{ kind: 'may', says, checked: 'enforced', policy: `@id("${id}/may/record")\npermit (${on(id)})\nwhen { context.actorIsParty && context.signers.contains(context.actor) };` }
];

/* Rules more than one step shares. */
const backdate = (id: AgreementAction) => forbid(id, 'backdate', 'cannot', 'Be dated earlier than the step it follows', 'context.datedBeforePrevious');
const latest = (id: AgreementAction) => forbid(id, 'follow-latest', 'must', 'Answer the latest step', '!context.followsLatest');
const fairTerms = (id: AgreementAction) => [
	forbid(id, 'two-people', 'must', 'Be between two different people', '!context.twoDifferentPeople'),
	forbid(id, 'described', 'must', 'Say what each side gives: words, at least one credit, or more than nothing in pounds', '!context.termsDescribed'),
	forbid(id, 'same-kind', 'cannot', 'Trade the same kind both ways (credits for credits is a gift)', 'context.sameKindBothWays'),
	forbid(id, 'pounds-personal', 'cannot', 'Record pounds on a personal agreement', 'context.poundsWithoutBusiness')
];
const overPromise = (id: AgreementAction) => forbid(id, 'over-promise', 'cannot', 'Promise more credits than are available', 'context.creditsPromised > context.creditsAvailable');
const treaty = (id: AgreementAction) => forbid(id, 'outside-treaty', 'cannot', 'Agree across federations outside a treaty', 'context.crossFederation && !context.underTreaty');

const define = (id: AgreementAction, says: string, rules: [string, Rule][]): ActionDefinition => ({
	schema: ACTION_SCHEMA,
	id,
	version: '1.0.0',
	by: 'q:core',
	says,
	engine: { cedar: CEDAR_VERSION },
	facts: facts(id),
	rules: Object.fromEntries(rules)
});

export const AGREEMENT_PROPOSE = define('agreement.propose', 'Someone offers an agreement: what they give, in exchange for what.', [
	record('agreement.propose', 'Record an offer, signed by one of the two people'),
	forbid('agreement.propose', 'start', 'must', 'Start a new agreement', 'context.phase != "none"'),
	...fairTerms('agreement.propose'),
	overPromise('agreement.propose'),
	treaty('agreement.propose'),
	backdate('agreement.propose')
]);

export const AGREEMENT_COUNTER = define('agreement.counter', 'Someone answers an offer with new terms; after agreeing, a variation.', [
	record('agreement.counter', 'Record a counteroffer, signed by one of the two people'),
	forbid('agreement.counter', 'something-to-answer', 'must', 'Answer an open offer or an agreement', 'context.phase != "agreeing" && context.phase != "agreed"'),
	latest('agreement.counter'),
	forbid('agreement.counter', 'own-offer', 'cannot', 'Counter your own offer (withdraw it instead)', 'context.phase == "agreeing" && context.ownOffer'),
	forbid('agreement.counter', 'same-people', 'cannot', 'Change who the agreement is between', '!context.partiesUnchanged'),
	...fairTerms('agreement.counter'),
	overPromise('agreement.counter'),
	treaty('agreement.counter'),
	backdate('agreement.counter')
]);

export const AGREEMENT_AGREE = define('agreement.agree', 'The other side agrees to the latest offer: the contract point.', [
	record('agreement.agree', 'Record an agreement, signed by the other person'),
	forbid('agreement.agree', 'open-offer', 'must', 'Agree to an offer that is still open', 'context.phase != "agreeing" || context.offerExpired'),
	latest('agreement.agree'),
	forbid('agreement.agree', 'own-offer', 'cannot', 'Agree to your own offer', 'context.ownOffer'),
	overPromise('agreement.agree'),
	treaty('agreement.agree'),
	backdate('agreement.agree')
]);

export const AGREEMENT_END = define('agreement.end', 'An open offer is declined by the other side, or withdrawn by the one who made it.', [
	record('agreement.end', 'Record an ending, signed by one of the two people'),
	forbid('agreement.end', 'open-offer', 'must', 'End an offer that is still open', 'context.phase != "agreeing"'),
	latest('agreement.end'),
	forbid('agreement.end', 'withdraw-others', 'cannot', 'Withdraw someone else’s offer', 'context.withdrawing && !context.ownOffer'),
	forbid('agreement.end', 'decline-own', 'cannot', 'Decline your own offer (withdraw it instead)', '!context.withdrawing && context.ownOffer'),
	backdate('agreement.end')
]);

export const AGREEMENT_DONE = define('agreement.done', 'One side says what was agreed is done, with evidence if they like.', [
	record('agreement.done', 'Record that it’s done, signed by one of the two people'),
	forbid('agreement.done', 'agreed', 'must', 'Follow an agreement both have made', 'context.phase != "agreed"'),
	backdate('agreement.done')
]);

export const AGREEMENT_SETTLE = define('agreement.settle', 'The accounting: one side signs the entries, the other confirms exactly the same.', [
	record('agreement.settle', 'Record a settlement, signed by one of the two people'),
	forbid('agreement.settle', 'agreed', 'must', 'Settle only what both have agreed, and never after it has ended', 'context.phase != "agreed"'),
	forbid('agreement.settle', 'entries', 'must', 'Say what is settled, entry by entry', '!context.hasEntries'),
	forbid('agreement.settle', 'within-agreed', 'cannot', 'Settle more than, or other than, what was agreed', '!context.confirming && !context.withinAgreed'),
	forbid('agreement.settle', 'one-at-a-time', 'cannot', 'Start a settlement while another waits to be confirmed', '!context.confirming && context.settlementWaiting'),
	forbid('agreement.settle', 'confirm-own', 'cannot', 'Confirm your own settlement', 'context.confirming && context.ownSettlement'),
	forbid('agreement.settle', 'same-entries', 'must', 'Confirm exactly the entries the other person signed', 'context.confirming && !context.sameEntriesAsPending'),
	forbid('agreement.settle', 'overdraw', 'cannot', 'Settle more credits than the payer holds', 'context.payerCredits > context.payerBalance'),
	backdate('agreement.settle')
]);

export const AGREEMENT_ACTIONS = [AGREEMENT_PROPOSE, AGREEMENT_COUNTER, AGREEMENT_AGREE, AGREEMENT_END, AGREEMENT_DONE, AGREEMENT_SETTLE];

/* ---- The facts, read from the chain ---- */

const kind = (v: Value) => ('credits' in v ? 'credits' : 'pence' in v ? 'pounds' : 'thing');
const described = (v: Value) => ('credits' in v ? Number.isInteger(v.credits) && v.credits >= 1 : 'pence' in v ? Number.isInteger(v.pence) && v.pence >= 1 : !!v.thing.trim());
const givesOf = (t: Terms | null | undefined, did: string) => (!t ? null : did === t.a ? t.aGives : did === t.b ? t.bGives : null);
const creditsIn = (v: Value | null) => (v && 'credits' in v ? v : null);

export interface Wallets {
	/** Credits this person could still promise (held, less what's committed elsewhere). */
	available: (did: string, mode: 'test' | 'live') => number;
	/** Credits this person holds. */
	balance: (did: string, mode: 'test' | 'live') => number;
	crossFederation?: boolean;
	underTreaty?: boolean;
}

const ACTION_OF: Record<AgreementReceipt['content']['step'], AgreementAction> = {
	proposed: 'agreement.propose',
	countered: 'agreement.counter',
	agreed: 'agreement.agree',
	declined: 'agreement.end',
	withdrawn: 'agreement.end',
	done: 'agreement.done',
	settled: 'agreement.settle'
};

/** Which action a step is, and the facts to decide it on, given the steps before it. */
export function agreementFacts(prior: AgreementReceipt[], next: AgreementReceipt, w: Wallets): { action: AgreementAction; facts: Record<string, unknown>; standing: Standing } {
	const c = next.content;
	const actor = next.did;
	const s = prior.length ? standingOf(prior, Date.parse(c.at)) : null;
	const phase = s ? s.phase : 'none';
	const base: Terms | null = s?.terms ?? null;
	const terms = c.terms ?? base;
	const person = (id: string) => ({ __entity: { type: 'Person', id } });

	/* What the actor promises by this step, if it's credits. */
	const promising = c.step === 'proposed' || c.step === 'countered' || c.step === 'agreed' ? creditsIn(givesOf(terms, actor)) : null;
	const t = c.terms;

	const entries: Entry[] = c.entries ?? [];
	const pending = s?.pending;
	const confirming = c.step === 'settled' && !!pending && c.parent === pending.hash;
	const credit = entries.find((e) => 'credits' in e.value);
	const payerMode = credit && 'credits' in credit.value ? credit.value.mode : 'test';
	const payerCredits = entries.filter((e) => credit && e.from === credit.from && 'credits' in e.value).reduce((n, e) => n + ('credits' in e.value ? e.value.credits : 0), 0);

	/* Within what was agreed and already settled (whether another settlement is waiting is its own rule). */
	const withinAgreed = c.step !== 'settled' || confirming || !s || s.phase !== 'agreed' || whySettlementDoesntFit(s, entries) === null;

	const followsLatest = !s ? c.parent === null : c.step === 'agreed' || c.step === 'declined' || c.step === 'withdrawn' ? c.parent === s.offerHash : c.parent === (s.phase === 'agreeing' ? s.offerHash : s.lastHash);

	const facts: Record<string, unknown> = {
		actor: person(actor),
		signers: [person(actor)],
		actorIsParty: !!terms && (actor === terms.a || actor === terms.b),
		phase,
		followsLatest,
		ownOffer: !!s && s.offeredBy === actor,
		offerExpired: !!s && s.phase === 'ended' && s.ended === 'expired',
		partiesUnchanged: !t || !base || (t.a === base.a && t.b === base.b),
		twoDifferentPeople: !t || (!!t.a && !!t.b && t.a !== t.b),
		termsDescribed: !t || (described(t.aGives) && described(t.bGives)),
		sameKindBothWays: !!t && kind(t.aGives) !== 'thing' && kind(t.aGives) === kind(t.bGives),
		poundsWithoutBusiness: !!t && !t.business && ('pence' in t.aGives || 'pence' in t.bGives),
		creditsPromised: promising?.credits ?? 0,
		creditsAvailable: promising ? w.available(actor, promising.mode) : 0,
		crossFederation: !!w.crossFederation,
		underTreaty: !!w.underTreaty,
		withdrawing: c.step === 'withdrawn',
		hasEntries: entries.length > 0,
		withinAgreed,
		confirming,
		ownSettlement: confirming && pending?.by === actor,
		sameEntriesAsPending: confirming && !!pending && sameEntries(entries, pending.entries),
		settlementWaiting: !!pending && !confirming,
		payerCredits,
		payerBalance: credit ? w.balance(credit.from, payerMode) : 0,
		datedBeforePrevious: !!s?.lastAt && c.at < s.lastAt
	};
	return { action: ACTION_OF[c.step], facts, standing: s ?? standingOf([], Date.parse(c.at)) };
}
