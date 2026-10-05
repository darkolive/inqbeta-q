# ADR-Q-040 — The day photo: seen at the gate, shown not given

**Status:** proposed 5 October 2026, not yet built. It builds on federations
and event federations with an end date (ADR-Q-007, `endsOn`), cards with a
purpose (ADR-Q-015), offers by link (ADR-Q-026), agreements (ADR-Q-025) and
scanning in at the door (ADR-Q-039 §5).

## Why

Darren, 5 October 2026:

> "I turn up at a festival, I have a ticket, here's my barcode. And in order to
> enter, I take a photo of myself, which is what I look like right then, at
> that time, assigned to the event. And that gets stored only on my vault,
> nowhere else. That's the rule."

> "If you're on your phone and you QR code scan someone else's phone to share
> details … the very first thing that comes up from that receipt is the picture
> of them that they have of themselves that day. You can confirm that."

> "It's part of the membership rules. You're happy to be identified. You're not
> hiding behind a mask in person, not when there's people's safety at risk."

> "When you share an address, you don't share that photo … you share whatever
> your personal address card is … maybe from then on, you can say, can I keep
> that as your memory card of the festival?"

At a festival, people need to know who they're dealing with: stewards, people
you've just met, someone you're handing a child or a bag to. Today that means
wristbands, lanyards and ID checks, and it puts a lot of effort on everyone.
A profile picture doesn't help, because it can be years old or someone else.
What helps is **what you look like today, seen by someone the event trusts.**

## Decided (proposed)

### 1. The day photo is a receipt, kept only in your vault

At the gate you scan your ticket, then take a photo of yourself. It becomes a
**day photo** receipt (`inqbeta.dayphoto/1`) that names:

- you (DID) and the event (federation ID);
- when and where it was taken (the gate);
- the photo's fingerprint (SHA-256 of the image).

**The photo is kept in your vault and nowhere else.** That's the rule, written
into the event's manifest. The festival, the storage unit and the people you
meet never get a copy to keep.

### 2. Being recognisable is a membership rule

Joining an event federation already means agreeing to its manifest
(ADR-Q-007). An event can add one more rule: **"While you're here, people can
see what you look like today."** You see it before you buy the ticket, and
agreeing is part of joining. Nobody is asked again at the gate, and there's
nothing to argue about when people's safety is at stake.

The rule names who can see your day photo (§5) and that it ends when the event
ends (§7).

### 3. The gate is the witness

A photo alone proves nothing: anyone can show a flattering one from years ago.
So at the gate **a steward looks at you and at the photo**, and the festival
signs a **seen at the gate** receipt:

- the day photo's fingerprint, not the photo;
- "matched the person in front of us", with the time and the gate;
- who signed, under which mandate (a steward in role, ADR-Q-038).

The festival keeps this receipt, and so do you. Anyone shown your day photo
can check that its fingerprint is one the gate signed today, the same way a
coin is checked (ADR-Q-035). **The festival vouches for the photo without ever
holding it.**

Scanning in at the gate is the same step as ADR-Q-039 §5: a ticket instead of
an engagement, and an in receipt at the gate.

### 4. When two people scan each other, the face comes first

You bump into someone and scan each other's QR codes. **The first thing that
comes up is their day photo**, marked "seen at the gate today, 14:02". You can
look up and confirm that's who's in front of you before anything else
happens.

It's the face of a receipt (ADR-Q-015 §1), with the evidence folded beneath:
the event, the gate's signature, the time.

### 5. Shown, not given

The day photo is **shown, not handed over**:

- it loads from a locked link held in the event's storage (as card links and
  offer links already work, ADR-Q-026 §2), with the key in the `#fragment`;
- it is drawn on screen, not saved to the viewer's address book or vault;
- the link stops working when the event ends, and the storage lets it go.

Who can open it is set in the event's rule (§2). The default:

- **Stewards and staff in role** can see any attendee's day photo, because
  safety is their job.
- **Attendees** see the day photo of someone they've scanned, or who scanned
  them.
- Nobody can browse a gallery of attendees.

A screenshot can't be prevented. The design keeps the honest path easy and
copying a deliberate act, and nothing is left behind on anyone's device by
default.

### 6. Your address card is what they keep

Swapping details works as it does now: you tick which details of your
Personal card go to them (ADR-Q-015, sharing by ticking). **The day photo
isn't one of them.** They keep your card; the face from the field fades
when the event does.

### 7. When the event ends

On the event's end date (`endsOn`):

- every day photo link closes, and the storage lets the boxes go;
- you still have your own day photo in your vault, as your own record of being
  there;
- the festival keeps the fingerprints and the "seen at the gate" receipts. It
  can prove who came in and when, but it **never builds a collection of
  faces**.

### 8. "Can I keep that?" The memory card

If you'd like to keep someone's day photo, as a memory of meeting them at the
festival, you ask. That's an **offer** (ADR-Q-026) to them: "keep your day
photo from this year's festival". If they accept, it's a small agreement
(ADR-Q-025), and the photo goes to you as a **memory card**, sealed, in your
vault. They can see that you hold it. If they decline, or don't answer before
the event ends, nothing is kept.

## When someone can't, or won't, be photographed

The rule must have a dignified alternative, not a turned-away person:

- **Faces that are covered**, for religious or other reasons: a photo of them
  as they present, or a check in a private space by a steward they choose.
- **People in safeguarding situations**, or who must not be photographed: they
  are checked in person by a named steward, who signs a "seen at the gate"
  receipt with no photo. Their scan shows "checked in person by the gate".
- **Children**: their day photo goes into the vault of the parent or guardian
  who brought them, is visible to stewards only, and is linked to that adult's
  day photo, so a steward can see who they arrived with.

Each alternative is its own kind in the receipt, so nobody can tell from it
why a person was checked differently.

## What this does not claim

- **Facial recognition.** Nothing here matches faces by machine. A person
  looks, and a person signs.
- **Identity.** The day photo proves "this person came in through our gate
  today with this ticket", not a legal name. It's not ID.
- **Preventing copies.** A viewer can photograph a screen. The design keeps
  that rare and deliberate; it can't stop it.
- **Data protection.** A photo of a face is personal data, and biometric if
  ever matched by machine (which this doesn't do). A real event needs a data
  protection review, and its own policy for stewards.
- **Safety in itself.** It helps people know who's who. It doesn't replace
  stewarding, welfare teams or the police.

## Build order

1. **The rule in the manifest**: an event federation can say "attendees are
   recognisable while here", and who can see day photos.
2. **The day photo receipt**: taken at the gate after the ticket scan, kept in
   your vault, fingerprinted.
3. **Seen at the gate**: the steward's check and the festival's signature on
   the fingerprint; checkable like a coin.
4. **Face first on scan**: swapping QR codes shows the day photo, from a
   locked link that runs out on `endsOn`, before any card.
5. **Alternatives**: checked in person; children linked to their adult.
6. **The memory card**: asking to keep it, as an offer and agreement.

## Related

- ADR-Q-002 §4: a card names details, never copies them.
- ADR-Q-007: federations, membership rules, event federations and `endsOn`.
- ADR-Q-015: cards with a purpose; a card is the face of a receipt.
- ADR-Q-025: agreements.
- ADR-Q-026: offers by link; locked links that let go.
- ADR-Q-035: checking a signature like a coin.
- ADR-Q-038: acting in role (stewards).
- ADR-Q-039 §5: scanning in at the door.
