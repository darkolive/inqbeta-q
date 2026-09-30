# ADR-Q-010: Messages — person to person, through a post office on the node

**Status: proposed, 28 September 2026.** Darren: "it's federation based? But
then how can I just send a message to someone who's not in the federation,
but a friend of mine? … find a way that is free as possible." Then: "implement
this suggestion … Mosquitto on our mini PC … tomorrow I'll plug in the mini PC
and we can start installing … a standalone node."

**Then (same day), the architecture beyond one box:** post offices as a
service that federations offer, a directory of those offers, a default
"commons" so nobody is stranded, several post offices instead of a cluster,
Nebula's place, native apps and waking, and capacity (§10–§14).

**Built:** the day-one node, `node/` (uncommitted, **not yet run**):
`compose.yaml`, Mosquitto's `mosquitto.conf` and `acl`, `bin/add-user.sh`,
and the audit `bin/check.sh`, which tests every must and cannot below against
the running broker. Runbook: `node/README.md`. The first run is on the mini PC,
29 September.

---

## The idea in one paragraph

A message needs no federation. **A friend is another DID**; a message is a
**receipt, signed by you and sealed to their key**; it travels through a
**post office** (an MQTT broker) that can neither read nor change it. The post
office runs on the node, starting with the mini PC, and holds sealed messages
for people who are away. Spin, from ADR-Q-009 §6, is not the post office. It
publishes *to* one. Its job here is checking, not carrying.

## 1. Friends, not federations

ADR-Q-009 §6 already allows a ring to one person to carry "the signed receipt
sealed to them". This ADR widens that from rings to messages.

- **Becoming contacts** works like a federation invitation (ADR-Q-007): a
  link or QR code with your key in the `#fragment`. Both sides sign a
  `contact.made` receipt. No club, no caretaker, no manifest.
- **Ending it** is `contact.ended`, signed by either side alone (like leaving).
  It is also how blocking works: the post office's check (§7) refuses a
  message to someone who has ended the contact.
- A federation topic stays what ADR-Q-009 said it was: news about that
  federation (a receipt's hash and kind), never private messages.

## 2. The inbox id

Every DID has one inbox, at `q/in/<inbox-id>`.

- **Proposed:** `inbox-id = base32lower(sha256("inqbeta.inbox/1" ‖ did))`,
  first 26 characters. It is stable, and it says nothing about who owns it
  unless you already know their DID (ADR-Q-001 §9: topics don't reveal
  membership).
- Each **world** (ADR-Q-005 step 6) is its own DID, so it has its own inbox.
  Your business contacts never see your personal inbox.
- Day one uses plain names (`darren`, `friend`) until §5 lands.

## 3. A message is a sealed receipt

- **Signed** by the sender's DID, and **sealed** (X25519, `seal.ts`) to the
  recipient's key, and to the sender's, so both vaults can keep it.
- The broker sees ciphertext and an inbox id. **Delivery is not evidence**
  (ADR-Q-009 §6). The receipt in each vault is the evidence; if the broker
  loses it, sync catches up.
- **Size:** a message is text and small things. Photos and files go into
  storage (SeaweedFS or the person's cloud), and the message carries their
  hash and a sealed key.

## 4. The post office: Mosquitto

Chosen for day one because it is tiny, mature, open source (EPL/EDL), speaks
MQTT over WebSockets for browsers, holds messages for people who are away
(persistent sessions), and has per-user topic rules built in. EMQX and NanoMQ
were the alternatives; either can replace it later without changing Q,
because MQTT is the standard, not the product.

**Its musts and cannots**, each one a line in `node/mosquitto/`, each one
tested by `node/bin/check.sh`:

| Rule | Config |
|---|---|
| **Must** sign in; nobody is anonymous | `allow_anonymous false`, `password_file` |
| **Cannot** read any inbox but your own | `acl`: `pattern read q/in/%u` |
| **May** post into any inbox | `acl`: `pattern write q/in/+` |
| **Must** hold sealed messages for people who are away, up to 30 days | `persistence`, `persistent_client_expiration 30d` |
| **Must** survive a restart | `persistence true`, `autosave_interval 60` |
| **Cannot** carry more than 256 KB | `max_packet_size 262144` |
| **Cannot** keep anything past delivery | `retain_available false` |
| **Cannot** log who talks to whom | `connection_messages false` |
| **Cannot** expose broker internals | no `$SYS` grant in `acl` |

## 5. Signing in to the post office — passwords first, the DID next

Day one uses passwords made by `bin/add-user.sh`. The target keeps the order from
`docs/q/channels.md` (passkey first, then everything else):

1. Q asks the node for a challenge.
2. Q signs it with the DID it signed in with.
3. A **Spin** component checks the signature, works out the inbox id (§2),
   and issues a short-lived credential for that inbox only.

The link between Mosquitto and Spin is **to verify**: the
`mosquitto-go-auth` plugin's HTTP backend calling Spin, or Mosquitto's own
dynamic security plugin updated by Spin. Either way, nobody holds a password,
and the inbox you can read is the one your key proves.

## 6. Reaching it from outside the house — to decide

| Option | Cost | Trade-off |
|---|---|---|
| **Cloudflare Tunnel** (outbound from the box, no router port) | Free | The domain's DNS must be on Cloudflare. Suggest moving **one** spare domain (e.g. `inqbeta.network`) and leaving `inqbeta.com` at Namecheap. Cloudflare terminates TLS, but sees only sealed messages. |
| **Router port + Caddy + dynamic DNS** | Free | Exposes the home IP; Caddy gets the certificate. |
| **A free cloud broker** (HiveMQ Cloud, EMQX Serverless) as a second post office | Free tier, limits on connections | Q can hold a short list and try each; they only see sealed messages. |

Not Vercel: serverless functions can't hold MQTT's long-lived connections.

## 7. The action: `message.send`

A core action (ADR-Q-009), checked by Cedar on the device before sending and
by Spin on the node before accepting:

- **must** be signed by the sender's DID;
- **must** be sealed to the recipient's key (the content is never in the clear);
- **must** name a live `contact.made` between the two DIDs, or be a first
  message carried by an invitation;
- **cannot** go to someone who has ended the contact;
- **cannot** exceed the post office's size.

A federation can add forbids to it (a club might forbid messages from a
suspended member to the club, for instance) but never a permit.

## 8. Friends who don't have Q yet

Channels (`docs/q/channels.md`): an email or SMS carrying only a link to the
receipt. They open inqbeta.com, press the passkey, get a DID, and the message
is sealed to it on the spot. Their reply makes the contact.

## 9. Waking a sleeping phone

MQTT reaches devices that are awake. A sleeping one is woken by **Web Push**,
carrying nothing but "wake up" (ADR-Q-009 §6); Q then fetches from its inbox.
Web Push is free. On iPhone it works once Q is added to the Home Screen.
Native iOS push (PushKit) needs a paid Apple developer account, and waits
until there is a native app.

## 10. Post offices are a federation service

Darren, 28 September: "people aren't going to have a post office … in order
to communicate with an interested party in your address book, they've got to
be a member of something like you that has a post office … here's a list …
so you then get a directory of federations [that] offer capacity, storage
services and messaging."

Most people will never run a node, just as most people never run a mail
server. So:

- **Everyone attaches to at least one post office**, chosen from a list when
  they first need one. Attaching is a signed receipt, `postoffice.attached`,
  naming the post office and the offer it accepted. Detaching is signed by the
  person alone (ADR-Q-007: exit never needs permission).
- **Where to send to you** is published beside your key: the post offices
  you're attached to, in order. A sender reads that and posts there.
- **You and your friend don't need the same one.** Your post office passes
  the message to theirs, as mail servers do. The only requirement is that
  each of you is attached to *a* post office.
- **Several at once** (§11): attach to two or three, and a sender posts to
  all of them. Your Q collects from whichever answers and drops duplicates by
  receipt hash.

### The directory of offers

A federation that runs nodes can **offer services** to people who aren't
members, or to its own members only:

| Service | What it is | The number that matters |
|---|---|---|
| **Post office** | Mosquitto, holding sealed messages (§4) | Inboxes, messages a day, days held |
| **Call relay** | TURN, for calls that can't connect direct (ADR-Q-004) | Relayed calls at once |
| **Storage** | SeaweedFS or IPFS Cluster, for files and backups | GB per person, copies kept |

Each offer is an **action definition in the index** (ADR-Q-009): its musts and
cannots ("cannot read what it carries", "must hold for 30 days", "must give
30 days' notice before closing"), its capacity and its terms (free, donation,
members only). Searchable in Dgraph: "post offices with room, in the UK, free".
As ever, the index finds and the hash decides.

A federation offering a service turns on a **Services block** (ADR-Q-007 §5),
which brings its own musts: publish real capacity, say when it's full, and
give notice before withdrawing, so nobody's inbox vanishes overnight.

### The commons: nobody is stranded

On day one there is no directory. **inQbeta runs a default post office and
call relay, the commons**: the mini PC first, then a small rented server.
A new person attaches there automatically and can move to a federation's
post office later. The commons is a federation like any other, with the same
offer and the same cannots, so it holds no special power.

## 11. Several post offices, not a cluster

Open-source Mosquitto doesn't cluster (clustering is in the paid Mosquitto
Pro; EMQX moved to the Business Source License in 2025). **We don't want a
cluster anyway**: clusters need low, steady delays between their machines,
the same reason Dgraph isn't stretched across homes (home-node.md §5).

Redundancy comes from **copies, not coordination**:

- each person lists several post offices (§10); senders post to all;
- a federation's nodes can **bridge** inboxes to each other (Mosquitto's
  built-in bridge: chosen topics copied to another broker), so losing one box
  loses nothing;
- duplicates are harmless: the same receipt always has the same hash.

## 12. Where Nebula fits

- **Inside a federation:** yes. Its nodes' post offices bridge to each other
  over the federation's own Nebula mesh, alongside Dgraph and storage traffic.
  A node can be in several federations' meshes at once, each kept apart.
- **Across everyone:** no. A Nebula mesh is governed by whoever signs its
  certificates, so one mesh for everyone means one authority over everyone.
  It also wouldn't reach a friend who is in no mesh.
- **What reaches everyone** is the public side: each post office's secure
  WebSocket address (§6), and iroh for dialling a key directly.

## 13. Native apps and waking

The design doesn't change for an iOS or desktop app. Only the wake-up does.

- **Mobile data is just internet.** MQTT works the same over 4G/5G as over
  wifi. Sending SMS is different: an iPhone app can only open a text for the
  person to send, and an SMS gateway costs per message, so SMS stays a
  fallback for friends without Q (§8).
- **iPhone, native:** iOS closes an app's connections soon after it's left,
  so push is still needed. Native gets Apple push (free to use), and a
  notification service extension that **unseals the message on the phone**
  before showing it, so Apple carries only "wake up". Calls ring on the real
  call screen (PushKit + CallKit).
- **The catch:** an Apple Developer account (about £79 a year), and Apple
  push for the Q app can only be sent with Dark Olive's Apple key. That means
  one small **wake-up service** holding the key, taking "wake inbox X" from
  post offices and sending nothing else. It is the one central piece; its
  cannots: carry no content, keep no log of who woke whom.
- **Web Push** (browser, installed Home Screen app, desktop) needs no central
  key: any post office can send it. Use it everywhere except the native
  iPhone app.
- **Desktop apps** can stay running and keep their connection open, so they
  barely need push.

## 14. Capacity: what it costs

Worked example, far above real use: **1,000 connections, 1,000 messages a
second, ~2 KB per sealed message.**

| | Needs |
|---|---|
| Memory | Tens of MB |
| CPU | A small part of one core (Mosquitto handles tens of thousands of small messages a second) |
| Bandwidth | **~16 Mbit/s in and ~16 out**; ~5 TB a month each way |
| Disk | Held messages capped at 1,000 per person: a few GB at worst |
| At home | Electricity, about £3 a month; 16 Mbit/s of the BT line's upload (about 110 Mbit/s on paper, to measure) |
| Rented | A small Hetzner server, a few euros a month with ~20 TB traffic included |

**Real use is far lower.** 1,000 people sending 100 messages a day each
averages 1–2 messages a second, with peaks around 50.

**Calls are the real cost.** Direct calls cost the relay nothing. Relayed ones
(roughly 1 in 5, more on mobile networks and office wifi) use about 2–5 Mbit/s
of the relay's upload each. Twenty relayed calls at once would use most of a
home line's upload, while 1,000 messages a second barely registers. So in the
directory, **relayed calls at once** is the number an offer must state
honestly, and Q spreads calls across several relays.

## Build order

1. **Day one** (29 September): the standalone post office on the mini PC,
   `node/README.md`, audited by `bin/check.sh`. Home network only.
2. Browser: Q connects over WebSockets (port 9001), sends and receives sealed
   messages to a test inbox.
3. `contact.made` / `contact.ended` and the inbox id from the DID (§1, §2).
4. `message.send` in `q-actions` (§7).
5. Signing in with the DID through Spin (§5); passwords go.
6. Reaching it from outside (§6), then Web Push (§9).
7. The commons (§10): the mini PC's post office and call relay as inQbeta's
   default, `postoffice.attached`, and "where to send to you" beside the key.
8. The Services block and offers in the action index (§10); bridging between
   a federation's post offices over Nebula (§11, §12).
9. The wake-up service and native push, when there is a native iPhone app (§13).

## Non-claims

This does **not**:

- claim anything has run: the node files have not been started yet;
- decide how the house is reached from outside (§6);
- decide the Mosquitto–Spin link (§5), which is to verify;
- fix the inbox id derivation (§2), which is proposed;
- measure anything in §14: those figures are estimates, to be replaced by
  what `bin/check.sh` and a load test on the mini PC show.

## Related

ADR-Q-001 (relays keep only that they carried), ADR-Q-004 (calls and ringing),
ADR-Q-007 (invitations), ADR-Q-009 §6 (MQTT carries news, never evidence),
`docs/q/channels.md`, `docs/q/home-node.md`.
