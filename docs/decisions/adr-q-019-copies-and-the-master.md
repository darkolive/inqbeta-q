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

### 3a. The core list: what "unchanged" is checked against

Darren, 2 October: *"The website is made up of blocks of receipts, and the
whole website is a receipt … if its initial foundation creation gets
authenticated … any update to the website is a new receipt and that new
receipt can again be authenticated against the original and still check it's
valid."*

- **The website is already a chain.** Every site release is signed and names
  the one before it (`previous`, `site.ts` and `releases.ts`), back to the
  founding.
- **The core is the kernel** (`docs/identity/kernel.md`): the receipt kernel,
  the verifier, sealing, keys and signing in, and the consent steps.
- **For each master release, the master publishes a core list**: every core
  file and its fingerprint, signed by Incubator.
- **Every site release names the core release it runs.** A release is valid
  when all three hold, checked by anyone, offline:
  1. it follows, link by link, from a founding Incubator authenticated;
  2. its core is one the master published;
  3. it's signed by the site's own authority.
- **Check against the master's list, not the original.** A copy that could
  only ever match its founding's core could never take a security fix. When
  the master publishes a new core, copies update and stay valid. A copy left
  on a core with a known problem shows **"Out of date"**.
- Changing a core function fails check 2 at once: **"Core changed"**. Pages,
  layout and words aren't on the list, so they change freely.

### 3b. The authenticated host receipt

Darren, 2 October: *"To register your version authenticated, it needs a
receipt from Incubator that confirms the code is the same … all the
authentication requires is to sign in on the incubator site and with your
passkeys, link it … the benefit … they get on the listing and notified
updates and whatever back channel."*

1. The copy's founder signs in on Incubator with their passkey and **links
   their copy**: the same identity, linked the way ADR-Q-018 does.
2. Incubator **fetches the live site's code** and compares it with the core
   list (§3a).
3. Incubator issues the **authenticated host receipt**
   (`inqbeta.host-authenticated/1`), signed by Incubator's federation key.
   It names the domain, the host's DID, the founder, the core release, when
   it was checked and until when.

What it says, and what it can't:

- **It says what was served, not what's inside the server.** Nobody can see
  inside someone else's server. Q signs, seals and holds keys in the browser,
  so the code a site sends out is the part that matters, and that can be
  checked.
- **It's short-lived** (around 30 days) and renews when rechecks pass. A
  failed recheck withdraws it.
- **Your own Q and the app check it too**, every visit, so a copy can't show
  Incubator a clean version and visitors another.
- **Every authentication and every withdrawal is a public receipt**, and a
  withdrawal gives its reason. Incubator is the trust anchor for copies, and
  says so openly.

What it gives the copy: the **Powered by Q · authenticated** badge, a
**listing**, **update notices** through the bellboy (Incubator is a federation
that notifies, ADR-Q-016 §6), and a **back channel** to Incubator.

What it gates, and what it never does:

- **Still works everywhere:** anything a person signed. It's checked and
  shown, with "Made on a host that isn't authenticated". The person sits above
  every federation (ADR-Q-007, Layer A), so no host can void a person's own
  signature.
- **Needs an authenticated host:** anything that asks others to trust the
  **host itself**: its founding and federations being recognised elsewhere,
  its plugins' receipts counting as listed, treaties, the commons services.
- In the kernel's terms (`kernel.md`), authentication answers **"Does anybody
  vouch for them?"** It never changes **"Does it hold up?"**

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

### 8. Incubator is the platform, like WordPress

Darren, 2 October: *"It's no different to what WordPress must do … They're
not responsible for every WordPress website created … if the authentication
requires a passkey with the incubator site … and that step in the
attestation clearly states incubator's core principles and rules, code of
conduct, then if someone as a bad actor … they're in breach of their
incubator membership."*

- **For the code, Incubator is a platform**, like WordPress. It isn't
  responsible for every copy, any more than WordPress is for every site.
- **What Incubator does give, it can take back.** The badge, the listing,
  treaties and the commons services are Incubator's, so Incubator answers for
  them by withdrawing them.
- **Authenticating is joining.** The authentication step (§3b) shows
  Incubator's principles and the Federation code, and the founder signs them
  with their passkey. A bad actor is then in breach of their membership.

### 9. Compliance: reported in the portal, decided by the same engine

Darren, 2 October: *"Just as … reporting code issues, we can have compliance
reporting a bad actor. And that can be actioned through an agent AI to
suspend, because it's not just kick out … it will be exercised by exactly
the same rule engine as every other incubator site running … proof of
concept is it's doing it itself."*

- **Report a host** sits in Incubator's portal, beside reporting a code
  problem. Anyone can report. The report is a receipt, sealed so only
  Incubator's compliance role can read it.
- **An AI agent does the legwork.** It gathers the evidence, checks it
  against the Federation code, and drafts the decision, citing the clause.
  **The AI drafts; people sign** (ADR-Q-007 §2). A person holding Incubator's
  compliance mandate signs it, so no one is suspended by a machine alone.
- **The steps are the ones every federation already has** (ADR-Q-007, built
  28 September):
  - **Suspension** (`federation.suspend`): still a member, paused until a
    date, citing a clause and saying why. It must end within a year, can't be
    backdated, can be lifted early, and never stops someone leaving.
  - **Removal** (`federation.remove`): ends belonging, citing a clause.
  - **Lifting**: early, signed.
- **While a host's founder is suspended or removed**, its authentication is
  paused or withdrawn, so the badge, the listing, treaties and the commons
  services stop with it.
- **The founder can appeal**, and the appeal is a receipt too. It's decided
  by someone other than whoever signed the suspension.
- **A failed core recheck isn't a judgment.** It withdraws authentication
  automatically (§3b), because it's a fact anyone can check, not a decision
  about a person.
- **What no decision can do:** stop the copy running (the code is free) or
  touch anyone's own receipts. The host becomes an island, visibly
  unvouched.
- **It's the same rule engine** (ADR-Q-009, Cedar) every copy runs for its
  own federations. Incubator policing itself with the tools it gives
  everyone else is the proof that the tools work.

## Consequences

- **Replication is growth, not a threat.** Every copy that joins strengthens
  the commons and the marketplace, and every copy credits the master.
- **Trust is visible.** The badge, the listing and the signed Federation code
  are receipts anyone can check.
- **The core must stay common.** Schema changes go through the master, so
  copies keep understanding each other.

## Build order

1. **The core list**: the master publishes each release's core files and
   fingerprints, signed. Site releases name the core release they run.
2. **The "Powered by Q" check** at the foot of every copy, and the warning
   before opening your vault on a copy whose core has changed.
2a. **The authenticated host receipt**: link your copy on Incubator; the
   check, the receipt, rechecks and withdrawal.
3. **"Where it lives"** labels on federations shown across copies.
4. **"Signed, but this copy doesn't know this kind yet"** for unknown
   receipts, and **"Made with … · Open it there"** for plugin receipts.
5. **The Federation code**: host founders join and sign.
5a. **Report a host** in Incubator's portal; the AI agent's draft; the
   compliance mandate; suspension, removal and appeal.
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

## Challenges still to solve

The easier a copy is to make, the faster Q spreads. These are what could
slow that down, or make it unsafe:

1. **Setting up still needs skills most people don't have.** Localhost first
   (ADR-Q-018) means Node, GitHub and Vercel today. The answer is likely
   **"Start your own host" inside the Q app**, so set-up is the cards and
   nothing else. That's one more reason people get the app.
2. **Browsers can't check a page's code before running it.** A host could
   serve different code to one visitor. Rechecks and the badge narrow this;
   **the app closes it**, because it signs with its own code, not the site's.
3. **Updates at scale.** Copies lag behind. Security fixes need a fast path
   from the master to every copy (an update notice, then one click), and core
   changes must never strand older receipts.
4. **Who decides the core.** New receipt kinds from copies need a home that
   doesn't fork the schema: names that carry the host's DID, and a way to
   propose one to the master.
5. **Incubator as the trust anchor.** If Incubator's key were stolen, or
   Incubator closed, copies must keep working, just unvouched. That needs a
   key kept offline, more than one signer for authentications, and a written
   plan for handing the role on.
6. **Bad hosts: handled the way WordPress is, plus membership.** See §9
   below. It's settled in principle; what's left is writing the Federation
   code and building the compliance report.
7. **The law follows each host.** Each copy's founder is responsible for
   their own host: the data it holds (UK GDPR) and, because hosts carry
   messages between people, possibly online safety duties. The Federation code
   says plainly that Incubator vouches for the code, not for each host's
   running of it. A lawyer should check the wording.
8. **Lookalikes.** Copies named to look like Incubator, on lookalike
   domains. The badge must show the real domain and the host's DID, never
   just a name.
9. **Plugins near keys.** Plugins must never touch the core: they run
   apart, ask for permissions, and can't sign as the person without asking.
10. **Two-way site sync clashes.** Two people editing the same page on the
    live site and the founder's computer at once. Nothing is lost, because
    both versions are receipts, but someone has to choose. That needs a
    simple "which one?" screen.

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

## Addendum, 6 October 2026 (night): trust travels down; branches show their work

Darren, looking at the first registered host on the directory: "that's a lovely
receipt, just like the mint coin … the same principle applies to hosts
registering with Incubator that confirms the core and everything is untouched
and that it meets whatever the manifest rules are decided, and also can point
to a Git branch history from the source of Incubator if they've gone and
created their own. That would be lovely to see what they did, because you can
really then see the skill of the direction of that branch, but it's still
authenticated and verified as a valid QR code … no federation inside your host
world can get authenticated themselves unless you are. So that's the way that
users will say: look, this isn't a trusted site, so I'm not going to register
here … a very good, easy, self-ruling mechanism that travels down."

**Decided (proposed):**

1. **A host's registration (ADR-Q-021) carries its authentication** (§3b): the
   core it serves checked against Incubator's signed core list (§3a), and its
   manifest against the rules a host must meet. The badge says "core checked as
   served", never more than can be checked.
2. **A branch shows its work.** A host built from its own branch names its Git
   repository and the commit it runs; the receipt page links to it and shows
   where it parts from Incubator's history. Pages, plugins and look may differ
   freely; the core must match for the badge.
3. **Trust travels down.** A club inside a host can be authenticated only while
   its host is; its receipt page shows the chain, Incubator → host → club, each
   with its own badge.
4. **People are told before they join.** Signing up on a host that isn't
   authenticated shows, first: "This host isn't authenticated by Incubator. Its
   clubs can't be either." The choice stays theirs.
5. **Nothing signed is voided.** A host that loses its badge shows "not
   authenticated" for itself and its clubs; what people signed stays theirs and
   valid (ADR-Q-007, Layer A).


**Settled with Darren, the same night:** "it's either an authentic repo
running, and so the hashes match. And if anything changes, it just breaks …
Or it's a branch and you can follow through what's different and also still
validate it as being a Q-Core project." So point 2 is softened: a branch whose
core differs is still registered, as a branch, provided its card names its
repository, branch and commit. What can't be registered is a core that differs
and says nothing. It is the badge that breaks, never the site: the AGPL lets
anyone run it, and a public branch with its commit named is also its source
offer.

**As built (6 October 2026, night):**

- *The core, as served.* `packages/q-core/core-files.json` names the core
  (canonical, did, passkey, seal, vault, keys, receipts, chain, links, session,
  ucan/*). The build (`apps/q/vite.config.ts`) puts exactly these into one
  self-contained chunk, `q-kernel`, and, after the files are written, writes
  `/_q/core.json`: `inqbeta.core-served/1` with release, commit, the chunk's
  path and the sha256 of its bytes. Checked: the fingerprint is stable when
  pages change, and changes when a core file does.
- *Incubator's core releases.* Whenever Incubator registers anyone, it reads
  its own `/_q/core.json`, fingerprints its own chunk, and if that release is
  new, its registrar signs it (`inqbeta.core-release/1`) and files it on its
  node (`GET/POST /core-releases`; only `GATE_REGISTRAR` adds). So each
  release Incubator runs becomes the master's signed word, with nobody having
  to remember to publish it.
- *The judgement* (`q-core/core-served.ts`, `judgeCore`). Incubator fetches the
  registering site's `/_q/core.json` and the chunk it names, fingerprints the
  bytes itself, and finds: **unchanged** (matches a release), **a branch**
  (differs, and the card names its source), or **changed** (differs and says
  nothing, or the site's word doesn't match what it serves). Changed is
  refused; the finding is kept, signed, in the registration (`core`) and said
  in its "checked" lines.
- *The card* gains `source: { repo, branch, commit }`, signed with the rest.
  The console's Register card asks "Straight from Incubator" or "My own
  branch", and fills the commit from the site's own build.
- *The receipt page* shows "Q's core, unchanged · release" or "A branch of Q"
  with **See what's different**: a GitHub compare from the nearest release's
  commit on `darkolive/inqbeta-q` to the branch's commit.
- *Before you join* (`HostTrust`): on the join page, before signing in and
  again with the invitation, and on the home page's Join card. It shows the
  host and, for a club, the club, each Registered / A branch of Q / Testing /
  Not registered, with a link to its receipt. Not registered is said plainly,
  with "You can still join." Only the federation's name is looked up.
- *Testing on your own machine:* a localhost site registers only with an
  Incubator that is itself on localhost.

**Not yet:** a club registering through its host (today only the federation a
site serves as its home can register, so a club can't be registered without its
host by construction, but there's no way yet for a host to put its clubs
forward); the manifest rules a host must meet; renewal reminders.
