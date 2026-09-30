// A camping club's own money.spend, derived from Q core.
// A federation adds FORBIDS ONLY — never a permit. Adding a forbid can only
// ever refuse more, so "only tightens" (ADR-Q-008 rule 3) is true by
// construction, before any analysis tool is run.

@id("camping-club/money.spend/cannot/over-200-without-vote")
forbid (principal, action == Action::"money.spend", resource)
when { context.amountPence > 20000 && !context.citesMembersVote };
