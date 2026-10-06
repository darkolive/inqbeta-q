---
status: decided (Darren, 3 October 2026) — every host runs in test mode until its operator publishes
implementation: test mode working end to end — mint, cashout and burn receipts and the books (q-core mint.ts), publishing (q-core money.ts), the rules in Cedar (q-actions core/mint.ts, server engine node.ts), the host's /api/mint with its ledger at the gate (or mint.local/ on localhost), Buy and Cash out on Credits, agreements in the mint's credits filed with its ledger, Money and Publish on the console, 3 October 2026. Not yet: real payments and payouts
updated: 2026-10-06
---

# ADR-Q-027 — Minting against reserves: credits made when value comes in, destroyed when it goes out

**Status: proposed, 3 October 2026.** Any host or federation may, if it
chooses, mint its own credits. It starts at nothing. Credits are minted only
when value comes in (pounds paid, or capital held), and destroyed when value
goes out (cash-out), so credits in circulation always match what stands
behind them. Members pass credits freely between them; the reserve doesn't
move.

**This changes an earlier decision, on purpose.** ADR-Q-017 §7, ADR-Q-023
and the white paper (December 2025) said credits are never cashed out.
Darren, 3 October 2026: "That white paper was written nearly a year ago and
our knowledge has changed so much since then … cashing out is the perfect way
of destroying a credit. The receipt of it still exists, but it needs to
evaporate so that the system reconciles … the reconciliation works from
balances, and that can't work if something still exists but is unaccounted
for." So cash-out is part of the design: it is how a credit leaves
circulation.

**Test mode, then published (Darren, 3 October 2026).** The legal question
belongs to whoever runs a host, not to Incubator: "in the master admin
localhost end, just like with all the other API settings, you have test mode
and published. When it is in test mode, you have a full functioning Incubator
Q portal, everything works. You can cash out, you can create credits, you can
mint … so you can fully test your shop and everything in your own flow, or AI
can. And when you're satisfied, you can then go from test mode to published.
And it resets balances to zero. And you have to add bank account details. And
you have to confirm, tick, your legal responsibility. So none of this has
anything to do with Incubator, what you do with this. And they sign it, and
that produces a published ID. And that is then what becomes unchangeable."
See §7.

## Context

Darren, 3 October 2026:

> "Whatever's creating the host or a federation have one of the schema is …
> minting credits ID. So both get the power to … mint their own credits. And
> then the reputation of those credits … and treaties with other federations
> is outside of that. When a federation is created, its minting opening
> balance is zero. If nothing changes, it remains zero. If someone can buy
> your credits … a £100 purchase, then 100 credits [are] released, minted, and
> cash balance 100. At any given point, whoever [is] holding credits decides
> to cash out … that reduces the … cash balance reserves … and how many
> credits [are] left in circulation. So every time a minted credit is cashed
> out it destroys … a really nice self-balancing model … it allows those
> credits to flow freely between members … held against those reserves …
> Not just in cash reserves, but from capital value: if investors bought
> shares that bought a building, then that building as a stored value divided
> by the number of shares is the value of each share. So there is an
> investment path as well."

From the white paper (December 2025): credits are **reserve-backed**
(solvency test `R ≥ COS × C_issued`), **capacity-limited**, minted only when
the checks say "yes" (space, headroom, money to deliver), and recorded with
**double-entry accounting and hash-linked history**; "Credits only become
obligations when sold, not when issued"; grants and donated capital act as
**reserve multipliers**. From the service sheet: shares at a fixed £1, no
speculation, redeemed into treasury by the CIC.

## Decision

### 1. Every host and federation has its own mint, at nothing

A federation's founding (ADR-Q-007) may name a **mint**: its own credit, with
its own id (`mint: <federation DID>`), name and rules. Opening supply: **0**.
Credits from different mints are different credits. What one is worth to
another is a matter for **treaties** (ADR-Q-023 §4), not for the mint.

### 2. Minted only when value comes in

| Event | Credits | Reserve |
|---|---|---|
| Someone buys 100 credits for £100 | **+100 minted** to the buyer | **+£100** cash |
| Capital is held (a building, a grant) | **+N minted**, by the federation's rule | **+value** (capital) |
| Members trade credits | move between members | unchanged |
| Credits spent on the federation's own services | move to the federation | unchanged (its cost of service is drawn as delivered: white paper §11) |

A mint is itself a receipt, signed by the federation's key with its mandate
holders, citing what came in: the payment provider's receipt, or the capital
record. **No credit without value in.**

### 3. Destroyed when value goes out: cash-out

A holder can cash out: ask for pounds for credits they hold.

| Event | Credits | Reserve |
|---|---|---|
| A holder cashes out 40 credits | **−40 destroyed** | **−£40** paid to the account they choose |

The burn and the payment are one settlement, both signed (the federation and
the holder), the same shape as ADR-Q-025: nothing is destroyed without the
payout recorded, and no payout without the burn.

### 4. The balance, always

For every mint, at every moment, Q can add up from the receipts:

```
credits in circulation  =  minted − destroyed
cash reserve            =  pounds in − pounds paid out
capital reserve         =  capital held (valued by its own rule)
```

and the rules refuse anything that would break:

```
cash reserve + capital reserve  ≥  backing per credit × credits in circulation
```

Hence "self-balancing": trades move credits but never change the totals, mints
and burns change both sides together, and the balance sheet (ADR-Q-024) shows
the federation's books as plainly as a member's.

### 5. Capital: the investment path

Capital (a building bought with members' shares, a grant) can stand behind
credits as well as cash. The service sheet's rules carry across: shares at a
fixed value (£1), no speculation, no votes from shares, redeemed into
treasury. The capital's value is set by the federation's published rule and
revalued only by a signed receipt. **This is the part most likely to be a
regulated investment** (share offers, collective investment schemes); it stays
a design until advised.

### 6. The rules (Cedar): `credits.mint`, `credits.cashout`, `credits.burn`

Cannots: mint without a cited value-in receipt; mint more than the backing
allows; burn without the payout in the same settlement; burn more than the
holder holds; pay out more than the cash reserve; mint or burn signed by anyone but the
federation's mandate holders (and, for a burn, the holder); any of it approved
by an AI.

### 7. Test mode, and publishing

Money is a **service** on the localhost console (ADR-Q-018), like email or
voice, with two states:

| | **Test mode** (every host starts here) | **Published** |
|---|---|---|
| Minting, buying, trading, shops, cashing out | all work, fully | all work |
| Pounds | none move; payments and payouts are test references | real, through the payment provider and the operator's bank |
| Credits | marked `test` | marked `live`, from zero |
| Who's responsible | nobody's money is at stake | the operator, who signed for it |

**Publishing** is a few steps on localhost, by the founder only:

1. **The rate**: what one credit costs and pays out (e.g. £1).
2. **Bank details** for payouts and the reserve. Kept in `.env` on this
   computer only: never in git, never sent to Vercel; the public record shows
   the last four digits.
3. **The responsibility**: a plain statement, ticked: that running money on
   this host is the operator's own legal responsibility (the regulations that
   apply, their accounts, their members), and nothing to do with Incubator or
   Dark Olive CIC.
4. **Sign** with the founder's passkey. That makes the **publication receipt**:
   the host, its mint, the rate, the bank's last four, the statement accepted,
   when. Its hash is the **published ID**. It goes in the host's public record
   (`static/host/services.json`), so every Q can see a host's money is live and
   who signed for it.

Then:
- **Balances start at zero.** Test and live books were always separate
  (`mode`), so live begins empty; test receipts stay as history.
- **It can't be changed.** A second publication is refused, and nothing turns
  live back to test. A host that wants different terms starts a new mint.

**Where the mint's key lives.** A mint signs as itself, so it has a key of its
own, made for you on localhost (`Q_MINT_SEED`, like `Q_SERVICE_SEED`) and
sent to the live site with the other keys. The live site's `/api/mint` signs
mints and burns; the mint keeps its own receipts so it always knows its
circulation and what it has paid out. In test mode the "payment" and "payout"
are test references; once published, a mint waits for the payment provider's
confirmation, and a burn for the payout's.

## Build order

1. **Mint, ask and burn receipts** in q-core, and **the books**: circulation,
   cash and capital reserves, every holder's balance, reconciled; tests that
   the books always balance and that a burn without its payout doesn't count.
2. **`credits.mint`, `credits.cashout` and `credits.burn`** in Cedar, with tests.
3. **Money on the console**: the mint's key, the rate, test mode; `/api/mint`
   signing mints and burns, keeping the mint's own receipts.
4. **Buy and cash out** on the Credits page, fully working in test mode; the
   host's books (supply, reserves) on its page.
5. **Publishing**: bank details (local only), the responsibility ticked, the
   founder's signature, the published ID; live from zero; never changed.
6. **Real payments and payouts** through a payment provider, after publishing.
7. **Mints for federations** inside a host, and **capital backing**.

## Non-claims

Not legal, financial or tax advice. Redeemable credits, payment handling,
share offers and asset-backed value may each fall under regulation
(e-money, payment services, financial promotions, collective investment
schemes, CIC asset-lock rules). Q makes test mode complete and publishing
deliberate; **the operator who publishes takes on that responsibility, and
signs for it** (§7). Incubator's own host follows the same rule: Dark Olive
CIC takes advice before it publishes its own.

## Related

ADR-Q-007 (federations), ADR-Q-017 §7 (never cashed out: changed here), ADR-Q-023 (credits; treaties), ADR-Q-024 (the balance
sheet), ADR-Q-025 (agreements and settlement); `origins/white-paper-2025-12.md`
(§7 issuance, §8 transaction allocation, §11 reserve consumption, §13
redemption), `origins/service-sheet.md` (shares and treasury).

## Addendum, 4 October 2026: the reserve ratio, and the safety valve

Darren: "It's the surviving balance of minted coins that determines
everything." A mint starts at nothing; nothing exists until value comes in.
Add £20 and 20 credits are minted: balance 20. Cash 5 out and 5 are
destroyed: 15 credits against £15.

**The ratio** is what backs the credits in circulation:

```
reserve ratio  =  (cash reserve + capital reserve) ÷ (credits in circulation × pounds per credit)
```

**Buying and cashing out don't move it.** Each moves pounds and credits
together: buying 20 credits adds £20 and 20 credits; cashing out 5 removes
£5 and 5 credits. A fully backed mint stays fully backed.

**It falls only when the reserve shrinks on its own**, usually because the
host draws on it, as the white paper allows, for the cost of services it has
delivered. 100 credits out, and £85 of the £100 spent on running the node:
£15 backs 100 credits, a ratio of 15%.

**The safety valve**, set on localhost (the host underwriting its mint): a
minimum ratio, 20% as an example (the white paper's reserve ratio). Below
it, the mint **pauses what would weaken the backing**: cash-outs, and
minting against capital or grants beyond what the reserve covers.

**Buying is never paused.** Each credit bought brings its own pound, so new
credits are fully backed the moment they're minted, and buying pulls a
low ratio back up:

| | Reserve | Credits out | Ratio | Cash-outs |
|---|---|---|---|---|
| Before | £15 | 100 | 15% | paused (below 20%) |
| Someone buys 50 | £65 | 150 | 43% | open again |

Bringing value in is never blocked, because that's what heals it.

**The federation's home page shows it** as its trust figure: "£1,240 held
for 1,240 credits: fully backed", or the ratio, beside credits minted and in
circulation (ADR-Q-030's snapshot).

Build: the minimum ratio as a Money setting on localhost, published with the
mint's terms; `credits.cashout` refuses below it (Cedar), saying why and how
it reopens; the ratio on the federation's home page.

**Checking the reserve with the bank** (Darren, 4 October: "it just needs to
ping and say, can you honour this?"). UK Open Banking's *Confirmation of
Funds* answers exactly that: asked "are £X available in this account?", the
bank replies yes or no, and never the balance. The account holder consents
once, for a set period. Q could ask it for the cash reserve, show "reserve
confirmed by the bank, [date]" beside the ratio, and refuse to count a
reserve the bank won't confirm. Limits: calling it needs a regulated
provider (a card-based payment instrument issuer under PSD2), so it would
come through a provider the host connects with its own key; a yes is true
at that moment, not a promise the money stays; and it confirms funds are
there, not that they're set aside for the mint.

**Levels of trust in a reserve** (4 October). The credits side needs no one:
every mint and burn is a signed receipt, so anyone can add up what exists.
Only the pounds need outside evidence, and a host climbs as it grows, the
home page never claiming more than it can show:

1. **Stated**: the host says what the reserve is, shown as "stated by the
   host, not checked". Free, sovereign.
2. **Honoured**: built from the cash-out receipts: how many, all paid, how
   quickly. Free, automatic, and the first place a struggling mint shows.
3. **Witnessed**: a member treasurer sees the bank statement and signs a
   reserve note with their own key (the Money block's two signatures,
   applied to the reserve). Free, and someone's name is on it.
4. **Bank-confirmed**: Confirmation of Funds through a provider the host
   pays for (above).

A penny sent with the mint's id in the reference proves the payout account
is the host's own; the levels prove what's in it. A screenshot proves
neither: it can be edited, and nobody can check it.

## Addendum, 5 October 2026: one credit is one unit of currency, and how the host pays its costs

### The currency replaces the rate

From ADR-Q-042 §3: a mint names its **currency** when it's made (GBP, EUR,
USD …), and **one credit is one whole unit of it**. Publishing step 1 (§7)
no longer sets "what one credit costs and pays out"; it names the currency,
which can never change. In code, the mint's `pencePerCredit` becomes
`currency`, with one credit worth one unit (minor units from ISO 4217).
Inflation shows in prices, not in the coin.

### No credit without a pound, and no advances

With advance credits ruled out (`docs/q/economy-controls.md`: nobody borrows
from the mint against future work), every credit in circulation came from
value in. So every credit should be matched by a pound in the reserve, or by
capital at its book value. Darren: "there is no reason that credits are not
underwritten, matched by pounds in a bank account, other than the bank
account doesn't reconcile."

### How the host pays its costs

The 4 October addendum allowed a host to spend the reserve directly on running
the node (£85 of £100, a 15% ratio). That is replaced. Every move carries its
accounting classification (ADR-Q-024 §3), so the books tell two kinds of
spending apart:

| The host spends on | How | Effect on backing |
|---|---|---|
| **An asset** (a hard drive, a building, equipment) | from the reserve, recorded as a tangible asset at cost | none at first: the asset is **capital backing** at its book value (§5) |
| **Running costs** (power, rent, a tutor) | only by **cashing out credits the host has earned** by delivering services, like anyone else | none: credits and pounds leave together |
| **Depreciation** of an asset | recorded each period by the asset's published rule | backing falls by that amount; the host tops it up from what it earns |

### Drift: the one figure that says the books are sound

```
drift = 1 − (cash reserve + assets at book value) ÷ credits in circulation
```

- **0%**: fully matched.
- **Over 10%**: a warning, shown with the trust figure on the federation's home
  page.
- **Over 20%**: the safety valve shuts cash-outs (buying stays open, because
  it heals drift), and treaties suspend (ADR-Q-042 §8).
- **Books not reconciled for over 30 days** count as unknown, treated as over
  20%.

Drift above zero now means something is genuinely wrong (a missed payment, an
unrecorded spend, depreciation not covered), never ordinary running costs.
This replaces the 4 October addendum's example minimum ratio of 20% with a
much tighter line: backing must stay above 80% (drift under 20%), because
ordinary running costs no longer come out of the reserve.

Capital backing is still the part most likely to be regulated (§5), and still
needs advice before it's live.

### As built, 6 October 2026 (job D1): currency replaces the rate

- **q-core `currency.ts`**: `isCurrency`, `currencyFrom` (pounds if unknown),
  `minorPerCredit` (ISO 4217 minor units from the platform's own Intl data:
  100 for GBP/EUR/USD, 1 for JPY), `money`, `creditsWorth`, `currencyName`.
- **The publication** names `currency`, not `pencePerCredit`;
  `problemsWithPublication` refuses a missing or unknown code;
  `publishedCurrency` reads any publication from before as pounds.
- **The books and the rules** (`booksOf`, `mintFacts`) take the mint's
  currency, not a number, so no caller can pass a rate. Receipt fields
  (`pence`) and Cedar facts (`…Pence`) keep their names, as receipts already
  signed carry them; they now mean minor units of the mint's currency.
- **The host**: `Q_CURRENCY` in Money replaces `Q_CREDIT_PENCE` (now
  ignored; unset means GBP). The Publish card has a currency picker, saved
  through the signed service record like the coin's name. `/api/mint` and
  the console report `currency`.
- **Every Credits screen** shows money in the mint's currency: "One credit",
  "Face value", buying, cashing out, the battery, the backing picture, the
  coin check, the books. Pricing from the flow drops "what a credit would be
  worth" (no longer a choice) for the price of a GB held for a day.
- **Not yet**: the story engine's model prices and the node's running costs
  are set in pence, so they're right for a pound-mint only; other currencies
  need a rate (ADR-Q-042 §3a).

### As built, 6 October 2026 (jobs D2–D4): drift, the safety valve, the cash-out lock

- **Drift** is in the books (q-core `booksOf` → `drift`, `driftOf`): 1 −
  (cash + capital) ÷ credits out, in the currency; never below 0. The books
  on the coin check and the Bank tab show it as a card: matched, watch it
  (over 10%), or cash-outs paused (over 20%).
- **The safety valve** (q-core `valveOf`): shut when drift is over 20%, or the
  books haven't been reconciled for over 30 days (a bank never reconciled has
  30 days from its first entry). Shut, cash-outs are refused in one sentence
  saying why and how it reopens; buying is never paused. Enforced twice: the
  mint API, and Cedar (`credits.cashout/cannot/valve-shut`, fact
  `valveShut`).
- **The cash-out lock** (audit A4): the gate files one entry at a time per
  ledger and reports its **tip** (how many entries). The mint sends back the
  tip it decided on (`x-ledger-tip`) when filing a cash-out ask or a spend;
  if the books have moved, the gate refuses with 409, and the mint reads
  again and decides again (up to three times). Proved with two asks at once:
  one goes in, the other decides again. Needs the gate updated on the node.

