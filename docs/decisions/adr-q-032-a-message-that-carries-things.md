---
status: accepted
implementation: step 1 built 4 October 2026 — the message card (lib/components/message/Composer.svelte), what it carries (q-core attachments.ts; lib/attachments.ts), files in pieces, several people at once. Proved between two people on a test host: two pictures, a 3.5 MB file in 4 pieces (saved byte-identical), a link, a place, a card, and a reply with a picture. Not yet: an offer, an invite.
updated: 2026-10-04
---

# ADR-Q-032 — A message that carries things

**Status: accepted, 4 October 2026.** Darren: "Sending a message should be
the first thing, and then who to comes after … in the send-a-message card,
add a file, add a picture … a link … think about it from a design point so
it's really enjoyable."

## Decisions

1. **The message first, then who it's for.** The message card is the first
   thing on Messages. Step 1: your words, and what you add. Step 2: faces
   from your address book; tap as many as you like. In a conversation the
   person is already known, so it is one step.
2. **Several people at once** (Darren's choice). Each gets their own sealed
   copy, its own receipt; the message says who else it went to (`alsoTo`).
3. **What it can carry**, each a big picture to tap, one word each:
   - **Picture**: shrunk in the browser (longest side 1600 px, JPEG) so it
     travels quickly; shown in the conversation, open big, Save.
   - **File**: anything up to **20 MB** (Darren's choice). Up to 600 KB rides
     inside the message; bigger goes in pieces of 900 KB, each its own sealed
     post, sent first, kept under `pieces` until the last arrives, joined and
     checked against the file's SHA-256, then kept under `files` in the vault.
     Pieces that don't add up, or don't match, are never joined.
   - **Link**: an address and an optional title. Only web addresses
     (http/https). Q never fetches it for a preview: the site would learn
     who's looking.
   - **Voice note**: up to two minutes, as voice messages are.
   - **A card**: your own, or a friend's passed on; the receiver can **Add**
     it to their address book.
   - **A place**: "Use where I am" (a pin) and/or words; opens on
     OpenStreetMap. Only what the sender adds is shared.
   - Next: **an offer** (an agreement's first step, accept/counter/decline)
     and **an invite** (what, when, where; going / can't go).
4. **Shown the way it arrives.** What you add sits in the card as it will be
   seen; pictures as a grid (Skeleton image layouts), the rest as cards.
5. **Free to give, never free to take.** Everything counts against the node's
   free daily allowance (the gate's `sendBytesPerDay`, 50 MB); the card says
   how much it is. Beyond the allowance is for credits (ADR-Q-017), not yet.
6. **The gate is unchanged.** Pieces are ordinary inbox posts (2 MB each at
   most); the inbox holds 25 MB, so a 20 MB file fits while it waits.

## Consequences

- Received files live in the vault, so they are backed up and kept like
  everything else (clouds, kept storage).
- The message story now reads write first, then choose who (all six
  languages); the English step 1 words changed, so its read-aloud recording
  needs making again.
