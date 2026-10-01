---
status: proposed
implementation: none
updated: 2026-10-01
---

# ADR-Q-014 — The bellboy, the directory and the storage unit

**Status: proposed, 1 October 2026.** It replaces ADR-Q-010 §3–§4, where the
broker held the whole sealed message. The rest of ADR-Q-010 stands, with
"post office" read as "bellboy".

## Context

The Hetzner test (`q/node-hetzner-test.md`) ran Mosquitto, Dgraph and Nebula on
one node, and Q's federation screen showed them live. Naming them led
somewhere better than the names.

Darren, 1 October:

- "a post box suggests there's something in it, like a letter … this is more
  like a bellboy who comes up to you and says, there is a phone call for you,
  sir, in reception. So you know where to go to then have the phone call."
- "a federation has to have storage once it starts collecting receipts …
  it can't be on the individual because the federation passes ownership. So
  that becomes one of the requirement plugins."
- "storage unit … that is the holding bay … You only hold it until it's
  passed on."
- "the bellboy's just got to send a receipt, who it's from, the title,
  because that's what will appear in your notifications bell … click on it
  … there's my receipt. Captured."

## Decision (proposed)

A node does three jobs. Each job does one thing.

| Job | Does | Holds | Runs on |
|---|---|---|---|
| **Bellboy** | Tells you **that** something is waiting, and **where** | A notice, for minutes to days | Mosquitto |
| **Directory** | Finds things | An index rebuilt from receipts; never the truth | Dgraph |
| **Storage unit** | Keeps the sealed thing until it's collected | The sealed receipt, until custody passes | SeaweedFS or IPFS Cluster |

### 1. The bellboy carries a notice, never the message

A **notice** is small (a few hundred bytes) and **sealed to the recipient**,
so the bellboy can't read it:

```json
{
  "schema": "inqbeta.notice/1",
  "receipt": "<hash of the sealed receipt>",
  "from": "<sender's DID>",
  "title": "Invitation to Green Space",
  "kind": "message | invitation | call | decision",
  "collect": ["<storage unit address>", "…"],
  "until": "<lifetime, then it is dropped>"
}
```

- The bellboy sees only an inbox id and ciphertext, as before (ADR-Q-010 §2).
  **"From" and the title are opened on your device, not on the node.**
- Padding: notices are padded to one fixed size, so their length says nothing
  (research-2026-09-20 §4).
- Once you've collected the receipt, the notice is spent. The bellboy keeps no
  copy and no log of who rang whom.
- Calls are the same: a notice whose `kind` is `call`, and the call itself
  goes direct or through a relay (ADR-Q-004).

### 2. The storage unit is the holding bay

- The sender puts the **sealed receipt** in a storage unit, then rings the
  bellboy.
- The storage unit holds it under **custody**: until the recipient collects
  it and signs that they have (a custody receipt), or until its lifetime ends.
  Then custody passes and the unit may let its copy go.
- **Nobody can make another machine delete anything.** The guarantee is that
  the copy is worthless: sealed, padded, and past its lifetime
  (research-2026-09-20 §4). We say "holds until passed on", never "destroys".
- Collected receipts live where they belong: in the recipient's vault, and, for
  a federation's own receipts, in the federation's storage for as long as its
  rules say. That is a federation keeping its records, not a holding bay.

### 3. Storage is required once a federation keeps receipts

A federation that keeps receipts must name at least one storage unit. It
becomes a **required block** (ADR-Q-007 §5), like Money is required once money
is held. A federation with no storage can still talk, through the commons'
storage unit (ADR-Q-010 §10), but can't hold records of its own.

### 4. What you see: the bell

On the header, the bell already sits in the top right.

1. A notice arrives. **The bell moves and shows a count**, so it draws the eye.
   It moves once, not on a loop, and stays still for anyone who has asked for
   reduced motion (the count still shows).
2. Click it. One line per notice: **who it's from and the title**, nothing
   else.
3. Click a line. Q collects the receipt from the storage unit, checks it, and
   says **"Captured"**. The receipt is in your vault.

### 5. Small jobs, small helpers

Each job does one thing, so a small model on your own device can help with
one job without seeing the others, for example reading a notice aloud
(ADR-Q-011) or suggesting which can wait. Nothing here needs a model; it's
room left open, under ADR-Q-013's rules for keys.

## Consequences

- **The bellboy gets smaller.** Mosquitto holds notices of a few hundred bytes,
  not messages of up to 256 KB. `max_packet_size` drops (to 4 KB, say), and a
  Raspberry Pi Zero 2 W serves far more people than `node-sizes.md` assumed.
- **Storage becomes part of the node test**: SeaweedFS or an IPFS Cluster
  follower beside Dgraph (home-node.md §8, still open).
- **The current bell is replaced.** Today it polls `/api/notifications`, an
  in-memory list on the server, every 30 seconds. Notices from the bellboy
  replace it: pushed to the open tab over WebSockets, and by Web Push when the
  tab is closed (ADR-Q-010 §9).
- **ADR-Q-010 changes:** §3 (a message is a sealed receipt in storage, not on
  the broker), §4 (the broker's limits), §10 (offers name bellboys and storage
  units separately), §14 (capacity).

## Build order

1. Notices: the `inqbeta.notice/1` shape, sealing, padding; a test that the
   bellboy can't read one.
2. The bell: subscribe to your inbox over WebSockets; move, count, list,
   reduced motion.
3. A storage unit on the Hetzner node; put, collect, custody receipt.
4. "Captured": collecting from the bell, checking, keeping in the vault.
5. Retire `/api/notifications`.
6. Storage as a required block in the federation founding.

## Non-claims

This does **not**:

- choose between SeaweedFS and IPFS Cluster for the storage unit;
- decide how long a storage unit holds an uncollected receipt (30 days, as in
  ADR-Q-010, is the starting guess);
- describe anything built.

## Related

ADR-Q-001 §7 and §9 (relays and acknowledgements), ADR-Q-004 (calls),
ADR-Q-007 §5 (blocks), ADR-Q-009 §6 (MQTT carries news, never evidence),
ADR-Q-010 (messages), ADR-Q-011 (read aloud), ADR-Q-013 (keys),
`q/research-2026-09-20-clusters-ipfs-relays.md` §4 (custody transfer),
`q/node-sizes.md`, `q/home-node.md`. In the incubator:
`docs/architecture/evidence-object-resolver-and-mycelium-discovery.md` ("I am
here", "I am what you are looking for", "come through this route").
