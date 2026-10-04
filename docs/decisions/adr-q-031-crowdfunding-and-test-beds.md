---
status: proposed
implementation: not started (4 October 2026)
updated: 2026-10-04
---

# ADR-Q-031 — Crowdfunding in credits, following, and the incubator as a test bed

**Status: proposed, 4 October 2026.** Anyone can ask for help in credits,
with a page telling their story. People give or back it, and follow how it
goes. An enterprise can start entirely inside Q, in credits, and only
"go live" with pounds, a bank account and declarations once it has proved
itself. Backers are rewarded in what the enterprise makes, never in shares
or money.

## Context

Darren, 4 October 2026:

> "All business, all energy needs help, needs resourcing to get it going …
> someone can say, I need help. And there is 300 credits they're asking for,
> and there's their page, like their GoFundMe … follow it through the story,
> and you've been part of helping that person with their story. So that
> becomes a person that you follow … that all becomes part of the index,
> searchable knowledge that we all gain from each other."

> "The whole point of incubator is it's a test bed … that's what an event is
> for … those things that worked, you noticed the crowd, you noticed the
> response, the evidence, the vibe, and you kept those things … and the
> things that didn't, you stopped doing … by just using the credits in the
> internal system of transfer … and then when it's ready, if it survives,
> then go live."

> "We don't have financial equity, but we can have credits … I want to try
> out an idea of creating a data farm … my service level agreement … it's
> going to cost me this much … if you give me this number of credits, I will
> give you one year of free data space, whatever the reward is."

What exists: agreements, shops and standing offers (ADR-Q-025, -026), mints
with grants and capital as reserves (ADR-Q-027), kept storage by the month
(ADR-Q-030), cards (ADR-Q-015), and the white paper's dividend reserve.

## Decision (proposed)

### 1. A campaign is a page and a standing offer

A **campaign** has a page: who's asking, their story, what it's for, the
target in credits, and by when (optional). Behind it is a standing offer
(ADR-Q-026) that anyone can take, in one of two kinds:

- **Gift**: "help me", with nothing promised back but updates. For someone
  in need, or a community cause.
- **Backing with a reward**: "give 50 credits, get a year of 10 GB kept
  storage when the farm is running". The reward is written into the terms,
  so backing is an agreement the enterprise must deliver on, exactly like a
  shop sale delivered later.

**The bar fills from signed receipts**, not from anyone's word. The page
shows who backed it (as they choose to be shown), how much, and how much is
left to raise.

### 2. Following the story

- The campaigner posts **updates**: what they did with it, what they
  learned, photos as evidence (ADR-Q-024's photo evidence).
- Anyone can **follow** a person, a campaign or an incubator project. Their
  updates appear on your home page, calmly, without ringing the bell.
- Updates are **indexed** (Directory Enquiries, ADR-Q-021), so what one
  enterprise learned is findable by the next.
- When a reward is delivered, the agreement says so (done, then settled), so
  every promise kept is on the record too: the campaigner's reputation.

### 3. The incubator as a test bed

An **enterprise** can start inside Q with only credits:

- storage, a website, a profile, a shop and a network, paid in credits;
- backing from a crowd, in credits;
- no bank account, and nothing cashed out.

If it works, it **goes live**: it sets up its business account, says who
does its accounts (the cash-out statement), and cashes out what it needs.
If it doesn't, it stops, with what it learned on the record. Like an
event: keep what the crowd responds to, stop what it doesn't.

### 4. Rewards, never shares or money

- A backer gets **what the enterprise makes**: a service, a product, access,
  a place at the event. Never a share of the enterprise, a percentage of its
  profits, or a promise of credits back with more on top.
- The white paper's dividend idea is kept in that spirit: an enterprise may
  offer **rewards in kind worth more than the backing** (a year of storage
  for 50 credits) because its cost of sale lets it. That's a good deal for
  the backer, not an investment return.
- Why the line: offering a share or a financial return to the public, as
  equity crowdfunding sites do, is regulated by the FCA. Credits that can be
  cashed out and passed on would very likely count as a financial return if
  they were promised back with interest. Rewards-based crowdfunding, as
  Kickstarter runs it, is the shape that stays clear. The solicitor
  confirms before any campaign goes beyond gifts.

### 5. Sponsorship

A sponsor (a business, a council, a trust) can back a young enterprise
through the mint: their grant goes into reserves and credits are minted
against it (ADR-Q-027), given to the enterprise as a gift campaign that's
already full. The sponsor follows the enterprise like any backer.

## Addendum, 4 October 2026: kinds of campaign, and pledges held

Darren: "It's either to support running costs going towards, or the project
can't happen until it's met its target … there has to be a starting figure
reached before it can start … if I say I'll support this and put 10 credits
in, that comes under the committed rule … if that person doesn't meet the
target by a set date … I get my credits released. But I can't spend those
credits on anything else because I've promised I would support them."

**Three kinds**, chosen when a campaign starts and written into its terms:

| Kind | When backers' credits move | If it falls short |
|---|---|---|
| **Running costs** (keep what comes in) | straight away, as each pledge is made | nothing to return: every credit helped |
| **All or nothing** (target by a date) | only when the target is met, all at once | every pledge released back to its backer |
| **Start when there's enough** (a minimum, then more) | when the minimum is met; after that, as pledged | if the minimum isn't met by the date, every pledge released |

**A pledge is a commitment, not a payment.** It's an agreement (ADR-Q-025):
the backer promises credits on the campaign's terms. Until the terms say the
credits move, they stay in the backer's balance but are **committed**, the
same rule that already stops anyone promising the same credits twice
(`creditsCommitted`): they can't be spent elsewhere. If the campaign falls
short by its date, the commitment ends and the credits are free again. No
one has to trust the campaigner with credits before the project can happen.

**Rules (Cedar)**: a pledge can't promise more than the backer has free;
credits move only when the kind's condition is met; a campaign can't change
its kind, target or date once someone has pledged (a change ends it, and
releases everyone, and it starts again).

## Build order

1. **Gift campaigns**: the page, the standing offer, the bar from receipts,
   updates; the three kinds, with pledges held as commitments.
2. **Following**: follow a person, campaign or project; updates on the home
   page; indexed.
3. **Backing with rewards**: rewards in the terms; delivery as done and
   settled; the reward agreement on both sides' records.
4. **Enterprises**: a test-bed profile that gathers an enterprise's shop,
   site, storage and campaigns in one place, and "going live" as a step.
5. **Sponsorship** through the mint.

## Non-claims

This does not:

- offer equity, shares, profit shares or financial returns, now or later;
- decide how a campaign's credits are taxed for the campaigner (the cash-out
  statement records; an accountant decides);
- check that a campaigner spends credits as they said. Updates, receipts and
  reputation make it visible; they don't make it certain;
- give financial or legal advice.

## Related

ADR-Q-015 (cards), ADR-Q-021 (Directory Enquiries), ADR-Q-023 (credits and
the exchange), ADR-Q-024 (the balance sheet, photo evidence), ADR-Q-025 and
-026 (agreements, shops), ADR-Q-027 (mints, grants), ADR-Q-030 (the network
market, kept storage), the white paper (December 2025: grants, the dividend
reserve).
