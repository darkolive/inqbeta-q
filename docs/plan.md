---
updated: 2026-10-03
about: The working plan — every idea captured so far, in the order it gets built, and how each piece is done. Claude follows this; Darren adds to it.
---

# The plan — from 3 October 2026

Darren: "I'm going ideas all over the place … please compile into a way that
you can follow through and execute in the most efficient way."

This is that. **Ideas go in the inbox at the bottom as they come**; each one
is placed into a phase at the next pause. The order below is chosen so that
each piece makes the next one smaller: shared parts first, then what's built
on them.

## Where we are (3 October, evening)

Live on inqbeta.com and the node, all committed:

- **Agreements** (ADR-Q-025): offer, counter, accept, done, settle; both sign;
  balances only from settlements.
- **Offers by link and shops** (ADR-Q-026): open offers; standing offers with
  stock; each sale its own agreement; sold-out cancel; shops held at the gate.
- **Minting** (ADR-Q-027): credits made when value comes in, destroyed on cash
  out; test mode; publish once, signed.
- **Copies in order** (ADR-Q-028, steps 1–2): the relay (a pass-through, held
  and arrived receipts signed, daily totals for pricing).
- Share by **AirDrop**; phones fit; the bell counts only what's unread;
  Credits says plainly when it isn't on.

## Phase 0 — finish switching on (Darren, on the node and phone)

- [ ] `GATE_MINTS=<the mint's did:key>` (copy the line from localhost: Federations → your host → Services → Publish money) in `/srv/node/.env`, then
      `docker compose up -d --force-recreate gate`. Credits then shows Test
      mode and **Buy** works.
- [ ] Buy test credits as the test person; buy from your shop; settle it.
      The first real end-to-end sale.
- [ ] The phone: closing inqbeta.com tabs, or clearing its website data once
      its vault is backed up, so it runs the current Q.

## Phase 1 — component sets (ADR-Q-029)

Why first: everything after this (backups settings, hiring pass-through, the
balance sheet) would otherwise add more copies of things that already exist
three or four times. One set, written once, each use saying only its
exceptions.

1. ✅ **The exchange set** (built 3 October) — offer → answer → settle, read from the head.
   - q-core: one chain reader for any exchange, given its step rules (agreements'
     `standingOf` becomes the first set of rules).
   - Screens: `ExchangeCard`, `ExchangeNow` (only the buttons open to you),
     `ExchangeTimeline`.
   - Agreements and the shop move onto it; the rules engine unchanged.
2. ✅ **The writer set** — `StepWriter`: steps as data, one Next/Back, one
   read-back. The four writers move onto it (host set-up, backups, your card,
   the agreement writer).
3. ✅ **The share set** — one `Share` (AirDrop and more, email, WhatsApp, text,
   code to scan, copy), replacing `ShareLink`, `ShareLinks`, `ShareCard`.
4. ✅ **The sign-in set** (as one rule) — one `SignIn` that stays where you are by default,
   replacing the four.
5. Calls, link requests and federation invitations: **left as they are for now** — they
   run on different chains (live calls; UCAN delegations), so moving them
   would add work without removing copies. Revisit when they next change.

## Phase 2 — copies in order (ADR-Q-028, steps 3–7)

1. ✅ The five-minute sync hands the relay what the cloud couldn't take, and
   drains it into the cloud when it's back (custody receipts; nothing let go
   until it's held elsewhere).
2. ✅ **Your own bucket** (S3-compatible), as a full copy or a pass-through;
   keys sealed in the vault and the vault pointer.
3. ✅ **Settings → Backups**: schedules within what
   the host offers.
4. ✅ **The download**, offered when due.
5. **Opening from the newest copy** on a new device.

## Phase 3 — the price, from the flow

1. **Pass-through by the hour**: a node's open hours as a standing offer in its
   shop; Q picks an open one; paid from the custody receipts.
2. **Measure → cost → credit price → minting price** (ADR-Q-028 §5a): the
   relay's daily totals and node running costs give a cost per GB-hour; that
   sets credits' worth, and the host's pence per credit.

## Phase 4 — later, in rough order

- The balance sheet page, statement and club summary (ADR-Q-024).
- A lock on cash-outs before real money (two at once could both pass).
- Real payments and payouts after Publish; an accountant and a solicitor first.
- Federation mints and capital backing; treaties in agreements.
- Photo evidence on "done".
- Earlier themes not yet done: voice messages as MP3 and text; Directory
  Enquiries (ADR-Q-021); "Powered by Q" and Report a host (ADR-Q-019); the
  Marketplace listing real plugins; load-testing the node.

## How each piece is done

1. Rules and data first (q-core, q-actions), with tests.
2. Screens, using the component sets.
3. **Checked before it reaches Darren**: all tests; `svelte-check`; the real
   production build (as Vercel builds it); and **clicked through in a real
   browser at desktop and iPhone size**, signed in, with no page errors and
   nothing wider than the screen.
4. The ADR updated (and the project copy); a commit command for Darren.
5. Anything the node needs, written out as numbered steps.

Standing rules: neurodivergent simplicity first; Skeleton for all styling
(olive `#556B2F`, orange `#D16900`, thick-bordered fields, no placeholders);
Darren commits and pushes; secrets never in chat or git; payout details stay
on localhost; new localStorage keys go in `q-core/src/storage.ts`.

## Inbox — new ideas, not yet placed

(empty)
