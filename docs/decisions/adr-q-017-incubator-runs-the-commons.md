---
status: proposed
implementation: none
updated: 2026-10-01
---

# ADR-Q-017 — Incubator runs the commons

**Status: proposed, 1 October 2026.** It joins two ideas that were written
apart: Incubator as Q's home federation (ADR-Q-016) and the commons, the
default services so nobody is stranded (ADR-Q-010 §10,
`q/providers-and-the-commons-market.md`). They are the same thing.

## Context

Darren, 1 October:

> "What we're seeing — the UI, the dashboard, the home page, all of it — are
> receipt blocks … so under sites we should be able to edit this site …
> only founder rights and who the founder gives permission to."

> "Resending emails, AI models, the bellboy, all of it as a service to the
> Federation … anyone using the communication portal … video call, or
> sending a message to anyone in their address book … should be using
> Incubator's API resources … they end up buying credits … certainly from
> Bellboy, there's no credits used."

> "Incubator can allocate a certain amount of storage for transit … not like
> archiving at all … literally just a storage unit, part of the post office …
> Dgraph … would give us ability to study performance … As long as there's an
> easy, visible token usage indicator on the dashboard … We can also have
> treaties working between Dark Olive and DoStudy and anything that Dark Olive
> produces."

Signing up is joining Incubator (ADR-Q-016 §2), so everyone using Q is a
member of at least one federation. "Someone in no federation" is really
"someone whose only federation is Incubator", and Incubator's agreement is
the terms of service.

## Decision (proposed)

### 1. Q is a site Incubator owns

- Q's home page, dashboard layout, theme, words and pictures are a **site**
  (ADR-Q-003) owned by the Incubator federation. Every change is a signed
  receipt; the previous version stays as evidence.
- **Who may edit:** the founder, and anyone the founder gives the **Site
  editor** role. The role is a mandate (ADR-Q-007 §3): scoped to the site,
  with an end date, removable by the founder alone. Inviting someone to it is
  an invitation they sign, like joining.
- **The surface is editable; the core is not.** Editors change pages, layout,
  theme, words and images. They can never change signing in, keys, sealing,
  how receipts are checked, or what a consent step says. Those are code,
  reviewed and deployed. Otherwise a compromised editor could turn Q into a
  convincing phishing page for everyone's passkeys.

### 2. Every service is filled in one order

**Mine → my federation's → Incubator's.** Incubator's is the safety net, never
the only way. Bringing your own key, mail server or node is always allowed
(ADR-Q-013), which is what keeps "no lock-in" true.

### 3. What Incubator provides, and what it costs

| Service | Cost to Incubator | Tier |
|---|---|---|
| **Bellboy** (notices) | Close to nothing | **Free**, for everyone. Rate limits so it can't carry spam. |
| **Transit storage** (the storage unit) | Small: holding only | **Free within an allowance.** See §4. |
| **Messages** to your address book | Notice + transit | Free within the allowance. |
| **Video and voice calls** | Nothing when direct; relay (TURN) when not | Direct: free. Relayed minutes: allowance, then credits. |
| **Email sending** | Per email | Credits. |
| **AI models** | Per use (tokens) | Credits, or your own key. |

Prices are **cheap, published, and the same for everyone**, with more than one
option where a service has more than one cost (a small model and a large one,
say).

### 4. Transit storage is a holding bay, not an archive

- Incubator allocates a fixed amount of storage **for transit only**: the
  sealed thing waits there until it's collected, or its lifetime ends
  (ADR-Q-014 §2). It is part of the post office, not a place to keep files.
- Keeping files is your vault, your own cloud (Google Drive), or a
  federation's storage (ADR-Q-014 §3). Incubator does not offer archiving in
  the free tier.
- The allowance is per person, in **bytes held at once and days held**, so a
  forgotten parcel can't fill the unit.

### 5. Usage is always visible

- **A usage indicator on the dashboard**: credits left, and this month's use
  by service, in plain words ("12 relayed call minutes, 3 emails, AI: 4,200
  words"). One tap opens the receipts behind it.
- **Every metered use is a receipt** signed by the service and kept in your
  vault, so the indicator is drawn from evidence, not from a server's say-so.
- A warning before credits run out, never a surprise stop mid-call.

### 6. Measuring without watching

- The directory (Dgraph) and the services' own counters give Incubator what
  it needs to run well: load, how long things wait, how full the storage unit
  is, cost per service.
- **Counts, not people.** Metrics are totals and timings. No per-person
  activity log is kept beyond the receipts each person holds themselves.
  What's shared publicly is **published facts** (ADR-Q-016 §5), signed and
  dated.

### 7. Who pays

All four, together:

1. **Free:** the bellboy, and a small monthly allowance of everything else.
2. **Bring your own:** your key, your mail server, your node. It costs Incubator
   nothing.
3. **Credits:** anything beyond the allowance. Bought in pounds; spent inside
   Q; **not redeemable for pounds** (cashing out would make credits look like
   e-money; see the commons-market doc, and check with an accountant first).
4. **Sponsorship:** a federation buys a block of credits and its members use
   services through it. The federation's card shows it ("Green Space covers
   your calls").

Income goes to Dark Olive CIC for now (open-shop audit §0).

### 8. Treaties

A **treaty** is a signed agreement between two federations (ADR-Q-007 build
order 7): what each provides the other, on what terms, until when, and how it
ends. It is how organisations work together as businesses without either
owning the other:

- **Incubator ↔ Dark Olive CIC:** Dark Olive builds and funds Q; Incubator
  runs the services; the income and costs between them are written down.
- **Incubator ↔ DoStudy:** DoStudy's courses use Incubator's bellboy, storage
  and AI on agreed terms, and its learners are members of both.
- Anything else Dark Olive makes joins the same way.

A treaty is a receipt both federations sign. Its musts and cannots are
ADR-Q-008's, and either side can leave on the notice it names.

## Consequences

- **Server settings shrink further.** Incubator's services are signed records
  (ADR-Q-016 §3); credits and allowances are its published terms.
- **The bell, messages and calls can go live for everyone** once the bellboy
  has DID sign-in (ADR-Q-010 §5), because every person is an Incubator member
  with an allowance.
- **The dashboard gains one small, always-visible thing:** usage.

## Build order

1. **Usage receipts** for what exists: notices, transit storage, relayed
   calls, email, AI. The dashboard's usage indicator, drawn from them.
2. **Allowances** in Incubator's published terms; the gate and relay enforce
   them.
3. **Credits:** buying (a payments provider), spending, the warning before
   they run out.
4. **The Site editor role**: the mandate, the invitation, editing the surface.
5. **Sponsorship** by federations.
6. **Treaties**: the first between Incubator and Dark Olive CIC.

## Non-claims

This does **not**:

- set prices or the size of the free allowance;
- choose a payments provider;
- give legal or tax advice. Credits, sponsorship and treaties all need an
  accountant's eye before money moves;
- decide whether other federations may sell services to non-members. The
  commons-market doc leans yes, by the same rules.

## Related

ADR-Q-003 (sites), ADR-Q-007 (federations, mandates, treaties), ADR-Q-008
(must and cannot), ADR-Q-010 (messages, the commons), ADR-Q-013 (AI keys and
credits), ADR-Q-014 (bellboy, directory, storage unit), ADR-Q-016 (Incubator
is a federation), `q/providers-and-the-commons-market.md`,
`q/open-shop-audit.md`.
