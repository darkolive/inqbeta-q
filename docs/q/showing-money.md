---
implementation: current
decision: none
updated: 2026-10-05
---

# Showing money and numbers: the design language

What the Credits work (late September to 5 October 2026) settled about how Q
shows numbers, money, health and proof. It's written down so the same rules hold
site-wide: the balance sheet, storage use, node capacity, crowdfunding, grants
and anything else that counts.

The decisions behind it are ADR-Q-035 (the bank), ADR-Q-036 (held by rule) and
ADR-Q-037 (ask the office). This doc is how they look.

## The one idea

Darren: "It represents the truth of the person. It's not about a comparison of
wealth. It's about having enough."

Q never shows more as better. It shows whether you have **enough**, and it
shows the **proof**.

## 1. Pictures carry the meaning; numbers confirm it

The page is designed for dyscalculia: someone should be able to read it without
doing sums.

- **Shape first.** A line rising, a band narrowing, a battery emptying. The
  picture tells you if things are fine before you read a figure.
- **Words beside every number.** A figure always says what it is ("bought, or
  given to you", "in agreements not yet settled"). There is never a bare number.
- **One sentence says the state.** Under a chart, a single plain sentence says
  what it means and what to do, for example "Getting close: only 12 credits free.
  Get more: buy some, ask for them, or crowdfund."
- **Whole numbers, grouped the British way** (`toLocaleString('en-GB')`), in
  `tabular-nums`. Pounds show as £12, not £12.00, unless there are pence.
- **The unit is said** ("credits"), with the singular when there's one.

## 2. Colour means one thing, everywhere

| Meaning | Token | Used for |
|---|---|---|
| In, received, yours | `primary` | Received line, the Your credits card, the free band |
| Out, spent | `error` | Spent line, the Spent card |
| Held, committed | `warning` | The committed band and card; credits held by rule |
| Healthy, then low, then empty | `success` → `warning` → `error` | The battery; the reconciled dot |

- Use the `-600-400` pairs (`stroke-primary-600-400`,
  `preset-filled-primary-600-400`) so it reads the same in light and dark mode.
- A card is the colour of the line it counts (`preset-tonal-{tone}`), so you
  match the number to the line by colour, not by reading a legend.
- Every style comes from Skeleton. An inline style is used only where
  Skeleton's own CSS overrides the class, as with the QR code's frame and fill.

## 3. Health is a battery

`Battery` and `enoughLevel(have, needed)` in `@inqbeta/q-ui` make up Q's
single health indicator.

- **Empty is the line you can't go below.** For cashing out, that's holding
  exactly what's committed. **Full is twice that.** The level is spare ÷ needed,
  capped at 1.
- **Cells, coloured smoothly** from green to orange to red, with red for the
  last two cells. There are no dials or speedometers: they were tried and
  rejected.
- **The bell tells you once, on the way down**, at a half, a quarter, a tenth and
  empty (`battery-watch.ts`). It doesn't nag, and rising back up is quiet.
- The `compact` version sits on a dashboard, with its words as the tooltip.

Use it for anything with an "enough": storage left on a node, a crowdfund
against its target, a grant's remaining pot.

## 4. Charts read like a share chart, by the clock

`LineChart` (generic) and `CreditFlowDisplay` (credits).

- **Running totals that only climb**: received, and spent. The gap between them
  is what you have. Running totals are easier to read than a bouncing balance.
- **Committed is a band, not a line.** It's filled amber on top of spent with no
  line of its own, labelled just **Committed**, and it grows and shrinks with
  your commitments. Green between it and received is free; the band touching
  green means act.
- **Soft curves** (a stepped line, softened). Lines are thin, with no dots and no
  end labels.
- **Spaced by the clock**, not one step per receipt.
- **Zero is the floor**, unless everything sits high: if the lowest value is
  under about a third of the top, the chart starts at nought. Otherwise it
  zooms to the window. Gridlines fall on round numbers (`niceStep`), so heights
  stay honest: 55 never looks like 450.
- **Windows as tabs**: 1 hour, 4 hours, 24 hours, Week, Month, 3 months, Year,
  All. The default is 24 hours.
- **Earlier and Later** step a whole window at a time. Later stops at now, and
  Earlier stops at the first receipt. Choosing a tab returns to now.
- **Everything follows the window**: the cards, the lists and the ticks. The
  window opens on the totals as they stood then, and its words say **now** or
  **then** ("20 committed then").
- **Hover shows the receipt**: its time, what it was, the balance after.
  A hidden table carries the same figures for screen readers.

## 5. Every number opens its receipt

Darren: "the receipts being all the proof."

- Tap a card and the receipts behind it list **under the card, before the
  chart**: what opens a list sits directly above it.
- Each line opens its signed receipt in the `ReceiptDrawer`. A line you can't
  open is only a claim.
- **Reconciled** shows a dot coloured by age (green within a day, through to
  red after a month), and opens the signed reconciliation.

## 6. A statement is between two parties

The coin's page is your statement with its bank, and it says who that's between:
**you**, **the federation** and **its bank**, by DID. Underneath:

- **Test or live**, said plainly;
- one row of three: Your credits, One credit, Face value;
- the chart;
- at the bottom, only the actions: Buy credits, Cash out (with the battery and
  the account it pays into).

A **breadcrumb** (Credits › coin name) replaces a page header. The Credits
home lists every coin you hold.

## 7. The coin is its own proof

`Coin`, `CoinCheck`, `CoinDrawer` and `/verify/[mint]`.

- **The coin's face is a QR code** to its public verify page. Scan to check
  shows whether it was minted here, who stands behind it, and its books.
- **Plain shapes**: circle, square, hexagon, shield, skull and crossbones, or
  a picture. It shouldn't look "coiny".
- The federation designs it: colour, ink and plate, with ink contrast chosen
  automatically. A mark in the middle switches the QR to high error
  correction.
- **The design is signed** (`inqbeta.coin-image/1` with its hash) and has a
  fingerprint, ready for a uniqueness registry.
- **Receipt pages are bare**: `/verify/` and `/c/` have no app chrome, are
  public, and show the thumbprint when there's no identity.

## 8. Ask the office

Wherever a button contacts an organisation, it names an **office**, not a
person: "Ask the treasurer". Whoever holds that office this term receives the
message (ADR-Q-037).

## 9. Quiet type

- Normal weights. Bold is kept for the one answer on a card (`h3`), never for
  rows.
- Dates sit inline in a row ("3 Oct, 13:49"), not in their own column.
- Short sentences, with the plain word first: "free", "held", "committed", "then".

## Components to reuse

| Component | Where | For |
|---|---|---|
| `Battery`, `enoughLevel` | `@inqbeta/q-ui` | Any "enough" |
| `LineChart` | `display/` | Any running totals over time |
| `CreditFlowDisplay` | `display/` | Credits in, out and committed, by window |
| `CashOutBattery` | `display/` | What you can cash out |
| `MintBooks` | `display/` | A mint's backing and reconciliation |
| `Reconciled` | `display/` | Age-coloured proof of the last reconciliation |
| `Coin`, `CoinCheck`, `CoinDrawer` | `display/`, `components/` | The coin and its check |
| `CoinDesigner` | `components/` | The federation designs and names its coin |
| `ReceiptDrawer` | `components/` | Open any receipt behind a number |
| `Thumbprint` | `components/` | Unlock on a bare receipt page |
| `batteryNotice` | `lib/battery-watch.ts` | The bell, once on the way down |
