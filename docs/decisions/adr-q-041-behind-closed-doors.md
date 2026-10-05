# ADR-Q-041 — Behind closed doors: private conversations, closed sessions, sealed records

**Status:** proposed 5 October 2026, not yet built. It builds on federations,
plans and decisions (ADR-Q-007 §5–6), must and cannot (ADR-Q-008), messages and
calls (ADR-Q-004, ADR-Q-010), cards (ADR-Q-015), agreements (ADR-Q-025) and
acting in role, with conflicts of interest (ADR-Q-038 §6).

## Why

Darren, 5 October 2026, looking at his address book:

> "Is there a way to put a protection on a page where you can't screen grab or
> copy? … if there was a toggle to say private, which meant what we're talking
> about doesn't go anywhere, I need to know that you're not recording at your
> end."

And then:

> "I'm starting to see ways like local councils, you know, how we did conflicts
> of interest, where we did declarations of interest, where we have privacy,
> closed-door discussions … that you need to do at times to make a good
> decision. And then you make a decision and then you come back and you record
> the decision. It should record that it was behind closed doors, so that you
> know that's what happens in council. It goes on a different, like, sealed
> document, but it says it is, so you know it was."

Good decisions sometimes need a private room: personal matters, a
contract still being negotiated, legal advice, a safeguarding concern, a
member's conduct. English local councils have long worked this way. Under the
Local Government Act 1972 (s.100A and Schedule 12A), the public can be excluded
for "exempt information", but only by a resolution that says so and gives the
reason. The decision then comes back into the open.

The principle Q takes from it is this: **the content may be private; the fact
that it was private never is.**

## Decided (proposed)

### 1. A private conversation (two people)

In the address book, a conversation can be switched to **Private**. Because no
web page can stop a screenshot or a camera pointed at a screen, Private is an
agreement that's visible and accountable, not a promise of the impossible:

- **Both sign a private receipt** before it starts: not recorded, not kept,
  no AI listening, no transcription, no receptionist (ADR-Q-022).
- **Nothing is kept.** Messages are sealed, aren't saved to either vault, and
  are gone when the conversation ends. Calls go peer to peer only, never
  through a relay that stores anything.
- **Each side can see the other's protection.** "Sam is on the Q app with
  capture blocked" (Android can block screenshots and screen recording), or
  "Sam is in a browser: screenshots can't be prevented there". You know before
  you speak.
- **Captures are announced** wherever the device can tell (iPhone reports
  screenshots and screen recording): "Sam took a screenshot at 14:02", shown
  to both. Under a signed agreement, that's evidence it was broken.
- **In the browser, deterrents only**: no selecting or copying, blurred when
  the window loses focus, and a faint watermark of the viewer's DID.

### 2. A closed session (a body making a decision)

A board, committee or meeting of a federation can go **behind closed doors**
for an item. Doing so takes three things, all in the open record:

- **A resolution to close**, proposed and agreed like any decision
  (ADR-Q-007 §6), naming the item and **the reason, from a fixed list**:
  personal information about someone, commercial terms being negotiated,
  legal advice, safeguarding, a member's conduct, security. "We'd rather not
  say" isn't on the list.
- **Who is in the room**, by office (ADR-Q-037): "the board, the treasurer,
  the safeguarding lead". Not by name, and not anyone else.
- **A closed-session receipt** (`inqbeta.closed-session/1`), public, saying:
  this body went into closed session on this date, for this item, for this
  reason, with these offices present.

### 3. Declarations of interest come first

Before a closed item is discussed, everyone in the room **declares**: no
interest, an interest (said), or an interest that means they must leave.

- Each declaration is a receipt, and **the declarations are public**, even
  though the discussion isn't. You can see that the treasurer declared an
  interest and left the room.
- Someone who has declared an interest that requires leaving is **shut out by
  the engine**: they can't open the session's sealed record or vote on the
  item (ADR-Q-009, ADR-Q-038 §6).
- Not declaring, and being found later to have had an interest, is itself on
  the record: the declaration they did sign says "no interest".

### 4. Inside the room

What's said in closed session is sealed to those present, under the private
rules of §1: no recording beyond what the body decides to keep, no AI
listening unless the body's rules allow it, and captures announced.

The body chooses, in its rules or for the item, whether to keep a record:

- **Sealed minutes** (the default, as councils keep confidential minutes):
  written, signed by the chair in role, sealed to the offices that were
  present, with a **review date** when the seal is looked at again.
- **Nothing kept**: allowed only where the rules say so, and the closed-session
  receipt says "no minutes kept".

### 5. Back in the open: the decision

The decision itself is **always recorded in public**, as a `decision.outcome`
receipt like any other, with:

- what was decided, and the vote;
- **"decided after a closed session"**, linking to the closed-session receipt;
- the sealed minutes **by their fingerprint** (SHA-256), so everyone can see
  that a sealed record exists and that it hasn't changed, without reading it.

Anyone can see that it happened, why it was closed, who was there, who
declared what, what was decided and that a sealed record exists. Only the
discussion is hidden.

### 6. Opening the seal

A sealed record isn't sealed forever. It can be opened:

- **at its review date**, if the body agrees the reason no longer applies;
- **by a later resolution** of the body, in the open;
- **on a proper request**: an auditor, a regulator or an ombudsman, as the
  federation's rules name them.

Opening is a receipt, and the fingerprint proves the record opened is the one
that was sealed on the day.

### 7. What can never go behind closed doors

The charter (ADR-Q-008) says what must stay public, whatever a body resolves:

- the **fact** of any closed session, its reason and its declarations;
- every **decision**, and every vote count;
- **the accounts**: the mint's books and every spend from the federation's
  account (ADR-Q-035, ADR-Q-038 §8). How a price was negotiated can be closed;
  that the money was spent can't;
- anything that takes away a member's Layer A rights: leaving, keeping their
  receipts, being told why they were suspended or removed.

A body can't close a session to decide something the charter says must be
decided in the open.

## What this does not claim

- **That copying can be prevented.** A browser can't stop screenshots; an app
  can on Android and can only detect them on iPhone; nothing stops a second
  camera. The protection is the agreement and the evidence, not a wall.
- **That it meets council or freedom of information law.** The local council
  model is the inspiration. A real council, charity or company has its own
  legal duties around confidential business and disclosure, and needs advice.
- **That sealed means safe from every authority.** A body's rules name who can
  require a seal to be opened; the law may name others.

## Build order

1. **Private conversations** (§1), in the address book: the private receipt,
   nothing kept, the other side's protection shown, browser deterrents.
2. **Q as an app** for capture blocking (Android) and capture detection
   (iPhone), announced into the conversation. This shares the reason for an
   app with the festival's Bluetooth.
3. **Declarations of interest** as receipts, and the engine shutting out
   anyone who must leave. Needs Offices (ADR-Q-007).
4. **Closed sessions**: the resolution with its reason, the closed-session
   receipt, the room by office, sealed minutes with a review date.
5. **The decision back in the open**, carrying "after a closed session" and
   the sealed record's fingerprint.
6. **Opening a seal**: at review, by resolution, or on a named request.
7. **The charter's never-closed list** checked by the engine.

## Related

- ADR-Q-004: calls, peer to peer.
- ADR-Q-007: federations, plans, decisions, offices.
- ADR-Q-008: must and cannot; the charter.
- ADR-Q-009: the engine.
- ADR-Q-010: messages.
- ADR-Q-022: the receptionist (never in a private conversation).
- ADR-Q-035: the federation's bank; the accounts stay public.
- ADR-Q-037: ask the office; the room by office.
- ADR-Q-038: acting in role; conflicts of interest; the federation's account.
- ADR-Q-040: the day photo; shown, not given.
