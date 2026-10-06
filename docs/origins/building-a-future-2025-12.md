---
implementation: none
decision: none
updated: 2026-10-05
source: Google Doc "Building a future" (Darren Knipe, December 2025), read 5 October 2026
---

# Building a future: the long white paper and the community model

Darren's working Google Doc from December 2025. It holds three things:

1. **The white paper**, tab by tab. This is the text of
   `2025-12-community-credit-exchange-white-paper.pdf` (project copy:
   `origins/white-paper-2025-12.md`), so it isn't repeated here.
2. **"Credit System Model"**: a longer, academic rewrite of the white paper in
   19 numbered sections. Most of what's new is here.
3. **"The Business Model"**: the inQbeta community model: membership, local
   and parent CICs, rules, share capital and the redemption market, plus a
   plain-language "Credit System" explainer.

Like everything in `origins/`, this is **history, not the current design**.
Where it disagrees with the ADRs, the ADRs win. Read it for *why*.

A note on reading it: the long version's 57 formulas are pasted in as
images, which can't be read as text. Where the same formula appears in the
white-paper tabs as LaTeX, it's quoted from there.

## 1. What the long version adds

### Why: wealth is capacity times velocity (§2)

Community currencies, LETS and time banks have failed in the same ways:
supply and demand for services that don't match, no predictable value,
speculative accumulation, no reserve, and running out of steam in quiet
periods. The answer offered: count wealth as **circulating credit supply ×
velocity**, where supply is **deliverable capacity**, not money. So a
community can't issue more credits than it can actually fulfil, which is the
LETS contradiction solved. "Hoarding behaviours reduce velocity, causing
measurable economic contraction."

### Definitions worth keeping (§3)

- **Booking window**: credits must be redeemable within it; seven days by
  default.
- **Slack**: a share of unbooked capacity kept free for last-minute
  bookings, as an anti-hoarding safeguard.
- **Reserve ratio**: under full Cost-of-Service backing, **1.0** (but see §3
  below: the PDF says 20%).
- **Price vs capacity separation** (§6.4): "Pricing has no effect on
  minting." Inflation changes prices, never issuance limits.

### Member wallets and identity (§12)

- A wallet holds credits and history, never pounds or bank details.
- **Identity separation**: wallet ID, member identity, login and personal
  data are all different identifiers, so nothing on the ledger exposes a
  person and the right to erasure works without breaking the accounts.
- Future-ready: wallet IDs becoming **DIDs**, and zero-knowledge proofs.
  This is what Q now does (ADR-Q-035 §4: "fully accountable, fully
  anonymous").
- Wallet controls include **hoarding warnings** and **reserve coverage
  indicators**: the ancestor of the battery.

### Agents and policy triggers (§14)

- Agents: Minting, Reserve, Settlement, Capacity, Governance.
- Trigger types: **state** (reserve below buffer), **event** (a booking fails
  for lack of slack), **time** (end-of-day settlement, month-end audit),
  **escalation** (several failing at once).
- **§14.3 Stimulus injection policy.** "To improve utilisation during
  low-demand conditions": the grant multiplier, member reward credits, a
  temporary issuance-ratio adjustment. "Never bypass reserve requirements."
- **Overrides** need a director quorum, a recorded resolution and a ledger
  justification, and **expire after seven days** unless renewed.

### The annual governance cycle (§15)

Reviewed once a year, each from 12 months of figures: base rate, inflation
multiplier, target utilisation U\*, the scaling constant α, slack, the
reserve buffer, the grant multiplier β, the 40% dividend cap, and redemption
funding. Required reports: utilisation, capacity distribution, reserve
adequacy, redemption pressure, dividend eligibility.

Adjustments are rules, not opinions:

| Setting | Goes up when | Goes down when |
|---|---|---|
| Target utilisation U\* | 12-month utilisation > 0.85 and reserves > 150% of minimum | utilisation < 0.50 for two quarters |
| Slack | last-minute booking failures > 8% | failures < 2% |
| Grant multiplier β | reserve volatility < 10% and no reserve breach all year | — |
| Inflation multiplier | defaults to official CPI; a local CIC may argue for more only from travel, energy or venue costs | |

Changes take effect from the **first day of the next quarter**. Emergency
overrides (imminent reserve breach, multi-day settlement failure, ledger
mismatch, replication failure) need two directors' signatures, expire in
seven days unless ratified, and **may never change prices**.

### Tax and the regulatory position (§16)

Credits as prepaid service rights (like gym passes or coworking hours); only
three tax events (buying credits is trading income, redeeming is
consumption, a business expense claim exports to the accounts); personal
mode as a member's protection; no appreciation, no secondary market, face
value only, no arbitrage; prohibited: credit-to-cash peer transfer, sale
above face value, speculation, derivatives, tokenised share markets.

**Check before reuse** (§5 below): this whole position was written for
credits that are *never cashed out*.

### Stress testing (§17)

| Scenario | Condition | What must hold |
|---|---|---|
| Bull | utilisation > 0.85 sustained, issuance ratio at 1.0 | no over-minting; reserves don't drain |
| Neutral | 0.55–0.75 | predictable reserve use |
| Bear | < 0.35 (§8.8 says 0.30); stimulus triggers | stimulus produces no unbacked issuance |
| Zero demand | 30/60/90 days of nothing | no issuance; reserves intact |
| Inflation shock | 10–25% | only prices move; issuance unaffected |
| Bank settlement failure | 48-hour delay, missing standing order, mismatch | **issuance freezes**; no override |

Plus the invariant `R ≥ COS × C_issued` under every condition, a
**sensitivity test** on how fast the issuance ratio and slack change ("policy
thrashing"), and quarterly **reserve volatility** σ_R = √(1/n Σ (R_t − R̄)²).
A StressTestAgent runs weekly micro-tests, quarterly scenarios and an annual
extreme test, each PASS/FAIL with the parameter at fault, kept in a
hash-linked Stress Test Ledger.

### The risk register (§18)

- Six categories: financial, operational, governance, cyber, legal, user
  behaviour (which includes "credit hoarding" and "gaming stimulation
  policy").
- Score: severity × likelihood × detectability (ISO/FMEA).
- Levels: **0** informational, **1** alert, **2** exception (minting
  pauses), **3** critical (stop until resolved).
- Rules: reserve under a 5% buffer → level 2; a missing bank settlement →
  level 3; utilisation under 30% → level 1.
- Mandatory minting halts: reserve mismatch, bank settlement late by more
  than 24 hours, a duplicate ledger hash, dividends over the 40% cap.
- Fixes: redundancy (storage), **dampening** (cut the issuance ratio when
  utilisation collapses), slack injection (+5–10% when congested), reserve
  restoration (halt until restored), governance lock (dividends).
- A risk record is never edited, only answered by a signed resolution.

### Roadmap (§19.4)

Pilot CIC (1–3 plugins, one site) → 3–7 federated nodes with replicated
storage and cross-node booking → multi-region governance → open-source
release with third-party security and compliance review.

## 2. The community model (the Business Model tabs)

Project copy only; see the project's `origins/building-a-future-2025-12.md`.
Like the Community Shared Workspace service sheet, it's an organisation's own
model rather than Q's, so it isn't kept in the repository.

## 3. Where the doc disagrees with itself

- **Share classes.** The executive summary has A = founders, B = community,
  C = preferential investors; §13 of the PDF has A = governance, F = founder,
  C = community.
- **Reserve ratio.** 1.0 under full COS backing (§3.6) versus a 20% COS
  reserve ratio (PDF §8.2).
- **The bear threshold.** Utilisation under 0.30 (§8.8) or 0.35 (§17.3.3).
- **Redemption priority.** Founders then community (§13.7) versus founders,
  preferential, then community (§15.8).
- **Low demand: stimulate or dampen?** §14.3 injects stimulus when demand is
  low; §18.8 cuts the issuance ratio when utilisation collapses. See
  `docs/q/economy-controls.md`.

## 4. What Q has changed since

| The doc | Q now | Where |
|---|---|---|
| Credits are never cashed out | Cash-out is how a credit is destroyed | ADR-Q-027 |
| Credits minted from capacity, within reserves | Minted only when value comes in (pounds or capital) | ADR-Q-027 |
| A base rate, £1 = 1 credit, raised yearly for inflation | One credit is one unit of the mint's currency; inflation shows in prices | ADR-Q-042 §3 |
| A parent CIC takes 10% of every sale | Incubator runs the commons; federations are a plugin | ADR-Q-017, ADR-Q-020 |
| Agents adjust settings | Rules in Cedar; nothing approved by an AI | ADR-Q-009, ADR-Q-027 §6 |
| Wallet IDs may become DIDs | Accounts are DIDs | ADR-Q-035 |
| Capacity issuance ratio and slack | No equivalent yet | `docs/q/economy-controls.md` |

## 5. Claims to check before reusing them

- **An HMRC "mutual credit exemption rule"** with four conditions (§16.4).
  It's not a rule that can be confirmed in that form; take an accountant's
  advice.
- **"Outside FCA regulation", "not e-money", "no Money Laundering
  Regulations exposure".** All argued on the basis that credits can't be
  turned back into cash. Q's cash-out (ADR-Q-027) removes that basis, so the
  position needs fresh advice, as ADR-Q-027's non-claims already say.

None of this is legal, financial or tax advice; the doc says so itself.
