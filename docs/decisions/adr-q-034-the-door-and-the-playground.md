# ADR-Q-034 — The door (inqbeta.com) and the playground (inqbeta.dev)

**Status:** decided 5 October 2026; §5 revised the same evening. Steps 1–4
and 6 are built (the rule, the gate, the mint, the bell, Opening soon, tester
passes); step 5, the development site, is next. See *As built* below.

## Why

Darren: test mode on inqbeta.com is great, because you can buy credits and see it all
working. But he wants to look at things live *knowing nobody else is
interfering*. inqbeta.dev should be the playground: it shows how it works, but
it doesn't use any real resources.

## What we already have

- **Every site signs in on its own** (passkey.ts, links.ts). Darren's localhost
  key is his **root**. His inqbeta.com passkey is the same person by a signed
  link (a UCAN pair) back to that root, checked offline.
- The host file (`static/incubator.json`) names the federation, and its
  invitation names the founder (the root).
- Every server door already checks signed receipts: the mint (`/api/mint`),
  the gate (`signedReceipt`, `GATE_OPERATORS`) and the bellboy.
- The mint has a mode, `test` or `live`. Publishing the host switches it to
  live (MoneyPublish).
- `TestSiteNote` already marks inqbeta.dev as the test site.

## Decided

1. **inqbeta.com is locked while the host is in test.** The servers (mint, gate
   `/store` and relay, bellboy, notifications) only answer receipts signed
   by the founder's root, a key linked to that root (a link receipt carried
   with the request), or a key holding a **tester pass**.
2. **Tester passes.** A pass is a receipt signed by the founder's root, made on
   localhost, naming one DID, with an end date (`inqbeta.tester-pass/1`).
   Revoking a pass is also a receipt. The list of passes is published next to
   the host file, so every server reads the same list.
3. **What visitors see.** The front door and the stories stay open. If someone
   who isn't let in signs in, they see **"Opening soon"**, with Stay in touch and
   a link to the playground on inqbeta.dev. The browser screen is only a
   courtesy. The real lock is on the servers.
4. **Opening.** Publishing the host as live takes the lock off. It's the same
   switch that turns the mint from test to live.
5. **inqbeta.dev is the development site: everything works, no real money.**
   *Revised 5 October, evening.* It was going to be a playground simulated
   in the browser. Darren:

   > "In the dev site, people should be able to create all functions as
   > they're being developed, including creating a federation, allocating
   > their own Google Drive, whatever resource as their bucket, pass-through
   > and storage system. They can test all of that, create their own mints,
   > all of that. There just won't be any real money allowed to transfer …
   > and clear explanation at the start: this is a development site and can
   > be destroyed at any time. It's not intended for real use, purely
   > testing."

   So on inqbeta.dev:

   - **No door.** Anyone can sign up and use every function as it's
     developed: found a federation, connect their own Google Drive or bucket,
     offer and hire pass-through and kept storage, run a shop, make a mint.
   - **No real money, ever.** Every mint there is test only: going live
     (Publish) is refused, and no payment or payout is taken or made.
   - **Said plainly at the start**, before sign-up and as a banner after:
     "This is Q's development site. It's for testing only, not for real use,
     and it can be wiped at any time. No real money moves here."
   - **Its own node services**, so the door on inqbeta.com never touches it
     and it can be wiped on its own: a second gate with its own storage
     folder on the same Hetzner machine (a `dev` gate), or its own node
     later. Wiping it is a deliberate step on the node, announced on the
     site first.
   - Identities are already separate (passkeys belong to their domain), so
     nothing can leak across to inqbeta.com.

## Build order

1. q-core: `isLetIn(did, { founder, links, passes, mode })`. A pure function,
   tested.
2. Mint, gate, bellboy and notifications: refuse anyone who isn't let in while
   the host is in test, with one plain sentence.
3. The browser: an "Opening soon" screen after sign-in for anyone not let in.
4. Localhost: give or take back a tester pass (Settings → the host), then
   publish the list.
5. The development site: the notice at the start and the banner; Publish
   refused (test mints only) when the site is the development site; a `dev`
   gate on the node with its own storage, and inqbeta.dev pointed at it;
   wiping written up as node steps.
6. Prove it in the test rig: Darren is let in, Tess is refused, then let in
   with a pass, then refused once it's revoked. On the development site,
   Tess can do everything, and Publish is refused.

## Open questions

- ~~Where the published pass list lives~~ **Settled 5 October: on the gate**
  (the Incubator's own storage), published at `GET /door`, read by the mint
  too. Darren: "we can always change".
- ~~How strict the playground limits are~~ No longer needed: the
  development site uses real (test) services, with the node's usual
  allowances.

## As built (5 October 2026)

**Step 1, the rule (q-core `door.ts`, 8 tests):** `isLetIn(did, { root,
host, mode, links, passes, now })` gives `{ in: true, as: 'open' | 'root' |
'linked' | 'pass' }` or `{ in: false, says }`. `givePass` and `takePass` make
`inqbeta.tester-pass/1` receipts signed by the root (30 days unless said);
`passList` keeps the newest per holder and ignores anything not signed by the
root, for another host, or altered. `OPENING_SOON` is the sentence.

**Step 2, the gate (`node/gate/server.mjs`, tested against q-core):**

- `GET /door`: whether there's a door, whether it's open, the root, the host,
  and the list (passes and links). `POST /door`: the root adds a pass, a
  pass taken back, or a key link; anything not signed by the root is refused.
  Kept in the filer at `/door/door.json`, read through a 30-second cache.
- **Acting is checked** on: leaving a drop, posting to an inbox, filing in a
  mint's ledger, listing or buying in a shop, and hiring kept storage. Each
  refusal is a 403 with the sentence and `door: 'closed'`. Reading stays open.
  The node's own mints always pass.
- **Switched by settings in the node's `.env`:** `GATE_DOOR_ROOT` (unset
  means no door, so the gate behaves as before), `GATE_DOOR_HOST`, and
  `GATE_DOOR=open` once the host is live.
- **Not yet:** the relay is reached by a space key, not a DID, so it isn't
  checked; it's only reached through a hire, which is. The bellboy and
  `/api/notifications` are next (see `q/door-brief.md`), with the mint on
  Vercel, the Opening soon screen and Tester passes on localhost.

**Don't switch the door on yet** on the Hetzner gate. inqbeta.dev uses the
same gate today, so the door would lock the development site too. It goes on
once the `dev` gate exists (step 5).

**Later the same evening: steps 3–6.**

- **The mint** (`lib/server/door.ts`, used by every POST to `/api/mint`): reads
  the gate's `GET /door` (30-second cache) and asks q-core's `isLetIn`. It
  only applies a door that names **this** host, so the development site's
  mint isn't locked by inqbeta.com's door even on a shared node. If the gate
  can't be asked, only the founder is let in. Live: everyone.
- **The bell**: nothing to add. On the live node the open listener only
  carries "something's waiting" pings, and only the gate may ring; leaving a
  message goes through the gate's inbox, which the door checks.
  `/api/notifications` no longer takes additions: nothing in Q used it, and
  anyone could put words into anyone's bell.
- **Opening soon** (`GET /api/door?did=`, `OpeningSoon.svelte`): after
  sign-in, someone not let in sees "Q isn't open to everyone yet", with a way
  to the development site, Ask a question, and Stay in touch. Keys and the
  public pages still open. A courtesy: the lock is on the servers.
- **Tester passes** (`TesterPasses.svelte`, in the host's Settings, in role,
  on the founder's own computer): give a pass (their DID, who it is, a week /
  30 days / 3 months / a year), take one back, see who's let in and until
  when. Names stay on that computer (`q.door.names`); the door sees DIDs.
  With no door yet, it shows the two `.env` lines to copy, and the warning to
  wait for the development site's own storage. **Your own other keys** (your
  inqbeta.com passkey) come in with a year's pass: the newer UCAN links
  aren't read by the gate yet.
- `q:acting` and `q.door.names` are now declared in `q-core/src/storage.ts`.

**Step 5, the development site: the parts that don't need its own host (5 October, late).**

- **The notice**, in all six languages, on every page of inqbeta.dev from the
  front door on: "This is Q's development site: for testing only, not for
  real use. It can be wiped at any time, and no real money moves here."
- **Test money only**: the mint treats any request arriving on inqbeta.dev as
  test, whatever the host's record says (`lib/server/site.ts`,
  `isDevelopmentSite`, or `Q_DEVELOPMENT_SITE=1`). Publishing live is recorded
  in the shared host record, so this is where it has to be refused.
- **No door there**: `/api/door` and the mint let everyone in on inqbeta.dev.
- **The node**: the gate now receives `GATE_DOOR_ROOT`, `GATE_DOOR_HOST` and
  `GATE_DOOR` (they weren't passed through before). A `gate-dev` service
  (profile `dev`, so it only starts when asked) uses its own storage folder
  (`/dev`) and `DEV_` settings, behind `dev-storage.135-181-156-21.sslip.io`.
  Starting it, and wiping only `/dev`, are in `node/HETZNER.md` step 7.

**Found on the way: the two sites are one host today.** inqbeta.dev is built
from the same branch, so it serves the same `incubator.json` and
`host/services.json`: the same federation, founder, storage and test books as
inqbeta.com. A separate gate alone doesn't separate them. The development
site needs **its own host**, founded on localhost like the first. Until it
has one, the door stays off.
