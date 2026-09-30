// Q core: the money.spend action (ADR-Q-008 example, ADR-Q-009 form).
// One permit = the "may". Every must and cannot is a forbid.
// Cedar: anything not permitted is denied; any forbid beats any permit.

@id("money.spend/may/record")
permit (principal, action == Action::"money.spend", resource)
when {
  context.spendMandateHolders.containsAll(context.signers)
};

@id("money.spend/must/two-signers")
forbid (principal, action == Action::"money.spend", resource)
when { context.distinctSignerCount < 2 };

@id("money.spend/must/cite-decision-over-threshold")
forbid (principal, action == Action::"money.spend", resource)
when {
  context.amountPence > context.thresholdPence && !context.citesBudgetDecision
};

@id("money.spend/cannot/payee-signs")
forbid (principal, action == Action::"money.spend", resource)
when { context.signers.contains(context.payee) };

@id("money.spend/cannot/exceed-budget-line")
forbid (principal, action == Action::"money.spend", resource)
when { context.amountPence > context.budgetLineRemainingPence };

@id("money.spend/cannot/ai-approval")
forbid (principal, action == Action::"money.spend", resource)
when { context.approvedByAI };

@id("money.spend/cannot/backdate")
forbid (principal, action == Action::"money.spend", resource)
when { context.datedBeforePrevious };
