---
status: proposed (Darren, 7 October 2026)
implementation: steps 1–4 — q-core `vouchers.ts` and `voucher-sales.ts`; q-actions `voucher.issue`, `.move`, `.redeem`; the node keeps masters; `/v/<voucher>` and `/v/new`. Issuing and redeeming in the app next
updated: 2026-10-07
---

# ADR-Q-044 — Vouchers: what you see is what you get

**Status: proposed, 7 October 2026.** It gives the market its one shape. It
builds on credits and the exchange (ADR-Q-023), agreements and committed
credits (ADR-Q-025), copies and the master (ADR-Q-019), the coin and its
verify page (ADR-Q-035) and treaties (ADR-Q-042). **It replaces the grant
mechanism of ADR-Q-036**: a grant is now a voucher (see §7 and the addendum to
036).

## Why

Darren, 7 October 2026, on opening the marketplace:

> "We have credits and we have coins that have QR code traceability … and
> we've also got the same for federations. So let's have a similar one, which
> is a kind of voucher. That's how you give out for grants and things. They're
> vouchers. I'm vouching for this, and it can be paid for with a credit …
> If you saw a picture of a t-shirt, size medium, price 10 credits, then the
> voucher is saying what you see there is what you get. So that is a very
> simple separation of purpose and rules. So a marketplace is a collective
> place of vouchers where credits can come in and purchase those vouchers."

> "If it's one of one, which means it's an original, then the title … goes to
> the buyer. And if it's a one of many item, then a copy goes to you. And …
> if anything can be replicated, then even if it's one of one at the time, if
> it can be copied, then it can't be title owned."

And on grants:

> "If a grant was a voucher and in the voucher you put a condition in a type,
> can it be passed on? Can it be transferred? … a voucher that is specifically
> for the purpose intended can't be sold on … Or you can put in the rules what
> it can be exchanged with … this voucher can be swapped for storage, it can be
> swapped for office space, it can be swapped for X, Y, Z … Solves so many
> problems and simplifies it."

## Decision (proposed)

### 1. The coin says what pays; the voucher says what you get

Q has three things you can scan, and each answers one question:

| | Its QR answers | Signed by |
|---|---|---|
| **Coin** | Is this money real, and is it backed? | The bank |
| **Federation card** | Who is this, and who stands behind them? | The federation |
| **Voucher** | What exactly is promised, by whom, how many exist, and who holds it? | **The issuer: "I vouch for this"** |

Credits are the money. A **voucher** is the signed promise on the other side of
the counter. The voucher carries the **purpose** (what you get); the market only
checks the **rules** (can this move, to whom, for what).

Vouching is the same act everywhere in Q. A member vouching for a newcomer
(ADR-Q-007, Standing) and a shop vouching for a t-shirt both put a signature
behind a claim, on record.

### 2. A voucher is a master and its copies

The words come from ADR-Q-019.

- **The voucher** (`inqbeta.voucher/1`) is the master: the issuer's signed
  promise. It names:
  - **the issuer** (DID) and, if different, **who redeems it**;
  - **what it is**: a title, words, and pictures, each picture signed in by its
    hash, so "what you see" can't change after the sale;
  - **its kind** (§3) and **its edition**: one of one, one of *N*, or open;
  - **its price**: so many credits of a named coin, or "given" (a grant or a
    gift);
  - **its terms** (§5): whether it can move, and what it can be exchanged for;
  - **when it ends**, and what happens then (§6).
- **A voucher held** (`inqbeta.voucher-held/1`) is a numbered copy in
  someone's vault: "12 of 50", naming the master, its holder, and the receipt
  that brought it to them. A wallet of vouchers is a chain of these, like a
  wallet of credits (ADR-Q-023 §2).

### 3. What can be owned: four kinds

| Kind | Example | What the buyer gets |
|---|---|---|
| **Original**: one of one, can't be copied | A painting; a particular vintage jacket | **Title passes.** The master and the thing are the same, so the buyer becomes its owner, and the voucher says so. |
| **Edition**: one of many | The medium t-shirt, 12 of 50 | **A copy.** The buyer owns their shirt outright; the issuer keeps the master (the design and the edition). |
| **Copyable**: can be replicated, however many exist today | A file, a song, a design, a course's materials | **A licence and a numbered, signed copy. Never title.** Even a one-of-one is a licence. |
| **Consumable**: used up | An hour of training; a month of storage; a desk-day | **Redeemed, not owned.** Handed back for the thing, and then it's spent. |

- **"If it can be copied, it can't be title-owned."** This is a rule the engine
  checks, not a label. Digital kinds are **copyable by default**. An issuer
  can't tick a box to call a file an original.
- **Provenance is not ownership.** What is unique in a digital one-of-one is
  the record of the first sale from its maker. The voucher can show that
  ("first from the maker"), but it says plainly that this is a record and not
  title.

### 4. Editions are enforced, and visible

- The engine refuses **a 51st of 50**. A one-of-one can be sold once.
- **The voucher's QR** opens its public page (`/v/<voucher>`), bare like
  `/verify/` (ADR-Q-035 §5). It shows: who vouches, what is promised (pictures,
  words, kind), **"12 of 50 · 38 left"**, the price, its terms in plain words,
  and, for the copy you hold, its chain back to the issuer.
- The voucher is designed like the coin: a card with the picture, the QR, the
  edition and its terms as chips. The QR stays standard and scannable.

### 5. Terms: whether it moves, and what it can be exchanged for

Every voucher states two things. They are rules (derived actions that can only
add cannots, ADR-Q-023 §4), checked whenever the voucher moves.

**Can it be passed on?**

- **Bound**: only the named holder can use it. It can't be sold, given or
  swapped. A grant for a purpose is bound.
- **Giftable**: it can be given away, never sold.
- **Sellable**: it can be listed on the market and sold on, at a price the
  holder sets, within any limit the issuer set.

**What can it be exchanged for?** This is the voucher's **realm**: the kinds of
offer it can be redeemed against or swapped for.

- **Itself only**: the t-shirt voucher gets you the t-shirt.
- **A list of kinds**: "storage, office space, training". The holder can redeem
  it with any provider offering one of those kinds who is **accepted by the
  issuer**: by treaty (ADR-Q-042), or by being on a list the issuer signs.
- The realm is how one grant voucher can serve many needs without becoming
  money. It can never be cashed out, and it can never buy anything outside
  its realm.

### 6. Paying, holding, redeeming

- **Buying a voucher is a trade** (ADR-Q-023): both sign. The buyer's credits
  are **held by agreement** (ADR-Q-025) until the voucher is redeemed or the
  goods arrive. Then they're released to the issuer. So the voucher is also
  the buyer's protection: if what arrives isn't what the pictures showed, the
  signed voucher is the evidence.
- **A given voucher** (a grant, a gift) is backed by the giver's credits,
  **held behind the voucher** in the giver's own bank. The holder holds a
  voucher, not credits, so **there is nothing for them to cash out**.
- **Redeeming** hands the voucher back, signed by both: holder and redeemer.
  If the redeemer isn't the issuer (a training provider under a grant), the
  credits held behind it move to the redeemer, and are ordinary credits to them
  from then on (ADR-Q-036 §5 carries over).
- **Swapping** within the realm turns one voucher into another, signed by both
  sides. The new voucher keeps its terms (a bound voucher stays bound).
- **When it ends**: a given voucher's unspent value **returns to the giver**,
  as a receipt naming the rule that returned it. A paid voucher can't simply
  lapse: it is refunded, or it doesn't expire (see non-claims).
- **Revocation**: an issuer can't take back a voucher it sold. A bound grant
  voucher ends early only by its own stated rule (for example, the holder stops
  qualifying, §7).

### 7. A grant is a voucher

This is the simplification. ADR-Q-036 put the conditions **on the credits**
(credits held by rule). Here the conditions sit **in the voucher**, and the
credits stay in the funder's bank, held behind it.

The foundation's story, retold:

1. The foundation mints its coin against the £100,000 it holds (ADR-Q-027).
2. It issues a **grant voucher**: *given; bound; realm: training, storage,
   office space; for people who meet its criteria; worth up to 400 credits
   each; returns on 14 March 2027 or when the holder stops qualifying.*
3. A young person proves they qualify, by attestation ("under 25 until …",
   ADR-Q-036 §3, unchanged), and receives a voucher held in their name.
4. They redeem it with a provider in the realm that the foundation has
   accepted. The engine checks the voucher, the attestation and the provider at
   the moment of redemption.
5. The credits held behind it move to the provider, who can cash them out
   (ADR-Q-035 §8).
6. Whatever is unredeemed at the end returns to the foundation, as a receipt.

**What this removes:** there's no second kind of committed credit, and no
restricted balance in the student's wallet. The student never holds credits
they can't use. Nobody could cash out a grant, because there's nothing to cash.

### 8. On the books

- **For the issuer, an unredeemed voucher is owed.** It's a liability on the
  balance sheet (ADR-Q-024), like a gift card, and it's shown as one.
  Credits held behind given vouchers show as committed, with the words "held
  behind 37 grant vouchers".
- **For the holder, a voucher is an asset**, listed under **Vouchers** beside
  Credits, with its face value and its terms. It is never added into the
  credit balance.

### 9. The market is vouchers

- **An offer is a voucher on display** (ADR-Q-021 listings, ADR-Q-023 §7).
- **A wanted offer is a voucher in reverse** (ADR-Q-030 §6): "I vouch I'll pay
  70p a GB for 100 GB this month."
- **Resale** is a sellable voucher listed by its holder. Its page shows the
  chain back to the issuer.
- The network market's storage contracts and the training grant run on the
  same machinery as the t-shirt.

## Consequences

- **One shape for everything sold, given or promised.** Shop goods, services,
  storage, grants, gifts and wanted offers are all vouchers.
- **Purpose and rules stay apart.** The issuer says what; the engine says
  whether.
- **Grants get simpler and safer.** Restricted value never sits in a person's
  wallet.
- **Honest ownership.** Title passes only when it really can.

## Build order

1. **The voucher and the voucher held** in q-core: the four kinds, the
   editions, and the chain.
2. **Terms in Cedar** (q-actions), with tests: bound, giftable or sellable;
   the realm; the 51st of 50 refused; title refused for copyable kinds.
3. **Buy and redeem**: a trade with credits held by agreement, then
   redemption that releases them.
4. **The voucher's page and QR** (`/v/<voucher>`), bare; and the voucher card
   in q-ui, alongside `Coin`.
5. **Vouchers** beside Credits in the wallet; issuer liabilities on the balance
   sheet.
6. **Given vouchers**: credits held behind them, attestation, return at the end.
7. **The market** lists vouchers; resale; wanted offers as reverse vouchers.
8. **A test bed** (ADR-Q-031): a shop with an edition of 50 t-shirts, an
   artist with a one-of-one, and the pretend foundation, its student and a
   training provider. All end to end in test mode.

## Non-claims

This does **not**:

- **meet consumer or gift-card law.** Rules on refunds, expiry of paid
  vouchers, distance selling and goods not as described all apply to real
  sales, and need a solicitor's view.
- **settle whether vouchers are e-money or regulated payment instruments**,
  especially vouchers redeemable at many providers. That needs advice before
  real money moves (as for credits, ADR-Q-023).
- **decide intellectual property.** The licence that comes with a copyable
  voucher is the issuer's to state; Q records it, it doesn't write it.
- **change grant, charity or data protection advice** in ADR-Q-036. That all
  still applies.

## Related

ADR-Q-007 (vouching for members), ADR-Q-009 (the engine), ADR-Q-019 (copies
and the master), ADR-Q-021 (listings), ADR-Q-023 (credits and the exchange),
ADR-Q-024 (the balance sheet), ADR-Q-025 (agreements; committed credits),
ADR-Q-027 (minting against reserves), ADR-Q-030 (the network market; wanted
offers), ADR-Q-031 (test beds), ADR-Q-035 (the coin and its verify page),
ADR-Q-036 (grants, now vouchers), ADR-Q-042 (treaties and settlement).

## Addendum, 7 October 2026: steps 1 and 2 as built

**Step 1, q-core `vouchers.ts`** (tested): the voucher (`inqbeta.voucher/1`),
the voucher held (`inqbeta.voucher-held/1`) and the redemption
(`inqbeta.voucher-redeemed/1`).

- `voucherProblem` refuses what the four kinds can't be: a digital original
  or edition; an original that isn't one of one, or isn't physical; an
  edition below 2; a copyable without a licence; pictures without a hash or
  alt text.
- `editionOf` reads every copy back to the issuer: each signed by who passed
  it and who received it. A number issued twice, a copy passed on twice, one
  not received yet, or past the edition is left out, with why.
- `redeemProblem`: before it ends, in its realm, by the issuer or a provider
  accepted on its list or by treaty.

**Step 2, q-actions `voucher.issue`, `voucher.move`, `voucher.redeem`**, in
the core, tested with real Cedar. Refused: the 51st of 50; a number twice;
title with anything but an original; moving a bound voucher; selling one
that's only giftable; resale over the issuer's limit; passing on or redeeming
a redeemed copy; redeeming outside the realm, by a provider not accepted, or
after it ends; a given voucher without the holder's eligibility. Never
approved by an AI (declared).

**Two choices made in building, to confirm:**

1. **A third backing for given vouchers: capacity.** Besides paid and
   given-from-credits, a voucher can be given from **idle capacity**
   (ADR-Q-043). It must be consumable, bound, and lapse at its end; it says
   what capacity it is, and a held one gives notice. The ADR-Q-043 capacity
   gift is now this voucher, so there is one shape for everything given.
2. **A paid voucher can't lapse or return at its end: it's refunded.** People
   keep what they paid for (the white paper's promise that bought credits
   never expire). Given from credits returns to the giver; given from
   capacity lapses back to idle.

## Addendum, 7 October 2026: steps 3 and 4 as built

**Step 3, buying** (q-core `voucher-sales.ts`, tested with real agreement
receipts). A paid voucher is sold through its issuer's **shop** (ADR-Q-026):
a shop offer whose terms are the voucher one way (named by its hash) and its
price the other, as many times as the edition allows. Taking it is the trade.
The buyer's credits are then **held by agreement** (`committedBy`), not paid.

- Each sale reads as one of: taken, issued, received, redeemed, released,
  cancelled, or refund due (`saleOf`).
- **The issuer hands out a copy only to the buyer, naming the sale**: one
  sale, one copy. This is a new rule in Cedar, `voucher.issue/must/paid`.
- **The credits are released only once it's redeemed** (`releaseProblem`).
  Both sign the settlement for exactly what was agreed, and the credits go to
  the issuer.
- **Refunds:** if the issuer can't deliver, or a paid voucher ends unredeemed,
  the issuer cancels the sale before anything is settled. Nothing ever moved,
  so the credits are the buyer's again.

**Step 4, the voucher's page and code.**

- **The node keeps the master** at `/voucher/<hash>`. It must be signed by its
  issuer and match its hash, so it can't be changed once kept. Anyone can read
  it, with its shop offer and how many are left.
- **`/v/<voucher>`** is open to anyone. It shows "Real", the voucher card
  (`VoucherCard.svelte`: what you get, how many, passing it on, exchanged for,
  ends, your protection) and its QR code. It has the shop's own Buy.
- **`/v/new`**: sell a voucher. Say what it is (physical, digital or a
  service), what the buyer gets, how many, the licence, the price, whether it
  can be passed on, the resale limit and when it ends. It's signed, kept at
  the node and put in your shop.
- The shop links each voucher listing to its page.
- Checklists `voucher-new` and `voucher-page`.

**Not yet:**

- Pictures: the voucher names each picture by its hash. Until pictures are
  kept at the node, their words stand in for them.
- Issuing the copy and redeeming from the app (the core and rules are done).
- Buying across banks: a voucher priced in another bank's credits waits for
  treaties to trade.
