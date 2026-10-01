---
status: proposed
implementation: started (profile, templates, CardFace, tabs, building blocks, share by ticking — 1 October 2026)
updated: 2026-10-01
---

# ADR-Q-015 — Cards with a purpose, and quiet updates

**Status: proposed, 1 October 2026.** It builds on ADR-Q-002 §4 (a card names
details, never copies them) and its 1 October addendum (one profile, "just for
me"). It narrows what cards are *for*.

## Context

Darren, 1 October:

- "The card is capturing in a visual way for a human the data that is the
  receipt."
- "When I receive a message from someone, I want to see their profile … their
  cover … their name … make a phone call, video call … So I can just pick up
  and talk to them."
- "When you send a message, you're using that card, the contact card, and
  choosing which bits to have in it and what your message block is."
- "The idea of just endlessly creating cards gets out of control … the noise
  of being in a nightclub where there were just so many flyers, you go blind to
  them. So I think they have to have a purpose."
- "Every update that we do of a card, that's a new receipt … Everyone who has
  your address will get a notification … How can we make that simplified?"

## Decision (proposed)

### 1. A card is the human face of a receipt

Wherever a receipt involves a person, Q draws their card, not their data: the
cover behind, the picture in front, the name, then what matters for that
receipt. The raw record is always there "for investigating", folded away
(ADR-Q-014's `ReceivedView` is the first example).

### 2. Four kinds, each with a purpose, and no others

| Card | Purpose | Made by | Shows |
|---|---|---|---|
| **Personal** | You, to the people in your life | You, from your profile | Picture, cover, name, where you live now if you choose, how to call you |
| **Business** | You at work | You, from your profile | Picture, cover, name, what you do, who for, your page, how to reach you |
| **Membership** | Your place in a federation | The federation; kept in your vault | Who and since when, standing, when it runs out, what they hold on you, what they can never have, Leave |
| **Agreement** | What two people have agreed | Both, signed by both | Both faces, what each must and cannot do (ADR-Q-008), dates, status |

- **Your profile** stays the private whole you edit (ADR-Q-002 addendum). It
  isn't a card anyone holds.
- **Your notifications card** is the other private one: what reaches you, from
  whom, and whether it rings (ADR-Q-016 §6). Nobody else ever holds it.
- **No blank or free-form cards.** Templates become the two you make
  (Personal, Business); membership and agreement cards come from the receipts
  they draw. "Basic", "Friends" and "Contact" fold into Personal; "Business"
  stays.
- **Just for me** still wins over every card (`cardView`).

### 3. A message carries your card

- Sending a message, you choose a face (Personal or Business), tick which of
  its details ride along this once (where you are now, say), and write the
  message block.
- The recipient sees **you**: your picture, cover and name, the message, and
  **Call** and **Video** buttons (ADR-Q-004) when your card carries a way to
  reach you.
- It goes through the bellboy and storage unit exactly as ADR-Q-014 describes.
  The face rides inside the sealed receipt; nobody in between sees it.

### 4. Card updates are quiet

The bell is for things that need you: a message, an invitation, a call, a
decision. A card changing is housekeeping.

- **One notice per holder per sitting.** Change five details and save, and each
  holder gets one notice, of kind `card.updated`, not five.
- **Their Q applies it without a bell.** Your entry in their address book just
  becomes current. A card names details, so the notice only says "my card
  changed"; their Q fetches the current face when it applies it.
- **At most one calm line**, never a count on the bell: "4 people updated their
  cards". Clicking it opens the address book with them marked. It can be
  switched off.

### 5. A membership card is drawn from what's already kept

Everything it shows is in your vault from joining (ADR-Q-007): the founding and
manifest (name, purpose, the agreement), your joining (when, how you're known),
your standing (`standingAt`: member, suspended, left, removed), the card you
gave them, and the principles no vote can remove. "When it runs out" is the
end date for event federations (`endsOn`) and otherwise "while you choose to
stay". It needs no new receipt, only a face.

## Addendum, later on 1 October: tabs, building blocks, sharing by ticking

Darren: "first tab is your profile or key identity … membership cards …
business cards … still be able to make a new card with different questions on
it … like the building blocks: is it a date, a number, a text, a text box, an
image … you start with one row … press add … and whether it's visible …
when you share, you can send an invite to someone to be your friend and tick
box which of those pieces of information you want to share with that person."

This revises §2's "no blank or free-form cards":

- **Revised the same evening**, after Darren tried it ("way too much … go
  into personal card and have the very basic form first, and then the next
  stage"): there is **no profile form**. The Cards page is tabs: Personal ·
  Business · Your own · Memberships · Notifications.
- **The Personal card is made in four steps** (Skeleton Steps), a few
  questions each: **You** (first name, last name, date of birth, photo, cover),
  **Contact** (email, phone, WhatsApp, home address), **Work** (businesses,
  added one at a time, or skipped), **Your card** (a switch per detail, with
  the card beside it). Each Next keeps what's written. Your profile is what
  these steps build.
- **Business cards** come from the work step: one card per business
  (`q:biz/<slug>/…` details), with the same switches.
- **Building blocks** stay only in "Your own" cards: start with one row,
  add rows, each an existing detail or something new (words, a few lines, a
  date, a number, yes or no, a web address, a picture).
- **Built-by-you cards** keep a purpose by being named for one ("Allotment
  society", "Band"); there is still no card that isn't drawn from your profile.
- **Sharing is per person.** Share opens a list of what may go (never anything
  just for you), ticked for that card or, from your profile, your name and
  picture only. You untick or tick, see exactly what they'll get, then send
  the link by email, WhatsApp, copy or QR.
- **Underneath:** a newer version of a question set now replaces the older
  one by name (`newestPerSet` groups by `setId`), because your profile's set
  changes every time you add a detail and an older version must not keep
  showing a detail you've cleared.

## Build order

1. **Membership cards**, drawn from memberships and federations you look after.
2. **Templates narrowed** to Personal and Business.
3. **A message carries your card**: choose a face and details, write, send;
   the recipient sees you, with Call and Video.
4. **Quiet card updates** through the bellboy, and the one calm line.
5. **Giving a card** to a person (the UCAN step, ADR-Q-002 §4).
6. **Agreement cards**: two faces, musts and cannots, two signatures.

## Non-claims

This does **not**:

- decide how "where you live now" is shared (a town, a pin, live location);
  it's a detail you choose per message, nothing more yet;
- decide the address book's layout beyond "people, drawn as cards";
- describe agreements in detail; ADR-Q-008's musts and cannots are the start.

## Related

ADR-Q-002 §4 and addendum, ADR-Q-004 (calls), ADR-Q-007 (federations and
membership), ADR-Q-008 (must and cannot), ADR-Q-010 and ADR-Q-014 (bellboy,
storage unit, the bell).
