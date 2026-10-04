---
status: proposed
implementation: step 1 started 4 October 2026 — kept storage by the month (q-core StoreService; the gate's /store, given only against a purchase it checks in its own shop from one of GATE_OPERATORS; apps/q lib/store.ts, synced like a cloud; the host offers it from Services, people Take it from the shop, and the agreement shows their vault there, its room and its end). Not yet: the button on a federation's page, the Network page. Built before it: hiring a pass-through by the hour (ADR-Q-028 §5)
updated: 2026-10-04
---

# ADR-Q-030 — The network market: providers, wanted offers, and places you can see

**Status: proposed, 4 October 2026.** The pieces of Q's network (relay,
bellboy, directory, storage, switchboard) become things people **provide**,
federations **ask for**, and members **choose**. All three use the
agreements, shops and receipts Q already has.

- A **member** clicks "Use us as a storage source" on a federation's page.
  Their vault starts keeping a copy there, and their **Network** page shows
  where their data is and how safe that makes it.
- A **provider** switches on the **Network provider** plugin and runs,
  offers and accepts everything about the nodes they provide from one panel.
  Their **provider card** carries what they state and what others can prove.
- A **federation** that's getting full sends out a **wanted** offer, and
  its own rules accept the providers that meet its criteria. Nobody needs an
  IT person, and nobody decides by hand.

Underneath are two rules. Price is set so that being big gives no unfair
advantage (the orchid: free to give, never free to take). And nothing is
ever let go until it's held somewhere else.

## Context

Darren, 4 October 2026, after hiring by the hour was built:

> "An orchid only absorbs the nutrients, the value that is around it, and no
> more … when it has what it needs, it stops and lets everything else
> consume … we want to take away the advantage of economies of scale and
> price value at an average of availability … if someone slower comes
> along, are they penalized for being slow or is their contribution
> appreciated?"

> "We are a crew sat on a ship in space … We want to exchange things … in a
> way where trust is open and transparent … Do we choose to have a captain …
> or are we in a situation where we have to all agree?"

On cost: "This is the internal decision-making of that federation or that
provider … I know my cost of sale is 10 pence a gig. So I can see this
federation offering one pound a gig, so I can make money if they buy it off
me." On demand: "They already had a terabyte of capacity of which only 5 gig
were being used. They don't need me … as capacity heats up and reaches a
threshold, 70% or whatever … it starts going, we need more capacity."

On running it: "We don't want admin paying for an IT guy deciding to add
another node … when it reaches 70%, it pings out a request … that appears on
the grid that a provider can scroll through … my card will send stats about
me, my server, health and reputation … I'll accept 50p a gig, pass-through
rate … or 70p a gig, allocated space … sold on a monthly clock."

On the member: "All I need to do is, if I went on a Federation's page and
they had in their network offer 'use us as a storage source', click that.
You get all the receipts you need to then have your own vault automatically
sync, create a copy, and appear in your own dashboard of networks where you
can see where your data is, which nodes, how healthy … I might choose
sensibly to have three … from different locations … It's self-responsibility,
not relying on the network to do it for you."

And: "One of the plugins available … is network provider … a panel that you
can run, manage, offer, accept, everything relating to the nodes that you are
offering … a relay, bellboy, a Dgraph directory, or storage or a switchboard
… that way we have the metrics locked in, and what card can be sent and read
by a federation."

What already exists:

- **Hiring a pass-through by the hour** (ADR-Q-028 §5). It's a standing
  offer in a shop whose terms describe the service. Q uses every
  pass-through you've hired, and the hire is settled from the custody
  receipts.
- **Custody receipts**: "held", signed by the node, and "arrived", signed by
  you. Nothing is let go without them.
- **`howSafe()`** and the **Network** page: ways to survive rather than
  number of copies, each place checked, stale, or only told.
- **Plugins**: the host offers them, and each member switches them on or off
  (ADR-Q-020 addendum).
- **Cards with a purpose** (ADR-Q-015), **shops and standing offers**
  (ADR-Q-026), and **mints** (ADR-Q-027).
- **The white paper's formulas**: cost of service is fixed costs over
  lifespan plus running costs; minting follows rolling utilisation against a
  target of about 80%; prices are set apart from services.
- **The node**: Nebula mesh, bellboy, Dgraph directory and SeaweedFS storage,
  run on Hetzner on 1 October (`node-hetzner-test.md`).

## Decision (proposed)

### 1. For a member: a federation is one of your places

A federation that offers storage shows **Use us as a storage source** on its
page, with its price, its allowance, and its record (§5).

- **One click** takes the offer. It's a standing offer in the federation's
  shop, so taking it is an agreement like any other (ADR-Q-025, -026). It's
  signed, checked by the rules, and kept in your vault.
- That agreement is **all Q needs**. It names where the storage is, your
  space, the price and the term. From then on, each sync keeps a copy of
  your sealed vault there, as it does with your bucket (ADR-Q-028 §2). What
  it holds is never readable by the federation or its providers.
- It appears on your **Network** page as a place, with its standing
  (checked, stale or told) and its record. `howSafe()` counts it by fate:
  three federations in three locations are three ways to survive, while two
  federations whose providers share one box count as one.
- **You decide whether to add another.** The page says plainly how many
  independent ways your vault survives, which have been checked lately,
  and what adding one more would change.

**No invented percentage.** "80% secure" would be a number Q can't stand
behind. The page shows what it can prove: the ways to survive, each one's
record, and when each was last checked. If a single headline is wanted,
it's the `howSafe()` level (danger, warn, good), and its reason is always
one tap away.

Your Google Drive, your own bucket and your download stay in the order
ADR-Q-028 sets. Federations are added to those, never a replacement for
them.

### 2. For a provider: the Network provider plugin

Switched on from **Installed** like any plugin, it adds a panel with the
same four parts for each service you provide (relay, bellboy, directory,
storage, switchboard):

| Part | What it shows and does |
|---|---|
| **Run** | Is it up, how full is it, how healthy is it, checked live from the browser |
| **Offer** | Your listings in your shop, and the **wanted** grid (§6) to answer |
| **Accept** | Offers and hires coming in, checked against your own rules |
| **Earnings** | What's been settled, from the receipts |

- **The node runs on your machine**: a mini PC, a Pi, a NAS or a rented
  server. Q in the browser manages it and never becomes the server. The
  plugin hands you the node's **Compose file as a signed manifest**
  (`home-node.md` §9, ADR-Q-006), so setting up a node means taking a file
  you can read and check.
- "Offer it in your shop, by the hour" (built, on the host's pricing card)
  moves here.
- **Your cost is your own business.** A grant, solar panels or cheap
  hardware are your advantage. The plugin helps you work your cost out (the
  white paper's cost of service, from the kit and its lifespan, power draw
  and electricity), but it's never published unless you choose.
- **Whether to put by for new kit is the operator's decision**, not the
  network's. A separate finance plugin could help: put in the capital, its
  lifespan and any repayments, and see what each gigabyte would need to
  earn. What it answers informs the operator's price; it isn't part of how
  the network runs.

### 3. The provider card

A card with a purpose (ADR-Q-015): `inqbeta.provider-card/1`, one format
every federation reads, so offers compare like with like and the metrics are
fixed. It's signed by the provider and updated quietly (ADR-Q-015 §4).

| Stated (the provider's word) | Proven (others' receipts) |
|---|---|
| Services offered, capacity, open hours | Files held, and how many arrived against how many were lost |
| Rough location (a region, for separate fates) | Corruption caught on pickup (every file is named by its hash) |
| Price, and the contract shapes offered (§4) | Uptime: whether it answered at each check |
| Spec (optional), and how long it's been running | How long it's been providing, and for how many hirers |

The two columns are always shown apart. A federation's rules can require
the proven column (say, "at least 30 days and 99% answered").

### 4. Two shapes of contract

- **As available** (built): "use my space until it's full". You pay for
  what's held, in GB-hours, from the custody receipts. There's no
  guarantee.
- **Reserved**: "100 GB set aside for you, for a month". It's paid for
  whether it's used or not. It's an **obligation**: the provider can't sell
  it twice, and the gate counts it like shop stock. Because it's a
  guarantee, it costs more.

A term can be an hour, a month or a year. At the end, the provider offers
again (perhaps at a new price) or doesn't. Once the space is promised and
the price agreed, it's a closed deal.

### 5. The record, from receipts

Reliability is measured from what the hirers already hold, never from a
provider's own figures:

- **Arrived or lost.** A "held" receipt followed by an "arrived" one is a
  file delivered. One that timed out or vanished is a file lost.
- **Corruption.** A file whose bytes don't match its name is caught the
  moment it's picked up.
- **Uptime.** Whether the node answered at each sync.

Each hirer's Q keeps these. To build a shared record, a hirer's Q can sign a
**summary** (counts only: files, arrived, lost, corrupted, checks answered,
for a period) and send it to the provider's card. No file names and no
times. A provider can't forge a hirer's signature, and hirers who never
share simply aren't counted.

### 6. Heat and wanted offers

A federation's **heat** is how full its own storage is.

- While it's cool, it needs nobody, however cheap the offers.
- When the heat passes its **ask threshold** (set by the federation, say
  70%), Q posts a **wanted offer**: a standing offer in reverse. "We'll take
  100 GB, reserved, for a month, at up to 70p a GB." It's listed on a
  **grid** every provider can browse (and found through Directory
  Enquiries, ADR-Q-021).
- It stops asking below a lower threshold (say 50%), so it doesn't flip on
  and off as files come and go.
- **Accepting is by rules, not by hand.** The federation writes its criteria
  once, as rules the engine checks (ADR-Q-008, -009): the most it will pay,
  the proven record it requires, regions to prefer for separate fates. An
  offer that meets them is accepted and signed, and one that doesn't is
  declined with the reason. Nobody needs to be an IT person.
- This is the white paper's own idea: minting follows rolling utilisation
  against a target. One reading of how stretched a federation is can drive
  both minting and buying in.

### 7. Joining and leaving the mesh

- **Nebula is the private road, not the load balancer.** Accepting a
  provider issues a **Nebula certificate valid until the contract ends**.
  The provider's node joins the federation's mesh, and drops off when the
  certificate expires.
- **Storage spreads the files.** The provider's node runs a SeaweedFS
  volume server. The federation's master sends new files to servers with
  room, and keeps copies on servers in different regions.
- **Leaving is draining first.** Before a contract ends (or when a provider
  stops), the federation moves what that node holds elsewhere, and only then
  lets it go. This is the custody rule again: nothing let go until it's held
  elsewhere. A certificate never expires with data still on the node.

### 8. Price: a band, chosen by the crew

- **The federation publishes the market**: its price, its demand, its heat.
  Providers read it and decide for themselves.
- **The price index** (in the directory, Dgraph). Every offer and wanted
  offer records its price per GB, so the directory keeps an index: the
  average over the last hour, day and month, across the whole incubator
  universe, beside the commercial providers' published prices and free
  allowances (a simple survey of the top ten). Anyone can see where their
  price fits, and whether storage is getting cheaper or dearer: evidence
  for planning and investment.
- **The band.** The *floor* is the average stated cost of its providers,
  weighted by the capacity each offers. The *ceiling* is the commercial
  providers' published prices, converted to the same unit (GB-hour against
  GB-month). **Five times cost of sale** is a marker, not a rule: the room
  above cost is what pays for the white paper's four-way split.
- **The price is chosen within the band by the federation's governance**, with
  the index as its evidence: a captain, a vote, or lazy consensus. Its charter says which, through the
  Plans and Offices blocks (ADR-Q-007 §5).
- **The orchid line** (a federation's choice). Every provider is paid the
  common rate. A federation may also set an *enough line* per provider,
  above which earnings go to its commons (to lower the price, or carry a
  slower member) rather than to growth. A slower provider is carried, openly,
  rather than cut out.
- **Gifted kit.** Space bought with a grant or shares costs almost nothing to
  run, so its limit is capacity. When it's full, it's full, and new files go
  to the next node. When a federation has to buy space in, its rate becomes
  the average over everything it has, reset each period.

### 9. Hot and cold: the vault doesn't have to be in one place

Free allowances are small (around 5 GB to 15 GB). A vault that has grown to
20 GB can't fit in one, unless only part of it needs to be there.

- **A vault is already in pieces.** Every file is sealed on its own and named
  by its hash, so any place can hold some files and not others.
- **Hot**: what's recent (say the last three months of receipts and files)
  plus the index of where everything is. Small, so it fits a free allowance
  and syncs quickly.
- **Cold**: everything, including the hot part, in cheaper or slower places:
  a federation, your bucket, your download. When you open something older,
  Q fetches it from the cold place, checks it against its name, and keeps it
  hot for a while.
- **The hottest place is the device in front of you.** You work from what's
  on it. Every time you attest something, it's sent straight out to your
  places (your bucket on every save; the rest at their own pace). Anything
  waiting for you at the bellboy is picked up whenever you're on, and once
  it's safely kept, Q says "got" so the sender's copy can be let go. So the
  device always has the newest, and the network soon has it too.
- **The only gap is what you made while offline.** What comes *to* you is
  never at risk: the bellboy and the sender keep it until you say "got".
  Anything you exchanged is in the other person's vault as well. What you
  made yourself since the last sync exists only on this device until it next
  reaches a place. Q shows that plainly ("2 things not yet copied anywhere"),
  and it goes the moment you're back online.
- **Never less safe.** The index says where every file is, and `howSafe()`
  counts ways to survive for the whole vault, hot and cold together. A file
  is only dropped from hot once it's held in cold.

### 10. Spare space: anyone can carry

Darren, 4 October: "Anybody could offer their capacity up that they're not
using … in a field … passing across files over Bluetooth … use me as a
carrier, and I earn a little bit of credit just by being that. It's not
taking anything away, and I can go offline any time … an incredible
incentive for the network to self-replicate."

- **Any spare space can be offered as available**: a corner of a phone, a
  laptop, a home NAS. It's the "as available" shape (§4): no promise, gone
  the moment you go offline, and nothing is lost when it goes, because the
  sender keeps every file until another place has signed for it.
- **Carriers are paid by the receipts.** A carrier earns for each file it held
  that later arrived, from the same "held" and "arrived" receipts that
  settle a pass-through. Carrying sealed boxes it can't open means a carrier
  learns nothing.
- **In a field**, phones pass sealed files to each other (Bluetooth, local
  Wi-Fi) until one reaches signal: the original problem Q was made to solve,
  with carriers rewarded for helping.
- **Someone else's cloud space** (a spare gigabyte of Google Drive, say) is
  technically just another place, but consumer cloud accounts usually aren't
  meant to be resold. Check the provider's terms before offering it.

## Build order

1. **"Use us as a storage source"**: the federation's offer, one click to
   take it, the agreement as the place, the sync keeping a copy there, and
   the place on the Network page with its standing. The gate needs a
   **store** to go beside the relay: per hire, within the space agreed, kept
   until the hire ends and then given back. Tests first.
   **Started 4 October:** kept storage by the month, offered from Services and
   taken from the shop; the gate's `/store` sets space aside only for a
   purchase it can check in its own shop, by one of `GATE_OPERATORS`, naming
   this node; each sync keeps the vault level there like a cloud; the
   agreement shows the vault's size there, the room and the end date. Still
   to do: the button on a federation's page, and the place on the Network
   page.
2. **The record**: the custody receipts per place on the Network page
   (arrived, lost, corruption, uptime), then signed summaries sent to
   provider cards.
3. **The provider card and the Network provider plugin**: Run (health), Offer
   (the existing shop offer moves here), Accept, Earnings.
4. **Reserved contracts**: space counted at the gate; terms by the month;
   renewals.
5. **Heat and wanted offers**: the thresholds, the grid, and acceptance by
   rules.
6. **The mesh**: Nebula certificates per contract, SeaweedFS volume servers,
   and draining before a contract ends. Tested first on the mini PC and the
   Hetzner node (`home-node.md` §7).
7. **The price index** in the directory, the band and its governance, and
   the orchid line, once a federation has more than one provider.
8. **Hot and cold**: the index of where each file is, recent files kept hot,
   older ones fetched from cold when opened.

## Open questions

- **Who chooses the price within the band**: each federation's charter says
  (members, providers, or both); the index is the evidence either way.
- **SeaweedFS on people's own connections.** SeaweedFS is made for servers
  in one building on fast, steady links. Providers' nodes will be in homes
  and offices, with slower upload and connections that drop. Does it cope
  with nodes being slow or vanishing for an hour, and with a stranger's
  server inside a federation's storage? To be measured (`home-node.md` §8).
- **How far back is "hot"**, and what goes in the index so that a new device
  can open from hot alone.
- **A federation's key as the Nebula authority**: still untested.
- **Summaries' privacy**: whether counts per period could still reveal too
  much about a small hirer's habits.

## Non-claims

This does not:

- describe anything built beyond ADR-Q-028's hiring;
- promise a record is a guarantee. A good record is evidence, not insurance;
- set prices, thresholds or margins (every figure here is an example);
- give financial or legal advice. Paid storage between members needs the
  accountant's and solicitor's view before real money moves (ADR-Q-027).

## Related

ADR-Q-006 (manifests), ADR-Q-007 (federations, blocks), ADR-Q-008 and -009
(rules and the engine), ADR-Q-014 (bellboy, directory, storage unit),
ADR-Q-015 (cards), ADR-Q-017 (the commons), ADR-Q-020 (plugins, specialised
hosts), ADR-Q-021 (Directory Enquiries), ADR-Q-023 (credits and the exchange),
ADR-Q-025 and -026 (agreements, shops), ADR-Q-027 (mints), ADR-Q-028 (copies
in order, hiring by the hour), `home-node.md`, `node-hetzner-test.md`,
`providers-and-the-commons-market.md`, `q-core/src/lifecycle.ts`
(`howSafe`), the white paper (December 2025), §7 and §8.
