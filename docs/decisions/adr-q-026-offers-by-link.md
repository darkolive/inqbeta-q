---
status: decided
implementation: built 3 October 2026 — offers by link (open offers, /offer/[id]); standing offers with a limit and the taken step (q-core standingOf, q-actions agreement.take); sold-out cancel; shops held at the storage gate (/shop/<did>, stock counted one at a time); /shop/[did] with Buy; Your shop on Agreements. Not yet: a shop on a federation's page, pictures on listings
updated: 2026-10-03
---

# ADR-Q-026 — Offers by link: share an offer like a card, and a shop is a page of offers

**Status: decided and built, 3 October 2026.** An offer (ADR-Q-025's first receipt)
can be shared the way a card is: by email, WhatsApp, a code, or through the
address book. Whoever opens the link sees the offer as a card and can accept,
counter or decline it, and the bellboy tells the offerer. An offer anyone can
take is a **standing offer**, and a shop's product page is just that.

## Context

Darren, 3 October 2026:

> "You create the first receipt by making an offer. And that offer can be
> shared with someone. So you can email them, you can send them through your
> address book, you can message WhatsApp them the link, all the same channels.
> But whoever receives the offer can open that link and see what the offer is,
> all of that card, and then either counter offer or accept or decline … pops
> up on the notification … it just gets bellboyed. A very simple system,
> self-deleting … For a shop, that is just a product page. That's your offer.
> As a viewer, I go on your shop … accept it. We have a contract."

Already built: cards shared by link (`cardlink.ts`, 2 October). The card waits,
**locked**, in the home federation's storage; the link is short,
`inqbeta.com/card/<id>#<key>`; the key sits in the `#fragment`, which no server
ever sees; the storage lets it go when it runs out. Agreements as chains of
receipts, with the rules in Cedar (ADR-Q-025).

## Decision (proposed)

### 1. Two kinds of offer

| | **To someone** | **To anyone (a standing offer)** |
|---|---|---|
| Who can take it | the one person it names | whoever opens the link |
| How many times | once | as many as it says (one, a number, or until withdrawn) |
| Example | "I'll cut your grass for 3 credits" | a product page: "Sourdough loaf, 4 credits"; a workshop place; a job to quote for |
| In the terms | `b` is their DID | `b` is empty until someone takes it |

### 2. Shared like a card

**Share** under an offer gives the same choices as a card: send to someone in
your address book (sealed, through the bellboy, as now), email, WhatsApp, copy
the link, or a QR code (Skeleton's QR code). The offer waits locked in the
storage, and the link is `inqbeta.com/offer/<id>#<key>`: the storage holds a box
it can't open. It is let go when the offer runs out (`until`) or is withdrawn,
which is the self-deleting part.

### 3. Opening the link

The person opening it sees the offer **as a card**: who's offering (their card,
as they chose to show it), what each side gives, when and where, and until
when. Then:

- **Not signed in?** "Make your passkey to answer": the same front door as a
  card link, then straight back to the offer.
- **Accept**, **Counteroffer** or **Decline**: each a receipt signed by them,
  sent to the offerer's inbox, and the offerer's bell rings. Accepting is the
  contract point (ADR-Q-025).
- Opening an offer also links the two of you up, as opening a card does, so
  the rest of the agreement flows through messages.

### 4. A standing offer: taking it starts a new agreement

Each person who takes a standing offer starts **their own agreement**, whose
first step names the standing offer by its hash:

```
standing offer   signed by the offerer, b empty, "up to 20"
   └── taken     signed by the taker: names themselves as b   → agreement 1 (agreed)
   └── taken     signed by another taker                       → agreement 2 (agreed)
```

`taken` is a new step: it is both the proposal (with the taker filled in) and
the acceptance, so there's a contract at once, with no back and forth, which is
what buying from a shop should feel like. The offerer's Q counts the takings
against the limit. A taking past the limit, or after withdrawal, doesn't hold,
and the rules refuse it (`agreement.take`).

### 5. A shop is a page of standing offers

A shop (on a site built with Q, or a federation's page) shows its standing
offers as product cards. "Buy" takes the offer. Settlement then works as
ADR-Q-025 says: credits from the buyer, the thing from the shop, both sign.
Stock, delivery and refunds are settlement and variations, not new machinery.

### 6. The rules

New cannots for `agreement.take`: take your own offer; take one that has run
out, been withdrawn, or reached its limit; take with terms other than the
offer's. A standing offer is otherwise held to every rule of
`agreement.propose`.

## Build order

1. **Offer links** for offers to someone: lock, drop, `/offer/<id>#<key>`, the
   offer card, Accept, Counteroffer, Decline from the link.
2. **Share** under an offer: address book, email, WhatsApp, copy, QR.
3. **Standing offers** and `taken`, with `agreement.take` in Cedar and tests.
4. **A shop**: a page of standing offers, on a site or a club's page.

## As built (3 October 2026)

- **A standing offer** is a `proposed` step with `b` empty and `limit` (how
  many). Answering it with `agreed`, `countered` or `declined` is refused:
  it is bought as it stands, or not.
- **A purchase** is a `taken` step signed by the buyer, in its own agreement
  whose id is the listing's id, a dot, and the buyer's own part
  (`jam.3f9a…`). Its parent is the listing's hash and its terms are the
  listing's with the buyer as `b`. The chain reads listing → taken, and is
  agreed at once.
- **Sold out:** the seller can cancel a purchase (`declined`) until any
  settling has begun; it ends as `sold-out` and goes back in stock.
- **The shop is held at the storage gate** (`/shop/<seller's id>`): the
  seller lists and withdraws; anyone else's purchase is checked against the
  listing's terms and the stock, one at a time per shop, so the last one
  can't be sold twice. The buyer's Q files the purchase at the gate *before*
  keeping it: if the gate says sold out, nothing is kept. The seller's name
  and inbox ride along with a listing, so purchases reach them through the
  bellboy. The gate is a convenience that counts; every signature is checked
  again in the buyer's browser.
- **In Q:** the writer has "My shop: anyone can buy it" with how many;
  `/shop/<id>` shows the shop with Buy; Agreements has a Your shop group;
  each listing shows its sales and what's left, and can be taken out of the
  shop.

## Non-claims

A shop on Q sells through agreements; it is not a payment processor, and
pounds are never moved by Q (ADR-Q-025). Consumer law (descriptions, returns,
distance selling) still applies to anyone selling as a business.

## Related

ADR-Q-015 (cards with a purpose; card links), ADR-Q-021 (Directory
Enquiries: offers as listings), ADR-Q-023 §7 (offers as listings), ADR-Q-025
(agreements).
