---
updated: 2026-10-05
about: The brief for building the door (ADR-Q-034): locking inqbeta.com to Darren and tester passes while in test, and making inqbeta.dev a playground. It covers what to read, what exists, the questions to settle first, the build order and how to prove it. Read first in the thread that builds it.
---

# The door: a brief for a new thread

## Focus

Build **ADR-Q-034, the door and the playground**, end to end:

- **inqbeta.com** answers only Darren (his root), keys linked to his root, and
  people he's given a **tester pass**, for as long as the host is in test.
- **inqbeta.dev** is a playground in the browser, where nothing real is used.

This is the first time every server door asks **who may act**. Offices and
in-role receipts (ADR-Q-007, ADR-Q-038) come next and use the same check, so
build it as the pattern they'll follow.

## Why now

It's the one real risk today: anyone who makes a passkey on inqbeta.com can
buy test credits, take storage on the Hetzner node and use the bellboy (audit
A1, `handover-2026-10-05.md`). It's decided and depends on nothing. The
decision, and why it comes before Offices, is in that handover under
"Decision: what's next".

## Read first

1. `docs/decisions/adr-q-034-the-door-and-the-playground.md`: the decision.
2. `docs/q/handover-2026-10-05.md`: where things stand, the audit, the order.
3. `packages/q-core/src/links.ts`: `checkLink`, how a key is proved to belong
   to Darren's root.
4. `node/gate/server.mjs`: `signedReceipt`, `GATE_OPERATORS`, `GATE_MINTS`,
   and the routes (drop, inbox, ledger, shop, relay, store, health, terms).
5. `apps/q/src/routes/api/mint/+server.ts`: GET, and POST for buy, cashout,
   file and reconcile.

## What already exists

- **A root and its links.** Darren's localhost key is the root; his
  inqbeta.com passkey is linked to it by a signed link (`links.ts`:
  `requestLink`, `approveLink`, `checkLink`, `unlinkKey`). `checkLink` works
  offline.
- **The host file** (`static/incubator.json`) names the federation and,
  through its invitation, the founder (the root).
- **Signed requests everywhere money or storage moves.** The mint checks
  signed asks; the gate checks `signedReceipt` and its operator and mint lists.
- **The mint's mode**, `test` or `live`; MoneyPublish turns it live. That same
  switch is what lifts the lock.
- **`TestSiteNote`** already marks inqbeta.dev.

## Found while writing this brief (check before building)

- **The bell's sign-in is still the development stand-in.** `lib/bellboy.ts`
  signs in to the bellboy with an inbox name and password from
  `PUBLIC_BELLBOY_*` settings, and seals notices with a shared test key. Any
  `PUBLIC_` setting is sent to every browser, so if these are set on the live
  site, anyone can read them. **First job:** check what the live site and the
  node actually use. If it's the stand-in, the bellboy can't be locked by DID
  until DID sign-in to it (ADR-Q-010 §5) is built. Say so plainly and do the
  other doors first. Messages themselves use proper sealing (`sealTo` in
  `messages.ts`).
- **`/api/notifications` has no check at all.** Anyone can read or add
  notifications for any DID by putting it in the address. It's held in memory,
  so it mostly vanishes, but it should either check a signed request or be
  removed in favour of the bell.

## Settled (Darren, 5 October)

**Later that evening:** the playground became the development site (see
step 7), so the playground limits no longer apply.

He agreed all four recommendations: the pass list lives on the Incubator's
own storage (the gate), "whatever it ends up using; we can always change";
reading stays open and acting needs to be let in; passes last 30 days by
default, named only on localhost; the playground has 1,000 play credits and
20 MB.

## The questions as they were asked

1. **Where the pass list lives.** The ADR leans to the gate (no redeploy for
   each change). The mint runs on Vercel, not the node, so it must read the
   same list: from the gate, cached for a minute. Recommend the gate.
2. **What stays open while locked.** Recommend that reading stays open and
   acting needs to be let in. Open: the front door, the stories, `/verify/`
   and coin checks (GET `/api/mint`), opening a card or offer link someone
   sent you, gate `/health` and `/terms`. Locked: buying, cashing out,
   filing, reconciling, taking or hiring storage, the relay, the store,
   leaving drops, inboxes, the bellboy.
3. **How long a pass lasts by default**, and whether Darren names people
   ("Theo") or only sees a DID. Recommend 30 days, with the name kept only on
   his localhost.
4. **The playground's limits**: how many play credits, how many files.
   Recommend 1,000 play credits and 20 MB in all.

## Build order (ADR-Q-034, made concrete)

1. **q-core `door.ts`**: `isLetIn(did, { root, links, passes, mode, now })`,
   which returns `{ in: true, as: 'root' | 'linked' | 'pass' }` or
   `{ in: false, says }`. Also `TESTER_PASS_SCHEMA` (`inqbeta.tester-pass/1`),
   `makePass`, `revokePass` and `passList` (the newest receipt per DID wins; a
   revoke ends it). Pure, with tests: root, linked, unlinked, pass, expired
   pass, revoked pass, live mode lets everyone in.
2. **The gate**: one `letIn(req)` used by every acting route. The request
   carries the signer's DID and, if it's a linked key, its link. The pass list
   is published at `GET /door`. While in test, refuse with one sentence:
   "inqbeta.com is opening soon. Ask Darren for a tester pass."
3. **The mint** (`/api/mint` POST): the same check, reading `/door` from the
   gate (cached).
4. **The bellboy**: if DID sign-in exists, the same check there; if not,
   record it as blocked on ADR-Q-010 §5 (see above).
5. **The browser**: after sign-in, if the door says no, show an **Opening
   soon** screen (Stay in touch; a link to the playground). A courtesy only:
   the lock is on the servers.
6. **Localhost**: Settings → the host → **Tester passes**: give a pass (DID,
   end date), take one back, see who holds one, publish the list to the gate.
7. **The development site** (revised 5 October, evening; ADR-Q-034 §5):
   not a simulation. Everything works on inqbeta.dev (federations, your own
   Drive or bucket, pass-through, kept storage, shops, mints), with test
   money only: Publish is refused there. There's a plain notice at the start
   and a banner: "development site, testing only, can be wiped at any time,
   no real money". It gets its own `dev` gate on the node, so the door on
   inqbeta.com never locks it.

## Progress

- ✅ Step 1: q-core `door.ts`, 8 tests.
- ✅ Step 2: the gate's door (`GET`/`POST /door`, checked on drops, inboxes,
  ledgers, shops and storage hires), tested against q-core. **Not switched
  on yet**: the Hetzner gate also serves inqbeta.dev, so it waits for the
  `dev` gate.
- ✅ Step 3: the mint asks the same door (only a door naming its own host).
- ✅ Step 4: the bell needs nothing more (only the gate rings; inboxes go
  through the door); `/api/notifications` no longer takes additions.
- ✅ Step 5 (browser): Opening soon after sign-in.
- ✅ Step 6: Tester passes in the host's Settings, on localhost.
- ✅ Step 7, part: the notice in six languages; test money only on
  inqbeta.dev; no door there; the gate receives the door settings; a
  `gate-dev` on its own `/dev` folder (HETZNER.md step 7).
- ✅ The development site as its own host (Darren's choice): host files by
  site, `pnpm dev:site` on localhost:5174 writing only `static/dev/` and
  `devsite/.env`. **Darren's next steps:** found it, then the node, then the
  door (ADR-Q-034, "Founding the development host").

## Before building: the checks (audit A5–A7)

In the cloud copy:

1. Bring up the test rig.
2. Get `svelte-check` and the production build running.
3. Fix the 10 TypeScript errors in `lib/components/decks/index.ts`, so new
   errors show.
4. Look at today's **Bank** tab and **role switch** at desktop and phone size,
   signed in. Fix what's wrong before starting.

## Proved when

In the test rig, with Darren and Tess:

- Darren (root) can buy, take storage and reconcile; his linked inqbeta.com
  key can too.
- Tess signs in, sees **Opening soon**, and every acting call is refused with
  the sentence.
- Darren gives Tess a pass on localhost and publishes it; Tess can now buy and
  take storage.
- Darren revokes it; Tess is refused again within a minute.
- Publishing the host as live lets everyone in.
- On the playground: sign up, buy play credits, join, take storage, and
  nothing reaches the gate or the mint (checked in the network log). Start
  again clears it.
- All tests, `svelte-check` and the production build pass, and it's clicked
  through at desktop and iPhone size.

## Afterwards

- Update ADR-Q-034 with **As built**, the project copy, and the handover.
- Write Darren's node steps (rsync, recreate the gate) as numbered lines.
- Give the commit command.
- Then the next brief: **Offices** (ADR-Q-007 §5–6).

## Standing rules

- Neurodivergent simplicity first.
- Skeleton for all styling: olive `#556B2F`, orange `#D16900`, thick-bordered
  fields, no placeholders, light Lexend, one meaning per colour
  (`showing-money.md`).
- Secrets never in chat or git.
- Darren commits and pushes. Edit on the Mac directly; check `git status`
  first.
