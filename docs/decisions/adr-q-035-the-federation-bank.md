# ADR-Q-035 — The federation's bank, and your statement with it

**Status:** decided 5 October 2026. The statement page, the activity magnifier, the
health battery, "Ask the federation" and the coin with its verify page are built; live-photo proof and the coin
console are not yet built.

## Why

Darren, 5 October 2026, looking at the finished Credits page:

> "Because we've got money, credits, flow, we are basically looking at the
> Federation host behind this mint should be considered a bank. Not in the
> legislation terms, but in the ancient terms of it is a holding house and can
> issue its promissory notes just like in the Drover days."

The drovers' banks of the eighteenth century were exactly that. A drover walked
cattle to market in London and sold them. Rather than carry the money home along
roads full of highwaymen, he left it with a trusted house and carried its note
instead. The note was only as good as the house's name, and the house's name was
only as good as its books. That is the model Q follows here.

## What a federation's bank is

1. **A holding house.** The federation (its host) holds the pounds that come
   in, and the reserves and capital behind them (ADR-Q-027).
2. **It issues its own notes.** The credits its mint makes are its promissory
   notes. Each one is backed by value that came in, and each is destroyed when it is
   cashed out, so the books always reconcile.
3. **Its reputation is its books.** It has no brand or adverts to stand on, only
   the record. Every move is double entry, and every move is a receipt signed by
   someone and checked by the rules when it was made. Anyone holding the receipts
   can add the books up again and get the same answer.
4. **Fully accountable, fully anonymous.** Accounts are DIDs, not names. Nothing
   on a receipt identifies a person unless they chose to put it there. The
   evidence is complete, and the identity stays private.
5. **Not a bank in law.** This is the old meaning, a house that holds and issues
   notes, not a regulated deposit-taker. Q records pounds in and out and never
   moves them itself (ADR-Q-027 non-claims).

## Decided

### 1. The Credits page is your statement with the bank

It's a statement between two parties: **you** (your DID) and **the federation**
(its federation ID), with **its bank**, the mint's DID, named beside them. That
pairing sits at the top of the page, because it says what everything below it
is: your account with this house, and nobody else's.

Top to bottom:

- **Who it's between**: you, the federation and its mint, each by ID, with
  **Ask the federation**.
- **Test or live**, said plainly.
- **Your credits, one credit, face value**: one row.
- **Your credits in and out**: the received and spent curves, with
  committed as a filled amber band on top of spent (a skin that grows and
  shrinks with your commitments). They're read by the clock like a share chart,
  over 1 hour, 4 hours, 24 hours, a week, a month, 3 months, a year or all. Each
  window is zoomed to its own figures, and the cards above show what that window
  holds.
- **Buy credits**, and **Cash out** with the battery.
- **The mint's books**: the backing picture and the reconciling figures, for
  reassurance (`MintBooks`, also on the federation's home page).
- **Your activity**: every move, newest first: bought, cashed out, received
  or spent in an agreement.

### 2. Every line of activity opens its receipt

Each line of your activity has a **magnifier** that opens the receipt behind it
in the drawer (`ReceiptDrawer`, the same read-only card as Receipts and the
activity feed). A statement line you can't open is only a claim; one you can open
is evidence.

### 3. Ask the federation

Under who the statement is between there's **Ask {federation}**. It opens a
conversation with the federation's founder (for a club, perhaps its treasurer)
about something you've found. This is compliance in its plainest form: you can
always seek reassurance from a person who can answer for the books. If you aren't
linked with them yet, their page says how.

### 4. Health is "enough", not "more"

The battery (`Battery` in `@inqbeta/q-ui`, with `enoughLevel`) is Q's core health
indicator. Darren: "It represents the truth of the person. It's not about a
comparison of wealth. It's about having enough."

- It's empty when what you hold equals what's committed, and full at twice that.
- Its colour runs from green to orange to red, with red for the last two cells.

A bank that shows you *enough*, not a league table, is the opposite of a
wealth display.

### 5. Every coin carries its own check

Every minted credit shows as a **gold coin with its QR code in black**
(`Coin.svelte`). The code opens **/verify/<mint>** on the host that minted it.
That page is open to anyone, signed in or not, and keeps two questions apart,
like DoStudy's verify page on the Dark Olive site:

- **Is this a coin this house really minted?** The mint's DID on the coin is
  matched against the house's own mint, along with whether it's live or test and
  its published ID.
- **Does the house hold up?** Its reserves and books (`MintBooks`), read live from
  the mint just now, and one coin's price.

The page then says **who stands behind it**: the federation, its purpose and
its founder.

Darren: "you see a coin, you can scan it, and you can verify it straight away as
being a legitimate minted coin and the state of its reserves and reputation."
The coin sits at the left of your statement, and anywhere else a coin is shown.

### 6. Credits is the coins you hold; each coin has a name

**Credits** (`/balance`) lists the coins you hold, each with its coin, its name,
what you hold, its face value and its battery. Opening one gives its
**statement** (`/balance/<mint>`). The statement has a breadcrumb back to
Credits, and its top card carries the coin's name, its banking details (you,
the federation and its bank, each by DID), the coin and "Scan to check". For
now Q reads one bank, your host's. The list is there for the coin console to
grow into.

**A bank names its coin.** Darren: "when a bank creates a coin, it should
give it a name … that then can give it some real fun ideas." In test mode the
name is `Q_COIN_NAME` in Money. On publishing it's signed into the publication
(`coinName`), so a live coin's name is part of its published record. Until it
has one, it's called "<federation> credit".

**A bank designs its coin** (`CoinDesigner`, in the federation's console under
Money). It chooses a shape (circle, square, hexagon, shield, skull and crossbones,
or its own picture, such as its logo in SVG, PNG, WebP or JPEG), the coin's
colour, the code's colour, what's behind the code, and a mark in the middle. A
picture with a shape is laid inside it. The code always stays a standard, scannable
QR code; with a mark it uses the strongest error correction. The design is
`Q_COIN_DESIGN`, signed into the publication with the name, and the picture is
kept beside the logo in `static/host/`. The design has a **fingerprint**
(`coinDesignFingerprint`), which is what a register of coins could hold one day to
keep a coin's look unique: a check, then registration. That register isn't
built; the fingerprint means it can be.

### 7. Last reconciled: signed, dated, and coloured by age

The bank's books are **reconciled** when its treasurer (the house's founder)
asks and the mint adds them up and signs them, as a receipt
(`inqbeta.mint-reconciled/1`). The receipt holds the books as they stood, how
many of the bank's receipts it covers, who asked, and when. The ask and the
reconciliation both go into the bank's ledger, and the node accepts both.

Every coin's statement, and its check, shows **Last reconciled**: how long ago,
who asked, how much has moved in the books since, and the signed receipt. Its
colour runs from **green within a day**, through orange, to **red at thirty days
or more**, or if it has never been reconciled. Darren: "if there's been a lot of
history between last reconciliation and now … that's a bit worrying." The
treasurer sees **Reconcile now**; everyone else sees how recently it was done.

### 8. Cashing out pays a standing order, never a new account

Cashing out pays only to your **cashing-out account**, set in Settings. Darren:
"it's not a case of a card being stolen. Someone has to physically change the bank
account details … so that's all traceable."

- The account is a receipt you sign (`inqbeta.payout-account/1`). Only its last
  four digits are kept to show, and the full details are kept as a fingerprint.
- Changing it is a new receipt naming the one it replaces, so every change, and
  who made it, is on record.
- A cash-out ask names the account by its receipt, and the mint refuses an ask
  without one. The burn records the account, and the payout is the day's
  standing order (a test reference until payouts are connected).

### 9. Proof without exposure (not yet built)

The same receipts can carry evidence that something was really done by a
person, without saying who they are to anyone else.

- **A live photo at signing.** Take a photo from your laptop or phone as you
  sign, sealed into the receipt. It's encrypted and invisible to anyone without
  the key. The evidence is there if it's ever needed: this person, at this time,
  signed this.
- **Address-book cards as evidence.** The card you exchanged with someone
  (ADR-Q-015) can confirm "this is the person I agreed with", in many small
  ways.

These are proofs held by the parties, not identity checks run by the bank.

## What this does not claim

- That a federation is a bank in law, or that credits are deposits.
- That anonymity means unaccountability. The record is complete; only the
  identity is private.
- That Q moves money. It records pounds in and out; payment providers move
  them.

## Next

- **Live-photo proof at signing**: a sealed photo field on a receipt, taken
  in the moment.
- **The coin console** (see `credits-home-brief`): every coin you hold, a
  statement for each, and each mint's health drawn as pictures.
- **Download a statement**: the window you're looking at, with its receipts,
  as one file you can keep or show someone.
- **The bank's own statement page**, for the treasurer: the same view from the
  mint's side, every holder by DID.

## Related

- ADR-Q-023: credits, rewards and the exchange.
- ADR-Q-024: the balance sheet.
- ADR-Q-025: agreements.
- ADR-Q-027: minting against reserves.
- ADR-Q-030: the network market.
- `credits-home-brief`: the console for every coin you hold.
