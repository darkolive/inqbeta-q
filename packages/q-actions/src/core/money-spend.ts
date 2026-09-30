/*
 * money.spend — Q core. The ADR-Q-008 example; first proven in
 * spikes/cedar-actions (11/11, ~0.25 ms per decision).
 *
 * Cedar cannot count or look anything up, so the verifier gathers these facts
 * from the chain first: distinct signers (worlds of one person count once),
 * live spend mandates at the receipt's time, what is left on the budget line.
 */
import { ACTION_SCHEMA, type ActionDefinition } from '../actions';
import { CEDAR_VERSION } from '../version';

const ON = 'principal, action == Action::"money.spend", resource';

export const MONEY_SPEND: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'money.spend',
	version: '1.0.0',
	by: 'q:core',
	says: 'Money leaves a federation to pay someone.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;
entity Ledger in [Federation];

action "money.spend" appliesTo {
  principal: [Person],
  resource: [Ledger],
  context: {
    signers: Set<Person>,
    distinctSignerCount: Long,
    spendMandateHolders: Set<Person>,
    payee: Person,
    amountPence: Long,
    budgetLineRemainingPence: Long,
    thresholdPence: Long,
    citesBudgetDecision: Bool,
    citesMembersVote: Bool,
    approvedByAI: Bool,
    datedBeforePrevious: Bool,
  }
};`,
	rules: {
		'money.spend/may/record': {
			kind: 'may',
			says: 'Record money leaving the federation, signed by holders of a live spend mandate',
			checked: 'enforced',
			policy: `@id("money.spend/may/record")
permit (${ON})
when { context.spendMandateHolders.containsAll(context.signers) };`
		},
		'money.spend/must/two-signers': {
			kind: 'must',
			says: 'Be signed by two different people',
			checked: 'enforced',
			policy: `@id("money.spend/must/two-signers")
forbid (${ON})
when { context.distinctSignerCount < 2 };`
		},
		'money.spend/must/cite-decision-over-threshold': {
			kind: 'must',
			says: "Cite the budget decision when above the federation's threshold",
			checked: 'enforced',
			policy: `@id("money.spend/must/cite-decision-over-threshold")
forbid (${ON})
when { context.amountPence > context.thresholdPence && !context.citesBudgetDecision };`
		},
		'money.spend/must/publish-accounts': {
			kind: 'must',
			says: 'Appear in accounts published to members within 30 days of the year end',
			checked: 'declared'
		},
		'money.spend/cannot/payee-signs': {
			kind: 'cannot',
			says: 'Be signed by the person being paid',
			checked: 'enforced',
			policy: `@id("money.spend/cannot/payee-signs")
forbid (${ON})
when { context.signers.contains(context.payee) };`
		},
		'money.spend/cannot/exceed-budget-line': {
			kind: 'cannot',
			says: 'Spend more than is left on the budget line',
			checked: 'enforced',
			policy: `@id("money.spend/cannot/exceed-budget-line")
forbid (${ON})
when { context.amountPence > context.budgetLineRemainingPence };`
		},
		'money.spend/cannot/ai-approval': {
			kind: 'cannot',
			says: 'Be approved by an AI',
			checked: 'enforced',
			policy: `@id("money.spend/cannot/ai-approval")
forbid (${ON})
when { context.approvedByAI };`
		},
		'money.spend/cannot/backdate': {
			kind: 'cannot',
			says: 'Be dated earlier than the receipt it follows',
			checked: 'enforced',
			policy: `@id("money.spend/cannot/backdate")
forbid (${ON})
when { context.datedBeforePrevious };`
		}
	}
};
