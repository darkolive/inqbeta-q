---
status: proposed
implementation: not started (3 October 2026)
updated: 2026-10-05
---

# ADR-Q-024 — The balance sheet: what you hold, what you've promised, and where you stand

**Status: proposed, 3 October 2026.** How Q shows value: a balance sheet
added up from your own receipts, with every action declaring how it counts,
brought across from the inQbeta repo's balance sheet, statement and the
Workhouse festival demonstrator.

## Context

Darren, 3 October, before theme 4 (credits for real): "there was a lot done in
the workhouse experiment repo that looked at balance sheets and reporting …
which I think would be really helpful to translate over." What was found, and
how it maps, is in `q/balance-sheet-from-workhouse.md`.

From inQbeta (`docs/guide/balance-sheet-explained.md`): "A wallet holds money …
your credentials aren't money." A balance sheet shows what you hold, what you
owe, and the honest number between them. From
`docs/architecture/plugin-accounting-manifest.md`: plugins never do their own
accounting; they declare what their events mean, and the core books them.

Already decided: credits are eligibility units, bought in pounds, never cashed
out (ADR-Q-017 §7, ADR-Q-023); a balance is added up from the vault, never held
by a server (ADR-Q-023 §2); every move is inspected by Cedar (ADR-Q-023 §3);
cards are the human face of receipts and must have a purpose (ADR-Q-015).

Darren's choices, 3 October: the page is called **Balance sheet** in the menu;
**credentials sit on it**, as cards; a club's summary shows **supply and
velocity**, not a "wealth" figure.

## Decision (proposed)

### 1. Three parts, and the honest number

| Part | What's in it | Counted as |
|---|---|---|
| **What you hold: credits** | *Available*: yours to spend or offer. *Committed*: held for an open offer or an accepted trade. | Credits |
| **What you hold: earned** | Membership cards, course completions, signed attestations: things earned that can't be handed on. | Listed as cards, **never given a value** |
| **What you've promised** | Credits held for others until something is delivered; a trade you've accepted but not yet done. | Credits |
| **Waiting** | A reward for capacity you delivered, waiting for its two signers. | Shown, **not counted** until it holds |

**Where you stand** = credits you hold − credits you've promised. In credits,
test and real always apart (ADR-Q-023 §2). Earned things stand beside it, not
in it.

### 2. Committed and available

You can offer or spend only what's available: what you hold minus what's
committed (from Workhouse's `exchange-value.ts`). Cedar is given `available`,
not the raw balance, when it decides a spend or a trade.

### 3. Every action declares how it counts

An action definition (ADR-Q-009) gains an `accounting` block. Core actions set
it; a derived action may change only the words people see, never how it counts
(a cannot, ADR-Q-008).

```ts
accounting: {
  counts: 'holds-more' | 'holds-less' | 'promised' | 'promise-kept' | 'waiting'
        | 'earned' | 'reversal' | 'nothing';
  /** Credits, an earned thing, or neither. */
  as: 'credits' | 'earned' | 'none';
  /** It doesn't count until verified (a reward's two signers). */
  needsVerifying?: boolean;
  /** Pounds that belong in someone's own accounts: paid for a pack, or a business trade's recorded value. */
  pounds?: 'paid' | 'recorded';
  /** Plain hint for the person's own records. Never tax advice. */
  hint?: 'personal' | 'business' | 'barter';
  show: { label: string; history: boolean; statement: boolean; promises: boolean; clubSummary: boolean };
}
```

The four credit moves, and the earned things:

| Action | counts | as | pounds |
|---|---|---|---|
| `credits.buy` | holds-more | credits | paid (live only) |
| `credits.spend` | holds-less | credits | — |
| `credits.reward` | waiting, then holds-more | credits | — |
| `credits.trade` | holds-more or holds-less, by direction | credits | recorded (business only) |
| an offer taken, not yet delivered | promised, then promise-kept | credits | — |
| `federation.membership` | earned | earned | — |
| a course completed (DoStudy) | earned | earned | — |

### 4. The page: four plain sections

The Credits page becomes **Balance sheet**. From Workhouse's History bank, each
section is a short table, a list where every row opens its receipt, and one
small chart:

1. **Credits**: opening, came in, went out, now; available and committed; over time.
2. **Earned**: your cards, memberships and completions, as cards (ADR-Q-015).
3. **Promised**: what you've promised others and what's been promised to you.
4. **Pounds**: what you paid for packs and the recorded value of business
   trades. The only part that may belong in your own accounts, and plainly
   marked as a record, not advice.

Skeleton styling only, numbers in words a person says, a picture story at the
top (the Credits story).

### 5. The statement

Choose a period: this month, this quarter, **the UK tax year (6 April to
5 April)**, or all time. It shows what came in and went out, promises made
and kept, by federation, and pounds. Save it as a PDF or a CSV, marked: "A
personal record from your own receipts. Not a legal statement or tax advice."

### 6. A club's summary

On a club's page, for those who look after it: credits in circulation
(supply), how often they change hands (velocity: 1 + exchanged ÷ supply),
members over time, and what moved under each treaty. No "wealth" figure.

## Build order

1. `accounting` on action definitions; the core credit actions and membership
   given theirs; a cannot that derived actions can't change `counts` or `as`.
2. `q-core/balance-sheet.ts`: pure functions over receipts (holds, committed,
   available, promised, waiting, earned, pounds, series over time), with tests.
3. The Balance sheet page, replacing Credits, and the menu name.
4. The statement, with periods and PDF and CSV export.
5. A club's summary.
6. Then ADR-Q-023's build order carries on (spend, usage receipts, rewards,
   trades, offers), each move already having its place.

## Addendum, 5 October 2026: the self-employed statement

Darren:

> "Allowing for the various accounting codes … makes categorising it into
> tangibles, intangible assets, expenses, depreciation all very
> straightforward and recorded … financial statements that would enable a
> self-employed, self-tax-assessed person [to] produce all of their income and
> expenditure … If it's recorded as a personal expense or a personal exchange,
> then those credits are just staying in the system … that's for the
> individual to explain … nothing to do with Incubator. If, however, you choose
> to declare … the schema types of accounts means that allocation of costs and
> allowable expenses will show what your tax bill likely is."

### 1. A business receipt can carry a category

`accounting.hint: 'business'` gains an optional **category**, chosen by the
person when they record the move (or suggested from the agreement's kind,
never decided for them):

- **income** (sales, fees, work paid in credits or pounds);
- **expense**, in the headings of HMRC's self-employment pages: goods bought
  for resale, travel and vehicle, staff, premises (rent, rates, power,
  insurance), repairs, office and phone, advertising, bank charges,
  professional fees, other;
- **asset**: equipment, a vehicle, a building share, recorded at cost, with
  **capital allowances** shown separately (in UK tax, depreciation itself is
  not an allowable expense);
- **intangible**: software, a licence, a course completed for the business.

### 2. Valued in pounds at the time

A business move records its value in pounds when it happens (ADR-Q-023 §5),
so a job paid in credits counts as income at that value. One credit is one
unit of the mint's currency (ADR-Q-042 §3), so for a pound-mint the value is
simply the credits.

### 3. The statement adds a "Self-employed" view

For a chosen UK tax year: income, expenses by heading, assets and their
allowances, and **net profit**, each total opening the receipts behind it, in
PDF and CSV. Personal moves are left out and listed only as a count ("42
personal exchanges, not included").

Marked plainly: **"Your own receipts, totalled by the categories you chose.
Not tax advice. What's allowable is HMRC's decision."**

### 4. What it doesn't claim

- **Good records are strong evidence, not the last word.** HMRC still decides
  what's allowable (the "wholly and exclusively" test). Double entry proves
  the books balance, not that every category is right.
- **A label doesn't decide what something is.** Regular paid work marked
  "personal" can still be trading income. Q records the label the person
  chose; the responsibility is theirs, between them, their bank and HMRC.
- **No estimate of a tax bill** is shown as fact. If one is ever added, it's
  plainly "a rough guide from your figures", with the rates and allowances it
  used and their date.

### Build

After step 4 above: the category on business moves, the self-employed view on
the statement, its export, and a test bed (ADR-Q-031) of a pretend sole
trader's year that adds up.

## Non-claims

Not tax, legal or financial advice. Whether and how a business records trades
in pounds, and how credits sit under barter, e-money and payment rules, needs
an accountant's and a solicitor's view before real money moves (ADR-Q-017,
ADR-Q-023).

## Related

ADR-Q-006 (components and manifests), ADR-Q-008 (must and cannot), ADR-Q-009
(actions and the engine), ADR-Q-015 (cards with a purpose), ADR-Q-017 (the
commons), ADR-Q-023 (credits); `q/balance-sheet-from-workhouse.md`; in the
inQbeta repo, `docs/guide/balance-sheet-explained.md` and
`docs/architecture/plugin-accounting-manifest.md`.
