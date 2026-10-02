---
status: proposed
implementation: none
updated: 2026-10-03
---

# ADR-Q-021 — Directory Enquiries

**Status: proposed, 2 October 2026.** How hosts and federations are found
beyond their own walls, without anyone owning the phone book.

## Context

Darren, 2 October:

> "If every install of an incubator website is a federation, has members,
> then to be found outside their federation, they can send a ping to
> incubator, which has the index of every authenticated site and federation.
> So that's the way the universe can be found, is everybody pings a card to
> incubator."

> "If that can be spawned … off incubator's website there could be a copy
> directory button … any machine that wants to search the community could
> download that directory receipt … by sharing the directory, it gets added to
> their node. So they have to have Dgraph … should it spawn the index or a
> fragment of it?"

Each node already has a **directory** (Dgraph, `q/node-sizes.md`): its own
phone book. This ADR adds the one everybody can ring, named in keeping with
the bellboy, the switchboard and the directory: **Directory Enquiries**.

## Decision (proposed)

### 1. A listing card

A host or federation is found by its **listing card**: a card with a purpose
(ADR-Q-015), signed, holding only what it chooses to make public.

| Field | Notes |
|---|---|
| Name, logo, cover, one line on what it's for | As on its own page |
| Address | Where to visit it |
| Kind | Host, or club inside a host |
| Under | For a club: its host |
| How people join | Open, ask to join, by invitation |
| Where | Optional: a town or country, and/or a **map pin** (§1a) |
| Tags | A few words people search by ("photography", "allotments") |
| Powered by Q | Its core status (ADR-Q-019 §3) and its authenticated host receipt |

### 1a. Pins, and finding things near you

Darren, 2 October: *"The location-based aspect, that's where pinning is really
fantastic. And Dgraph has latitude, longitude function in it."*

- A listing can carry a **map pin**: the latitude and longitude where the club
  meets, or the host is based. The same pin the Personal card already offers.
- The directory stores it as a Dgraph **geo** point with a geo index, so Find
  can ask *near* ("within 10 miles of here") and *within* ("in Shropshire")
  without anything extra.
- **A pin is coarse unless the founder says otherwise.** By default it's
  rounded to about a kilometre, so a club run from someone's front room
  doesn't publish their house. A founder can mark it a **public place** (a
  village hall, a shop) to pin it exactly.
- Find shows results on a map as well as a list, and **Just a part** (§5) can be
  an area: "copy everything within 50 miles".

### 1b. Not just places: what's happening, when, where and how

Darren, 2 October: *"It also complements and works with events and invites …
and promotion … with pin location, time … you've got all sorts of directory
listings. What's happening, when, where, how, which then becomes so easy for
the courses run."*

A listing card has a **kind**. The same card, signature, pin and release carry
them all:

| Kind | What it adds | When it goes |
|---|---|---|
| **Host or club** | §1 | When withdrawn, or not renewed |
| **Event** | Start and end time, the pin (or "online"), how to come (open, ask, invite), cost if any, places left | **By itself, once the event has ended** |
| **Course** | Dates or "start any time", where or online, places, who runs it (DoStudy and any course a host offers) | When the last date passes, or it's full and closed |
| **Promotion** | An offer from a business card (ADR-Q-015): what, until when, where | At its end date, which it must have |

- **Who can list what:** an event, course or promotion is listed **by a host or
  club already listed**, under its signature, so it's always clear who's
  behind it.
- **Find answers all four questions together**: *what* (words, tags, kind),
  *when* (this weekend, next month; Dgraph's datetime index), *where* (near,
  within; §1a) and *how* (open, free, online). "Pottery courses within 20 miles
  starting this month" is one search.
- **Going is a receipt.** Booking a place, or accepting an invitation, makes a
  signed receipt both sides keep: the ticket. It can be added to a calendar.
- **Promotions are marked as promotions**, always, never mixed in as if they
  were events, and a host can only have a few running at once, so Find can't
  be flooded. People can hide promotions in Find.
- **Events tie to the federation's event strand** (ADR-Q-007: a federation with
  an end date): a festival can be a federation for its weekend, with its event
  listing pointing to it.

### 2. Listing: sent, checked, kept fresh

- A host sends its card to Incubator's **front door** (the gate), the way a
  shared card is dropped off today (ADR-Q-015, `node/gate`).
- **Only authenticated hosts can list** (ADR-Q-019 §3b). Spam and lookalikes
  can't get in, and a host whose authentication is withdrawn drops out.
- **A club is listed under its host's signature**: the host vouches for the
  clubs inside it, and a host with federations switched off (ADR-Q-020) lists
  only itself.
- **Listings expire** (around 90 days) unless renewed, so a host that
  disappears drops out on its own. Withdrawing is one signed message, and
  the listing goes at once.

### 3. People are never listed unless they choose to be

The person sits above every federation (ADR-Q-007, Layer A).

- **Hosts and federations** are listed by default when they're authenticated.
- **A person** appears only if they deliberately publish a **public card**, like
  a business card, and can withdraw it.
- **No membership is ever listed.** Who belongs to what stays between the
  member and the federation.
- Searching for someone who isn't listed finds nothing. It doesn't say
  "hidden".

### 4. The directory is a signed release anyone can hold

Incubator publishes the directory the way a site is released (`releases.ts`):

- the fingerprint of every listing card in it, rolled up into **one root
  fingerprint**;
- a **release number**, naming the release before it;
- **Incubator's signature** on the whole.

Anyone holding a copy checks each listing against its own signature and the
whole against Incubator's root. **A copy can't forge anything; at worst it's
out of date, and its release number says so.**

### 5. "Copy the directory"

On Incubator's **Directory Enquiries** page:

- **The whole directory**: listings are only cards, so it's small (tens of
  megabytes for tens of thousands of listings).
- **Just a part**: by country, by kind (hosts, clubs, businesses), or only the
  directories of treaty partners (ADR-Q-017 §8).

The copy goes into the copying host's **own node directory** (Dgraph), so it
needs a node with the directory job (a Pi 5 or mini PC, not a Pi Zero;
`q/node-sizes.md`). On that host, under Settings → Nodes:

> **Directory: Reached.** Holds a copy of Directory Enquiries · release 214 ·
> up to date · [Keep it up to date: daily]

After the first copy, updates are **only the changes** since the last release:
new listings, renewals, withdrawals.

### 6. Mirrors answer searches too

- A node holding a copy can **list itself as a mirror**, in the directory
  itself.
- The **Find** page on any host asks whichever copies it can reach, nearest
  or least busy first, and combines the answers, removing duplicates by
  listing fingerprint. Searching doesn't depend on Incubator being up.
- A host with its own copy searches it locally first: instant, and offline.

### 7. Fragments are subsets of listings, not a stretched database

Dgraph splits data across machines only **inside one installation**, run
together. Across independent nodes in different homes, each node holds a
complete small Dgraph of **its own part**, copied as signed listings ("Just a
part", §5). A search that needs more asks several and combines (§6). One
directory is never stretched across homes (`q/home-node.md` §5).

### 8. Not the only phone book

- If Incubator went away, every copy still works and can still be checked
  against its last release.
- Another directory (a national association's, say) can join by **treaty**:
  each answers the other's searches, or each carries the other's listings in
  its releases.

### 9. Find, on every host

- A **Find** page: search by words, tags, kind, place, and how people join.
- Each result is the **listing card**, with **Visit** (open that host) and
  **Ask to join** (its consent steps, ADR-Q-007). Joining a club on another
  host means adding a way in for that host's domain (ADR-Q-019 §2).

## Consequences

- **The universe can be found**, through signed cards, with no central owner.
- **Incubator's role is vouching and publishing**, not controlling. Its
  releases are checkable, and copying them is encouraged.
- **The marketplace** (ADR-Q-019 §5) can use the same listing and release
  mechanism for plugins.

## Build order

1. **The listing card** (with its optional pin), made from a host's own page; sent to the gate;
   checked (authenticated host, signatures); kept in Incubator's directory.
2. **Expiry, renewal and withdrawal.**
3. **Find on Incubator**, searching its directory by words and by place (near, within), with a map.
4. **Signed releases**: root fingerprint, release number, the changes since
   the last.
5. **Copy the directory**, the whole or a part, into a host's own node;
   **keep it up to date**.
6. **Mirrors**, and Find on every host asking several copies.
7. **Events, courses and promotions** as listing kinds; bookings and invitations as receipts (tickets).
8. **Public cards for people**, opt-in.
9. **Treaties between directories.**

## Addendum, 3 October 2026: wanted cards, alerts, and Keep

Darren:

> "You want to offer a service, fill in this card, that then just gets
> indexed … I'm looking for CPUs that come up on this directory that are
> under a pound a unit. Get notified."

> "You don't want to be receipting everything you looked at. But what you
> search for, helpful … you only keep what you are interested in … if you
> save a search, then by default that should download that page receipt …
> and then it's offline in your local storage."

**Offers and wants are cards.**

- **Offering a service** (a CPU hour, a GB held, a render minute) is a
  listing card: what, the unit, the price in credits, where, how to book.
  Signed, it's indexed like any listing (§1b).
- **Wanting something** is a card too: a **saved search** ("CPU hours, under
  £1 a unit, within 50 miles"). When a new listing matches, the bellboy rings
  you with the card. Dgraph's number, date and place indexes make it one
  query, run against each listing as it arrives.
- **Taking it up is a trade**, signed by both, inspected by Cedar (ADR-Q-023);
  the receipt is the booking.
- **Saved searches are private.** They run on your own Q or node, against your
  copy of the directory (§5), so nobody, Incubator included, learns what
  you're looking for.

**Looking leaves no trace; keeping does.**

- **Searching records nothing**, for you or anyone.
- **Keep is one button.** It makes a signed receipt: what it was, where from,
  when you saw it, and a fingerprint of what it said then. If it changes or
  goes, you can still show what you saw.
- **Keeping downloads it.** A listing or card is already a signed receipt, so
  the whole of it comes into your vault: instant, offline, still checkable.
  For a page from elsewhere, **the seed rules decide** (Cedar): a full copy
  for your own reference where that's allowed, otherwise the link, the
  fingerprint and your notes. Never republished.
- **A saved search keeps its latest results offline**, refreshed when you're
  online.
- **What you keep becomes your knowledge**: in your vault, searchable, and
  usable as context by your own AI on your own device (ADR-Q-013).

Build order, added: (10) **Keep**, with offline copies; (11) **saved searches
and alerts**; (12) **offers of capacity** as listings.

## Non-claims

This does **not**:

- choose ranking, or how "nearest" is measured;
- set the listing lifetime precisely (90 days is a starting figure);
- decide how Find handles abuse in tags and descriptions beyond what the
  Federation code and Report a host already cover (ADR-Q-019 §9).

## Related

ADR-Q-007 (federations; the person above), ADR-Q-014 (bellboy, directory,
storage), ADR-Q-015 (cards with a purpose), ADR-Q-017 (treaties), ADR-Q-019
(copies, authenticated hosts, marketplace, compliance), ADR-Q-020 (federations
are a plugin), `q/node-sizes.md`, `q/home-node.md`, `releases.ts`.
