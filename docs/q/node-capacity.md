---
implementation: estimates; the calculator is node/bin/capacity.mjs
decision: none yet. This informs where Incubator's services run.
updated: 2026-10-02
---

**Names (2 October):** the relay is called the **switchboard**, Darren: *"that's how you used to make calls, through the switchboard."* Its service, profile and check script keep the technical name, `relay`, as the bellboy's record kept `postOffice`.


# How many members can a node serve?

**2 October 2026.** Darren: *"If we can have our own node and then we've got
our bellboy and we've got our Dgraph directory, let's build up these services
and work out how many users they can service based on equipment spec."*

A node now has **four jobs** (ADR-Q-014, ADR-Q-017 §3):

| Job | Software | What it does | What runs out first |
|---|---|---|---|
| **Bellboy** | Mosquitto (behind Caddy) | Says *that* something is waiting, and where | Memory for open connections |
| **Storage unit** | SeaweedFS + the gate | Holds sealed things until they're collected | Disk |
| **Directory** | Dgraph | Where things are found: published facts, offers, memberships | Memory, then disk speed |
| **Switchboard** | coturn, a TURN relay (new today) | Connects a call when two devices can't reach each other. Like the old switchboard it puts the call through; unlike it, it can't listen in | **Upload bandwidth** |

The switchboard is new: `node/coturn/turnserver.conf`, started with
`docker compose --profile relay up -d relay`, checked by
`node/bin/check-relay.sh`. Q offers the host's own switchboard first and Cloudflare's
after it (`apps/q/src/routes/api/calls/ice`). Runbook: `node/HETZNER.md` step 6.

## The answer, as it stands

From `node bin/capacity.mjs` (members a host can have, at its busiest hour):

| Device | Bellboy | Storage unit | Directory | Switchboard | **Members** | Limited by |
|---|---|---|---|---|---|---|
| Raspberry Pi Zero 2 W | 20k | — | — | — | **20k** | bellboy (its only job) |
| Raspberry Pi 5 8 GB + SSD, at home | 200k | 102k | 188k | 8.9k | **8.9k** | switchboard |
| Mini PC (N100, 16 GB), at home | 200k | 205k | 390k | 8.9k | **8.9k** | switchboard |
| Mini PC at home, switchboard elsewhere | 200k | 205k | 390k | — | **200k** | bellboy |
| Hetzner CPX12 (1 vCPU, 2 GB) | 50k | 13k | 37k | 53k | **13k** | storage |
| Hetzner CPX22 (2 vCPU, 4 GB) | 100k | 31k | 88k | 53k | **31k** | storage |
| Hetzner CPX32 (4 vCPU, 8 GB) | 200k | 72k | 188k | 71k | **71k** | switchboard |

**What it says, in plain words:**

1. **At home, calls are the limit.** A home connection sends perhaps 50
   Mbit/s out, and every relayed video call needs about 3. That covers about
   9,000 members. Everything else a mini PC does comfortably reaches six
   figures.
2. **So split the jobs.** The bellboy, storage unit and directory at home (or
   on any machine with memory and an SSD), and the switchboard on a rented server or
   Cloudflare. That's the "Mini PC at home, switchboard elsewhere" row.
3. **The test node (CPX12) covers about 13,000 members**, if its storage unit
   is given the disk. **Today it's set to 1 GB**
   (`-volume.max=8 × 128 MB`), which is about **1,000 members**. That's the
   first number to raise (`compose.hetzner.yaml`, `storage`).
4. **The bellboy is never the problem.** It holds connections, not messages.
   Messages wait in the storage unit, and the bellboy only rings.

## The assumptions behind it

All in `node/bin/capacity.mjs`. Change one and run it again.

| Assumption | Value | Why |
|---|---|---|
| Members with Q open at once | 10% | A busy hour for a community app |
| Memory per open connection | 64 KB | Mosquitto plus Caddy holding a WebSocket over TLS; generous |
| Held in the storage unit per member | 1 MB | Messages (2 KB each), shared cards, receipts waiting. The free allowance (ADR-Q-017 §4) caps the worst case. |
| Directory per member, disk / memory | 30 KB / 25 KB | Facts, offers and memberships, with indexes. Not receipts: those live in vaults. |
| Members on a call at once | 1% | |
| Calls that need the switchboard | 15% | Commonly quoted for WebRTC; mobile networks push it up |
| A relayed 1:1 video call | 3 Mbit/s out | 1.5 Mbit/s each way, both forwarded |
| Relayed call time per member | 0.3 hours a month | 2 hours of calls, 15% relayed |
| All four services idle | 534 MB | **Measured**, CPX12, 1 October |
| Hetzner's real throughput | 300–400 Mbit/s | Hetzner says to expect 300–500 Mbit/s per server, whatever the plan |
| Hetzner's monthly traffic | 20 TB | Included in every CPX plan, then about $1.20 per TB |

Two checks: each member uses about 0.2 GB of switchboard traffic a month, so 20 TB
covers about 100,000 members. And a CPX12's 300 Mbit/s carries about 80
relayed calls at once.

## What isn't known yet

**Only one figure is measured** (534 MB idle). Everything else is an estimate.
To replace them, a load test on the CPX12, one job at a time:

| Job | How to test | What to read |
|---|---|---|
| Bellboy | `emqtt-bench` (or a small Node script) opening thousands of WebSocket connections through Caddy | Memory per connection; when connections start failing |
| Storage unit | The gate's inbox, hammered with posts of 2 KB (`autocannon`) | Posts a second; disk per member |
| Directory | Synthetic members and published facts loaded into Dgraph, then the lookups Q makes | Memory, query time at 10k / 100k members |
| Switchboard | `turnutils_uclient -m <n>` with many streams at once | Mbit/s before packets drop; CPU |

**Not covered by these numbers:**

- **A home node reachable from outside.** The mini PC sits behind a BT router.
  It needs a tunnel (or the switchboard elsewhere) before members can reach it. Home
  routers also have their own limit on connections held open, often a few
  thousand.
- **Group calls.** These are 1:1. A group call through a switchboard grows with
  the square of the people in it; that would need an SFU, a different
  machine.
- **`turns:` on 443.** Some networks only allow web traffic, and the switchboard
  doesn't offer TLS yet.
- **Several nodes per host.** Several bellboys spread the load (ADR-Q-010
  §11) and multiply every bellboy figure.
- **Prices.** Hetzner's are from September 2026; Raspberry Pi prices moved a
  lot in 2025–26 (node-sizes.md).

## Related

`q/node-sizes.md` (smallest device per job), `q/node-hetzner-test.md` (the
measured run), ADR-Q-004 §3 (calls and the relay), ADR-Q-010 §14 (message
sizes), ADR-Q-014 (bellboy, directory, storage unit), ADR-Q-017 §3–§4 (what
Incubator provides; transit allowance).

## Sources

- Hetzner plans and throughput: bestusavps.com, "Hetzner Cloud Network Speed,
  Traffic and Specs (2026)", from Hetzner's pricing API and documentation.
- Cloudflare TURN pricing (the alternative relay): developers.cloudflare.com,
  Realtime pricing: first 1,000 GB a month free, then $0.05 per GB.
