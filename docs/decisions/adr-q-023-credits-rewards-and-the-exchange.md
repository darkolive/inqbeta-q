---
status: proposed
implementation: started — the four credit actions in Cedar (q-actions core/credits.ts), credit receipts and balances (q-core credits.ts), the Credits page with a test-mode pack, 2 October 2026
updated: 2026-10-02
---

# ADR-Q-023 — Credits, rewards and the exchange, inspected by Cedar

**Status: proposed, 2 October 2026.** How value moves in Q: bought, spent,
earned and traded, every move a receipt and every receipt inspected by the
same rule engine, so the market that grows from it is robust by
construction.

## Context

Darren, 2 October, after the storage allowance and usage went in:

> "Introduce financial reward models now … this is all very much then leading
> towards a market exchange. And that's where treaties and everything can be
> at the point of inspection, which Cedar sounds perfect for: an absolutely
> robust exchange using Cedar."

Already decided: credits are bought in pounds, spent inside Q, never cashed
out (ADR-Q-017 §7); the free allowance is for passing things between people,
heavier use costs credits, and Incubator pays its way from use, not investors
(ADR-Q-017, 2 October addendum); credits in test mode first (ADR-Q-020 §3).
The white paper (December 2025) frames credits as **eligibility units**: a
right to use a service within capacity, backed by a reserve, paid out for
delivered capacity and never for promises. Cedar already decides money.spend
and federation membership (ADR-Q-008, ADR-Q-009).

## Decision (proposed)

### 1. Four moves, and nothing else

| Move | What happens | Who signs |
|---|---|---|
| **Buy** | Pounds in, credits to the buyer, in published packs | The buyer (and, once live, the host and the payment provider's receipt) |
| **Spend** | Credits out, for a service beyond the free allowance | The holder, citing the usage receipt the service signed |
| **Reward** | Credits earned for capacity delivered to others: storage held, calls relayed, a node kept running | Two holders of the federation's reward mandate |
| **Trade** | Credits from one person to another, for something given or done | Both people |

Each is a core action (`credits.buy`, `credits.spend`, `credits.reward`,
`credits.trade`; `packages/q-actions/src/core/credits.ts`).

### 2. Every move is a receipt; a balance is added up

- A move is signed and kept in the vault of everyone it touches, like a
  message. It names the holder's previous move, so a wallet is a chain.
- **A balance is never a number a server holds.** Q adds it up from the moves
  in your vault (`q-core/credits.ts`), counting each once and only if it holds.
- **Test and real never mix.** Every move says which it is; balances, spends
  and trades are always one or the other.

### 3. Inspected at the point it's made, and whenever it's checked

The rule engine decides each move **before it's kept**, and the decision
(the action's hash and the rules that decided) is written into the receipt.
Anyone checking later runs the same rules on the same facts and must get the
same answer. The rules, in plain words:

- **Buy:** only published packs, at the published price, the same for
  everyone; **no real credits before the payment is confirmed**.
- **Spend:** never more than you hold; always citing the use, signed by the
  service that gave it; test credits never pay for a real service.
- **Reward:** **only for capacity already delivered and verified**; within the
  reserve; two signers; never to yourself; never approved by an AI.
- **Trade:** both sign; nobody gives more than they hold; never with
  yourself; a business trade records its value in pounds; **across
  federations only under a treaty**.
- All: nothing below one credit; nothing backdated.

### 4. Treaties are derived actions

A treaty between two federations (ADR-Q-017 §8) carries its own credit rules
as **derived actions** (ADR-Q-009): it can add cannots, never remove the core
ones. "Incubator and DoStudy trade up to 500 credits at a time" is one forbid;
the engine applies it to every trade the treaty covers, at the moment of the
trade. The test suite proves a trade the core allows can be refused by the
treaty, and never the other way round.

### 5. Personal and business

Every trade says which it is (white paper §12):

- **Personal:** neighbourly, between people. Declared, not yet checked:
  non-commercial.
- **Business:** credits are consideration for something; the trade **must
  record its value in pounds** at the time, for the business's accounts.

### 6. Rewards are paid from delivered capacity

- What earns a reward is a **usage receipt signed by the service** that
  delivered it: storage held for others, minutes relayed, a node's uptime as
  measured by the federation's checks.
- A federation sets its rate and its reserve; Cedar checks that the units
  rewarded never exceed the units verified, and that the reserve covers what
  the new credits could be spent on.
- So the people who run the commons, a home node, a club's switchboard, are
  paid by it, and the commons stays sustainable without investors.

### 7. Towards an exchange

The market is what these four moves add up to:

- **Offers** are listings (ADR-Q-021): what, for how many credits, personal
  or business, where.
- **Taking an offer** is a trade both sign, inspected against the core rules
  and every treaty in play.
- No order book, no speculation: credits buy services and things people
  offer; they are never cashed out.

## Build order

1. **The four actions** in Cedar, with tests (including a treaty). *(Done.)*
2. **Credit receipts and balances** from the vault. *(Done.)*
3. **Buy a pack in test mode**, checked before it's kept; the Credits page.
   *(Done.)*
4. **Spend**, first on lifting the daily storage allowance, citing the gate's
   signed usage.
5. **Usage receipts signed by services** (the gate signs what it held).
6. **Rewards** for node operators from those receipts; the reserve.
7. **Trades** between people; then offers as listings.
8. **Real payments** behind the same receipts.

## Non-claims

This does **not** set prices, packs beyond the first, reward rates or reserve
ratios; choose a payment provider; or give legal, tax or financial advice.
Whether credits sit outside e-money and payment-services rules, and how
business trades are accounted for, needs an accountant's and a solicitor's
view before real money moves (ADR-Q-017 non-claims).

## Related

ADR-Q-008 (must and cannot), ADR-Q-009 (actions and the engine), ADR-Q-017
(the commons, credits, treaties), ADR-Q-020 (credits in test mode),
ADR-Q-021 (listings), `origins/white-paper-2025-12.md`,
`q/providers-and-the-commons-market.md`.
