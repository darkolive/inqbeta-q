---
status: proposed
implementation: not started (3 October 2026)
updated: 2026-10-03
---

# ADR-Q-025 — Agreements: write one on anything, and every step is a receipt

**Status: proposed, 3 October 2026.** A third part of the vault, beside Files
and Receipts: **Agreements**. Anyone can write one straight away — "I'll cut
your grass in exchange for…" — and offers, counter-offers, acceptance and
completion are each a signed receipt, in plain language, balanced like
double-entry bookkeeping so the balance sheet (ADR-Q-024) is always right.

## Context

Darren, 3 October 2026:

> "A friend who's looked said this would be fantastic if you could record a
> contract — a self-employed person doing a job on a site … In the vault
> you've got files, which are your documents … receipts, which should be just
> findable and visible, human readable. And then what about agreements? … Those
> contracts can be treaties, they can be jobs … write a contract straight away
> on anything. I'll cut your grass in exchange for … This is what the
> Incubator Workhouse model showed in the activity: every time you made an
> offer, counter-offer, accepted — the language is recorded really beautifully."

> "If it's a transactional balance sheet receipt, then these rules of financial
> recording, double entry, bookkeeping checks make it a very, very robust system."

From the Workhouse demonstrator (`~/inQbeta/apps/portal/app/workhouse`): an
offer gives one thing (credits, pounds, or something done) in exchange for
another; it can be **proposed, countered, accepted, completed, rejected,
withdrawn or expired**; every step is written as a sentence from the reader's
side ("You proposed an offer to Ben of 3 credits in exchange for cutting the
grass." / "Ben counteroffered your offer…"); credits in open offers are
committed, not spendable (`exchange-value.ts`); and each line of activity has
its proof beside it.

Already decided: cards include **agreement and contract cards between two
people** (ADR-Q-015); offers are listings and taking one is a trade both sign
(ADR-Q-023 §7); treaties between federations (ADR-Q-017 §8, ADR-Q-023 §4); a
promise is a liability until it's kept (ADR-Q-024).

## Decision (proposed)

### 1. The vault has three parts

| Part | What it is |
|---|---|
| **Files** | Your documents: photos, PDFs, anything you keep |
| **Receipts** | Signed records of what happened, findable and readable as cards |
| **Agreements** | What people have promised each other, and how it went |

An agreement is a chain of receipts, so it's found under Agreements and each
step is also a receipt. Files can be attached as evidence (a photo of the
finished job), linked by hash, never copied into the agreement.

### 2. Write an agreement, in steps

Under **You**, *Agreements* opens with **Write an agreement**. Steps, one
screen each, no blank page:

1. **Who with.** Someone from your address book (or a club, for a treaty).
2. **What you'll do or give.** Words ("cut the grass"), credits, or pounds.
3. **In exchange for.** The same three choices (not the same kind both ways:
   credits for credits is a gift, not an agreement — from Workhouse).
4. **When and where** (optional): dates, a place, a site.
5. **How you'll both know it's done** (optional): what counts as finished,
   photos, a sign-off.
6. **Read it back, and send.** The whole agreement as one sentence first.

### 3. Every step is a receipt, said from your side

| Step | Who signs | Said (to the person who made it) |
|---|---|---|
| **Proposed** | the proposer | "You proposed to Ben: cutting the grass, in exchange for 3 credits." |
| **Countered** | the one countering | "Ben offered instead: cutting the grass, in exchange for 5 credits." |
| **Accepted** | both (the second signature makes it binding) | "You and Ben agreed: …" |
| **Done** (with evidence) | the one who delivered | "You said it's done, with 2 photos." |
| **Completed** | both | "Ben confirmed it's done. The agreement is complete." |
| Declined, withdrawn, expired | the one ending it, or nobody (time) | "Ben declined." / "You withdrew." / "It ran out on 12 October." |

Each names the step before it, so an agreement is a hash-linked chain like a
call (ADR-Q-004). A change after acceptance is a **variation**: a new counter
that both sign; the original stays.

### 4. Double-entry: every agreement balances

When an agreement completes, it writes its **entries**: for each kind of value,
what one side gives the other receives, so each kind adds up to nothing across
the two of them.

- *Credits*: Ana −3, Ben +3.
- *Pounds* (business only, a record, never moved by Q): Ana paid £40, Ben received £40.
- *Things done*: Ben gave "cut the grass", Ana received it. Counted, never valued.

Before acceptance, what each side has promised is a **promise** on their
balance sheet (ADR-Q-024); credits promised are **committed**, so they can't be
offered twice. The rule engine refuses an agreement whose entries don't
balance, and refuses credits beyond what's available.

### 5. Three kinds, one shape

| Kind | Between | What's special |
|---|---|---|
| **Swap** | two people | neighbourly; personal (ADR-Q-023 §5) |
| **Job** | a self-employed person and a client | business; the site, start and end, the price (pounds and/or credits), variations, evidence and sign-off; its value in pounds recorded for both sides' accounts |
| **Treaty** | two federations | signed by each federation's key (with its mandate holders); its rules are derived actions that can only add cannots (ADR-Q-023 §4) |

An agreement shows as a **card** (ADR-Q-015): who, what for what, when, and
where it stands, with its steps beneath as a timeline in plain sentences, each
with a magnifier to open its receipt.

### 6. The rules (Cedar): `agreement.propose`, `.counter`, `.accept`, `.done`, `.complete`, `.end`

Cannots, in plain words:

- Accept your own offer.
- Accept or complete without both signatures.
- Change anything after acceptance except by a variation both sign.
- Complete with entries that don't balance.
- Promise more credits than are available.
- Trade the same kind both ways (credits for credits).
- Across federations, agree outside a treaty (ADR-Q-023 §3).

## Build order

1. **Agreement receipts** in q-core: the steps, the chain, the entries, with
   tests (an agreement that balances; one that doesn't; a variation).
2. **The rules** in q-actions, with tests.
3. **Agreements** in the vault, and **Write an agreement** under You.
4. **The sentences** in activity, from each reader's side, with the magnifier.
5. **The balance sheet** reads promises and entries (ADR-Q-024).
6. **The job kind**: site, dates, evidence from Files, sign-off.
7. **Treaties.**

## Non-claims

An agreement in Q is a signed record of what two people said they'd do. It is
**not legal advice**, and a written template is not a solicitor's contract.
For work of real value, take advice; before real money moves, an accountant
and a solicitor (ADR-Q-017, ADR-Q-023).

## Related

ADR-Q-004 (calls as chains), ADR-Q-008 (must and cannot), ADR-Q-009 (actions),
ADR-Q-015 (cards with a purpose), ADR-Q-017 (treaties), ADR-Q-023 (credits,
offers, trades), ADR-Q-024 (the balance sheet); in the inQbeta repo,
`apps/portal/app/workhouse` and `lib/exchange-value.ts`.
