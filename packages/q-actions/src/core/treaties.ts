/*
 * treaty.agree, treaty.trade and treaty.settle — Q core (ADR-Q-042, "The
 * rules"; 6 October 2026, E4). Facts come from the treaty and settlement
 * records themselves, checked by q-core/treaties, and from each signer's
 * office, checked by q-core/inrole.
 *
 * Treaties are derived actions: they can only add cannots (ADR-Q-023 §4). A
 * trade the core allows can be refused by a treaty, never the other way round.
 */
import { ACTION_SCHEMA, type ActionDefinition } from '../actions';
import { CEDAR_VERSION } from '../version';
import { actingCovers } from '@inqbeta/q-core/inrole';
import { treatyParts, withinCap, type SettlementParts, type Standing, type Treaty } from '@inqbeta/q-core/treaties';

const on = (id: string) => `principal, action == Action::"${id}", resource`;
const rule = (action: string, kind: 'may' | 'must' | 'cannot', slug: string, says: string, when?: string) => ({
	[`${action}/${kind}/${slug}`]: when
		? {
				kind,
				says,
				checked: 'enforced' as const,
				policy: `@id("${action}/${kind}/${slug}")\n${kind === 'may' ? 'permit' : 'forbid'} (${on(action)})\nwhen { ${when} };`
			}
		: { kind, says, checked: 'declared' as const }
});
const NO_AI = (action: string) => rule(action, 'cannot', 'ai', 'Be approved by an AI — checked when the Standing block vouches for people');

export const TREATY_AGREE: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'treaty.agree',
	version: '1.0.0',
	by: 'q:core',
	says: 'Two federations agree a treaty: why, both banking cards, the rate, the cap and how often they settle. It counts only with both sides.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "treaty.agree" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    termsHold: Bool,
    signedByA: Bool,
    signedByB: Bool,
    holderAInRole: Bool,
    holderBInRole: Bool,
    sameMode: Bool,
    rateRight: Bool,
    hasPurpose: Bool,
  }
};`,
	rules: {
		...rule('treaty.agree', 'may', 'agree', 'Agree a treaty signed by both federations’ keys and a mandate holder of each', 'context.signedByA && context.signedByB && context.termsHold'),
		...rule('treaty.agree', 'must', 'holders', 'Be signed for each side by someone in role with the federation’s money mandate (treasurer or caretaker)', '!context.holderAInRole || !context.holderBInRole'),
		...rule('treaty.agree', 'cannot', 'test-live', 'Treat between a test mint and a live one', '!context.sameMode'),
		...rule('treaty.agree', 'cannot', 'rate', 'Trade at anything but par in one currency, or a named published rate across two', '!context.rateRight'),
		...rule('treaty.agree', 'must', 'purpose', 'Say why: shared ethics, or connections offered or sought (without it, it shows as “no purpose given”)'),
		...NO_AI('treaty.agree')
	}
};

/** Facts for treaty.agree. Each holder's `acting` is their office proof, checked for the money mandate. */
export async function treatyAgreeFacts(t: Treaty, o: { actingA?: unknown; actingB?: unknown; founderA?: string; founderB?: string; now?: Date } = {}) {
	const p = await treatyParts(t);
	const inRole = async (holder: string | null, acting: unknown, federation: string, founder?: string) =>
		!!holder && (await actingCovers(holder, acting, { federation, cmd: '/fed/money', founder, now: o.now })).ok;
	return {
		termsHold: p.termsOk,
		signedByA: p.signedByA,
		signedByB: p.signedByB,
		holderAInRole: await inRole(p.holderA, o.actingA, t.a.federation, o.founderA),
		holderBInRole: await inRole(p.holderB, o.actingB, t.b.federation, o.founderB),
		sameMode: t.a.mode === t.b.mode,
		rateRight: t.a.currency === t.b.currency ? t.rate.kind === 'par' : t.rate.kind === 'source',
		hasPurpose: p.hasPurpose
	};
}

export const TREATY_TRADE: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'treaty.trade',
	version: '1.0.0',
	by: 'q:core',
	says: 'A member spends one federation’s credits at another, under their treaty. The two treasuries settle later.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "treaty.trade" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    underATreaty: Bool,
    inForce: Bool,
    withinCap: Bool,
    isCapacityGift: Bool,
    sameMode: Bool,
    rateIsTheTreatys: Bool,
    excluded: Bool,
  }
};`,
	rules: {
		...rule('treaty.trade', 'may', 'trade', 'Spend credits across a treaty that is in force', 'context.underATreaty && context.inForce'),
		...rule('treaty.trade', 'cannot', 'no-treaty', 'Trade across federations with no treaty', '!context.underATreaty'),
		...rule('treaty.trade', 'cannot', 'suspended', 'Trade under a suspended or ended treaty', '!context.inForce'),
		...rule('treaty.trade', 'cannot', 'cap', 'Hold more of a partner’s credits than the treaty’s cap', '!context.withinCap'),
		...rule('treaty.trade', 'cannot', 'gift', 'Send a capacity gift across a treaty, or treat one as a coin', 'context.isCapacityGift'),
		...rule('treaty.trade', 'cannot', 'test-live', 'Mix a test mint’s credits with a live one’s', '!context.sameMode'),
		...rule('treaty.trade', 'cannot', 'rate', 'Trade at any rate but the treaty’s (par, or its named source on the day)', '!context.rateIsTheTreatys'),
		...rule('treaty.trade', 'cannot', 'excluded', 'Buy a service the treaty excludes', 'context.excluded')
	}
};

/** Facts for treaty.trade: the receiving side would then hold `adding` more of the payer's credits. */
export function treatyTradeFacts(
	t: Treaty | null,
	o: { standing?: Pick<Standing, 'state'> | null; receiver?: 'a' | 'b'; held?: number; adding?: number; isCapacityGift?: boolean; payerMode?: 'test' | 'live'; rateUsed?: number; rateOnTheDay?: number; service?: string }
) {
	if (!t) return { underATreaty: false, inForce: false, withinCap: false, isCapacityGift: !!o.isCapacityGift, sameMode: false, rateIsTheTreatys: false, excluded: false };
	const receiver = o.receiver ?? 'a';
	const payer = receiver === 'a' ? t.b : t.a;
	const par = t.rate.kind === 'par';
	return {
		underATreaty: true,
		inForce: o.standing?.state === 'in-force' || o.standing?.state === 'ending',
		withinCap: withinCap(t, receiver, o.held ?? 0, o.adding ?? 0).ok,
		isCapacityGift: !!o.isCapacityGift,
		sameMode: (o.payerMode ?? payer.mode) === t.a.mode && t.a.mode === t.b.mode,
		rateIsTheTreatys: par ? (o.rateUsed ?? 1) === 1 : o.rateUsed !== undefined && o.rateUsed === o.rateOnTheDay,
		excluded: !!o.service && t.excludes.includes(o.service)
	};
}

export const TREATY_SETTLE: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'treaty.settle',
	version: '1.0.0',
	by: 'q:core',
	says: 'Two federations settle a period: swap first, each cancelling the other’s credits handed back, then the difference paid to the banking card the treaty names.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "treaty.settle" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    forThisTreaty: Bool,
    signedByBoth: Bool,
    balances: Bool,
    swappedFirst: Bool,
    toNamedCard: Bool,
    rateIsTheTreatys: Bool,
    valveOpen: Bool,
  }
};`,
	rules: {
		...rule('treaty.settle', 'may', 'settle', 'Settle a period, signed by both federations', 'context.forThisTreaty && context.signedByBoth'),
		...rule('treaty.settle', 'cannot', 'unbalanced', 'Settle with entries that don’t balance', '!context.balances'),
		...rule('treaty.settle', 'cannot', 'pay-not-swap', 'Pay money for credits that could have been swapped', '!context.swappedFirst'),
		...rule('treaty.settle', 'cannot', 'other-card', 'Pay a settlement to anything but the banking card named in the treaty', '!context.toNamedCard'),
		...rule('treaty.settle', 'cannot', 'rate', 'Settle at any rate but the treaty’s', '!context.rateIsTheTreatys'),
		...rule('treaty.settle', 'cannot', 'valve', 'Pay the difference while the paying mint’s safety valve is shut (it’s a cash-out); the treaty suspends instead', '!context.valveOpen'),
		...NO_AI('treaty.settle')
	}
};

/** Facts for treaty.settle, from q-core's settlementParts and the paying mint's valve. */
export function treatySettleFacts(p: SettlementParts, o: { payerValveShut?: boolean; paysMoney?: boolean } = {}) {
	return { ...p, valveOpen: !(o.paysMoney && o.payerValveShut) };
}

export const TREATY_END: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'treaty.end',
	version: '1.0.0',
	by: 'q:core',
	says: 'Either federation ends a treaty on 30 days’ notice, closing with a final settlement on the last day. Missed settlements and unsound books suspend it on their own.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "treaty.end" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    signedByOneSide: Bool,
    saysWhy: Bool,
  }
};`,
	rules: {
		...rule('treaty.end', 'may', 'end', 'Give notice, signed by one of the two federations', 'context.signedByOneSide'),
		...rule('treaty.end', 'must', 'say-why', 'Say why', '!context.saysWhy'),
		...rule('treaty.end', 'must', 'final-settlement', 'Close with a final settlement on the last day'),
		...rule('treaty.end', 'cannot', 'void-held', 'Void what either side already holds: holdings stay valid until settled')
	}
};

export const TREATY_ACTIONS = [TREATY_AGREE, TREATY_TRADE, TREATY_SETTLE, TREATY_END];
