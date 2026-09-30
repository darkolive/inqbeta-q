# Clusters, IPFS, and carrier relays

**2026-09-20 — research, not decisions.**

Four questions were asked. Three have clear answers. The fourth has an
answer that is better than the one we were looking for.

---

## 1. What NVIDIA actually introduced, and whether any of it is ours

At CES in January 2026 NVIDIA launched **BlueField-4 STX**, a storage
architecture where the DPU — not the host CPU — runs the storage stack, so
that inference clusters can keep KV-cache context in shared fast storage
instead of recomputing it. VAST Data built a "context memory" tier on it.
It is real, it is shipping, and it is about one thing: keeping GPUs fed.

Their two software pieces are the same story:

- **Dynamo** — open-source distributed inference serving. Its interesting
  part is the *KV-cache-aware router*: it sends a request to whichever
  worker already holds the relevant prefix, rather than to the least busy
  one. Routing by *what a node already has*, not by load.
- **KAI Scheduler** — the Run:ai scheduler, open-sourced under NVIDIA.
  A Kubernetes GPU scheduler: gang scheduling, quotas, fractional GPUs.

**None of this is ours.** All of it assumes a datacentre you own, a fast
private fabric, and workloads you control. We have phones, laptops, and
strangers' devices. Buying into this stack would mean becoming the thing
we are trying not to be.

**One idea does transfer, and it is worth taking.** Dynamo's router is
content-aware: *route to the node that already holds it.* That is exactly
what a content-addressed network should do, and it is what our relay
selection should do — when a receipt needs to move, prefer the peer that
already holds a piece of the conversation over the peer with the best
connection. Cheapest hop is the one that does not have to happen.

## 2. "Cloud cluster load balancing for IPFS"

There is no such product, because the phrase mixes two different jobs.

**IPFS Cluster** ([ipfscluster.io](https://ipfscluster.io/)) is the closest
named thing, and it is not a load balancer. It is *pinset orchestration*:
a sidecar next to each Kubo node that keeps an agreed set of CIDs pinned
across a group of peers, with a replication factor (min/max), and either
CRDT or Raft consensus over the pinset. You tell the cluster "keep this
CID on at least 3 peers" and it allocates. `ipfs-cluster-follow` lets
someone mirror a pinset they do not control — join, follow, hold.

That is *durability*, not *balancing*. The balancing job — spreading
retrieval traffic — is done by ordinary infrastructure in front of
gateways, or increasingly not at all, because IPFS in 2026 is moving
retrieval to plain HTTP where CDNs already solve it (see §3).

**What this means for us.** IPFS Cluster is the right shape for the
*federation* layer, not the device layer. A club, a research group, a
practice — each runs a small cluster, declares a replication factor, and
the members' nodes follow the pinset. "Free to give, never free to take"
becomes a configuration: `ipfs-cluster-follow` is give; write access to
the pinset is earned.

It is not the right shape for phones. Phones are not cluster peers.

## 3. IPFS, looked at properly

The important finding is that **IPFS in 2026 is not the thing we assumed
it was in ADR-Q-001**. It has moved, and it has moved toward us.

What shipped through 2025 ([Shipyard year in review](https://ipshipyard.com/blog/2025-shipyard-ipfs-year-in-review/)):

- **Provide Sweep.** The DHT provider system was rebuilt. A node used to
  fall over past ~5,000 announced CIDs; the new one spreads announcements
  over time and does 97% fewer lookups at volume. Home hardware can now
  announce hundreds of thousands of CIDs. This matters: it is the
  difference between "a phone can announce its receipts" and "only
  datacentres can."
- **AutoTLS.** A node gets a real certificate automatically, so browsers
  can open a secure WebSocket *directly to a home node*. No gateway in
  the middle.
- **HTTP retrieval.** Blocks can be fetched over ordinary HTTPS with
  cryptographically verifiable responses. Content addressing without
  needing anyone to speak libp2p.
- **Delegated routing.** A node too small to join the DHT asks a routing
  endpoint instead, and still gets DHT answers.
- **`@helia/verified-fetch`.** A browser verifies content locally rather
  than trusting a gateway.

Read together, the direction is: **verify locally, retrieve over
whatever transport is available, and stop depending on being a full DHT
peer.** That is our architecture, arrived at from the other end.

### This partly answers ADR-Q-001 §10

§10 asked: public DHT, or private swarm? It has been blocking relay work.

The research says the question is now a false choice. The *retrieval*
path and the *announcement* path have been separated. We can:

- use content addressing and verified fetch everywhere, always;
- announce **nothing** to the public Amino DHT by default;
- reach peers by delegated routing inside a federation, or directly over
  the mesh;
- and let a federation choose, per question set, whether anything it
  holds is announced publicly at all.

So: **content addressing is not the leak. Announcement is.** Keep the
first, make the second a decision a federation makes rather than a
property of the protocol. §10 can be closed on that basis, with the
private-swarm option kept for federations that want it.

### The other finding: iroh 1.0

[iroh](https://github.com/n0-computer/iroh) shipped 1.0 with the slogan
**"dial keys, not IPs."** You connect to a public key; the library finds
a path — direct, hole-punched, or via relay. Its relays are stateless and
encrypted: they route packets and store nothing, and cannot read anything
because every connection is end-to-end encrypted QUIC. It carries a
built-in blob transfer protocol for hash-addressed data. It has no DHT,
which its own FAQ names as the gap.

Dialling a key rather than an address is precisely what a DID is for. The
missing DHT is exactly the piece we decided we did not want to depend on.
This deserves a real evaluation against libp2p before we commit — not
today, but it goes on the list ahead of most other things.

## 4. Carrier relays that destroy the packet once it has moved on

This is the question with the better-than-expected answer.

### The name for it already exists

What was described is **delay-tolerant networking** with **custody
transfer** — standardised as Bundle Protocol v7, [RFC 9171](https://www.rfc-editor.org/rfc/rfc9171.html),
and used for spacecraft, where there is no end-to-end path and a node must
hold a bundle until the next hop accepts custody, after which it may
delete its copy. NASA ships an implementation (HDTN); [DTN7](https://dtn7.github.io/)
is an open one in Rust and Go.

We do not need to adopt the protocol. We should steal the vocabulary:
**custody**, **bundle**, **lifetime**. A receipt in transit is a bundle
with a lifetime; a relay takes custody; custody is released when the next
hop acknowledges. ADR-Q-001 §9 already has `ackTag = HMAC(shared, cid ‖ "ack")`
— that is a custody acknowledgement, and naming it so makes the design
legible to anyone who has seen DTN before.

### Bitchat is the working reference

Jack Dorsey's [bitchat](https://github.com/permissionlesstech/bitchat) is
a BLE mesh messenger with a published whitepaper, and its numbers are
worth copying rather than re-deriving:

| thing | bitchat's answer |
|---|---|
| flood control | TTL 7 at origin; dense graphs (≥6 links) cap relayed TTL at 5 |
| duplicate suppression | LRU of 1000 entries, 5-minute expiry, keyed on sender+timestamp+type+payload digest |
| relay jitter | random 10–220 ms before retransmit |
| public message cache | 6 hours, gossip-synced ~every 15 s |
| fragments | ~469-byte fragments; 30 s reassembly timeout; 1 MiB cap |
| sealed envelope for an absent peer | 24-hour TTL, 16 KiB max |
| outbox | 24 hours, 8 attempts, then visible failure |
| padding | only encrypted packets, to 256/512/1024/2048 buckets |

Two of those are design lessons, not parameters. **Padding to buckets**
hides message size — we currently do not, and a sealed receipt's length
leaks what kind of receipt it is. **A visible failure after 8 attempts**
is honest in the way this project tries to be: the sender is told it did
not arrive, rather than left to assume.

### The hard truth about "destroy"

**You cannot make a relay delete anything.** A relay is someone else's
device. It can lie, and there is no protocol that catches it.

So the guarantee has to be built the other way round: **make the copy
worthless rather than requiring its deletion.** We already have most of
this —

- the bundle is sealed to the recipient, so a relay holding it forever
  holds ciphertext it cannot open;
- it is padded, so its size says nothing;
- it carries a lifetime, after which an honest relay drops it and a
  dishonest one holds something that no longer routes;
- it names no sender and no recipient in clear, only a hash.

What we should stop saying is that relays "destroy" their copy. What is
true is: **a relay keeps only the fact that it carried something, and
what it carried is of no use to it.** ADR-Q-001 §7 says "holds a copy in
quarantine, and keeps only the fact that it did" — that is nearly right,
and should be rewritten so the guarantee is cryptographic rather than
behavioural. A promise to delete is not a security property.

### Bluetooth is the wrong carrier — and iOS 26 gives us the right one

[Berty's account of running libp2p over BLE](https://berty.tech/blog/bluetooth-low-energy/)
is the most honest write-up available, and it is discouraging: BLE is
"extremely slow," "totally unsuitable for exchanging photos, let alone
videos," fine only for small text. Connections "sometimes fail in a loop,
sometimes work instantly, sometimes remain stable for hours, sometimes
cut off after a few seconds." Android's APIs are error-prone; iOS's are
pleasant but background-restricted. Berty's conclusion was to use BLE
only as a *cross-platform bridge*, and to upgrade to Apple Multipeer
Connectivity or Android Nearby — both of which discover over BLE and then
move the data over direct Wi-Fi — wherever they could.

That has now got much better. **iOS 26 ships a public `WiFiAware`
framework** ([Apple docs](https://developer.apple.com/documentation/WiFiAware)),
which for the first time lets third-party apps do AirDrop-style
peer-to-peer over Wi-Fi — and Wi-Fi Aware is the same NAN standard
Android already implements, so it is cross-platform rather than another
Apple island.

So the carrier layer should be tiered, and Bluetooth demoted:

1. **Wi-Fi Aware** — the real local carrier. Megabits, not kilobits.
   iOS 26+ and Android. This is where a receipt actually moves.
2. **BLE** — discovery and tiny payloads only. An advertisement saying
   "I have something for a key that looks like this" is a few hundred
   bytes and BLE is good at that. Use it to *find*, not to *carry*.
3. **The mesh / relays** — when nobody is nearby, per §7 and the
   WireGuard note from last night.

A receipt of a few kilobytes fits the BLE path; anything with an avatar
or an attachment does not. That is a real constraint on what a card can
weigh, and it should be a tested rule in `q-core` rather than a
discovery made in a field.

---

## What this changes

- **ADR-Q-001 §10 can be closed.** Not "public DHT or private swarm" but
  "content addressing always, announcement never by default, and per
  federation thereafter."
- **§7 needs rewriting** so the relay guarantee is sealing, padding, and
  lifetime — not a deletion promise.
- **§9's `ackTag` should be renamed** custody acknowledgement, and the
  envelope should gain padding buckets.
- **A size budget for receipts** belongs in `q-core` as a tested rule,
  because BLE sets it.
- **iroh deserves an evaluation** against libp2p. "Dial keys, not IPs" is
  our model, already built.
- **IPFS Cluster belongs at the federation layer**, and gives "free to
  give, never free to take" a concrete implementation.
- **NVIDIA's stack is not for us**, but Dynamo's content-aware routing
  is: prefer the peer that already holds something.

Nothing here has been built. All of it is reading.

## Sources

- [NVIDIA: BlueField-4 STX storage architecture](https://nvidianews.nvidia.com/news/nvidia-launches-bluefield-4-stx-storage-architecture-with-broad-industry-adoption)
- [NVIDIA Dynamo](https://www.nvidia.com/en-us/ai/dynamo/) · [docs](https://docs.nvidia.com/dynamo/index.html)
- [NVIDIA open-sources the Run:ai / KAI scheduler](https://developer.nvidia.com/blog/nvidia-open-sources-runai-scheduler-to-foster-community-collaboration/) · [repo](https://github.com/NVIDIA/KAI-Scheduler)
- [IPFS Cluster](https://ipfscluster.io/) · [architecture](https://ipfscluster.io/documentation/deployment/architecture/)
- [IPFS Shipyard, 2025 in review](https://ipshipyard.com/blog/2025-shipyard-ipfs-year-in-review/)
- [IPFS Kademlia DHT specification](https://specs.ipfs.tech/routing/kad-dht/)
- [iroh](https://github.com/n0-computer/iroh) · [FAQ](https://docs.iroh.computer/about/faq) · [the road to 1.0](https://www.iroh.computer/blog/the-road-to-iroh-1-0)
- [RFC 9171 — Bundle Protocol v7](https://www.rfc-editor.org/rfc/rfc9171.html) · [DTN7](https://dtn7.github.io/)
- [bitchat whitepaper](https://github.com/permissionlesstech/bitchat/blob/main/WHITEPAPER.md)
- [Berty: libp2p and Bluetooth Low Energy](https://berty.tech/blog/bluetooth-low-energy/)
- [Apple: Wi-Fi Aware framework](https://developer.apple.com/documentation/WiFiAware) · [building peer-to-peer apps](https://developer.apple.com/documentation/wifiaware/building-peer-to-peer-apps)
- [Bluetooth Mesh + libp2p, opportunistic protocol evaluation (Sensors, 2025)](https://doi.org/10.3390/s25041190)
