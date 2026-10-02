---
status: proposed
implementation: started — Part A build steps 1–2 and saving a copy, 2 October 2026 (lib/voicemail.ts, routes/call, messages)
updated: 2026-10-02
---

# ADR-Q-022 — Voice messages, and the receptionist

**Status: proposed, 2 October 2026.** Two things that start in the same
place, a call nobody answered, and are kept apart on purpose: one is a
person's message, the other is a business service.

## Context

Darren, 2 October, after calling someone whose Q wasn't open:

> "If someone doesn't answer … you could leave a message, which becomes an
> MP3 that goes in the storage for them to pick up later … Or also the
> ability to put in an AI agent and have an AI receptionist handle the call
> and divert it … another kind of service to offer business."

> "The agent answering is a business service. And so when you are calling a
> business card, there is a … made aware that you make this call, you will be
> first talking to an AI receptionist, who is there to help and guide you in
> your inquiry. So that's okay. And that's a particular business feature."

The call screen's promise (CallStory, scene 5) is **only the two of you can
hear**. Voice messages keep it untouched. The receptionist keeps it by being
the business itself, and by saying so before anyone speaks.

## Decision (proposed)

### Part A — Voice messages: for everyone

1. **When a call isn't answered** (no answer, or they press Not now), Q offers
   **Leave a message** beside Try again and Send a message.
2. **Recorded in the browser**, as Opus audio (what browsers record by
   themselves: small and clear for voice; AAC on Safari). Up to 2 minutes at a
   voice bitrate, so the sealed post stays under the storage's 1 MB limit.
   Listen back, record again, or Send.
3. **Sent like any message** (ADR-Q-010, ADR-Q-014): sealed to them, put in
   storage, and the bellboy rings with a notice of kind `voicemail`: who it's
   from and how long, opened on their device.
4. **They tap it, Q collects and checks it, and it plays.** Both keep a signed
   copy. It joins the call's record: Your calls shows **Missed · left a
   message** with a play button. It also appears in the conversation with
   that person.
5. **MP3 on request.** Anyone can save a copy; today in the format it was
   recorded in, MP3 later. Q doesn't send MP3.
6. **Read aloud's other half** (ADR-Q-011): a voice message can be shown as
   text on the listener's own device, never on a server, for people who'd
   rather read.
7. Storage it uses counts towards the club's allowance, then credits
   (ADR-Q-020 §3), like any other sealed thing waiting.

### Part B — The receptionist: a business feature

1. **Only on a business card** (ADR-Q-015). Personal cards never have one.
2. **It is the business answering.** The receptionist has its own identity,
   signed by the business, acting for it under a permission the business can
   withdraw at any time. It isn't a third party listening in. So "only the two
   of you can hear" still holds: you and the business.
3. **You're told before you call.** On the business card, by the Call button:
   *"You'll speak first with Green Space's AI receptionist, here to help and
   guide your enquiry."* When it answers it says so again. You can choose
   **Leave a voice message** instead, or hang up; nothing is held against you.
4. **What it can do**, chosen by the business: take a message; answer from
   what the business has published (its card, opening times, offers, FAQs);
   book a time; or **put the call through** to a person who's free. Never more
   than the business allows it.
5. **The record says so.** The call's receipts show the receptionist took the
   call, and who it was put through to. Any summary or transcript is the
   business's record **and the caller's**: both get a signed copy, and the
   caller is told one is being kept.
6. **Keys and credits** follow ADR-Q-013: the business's own AI key, or the
   host's, paid in credits. It's a paid service a host can offer, beside
   storage and the switchboard.

## Build order

1. **Leave a message** after an unanswered call: record, listen, send. *(Built.)*
2. **The `voicemail` notice**, collect and play; Your calls shows it. *(Built.)*
3. **Save as MP3**; shown as text on the listener's device.
4. **The receptionist's notice on business cards** (the words, before Call).
5. **The receptionist**: identity and permission from the business; take a
   message; answer from published facts.
6. **Put through**, and booking.

## Non-claims

This does **not** choose the AI model or provider, set prices, or decide
recording-consent law for each country. Before the receptionist takes real
calls, what callers must be told, and how long transcripts are kept, needs
checking against UK and EU rules (and any other country a business serves).

## Related

ADR-Q-004 (calls), ADR-Q-010 (messages), ADR-Q-011 (read aloud), ADR-Q-013
(AI keys and credits), ADR-Q-014 (bellboy and storage), ADR-Q-015 (cards with
a purpose), ADR-Q-020 (credits), CallStory.
