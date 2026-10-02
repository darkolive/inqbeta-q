---
implementation: design
decision: names agreed; sizes are estimates except where marked measured
updated: 2026-10-01
---

# Node sizes: the bellboy and the directory

**1 October 2026.** After the Hetzner test (`node/HETZNER.md`,
`q/node-hetzner-test.md`), Darren named the two jobs a node does and asked how
small a machine can do each one.

## The names

- **Bellboy**: Mosquitto. First called "post office", then "post box", then,
  the same day, Darren: "a post box suggests there's something in it, like a
  letter … this is more like a bellboy who comes up to you and says, there is
  a phone call for you, sir, in reception. So you know where to go to then
  have the phone call." The bellboy tells you **that** something is waiting
  and **where**. He doesn't carry the conversation, and can't read it.
- **Directory** (was "index"): Dgraph, where things are found. It's the
  telephone directory that used to sit in the phone box.
- **Lighthouse**: Nebula's meeting point for a federation's mesh. A third,
  very small job, listed here for completeness.
- **Storage** (2 October, was "storage unit"): SeaweedFS and the gate, the
  holding bay where sealed things wait until they're collected. Darren: "just
  call it storage." The icon and record keep `storage-unit` / `storage`.
- **Switchboard** (2 October, was "relay"): coturn, a TURN relay. Darren:
  "that's how you used to make calls, through the switchboard." It connects a
  call when two devices can't reach each other, and unlike the old operators it
  can't listen in: everything it passes is encrypted. Lucide's `cable` icon.
  The compose service and profile keep the technical name, `relay`. Sizes:
  `q/node-capacity.md`.

Q's federation screen uses these names and icons now (Lucide's
`concierge-bell` and `book-user`). The node record's field names stay
`postOffice` and `index` so records already written still read.

**What the name asks of the design.** Today the bellboy (ADR-Q-010 §3–§4)
holds the **sealed message itself**, up to 256 KB, until it's collected. A
true bellboy would carry only the **notice**: a receipt's hash, its kind, and
where to collect it. The message would wait somewhere else: on the sender's
device (both must be online), in the federation's storage, or fetched directly
with iroh. That is an open decision, not yet made. If it's taken, the bellboy
gets smaller still: a notice is a few hundred bytes, not 2 KB.

## Why uptime matters less than it sounds

A bellboy only has to be on duty **some of the time**:

- Senders post to **every** bellboy the recipient is attached to (ADR-Q-010
  §10–§11). If one is off, another carries the message.
- If all of them are off, the message waits in the sender's Q and goes when
  one comes back. Nothing is lost.
- Delivery is not the evidence. The signed receipt in each vault is, so a bellboy
  that drops out mid-way costs time, not truth.

So a £15-class computer on a windowsill can be a real bellboy. What it needs
is enough memory and storage for the messages it's holding.

---

## 1. The bellboy

### What limits it

- **Memory.** Mosquitto 2.0 keeps **every held message in memory**. The
  persistence file on disk is a copy, saved every 60 seconds (our
  `autosave_interval`). So RAM is the real limit, and the disk needs about the
  same again.
- **Our limits** (`node/mosquitto/config/mosquitto.conf`): at most 1,000
  messages waiting per inbox, 256 KB each, held up to 30 days.
- **A sealed message is small**, about 2 KB of text (ADR-Q-010 §14). Photos and
  files go to storage and travel as a hash.

| Held at once | Memory used |
|---|---|
| 50 inboxes × 100 messages waiting × 2 KB | about 10 MB |
| 1,000 inboxes × 100 waiting × 2 KB | about 200 MB |
| Worst case: one inbox full of 256 KB messages | 256 MB for that one inbox |

On a small box, add `max_queued_bytes` (for example 5 MB per inbox) beside
`max_queued_messages`, so one full inbox can't fill the memory.

- **CPU and bandwidth** barely register: one core handles thousands of messages
  a second, and home broadband is plenty (ADR-Q-010 §14).
- **Mosquitto runs on almost anything.** The official image is about 10 MB and
  is built for 32-bit ARM (v6) and 64-bit ARM as well as Intel/AMD.

### Smallest specification

- 512 MB RAM, any ARM or x86 Linux
- 8 GB storage or more
- Wired network or wifi
- Docker if you want to use the same `node/` files; plain `apt install
  mosquitto` is lighter on the very smallest boards

### Devices

Prices are Raspberry Pi list prices in US dollars, April 2026. They have risen
sharply since late 2025 because of memory shortages.

| Device | RAM | Price | Good for |
|---|---|---|---|
| **Raspberry Pi Zero 2 W** | 512 MB | $15 | The smallest sensible bellboy: a household, a street, a club. Tens of inboxes; hundreds if people collect promptly. |
| Raspberry Pi 4 Model B | 2 GB | $35 | Hundreds to a few thousand inboxes. |
| Raspberry Pi 5 | 2 GB | $65 | The same, faster, with room for Nebula and more. |
| Any old laptop, NAS or mini PC that runs Docker | 2 GB+ | already owned | As the Pi 4/5. |

**Storage on a Pi:** saving every 60 seconds wears a microSD card. Use an
A2-rated card, or for a box meant to run for years, a small USB SSD.

---

## 2. The directory

### What limits it

- **Memory and disk speed.** Dgraph caches what it reads, and writes in bursts
  as it compacts. It slows badly on a microSD card.
- **64-bit only.** The official Dgraph image is built for 64-bit Intel/AMD and
  64-bit ARM, with no 32-bit build.
- **Dgraph's own production guidance** is far above our needs: Alpha 8+ cores,
  16 GB+, 3,000+ IOPS; Zero 2–4 cores, 4 GB. That's for big clusters. One
  federation's own directory (thousands to hundreds of thousands of receipts)
  needs much less.
- **Measured, 1 October 2026:** Dgraph v25.4.1 (Zero and Alpha) and the bellboy
  together on Hetzner CPX12 (1 vCPU, 2 GB), with Dgraph's cache capped at
  512 MB: 471 MB used, swap untouched, with a test's worth of data.

### Smallest specification (estimate)

- 64-bit, 4 cores
- **4 GB RAM** (2 GB works for a test with the cache capped)
- **An SSD**, not a memory card

### Devices

| Device | RAM | Price | Notes |
|---|---|---|---|
| **Raspberry Pi 5** + NVMe SSD (M.2 HAT) or USB SSD | 4 GB | $110 + SSD | The smallest directory we'd suggest. |
| Raspberry Pi 4 Model B + USB 3 SSD | 4 GB | $100 + SSD | Workable, slower. |
| Raspberry Pi 5 + SSD | 8 GB | $175 + SSD | Room for a directory and a bellboy together. |
| Mini PC (Intel N100 class) | 8–16 GB | varies | Comfortable; Darren's mini PC is this kind of machine. |
| Hetzner CPX12 / CPX22 | 2 / 4 GB | €11.49 / €19.49 a month | Measured (CPX12). CPX22 if the directory grows. |

**Not a Pi Zero 2 W:** 512 MB is too little for Dgraph.

Each node keeps **its own** directory, built from the receipts the federation
shares. One directory is never stretched across homes (home-node.md §5).

---

## 3. Together or apart

They're separate jobs, and a federation needs different numbers of each:

- **Bellboys should be everywhere**: small, cheap and plentiful. More of them means messages get through even when some
  are off.
- **Directories are fewer and heavier**: a few per federation, on machines with
  memory and an SSD.

So a node takes a **role** when it's set up:

| Role | Smallest device |
|---|---|
| Bellboy only | Raspberry Pi Zero 2 W |
| Directory only | Raspberry Pi 5 4 GB + SSD |
| Both | Raspberry Pi 5 8 GB + SSD, or a mini PC |
| Lighthouse | Needs a fixed public address, so usually a small rented server rather than a Pi at home |

**Next in `node/`:** Compose profiles, so a node runs one role or both,
for example `docker compose --profile postbox up -d`. The Q form already lets a
caretaker tick bellboy, directory or both.

## Non-claims

This does **not**:

- claim anything has run on a Raspberry Pi. The only measured figures are from
  Hetzner CPX12 (x86), with test data;
- size the directory for a large federation. That needs a load test with real
  receipts;
- account for Mosquitto 2.1's new SQLite persistence plugin, which might keep
  held messages on disk rather than in memory. To check, because it would make
  the smallest bellboy smaller still;
- fix prices. Raspberry Pi prices moved a lot in 2025–26.

## Sources

- Raspberry Pi prices: magazinmehatronika.com, "The 2026 Raspberry Pi pricing
  and buying guide"
- Dgraph resource table: docs.dgraph.io, Architecture
- Image architectures: Docker Hub API, `dgraph/dgraph:latest` (amd64, arm64)
  and `eclipse-mosquitto:2` (amd64, arm64 v8, arm v6, others)
- Mosquitto holds all messages in memory: Roger Light, mosquitto-dev list
- Mosquitto 2.1 SQLite persistence plugin: Cedalo, "Introducing Eclipse
  Mosquitto 2.1"

## Related

ADR-Q-010 (messages; §10 the directory of offers, §11 several bellboys, §14
capacity), home-node.md, `node/HETZNER.md`, `q/node-hetzner-test.md`.
