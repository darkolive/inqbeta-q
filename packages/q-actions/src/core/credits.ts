/*
 * Credits — Q core (ADR-Q-023, 2 October 2026). Four ways credits move, each a
 * signed receipt inspected here, at the moment it's made and whenever anyone
 * checks it afterwards:
 *
 *   credits.buy     pounds in, credits to the buyer (test mode first)
 *   credits.spend   credits out, for a service beyond the free allowance
 *   credits.reward  credits earned for capacity delivered to others
 *   credits.trade   credits between two people (the exchange)
 *
 * Credits are eligibility units for services: not money, not redeemable for
 * pounds (ADR-Q-017 §7, the white paper). Cedar can't count or look things up,
 * so the verifier gathers the facts from the chain first: balances, verified
 * capacity, the reserve. A treaty between federations is a derived action: it
 * can add cannots, never remove one (ADR-Q-009).
 */
import { ACTION_SCHEMA, type ActionDefinition } from '../actions';
import { CEDAR_VERSION } from '../version';

const ENTITIES = `entity Person;
entity Federation;
entity Wallet in [Federation];`;

const on = (id: string) => `principal, action == Action::"${id}", resource`;
const nothing = (id: string) => ({
	kind: 'cannot' as const,
	says: 'Move less than one credit',
	checked: 'enforced' as const,
	policy: `@id("${id}/cannot/nothing")
forbid (${on(id)})
when { context.credits < 1 };`
});
const backdate = (id: string) => ({
	kind: 'cannot' as const,
	says: 'Be dated earlier than the move it follows',
	checked: 'enforced' as const,
	policy: `@id("${id}/cannot/backdate")
forbid (${on(id)})
when { context.datedBeforePrevious };`
});

export const CREDITS_BUY: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'credits.buy',
	version: '1.0.0',
	by: 'q:core',
	says: 'Someone buys a pack of credits from their host.',
	engine: { cedar: CEDAR_VERSION },
	facts: `${ENTITIES}

action "credits.buy" appliesTo {
  principal: [Person],
  resource: [Wallet],
  context: {
    buyer: Person,
    signers: Set<Person>,
    credits: Long,
    packPublished: Bool,
    priceMatchesPack: Bool,
    live: Bool,
    paymentConfirmed: Bool,
    datedBeforePrevious: Bool,
  }
};`,
	rules: {
		'credits.buy/may/record': {
			kind: 'may',
			says: 'Record credits bought, signed by the buyer',
			checked: 'enforced',
			policy: `@id("credits.buy/may/record")
permit (${on('credits.buy')})
when { context.signers.contains(context.buyer) };`
		},
		'credits.buy/must/published-pack': {
			kind: 'must',
			says: 'Be one of the packs the host publishes',
			checked: 'enforced',
			policy: `@id("credits.buy/must/published-pack")
forbid (${on('credits.buy')})
when { !context.packPublished };`
		},
		'credits.buy/must/pack-price': {
			kind: 'must',
			says: 'Cost what the published pack costs, the same for everyone',
			checked: 'enforced',
			policy: `@id("credits.buy/must/pack-price")
forbid (${on('credits.buy')})
when { !context.priceMatchesPack };`
		},
		'credits.buy/cannot/live-without-payment': {
			kind: 'cannot',
			says: 'Give real credits before the payment is confirmed',
			checked: 'enforced',
			policy: `@id("credits.buy/cannot/live-without-payment")
forbid (${on('credits.buy')})
when { context.live && !context.paymentConfirmed };`
		},
		'credits.buy/must/provider-receipt': {
			kind: 'must',
			says: 'Cite the payment provider’s own receipt, once real payments start',
			checked: 'declared'
		},
		'credits.buy/cannot/nothing': nothing('credits.buy'),
		'credits.buy/cannot/backdate': backdate('credits.buy')
	}
};

export const CREDITS_SPEND: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'credits.spend',
	version: '1.0.0',
	by: 'q:core',
	says: 'Someone spends credits on a service beyond the free allowance.',
	engine: { cedar: CEDAR_VERSION },
	facts: `${ENTITIES}

action "credits.spend" appliesTo {
  principal: [Person],
  resource: [Wallet],
  context: {
    holder: Person,
    signers: Set<Person>,
    credits: Long,
    balanceBefore: Long,
    citesUsage: Bool,
    usageSignedByService: Bool,
    testCredits: Bool,
    liveService: Bool,
    datedBeforePrevious: Bool,
  }
};`,
	rules: {
		'credits.spend/may/record': {
			kind: 'may',
			says: 'Record credits spent, signed by their holder',
			checked: 'enforced',
			policy: `@id("credits.spend/may/record")
permit (${on('credits.spend')})
when { context.signers.contains(context.holder) };`
		},
		'credits.spend/cannot/overdraw': {
			kind: 'cannot',
			says: 'Spend more credits than are held',
			checked: 'enforced',
			policy: `@id("credits.spend/cannot/overdraw")
forbid (${on('credits.spend')})
when { context.credits > context.balanceBefore };`
		},
		'credits.spend/must/cite-usage': {
			kind: 'must',
			says: 'Cite the use it pays for, signed by the service that gave it',
			checked: 'enforced',
			policy: `@id("credits.spend/must/cite-usage")
forbid (${on('credits.spend')})
when { !context.citesUsage || !context.usageSignedByService };`
		},
		'credits.spend/cannot/test-on-live': {
			kind: 'cannot',
			says: 'Pay for a real service with test credits',
			checked: 'enforced',
			policy: `@id("credits.spend/cannot/test-on-live")
forbid (${on('credits.spend')})
when { context.testCredits && context.liveService };`
		},
		'credits.spend/cannot/nothing': nothing('credits.spend'),
		'credits.spend/cannot/backdate': backdate('credits.spend')
	}
};

export const CREDITS_REWARD: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'credits.reward',
	version: '1.0.0',
	by: 'q:core',
	says: 'A federation rewards someone with credits for capacity they delivered to others.',
	engine: { cedar: CEDAR_VERSION },
	facts: `${ENTITIES}

action "credits.reward" appliesTo {
  principal: [Person],
  resource: [Wallet],
  context: {
    recipient: Person,
    signers: Set<Person>,
    distinctSignerCount: Long,
    rewardMandateHolders: Set<Person>,
    credits: Long,
    verifiedUnits: Long,
    unitsRewarded: Long,
    reservePence: Long,
    reserveNeededPence: Long,
    approvedByAI: Bool,
    datedBeforePrevious: Bool,
  }
};`,
	rules: {
		'credits.reward/may/record': {
			kind: 'may',
			says: 'Record a reward, signed by holders of a live reward mandate',
			checked: 'enforced',
			policy: `@id("credits.reward/may/record")
permit (${on('credits.reward')})
when { context.rewardMandateHolders.containsAll(context.signers) };`
		},
		'credits.reward/must/two-signers': {
			kind: 'must',
			says: 'Be signed by two different people',
			checked: 'enforced',
			policy: `@id("credits.reward/must/two-signers")
forbid (${on('credits.reward')})
when { context.distinctSignerCount < 2 };`
		},
		'credits.reward/must/delivered-capacity': {
			kind: 'must',
			says: 'Pay only for capacity already delivered and verified, never for promises',
			checked: 'enforced',
			policy: `@id("credits.reward/must/delivered-capacity")
forbid (${on('credits.reward')})
when { context.unitsRewarded > context.verifiedUnits };`
		},
		'credits.reward/must/within-reserve': {
			kind: 'must',
			says: 'Stay within the reserve that covers what the credits can be spent on',
			checked: 'enforced',
			policy: `@id("credits.reward/must/within-reserve")
forbid (${on('credits.reward')})
when { context.reserveNeededPence > context.reservePence };`
		},
		'credits.reward/cannot/self-reward': {
			kind: 'cannot',
			says: 'Be signed by the person being rewarded',
			checked: 'enforced',
			policy: `@id("credits.reward/cannot/self-reward")
forbid (${on('credits.reward')})
when { context.signers.contains(context.recipient) };`
		},
		'credits.reward/cannot/ai-approval': {
			kind: 'cannot',
			says: 'Be approved by an AI',
			checked: 'enforced',
			policy: `@id("credits.reward/cannot/ai-approval")
forbid (${on('credits.reward')})
when { context.approvedByAI };`
		},
		'credits.reward/cannot/nothing': nothing('credits.reward'),
		'credits.reward/cannot/backdate': backdate('credits.reward')
	}
};

export const CREDITS_TRADE: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'credits.trade',
	version: '1.0.0',
	by: 'q:core',
	says: 'Two people exchange credits, for something given or done.',
	engine: { cedar: CEDAR_VERSION },
	facts: `${ENTITIES}

action "credits.trade" appliesTo {
  principal: [Person],
  resource: [Wallet],
  context: {
    giver: Person,
    taker: Person,
    signers: Set<Person>,
    credits: Long,
    giverBalanceBefore: Long,
    business: Bool,
    recordsPoundValue: Bool,
    testCredits: Bool,
    live: Bool,
    sameFederation: Bool,
    underTreaty: Bool,
    datedBeforePrevious: Bool,
  }
};`,
	rules: {
		'credits.trade/may/record': {
			kind: 'may',
			says: 'Record a trade, signed by both people',
			checked: 'enforced',
			policy: `@id("credits.trade/may/record")
permit (${on('credits.trade')})
when { context.signers.contains(context.giver) && context.signers.contains(context.taker) };`
		},
		'credits.trade/cannot/overdraw': {
			kind: 'cannot',
			says: 'Give more credits than the giver holds',
			checked: 'enforced',
			policy: `@id("credits.trade/cannot/overdraw")
forbid (${on('credits.trade')})
when { context.credits > context.giverBalanceBefore };`
		},
		'credits.trade/cannot/self-trade': {
			kind: 'cannot',
			says: 'Be a trade with yourself',
			checked: 'enforced',
			policy: `@id("credits.trade/cannot/self-trade")
forbid (${on('credits.trade')})
when { context.giver == context.taker };`
		},
		'credits.trade/must/value-business-trades': {
			kind: 'must',
			says: 'Record a value in pounds when either side trades as a business',
			checked: 'enforced',
			policy: `@id("credits.trade/must/value-business-trades")
forbid (${on('credits.trade')})
when { context.business && !context.recordsPoundValue };`
		},
		'credits.trade/must/treaty-across-federations': {
			kind: 'must',
			says: 'Be covered by a treaty when the two people are in different federations',
			checked: 'enforced',
			policy: `@id("credits.trade/must/treaty-across-federations")
forbid (${on('credits.trade')})
when { !context.sameFederation && !context.underTreaty };`
		},
		'credits.trade/cannot/test-in-live': {
			kind: 'cannot',
			says: 'Mix test credits into a real trade',
			checked: 'enforced',
			policy: `@id("credits.trade/cannot/test-in-live")
forbid (${on('credits.trade')})
when { context.testCredits && context.live };`
		},
		'credits.trade/must/personal-is-neighbourly': {
			kind: 'must',
			says: 'Be non-commercial when both sides trade as people, not businesses',
			checked: 'declared'
		},
		'credits.trade/cannot/nothing': nothing('credits.trade'),
		'credits.trade/cannot/backdate': backdate('credits.trade')
	}
};

export const CREDIT_ACTIONS = [CREDITS_BUY, CREDITS_SPEND, CREDITS_REWARD, CREDITS_TRADE];
