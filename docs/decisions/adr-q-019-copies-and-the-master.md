---
status: proposed
implementation: none
updated: 2026-10-02
---

# ADR-Q-019 — Copies, and the master they come from

**Status: proposed, 2 October 2026.** ADR-Q-018 made installing Q a matter of
taking a copy of the master and running it on your own computer first. This
ADR says what that means once there are many copies: **what carries between
them, what every copy must show, and what joining Incubator gives a copy
that copying alone doesn't.**

## Context

Darren, 2 October:

> "You could install this setup on your local and create your own incubator
> version, which in itself then is just a replication, replication,
> replication … would it be possible to take a DID from Incubator and take
> that file into any branch version copy of Incubator and those files be
> visible in that … the whole transportation point of mycelium replication …
> a website within a website within a website."

> "This is like WordPress, isn't it? You install a default template … and then
> you create your own version … if you've got two incubator types that are
> linked … all of your federations will show regardless of which incubator
> you're using … developers could … produce their own plugins … the reason
> you'd go and use their site is you can do stuff you can't do on others."

> "Like you would have at the bottom 'powered by' … a condition that you need
> to have the authentication … that just puts even more trust in their
> operation … the federations within an incubator copy could actually all be
> clubs belonging to an overarching body … It is basically a website with lots
> of powerful functioning, works offline … the one where we will have
> advantage is in the app … to be officially recognised on the incubator
> marketplace … everybody who wants a copy should first join us and sign an
> agreement … That's our code of conduct, the Federation code. Go forth and
> make your own."

## Decision (proposed)

### 1. Q is to receipts what WordPress is to websites

- **The master** is the source: Q's code, its core schemas and its default
  template. Dark Olive CIC is its steward (`LICENSING.md`).
- **A copy** is a host made from the master (ADR-Q-018). Like a fresh
  WordPress install, it starts with the default template, which is the
  Incubator site, and becomes its own: its name, logo, agreement, pages and
  federations.
- **Every copy is a receipt, proof and evidence portal that's also a
  website.** It works offline, signs everything, and anyone can check it.
- Copies can be made from copies. Each one still names the master it comes
  from (§3).

### 2. Your identity and receipts carry between copies

- **Your DID is your key, not an account on a host.** It means the same thing
  on every copy, and no copy has to ask another who you are.
- **Receipts check themselves.** Any copy using the core schemas can open your
  vault (your folder, your Google Drive) and check every file with no call
  home.
- **Passkeys are locked to a domain**, so on another copy you add a way in for
  that domain, with your recovery kit or by linking from a device already
  signed in (`continuity.ts`). It's one identity with a way in per host, the
  same mechanism ADR-Q-018 uses for founders.
- **What you see follows you.** With your vault synced, every federation
  you're in shows on whichever copy you're using, each marked with where it
  lives: "Green Space · on club.example".
- **Seeing isn't the same as recognising.** Another copy can check that your
  Incubator membership is real, but Incubator's rules and services don't apply
  there automatically. Hosts that honour each other's members, services or
  credits do it by **treaty** (ADR-Q-017 §8). Treaties are the threads of the
  mycelium: copies joined by signed agreements, never by an owner.
- **A copy that doesn't know a kind of receipt** lists it as "Signed, but this
  copy doesn't know this kind yet". It never drops it.

### 3. Every copy shows where it comes from: a checked "Powered by Q"

- At the foot of every copy: **Powered by Q**, like "Powered by WordPress".
- **It's a check, not a line of text.** Tapping it shows, signed:
  - **Core: unchanged from the master**, release X. Signing in, keys, sealing,
    how receipts are checked, and what consent steps say all match the
    master's published release.
  - **or Core: changed.** That's allowed, and it's the copy's right under the
    licence, but it's said plainly.
- **Your Q warns you before you open your vault on a copy whose core has
  changed.** This is what stops replication turning into a phishing kit. A bad
  copy could look like Incubator and quietly copy what you open; the check
  makes that visible before it can happen.
- The surface is free to vary: pages, layout, theme, words, plugins. The core
  must be provably the master's for the copy to say "unchanged" (ADR-Q-017
  §1).
- **A checked badge adds trust, not friction.** A host has nothing to lose by
  showing it, and its members gain a reason to trust it.

### 4. A copy can be an overarching body with clubs inside

A copy's federations don't have to be strangers. A copy can be:

- **An overarching body with member clubs**: a national association whose
  host carries each local club as a federation, with the association's
  agreement above theirs.
- **One organisation with many groups**: a school with classes, a council
  with services, a charity with projects.
- **A specialist host**: a developer's copy with plugins nobody else has.

A site can carry another site, because sites are signed releases and carriers
are never trusted (ADR-Q-003, `releases.ts`). So a website within a website
within a website is ordinary, and every layer can be checked.

### 5. Plugins are open to everyone; recognition is a listing

- **Anyone can build plugins on their own copy.** The plugin builder is not
  held back, because people pushing at what's possible is the point.
- **A receipt made by a plugin can be checked anywhere**, even on a copy that
  doesn't have the plugin. That copy shows "Made with Survey Builder on
  club.example · Open it there". Specialist hosts are worth visiting because
  of what they can do.
- **The Incubator marketplace is a listing, and every listing is a receipt.**
  To be officially recognised, a plugin is reviewed (the plugin permission
  interview) and listed, signed by Incubator. Unlisted plugins still work;
  they just aren't recognised.

### 6. The app is Incubator's

- **The website is open; the Q app is not released as source.** It's
  Incubator's own. It's practical, works offline, and shows everything from
  every copy you're linked to, which is why people will want it.
- **This has to be built the right way to be allowed.** The app (`apps/q`) is
  AGPL, and AGPL code can't become a closed app. A closed app can be built on
  the libraries (`q-core`, `q-ui`, `q-actions`), which are Apache 2.0 and
  allow it. The other route is code the CIC owns outright: the copyright owner
  isn't bound by its own licence, but code contributed by others is (see §8).

### 7. Join Incubator, sign the Federation code, go forth

- **The code is free to copy.** AGPL allows anyone to take it, and it forbids
  adding extra conditions to the code itself, so copying can't be made
  conditional on joining.
- **What joining gives a copy is everything that's Incubator's to give:**
  - the checked **Powered by Q** badge, and the right to show "core unchanged"
    with Incubator's signature on it;
  - a **marketplace listing** for its plugins;
  - **treaties** with Incubator: the commons services (email, AI, relayed
    calls, transit storage), recognition of members;
  - use of the **Q name** for an unchanged copy (`TRADEMARKS.md`).
- **To get them, a copy's founder joins Incubator and signs the Federation
  code**: the agreement to use it respectfully. It's Incubator's code of
  conduct for hosts, written by Darren when Incubator is founded (ADR-Q-016).
  It's a receipt, so every recognised copy can show it signed.
- Copies that don't join still work. They just carry no badge, no listing and
  no treaty. People can see the difference, so they can choose.

## Consequences

- **Replication is growth, not a threat.** Every copy that joins strengthens
  the commons and the marketplace, and every copy credits the master.
- **Trust is visible.** The badge, the listing and the signed Federation code
  are receipts anyone can check.
- **The core must stay common.** Schema changes go through the master, so
  copies keep understanding each other.

## Build order

1. **Core release fingerprints**: the master publishes the hashes of each
   release's core, signed.
2. **The "Powered by Q" check** at the foot of every copy, and the warning
   before opening your vault on a copy whose core has changed.
3. **"Where it lives"** labels on federations shown across copies.
4. **"Signed, but this copy doesn't know this kind yet"** for unknown
   receipts, and **"Made with … · Open it there"** for plugin receipts.
5. **The Federation code**: host founders join and sign.
6. **The marketplace listing**, signed by Incubator.
7. **Host-to-host treaties.**
8. **The app**, built on the Apache libraries.

## Non-claims

This does **not**:

- write the Federation code;
- set the marketplace's review rules or terms;
- decide how a changed core can apply to be recognised;
- give legal advice. The licensing points (§6, §7) and contributor agreements
  need a lawyer's check before the app ships.

## Open question

- **Contributor agreements.** Code signed off with `-s` records that a
  contributor had the right to submit it, but doesn't give the CIC ownership.
  If others contribute, an agreement licensing their work to the CIC keeps the
  CIC able to steward the whole codebase and build the app from it.

## Related

ADR-Q-003 (sites), ADR-Q-005 (identity, ways back in), ADR-Q-007
(federations, treaties), ADR-Q-016 (Incubator is a federation), ADR-Q-017 (the
commons; the editable surface and fixed core), ADR-Q-018 (install on your own
computer first), `LICENSING.md`, `TRADEMARKS.md`.
