---
status: proposed (Darren, 5 October 2026)
implementation: E1–E4 built 6 October 2026 (q-core treaties.ts; q-actions core/treaties.ts); the page and the burns not yet
updated: 2026-10-05 (currency; partner health as drift; capacity gifts)
---

# ADR-Q-042 — Treaties and settlement: swap first, pay the difference

**Status: proposed, 5 October 2026.** A treaty between two federations says
why they're joining (shared ethics, or connections offered or sought), what
one's credit is worth in the other's, how much of each other's credit either
will hold, and how often they settle. When they settle, they **swap first**:
each hands back the other's own credits, which are cancelled. Only the
**difference** is paid, by bank transfer to the other's banking card. So
reserves move by the net, never by the gross.

## Why

Darren, 5 October 2026:

> "As well as your business registered and having a business card, you then
> also have your banking card, which is how you pay for things, cash in, cash
> out. And that stays in your business. But when you're setting up a treaty,
> if you're accepting each other's credits, then you need to share each
> other's banking card so that you can do bank transfers and cash out … I'll
> accept your credits if at any given time I end up receiving them. I want to
> cash them in. Or swap. Because we don't necessarily want to see our reserves
> dropped. So those have got to be the two settlement options … first they
> should offer each other in settlement. An outstanding balance should be bank
> transfer. And the treaty should state how long the settlement period is …
> daily, three days, seven days, 30 days … And then … why you would have a
> treaty is because you demonstrate shared ethics or specific connections
> offered or seeking."

On rates:

> "We're working in credits, but the credits could be worth different. So one
> should not assume … If people can place the value of a credit to another
> currency, then that is the way a federation can price itself out of exchange
> rate manipulation, because it can factor that in and that's declared."

It's what the old country banks did with each other's notes, and it follows on
from the drovers' banks of ADR-Q-035. A house holding a rival's notes didn't
present every one for gold. The two exchanged what they held of each other's
paper at the clearing and paid gold only on the balance.

Already decided: credits from different mints are different credits, and what
one is worth to another is for treaties (ADR-Q-027 §1). Treaties are derived
actions that can only add cannots (ADR-Q-023 §4). A treaty is an agreement
signed by both federations' keys (ADR-Q-025 §5). Across federations, nothing
trades outside a treaty (ADR-Q-023 §3).

## Decided (proposed)

### 1. Why the treaty exists, said first

A treaty opens with its **purpose**, in plain words, because that's what
people will actually read:

- **Shared ethics**: the principles both sides hold (for example, both are
  CICs with an asset lock, or both pay a living wage).
- **Connections offered or sought**: what each brings and what each is
  looking for (rooms, storage, training, a switchboard). These can point at
  listings in the directory (ADR-Q-021) and the network market (ADR-Q-030).

A treaty with no stated purpose isn't refused, but it shows as "no purpose
given".

### 2. Two cards: the business card and the banking card

Every federation has a **business card** (who it is: ADR-Q-015) and a
**banking card** (how it's paid: where the pounds go when someone settles
with it). The banking card belongs to the federation and stays with it, like
the cashing-out account in ADR-Q-035 §8:

- It's a receipt the federation signs, with only the last four digits shown and
  the full details kept as a fingerprint. Changing it is a new receipt naming
  the one it replaces.
- **A treaty exchanges banking cards.** Each partner can see the other's full
  details, sealed to the partner's key, and nobody else can.
- A settlement pays only to the banking card named in the treaty. A changed
  card reaches the partner as a signed change, never as a message saying "pay
  this account instead".

### 3. One credit is one unit of the mint's currency

Darren, 5 October 2026:

> "Every federation at time of formation decides its currency, its default
> currency. And all cash out is in that currency. Match for match, one credit
> equals one whole sovereign unit. So one credit equals one pound, one euro,
> or one dollar … that's the base rate that it is measured against … the base
> rate difference of a French credit to a British credit is going to be by
> what is agreed on the day."

This came out of a worked example. Three bakers each sell a £1 loaf, with
base rates of £1, 50p and £5 a credit. If every loaf is priced at "1 credit"
and coins swap one for one, the 50p federation sells bread at half its cost
without saying so and can't cover it. The £5 federation charges £5 for a £1
loaf. A partner who accepts the 50p coin at par recovers only 50p a coin at
settlement, because that's all its mint holds. "A coin for a coin" is fair
only when the coins are the same size, so Q makes them the same size.

**The rule.**

- **A mint names its currency when it's made** (ISO 4217: GBP, EUR, USD …).
  It's signed into the mint's publication (ADR-Q-027 §7) and can't change.
  A federation that wants another currency starts another mint.
- **One credit is one whole unit of that currency.** A pound-mint's credit is
  £1, a euro-mint's is €1. Nobody sets the base rate; it's the currency.
- **Buying and cashing out are in that currency**, one unit per credit.
- **Prices show the currency beside the credits** ("2 credits · £2.00").

**Consequences.**

- **Two mints in the same currency are at par, always.** One pound-credit is
  one pound-credit. A treaty between them needs no rate.
- **Two mints in different currencies trade at the exchange rate between the
  currencies.** It's never set by either federation and never by a market
  in credits. It's read from a published source the treaty names (for
  example the Bank of England's or the European Central Bank's daily
  reference rate).
- **Inflation shows in prices, not in the coin.** The white paper's annual
  inflation adjustment to the base rate (December 2025) is replaced: a loaf
  that costs more is priced at more credits, in the open.
- **This changes ADR-Q-027 §7, step 1.** Publishing no longer sets "what one
  credit costs and pays out"; it names the currency. In code,
  `pencePerCredit` becomes `currency`, with one credit worth one unit of it
  (100 minor units for pounds, euros and dollars; currencies differ, so the
  minor units come from ISO 4217).

### 3a. The rate across currencies, on the day

Where two mints' currencies differ, the treaty names its **rate source**, and
the rate is used at two moments, each written into its receipt:

1. **At the trade.** A member of a euro-federation buys a £1 loaf from a
   pound-federation with euro-credits. The receipt records the rate on the
   day and the credits it came to (e.g. 1.15 euro-credits at 0.87 £/€). The
   member sees both before they sign.
2. **At settlement.** The swap and the net payment (§6) are worked out at the
   rate on settlement day, from the same source.

Between the two, the rate can move, so the federation holding the other's
credits can gain or lose a little. That's the **cost of waiting**, and it's
shown openly on both sides' books as an exchange gain or loss, never hidden in
a price. A shorter settlement period (§5) keeps it small. A federation that
wants none of it makes treaties only in its own currency.

### 4. How much of each other's credit either side will hold

A treaty sets an **exposure cap**: the most of the partner's credits either
federation will hold between settlements. "Incubator and DoStudy hold up to
500 of each other's credits" is one forbid (ADR-Q-023 §4).

Optionally, the cap can be a **share of the holder's own reserve** (e.g. "no
more than 10% of our reserve in DoStudy credits"). This is the same idea as the
white paper's reserve ratio, applied to what you hold of someone else's.

### 5. The settlement period

The treaty names one: **daily, 3 days, 7 days or 30 days**. Everything
outstanding between the two is settled within it. Each settlement is a
receipt both sign, double entry (ADR-Q-025 §4), and it closes the period.

### 6. Settlement order: swap first, then pay the difference

At the end of each period, each federation adds up what it holds of the
other's credits, at the treaty rate:

1. **Swap.** Each hands back as many of the other's credits as will match.
   A credit back with the mint that issued it is **cancelled** (burned, with
   the swap as the value that went out, in place of a payout). No pounds
   move. Each mint's circulation falls, its reserve doesn't, and its ratio
   rises.
2. **Pay the difference.** Whoever still owes pays the net **in pounds to the
   other's banking card**. Its mint burns the matching credits against that
   payout, exactly as a cash-out (ADR-Q-027 §3).

Worked example, two pound-mints, so at par:

| | Incubator holds | DoStudy holds |
|---|---|---|
| Before | 100 DoStudy credits | 70 Incubator credits |
| Swap 70 each way | 30 DoStudy credits | 0 |
| DoStudy pays £30 to Incubator's banking card; DoStudy's mint burns 30 | 0 | 0 |

DoStudy's reserve drops by £30, not £100. Incubator's drops by nothing.

### 7. Settlement and the safety valve

A net payment is a cash-out, so it meets the debtor mint's safety valve (drift under 20%,
ADR-Q-027 addendum of 5 October). If the valve is shut, the payment can't be made. The
treaty doesn't override the valve. Instead:

### 8. A missed settlement suspends the treaty

If a period closes unsettled, the treaty **suspends itself**: no new trades
across it until the balance is settled. Holdings already in place stay valid
and still count. Both sides' pages show it plainly ("settlement overdue since
…"), and it counts against the debtor's **honoured** level of trust
(ADR-Q-027, levels of trust).

### 9. The partner's health is its drift

Darren, 5 October 2026: with no advances, "there is no reason that credits
are not underwritten, matched by pounds in a bank account, other than the
bank account doesn't reconcile … 10%, 20% starts feeling everything is way
out."

Each mint publishes its **drift** (ADR-Q-027, addendum of 5 October):

```
drift = 1 − (cash reserve + assets at book value) ÷ credits in circulation
```

- **Over 10%**: the partner is warned, on both sides' treaty pages.
- **Over 20%**, or **books not reconciled for over 30 days**: the treaty
  **suspends itself** (as §8) until the partner is back inside the line.

A treaty needs no other test of a partner's soundness: drift is what every
other worry eventually shows up as.

### 10. Capacity gifts never cross a treaty

Stimulus from idle capacity (`docs/q/economy-controls.md`) is **not a credit**:
it has no pound behind it, so minting it as a coin would break §9. It's a
**capacity gift**, its own kind of receipt, naming its recipient, the capacity
it's for (this federation's storage, Tuesday's room), the amount and the
booking window. It's used up by the service's own usage receipt, never appears
in a coin balance, the battery or drift, can't be handed on, and expires with
its window. Because it isn't a coin and names one federation's capacity, it
**can never cross a treaty**.

Stimulus paid for in pounds by a funder is different: that's grant credits held
by rule (ADR-Q-036), real coins, which can reach qualifying providers through a
treaty.

| | Bought credits | Committed by agreement | Held by rule (grant) | Capacity gift |
|---|---|---|---|---|
| Pound behind it | yes | yes | yes, the funder's | no: idle capacity |
| A coin | yes | yes | yes | no |
| Cashable | yes | once released | by the provider once paid | never |
| Transferable | yes | no | no | no |
| Crosses a treaty | yes | yes | to qualifying providers | never |
| Expires | never | when the agreement ends | when the holder stops qualifying | with its window |

### 11. Proposed defaults, to confirm

- **What it covers**: every service, unless the treaty lists exclusions.
- **Its term**: open-ended or fixed; either side may end it with notice (30
  days), and ending closes with a final settlement on the last day.
- **Test and live never mix**: a test mint treats only with test mints, live
  with live.
- **Who signs**: each federation's key with its mandate holders, plus a members'
  vote where that federation's own rules ask for one (ADR-Q-007).
- **States**: proposed → signed by one → in force (both signatures) →
  suspended ⇄ in force → ended. From the inQbeta wiki's Dual-Signature Treaty
  Model: it counts only with both signatures.

## The rules (Cedar): `treaty.propose`, `.agree`, `.vary`, `.settle`, `.suspend`, `.end`

Cannots, in plain words:

- Agree a treaty without both federations' keys and their mandate holders.
- Trade across federations with no treaty, or under a suspended one.
- Keep a treaty in force while either partner's drift is over 20%, or its books are unreconciled for over 30 days.
- Send a capacity gift across a treaty, or treat one as a coin.
- Treat between a test mint and a live one.
- Hold more of a partner's credits than the exposure cap.
- Mint a credit worth anything but one unit of the mint's currency, or change a mint's currency.
- Trade across currencies at any rate but the treaty's named source on the day, or trade at anything but par within one currency.
- Pay a settlement to anything but the banking card named in the treaty.
- Pay pounds for credits that could have been swapped.
- Settle with entries that don't balance.
- Any of it approved by an AI.

## Build order

1. **The banking card** as a federation receipt, sealed to a treaty partner.
2. **Treaty receipts** in q-core: purpose, both banking cards, rate, cap,
   period. Tests: a treaty that settles by swap only, one with a net payment,
   one that misses a period and suspends.
3. **The settlement**: swap burns on both mints, the net payout as a
   cash-out, one receipt both sign.
4. **The rules** in q-actions, with tests that a trade the core allows can be
   refused by a treaty, and never the other way round.
5. **Treaties on the federation's page**: who with, why, the rate, the cap,
   when the next settlement is due.
6. **The first treaty**: Incubator and Dark Olive CIC (ADR-Q-017), in test
   mode.

## The member's side

Darren: "If there's a treaty between two federations and therefore I can
spend my coin from Federation A at Federation B, then I've obtained the
services I wanted and Federation B now holds Federation A's coin. So that is
between them two to settle according to their treaty. I don't have to get
involved." A member spends their own coin wherever a treaty reaches; the two
treasuries settle. A credit is simply a way of buying a service.

## Open questions

- **Which rate sources are allowed**, and what happens on a day the source
  publishes nothing (weekends, holidays): most likely the last published rate.
- **More than two.** With three or more federations in treaty, netting across
  all of them (a clearing house) would move even less money. That's for later.

## Non-claims

Not legal, financial or tax advice. Clearing credits between organisations
and paying the balance in pounds may fall under payment-services or e-money
rules. Each federation that publishes its mint takes that responsibility
(ADR-Q-027 §7). Q records the transfer and the settlement; it never moves the
pounds.

## Related

ADR-Q-015 (cards), ADR-Q-017 §8 (treaties), ADR-Q-021 (directory), ADR-Q-023
(credits; treaties as derived actions), ADR-Q-025 (agreements; treaties as a
kind), ADR-Q-027 (minting, cash-out, the safety valve, levels of trust),
ADR-Q-030 (the network market), ADR-Q-035 (the federation's bank; the
cashing-out account); `origins/white-paper-2025-12.md` (Base Rate and
Inflation Policy, Currency Neutrality, §8 reserve ratio).

## As built (6 October 2026, night): E1–E4

The records and the rules, in q-core and q-actions, tested. Nothing on a page
yet (E5).

- **The banking card** (`q-core/treaties.ts`, E1): `makeBankingCard` signed by
  the federation's key, with the currency it's paid in, the last four digits,
  and a SHA-256 fingerprint of the full details. A changed card is a new
  receipt naming the one it replaces (`currentBankingCard` follows the
  chain). `sealDetailsFor` seals the full details to the partner and the
  federation only; `detailsMatch` refuses opened details that don't match the
  card's fingerprint, so "pay this account instead" can't arrive as a message.
- **The treaty** (E2): the purpose (ethics, offered, sought), both sides
  (federation, mint, currency, test or live, banking card), the rate (par in
  one currency; across two, a named source: Bank of England or ECB), the cap
  (credits, and optionally a share of the holder's reserve), the period (1, 3,
  7 or 30 days), exclusions, and a fixed end or none. `proposeTreaty`: side
  A's key and its mandate holder sign; `agreeTreaty`: side B's key and its
  holder sign exactly the same terms. `treatyParts` checks all four
  signatures; any change breaks them. Refused at the source: test with live,
  a rate other than par in one currency, no named source across two, a period
  other than 1/3/7/30.
- **Settlement** (E3): `settleSums` swaps first at the day's rate, then names
  the net: who pays, how much in their own currency, and to which banking
  card. The ADR's example holds exactly (Incubator 100, DoStudy 70: swap 70
  each way, DoStudy pays £30 to Incubator's card); across currencies, €1 =
  £0.87 swaps £50 for €57.47 and DoStudy redeems the remaining €42.53.
  `proposeSettlement` and `agreeSettlement`: one record both federations
  sign. `settlementParts` checks it balances, swapped first, pays the named
  card, at the treaty's rate.
- **Standing**: `treatyStanding` reads proposed, in force, suspended (a period
  closed unsettled; a partner's drift over 20% or books unreconciled for over
  30 days, warning over 10%), ending (after notice, `giveNotice`, 30 days) and
  ended. `withinCap` checks the cap, and the share of reserve when given.
- **The rules** (`q-actions/core/treaties.ts`, E4), in `CORE_ACTIONS`:
  `treaty.agree` (both keys, each holder in role with the money mandate,
  checked by `actingCovers`), `treaty.trade` (no treaty, suspended, over the
  cap, a capacity gift, an excluded service, another rate, or test with live:
  each refused by its own rule), `treaty.settle` (unbalanced, paying what could
  be swapped, another card, another rate, the payer's valve shut), and
  `treaty.end` (notice with a reason; holdings stay valid). "Approved by an
  AI" is declared on agree and settle.

Tests: q-core 613 pass; q-actions 65 pass.

**Not yet:** the burns themselves on each mint when a settlement is signed
(the swap as a burn with the swap as its value, the net as a cash-out); the
rate fetched from the named source; trade receipts that record the rate on
the day; treaties on the federation's page and the first treaty, Incubator
and Dark Olive CIC, in test (E5).

## Addendum, 7 October 2026: E5, treaties on the federation's page

In role, on the Bank tab, below the federation's own account
(`FederationTreaties.svelte`, `/api/treaties`).

- **Proposing.** A money office holder chooses a federation from Incubator's
  registry. Its side (bank, currency, test or live, banking card) is read from
  its registration and its own bank, never typed in. The caretaker signs with
  the federation's key and in role; this bank files it (`inqbeta.mint-federation/1`,
  kind `treaty`) with the holder's office proof, and gives a link to send.
- **Agreeing.** The link opens the partner's federation page. Out of role it
  says a proposal is waiting; in role it shows the terms in plain words. The
  partner signs twice. Its bank reads what the proposer filed, checks both
  holders by `treaty.agree` (side A's holder as at the proposal, side B's
  now), files it, and sends it to the proposer's bank, which checks the same
  and files it. Each bank holds the whole treaty.
- **Standing.** `federationTreaties` (q-core `federation-money.ts`) reads each
  treaty from the books: proposed, in force, suspended (a partner's books
  short or unreconciled), ending, ended. A partner's health is read from its
  published bank.
- **Notice.** Either side signs notice with the federation's key; both banks
  file it (kind `treaty-notice`), and it ends 30 days on.
- **Accepted providers.** `inTreatyWith` gives the federations in treaty now,
  in force or ending: the providers a voucher's realm accepts by treaty
  (ADR-Q-044 §5).

Not yet: trades and settlements under a treaty (no money moves here); a
partner's revoked mandates aren't read when its holder is checked; a varied
treaty. Checklist `federations-one-treaties`.

The first treaty, Incubator and Dark Olive CIC in test, needs Dark Olive CIC
to be a federation on its own host, registered with Incubator, with its
banking card signed.
