# ADR-Q-034 — The door (inqbeta.com) and the playground (inqbeta.dev)

**Status:** decided 5 October 2026, not yet built.

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
5. **inqbeta.dev is the playground, all in the browser.** It has the same
   dashboard and sign-in, but it uses no mint, no node and no bellboy. Credits,
   kept storage, joins and the shop are simulated in the visitor's browser,
   marked "Play". A banner says nothing is real. **Start again** wipes it.

## Build order

1. q-core: `isLetIn(did, { founder, links, passes, mode })`. A pure function,
   tested.
2. Mint, gate, bellboy and notifications: refuse anyone who isn't let in while
   the host is in test, with one plain sentence.
3. The browser: an "Opening soon" screen after sign-in for anyone not let in.
4. Localhost: give or take back a tester pass (Settings → the host), then
   publish the list.
5. The playground: a `play` mode switched on by the inqbeta.dev hostname.
   Calls go to in-browser stand-ins. Add the banner and Start again.
6. Prove it in the test rig: Darren is let in, Tess is refused, then let in
   with a pass, then refused once it's revoked. On .dev, everything works and
   nothing reaches a server.

## Open questions

- Where the published pass list lives: next to `incubator.json` (a redeploy for
  each change) or on the gate (no redeploy). The gate is likelier to be right.
- How strict the playground limits are.
