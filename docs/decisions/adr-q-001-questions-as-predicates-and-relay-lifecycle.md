# ADR-Q-001: Questions as predicates, and the relay lifecycle of a receipt

**Date**: 2026-09-19
**Last amended**: 2026-09-19 — §8 corrected (a store's encryption at rest is not what makes a receipt relayable), §9 added (the envelope), §11 added (a federation is a namespace of questions)
**Status**: Proposed — nothing here is built
**Followed by**: [ADR-Q-002](adr-q-002-receipt-lifecycle-and-cards.md) — the life of a receipt, and the cards a person shows

**Numbering**: Q keeps its own ADR series (`adr-q-NNN`). The inQbeta series in
`~/inQbeta/docs/decisions/` runs to ADR-025 and is a separate repository with a
separate posture (see this repo's README, decided 2026-09-16). A `q` prefix so
the two can never be confused for one another.

---

## Context

Two ideas arrived on the same day, from opposite ends, and meet in the middle.

**The first, about schema.**

> "Each type has specific schema questions, which are those names, which are the
> titles. And they're the questions, and the answers are what make it specific.
> And that's the content… If the DID is the key and the answer is the value, then
> receipts become an ability to build an eco knowledge system. And the Dgraph
> connection makes it all possible to see where your own data fits."

**The second, about delivery.**

> "The nodes in the ecosystem of storage and capacity are all relays… if
> everything is a relay until the recipient is holding it themselves, once they
> have, it can destroy the relays, because they only need a receipt that they
> were a relay. Anything sent is a copy, a receipt branch of, and when the
> recipient receives it, their copy, they then decide where the source of truth
> their end starts from. Everyone else in between is simply a relay carrier, and
> it's in quarantine held somewhere until it's read, received, and then can
> self-destroy. And that's the life cycle of every receipt."

— Darren, 2026-09-19

### What already exists

| | |
|---|---|
| `packages/q-core/src/taxonomy.ts` | `DGRAPH_EVIDENCE_PREDICATES` — a **hand-written** predicate list: `evidence.did`, `evidence.category`, `evidence.author`, `evidence.previous`… |
| `packages/q-core/src/dgraph.ts` | a Dgraph client: query by subject, author, event; full-text search |
| `packages/q-core/src/vault.ts` | `contentName` / `contentAddress` — a locked file is named by its own hash, `content://sha256:…`, and a passing test asserts that name **is a CID with the same digest** |
| `packages/q-core/src/seal.ts` | `SealedReceipt` — envelope fields (`schema`, `did`, `signedAt`, `contentHash`, `signature`) wrapped around an opaque `content` |
| `packages/q-core/src/channels.ts` | `uses` — a per-receipt, revocable statement of what a thing may be used for |

So: a triple store is already connected, content addressing already exists under
another name, and the envelope/content split is already cut. What is missing is
the decision to treat predicates as **data** rather than as a list in a source
file.

---

## Problem statement

1. Adding a question to a receipt type today means editing TypeScript. That puts
   the shape of a federation's evidence in the hands of whoever can merge to
   `main`, which is the opposite of what a federation is for.
2. A receipt records answers but not what was asked. `{"dob": "1970-11-10"}` is
   data. *"We asked these words, and this is what they answered"* is evidence.
   An audit system that cannot reproduce the question has lost the thing that
   made the answer mean something.
3. There is no statement, anywhere, of whether an answer may be pooled — read
   across people, counted, or used to train anything. "Free to give, never free
   to take" has no mechanism behind it at the level of a single answer.
4. A receipt in flight has no defined lifecycle. Nothing says what a node
   holding a copy owes the sender, what it may read, or when it must stop
   holding it.

---

## Definitions

**Question** — a stable, identified thing that can be asked. Not its wording.

**Asking** — one wording of a question, in one language. A question has many
askings and they can be added without disturbing anything already answered.

**Answer** — what a person gave in response, typed.

**Schema package** — an ordered set of questions defining one receipt type,
content-addressed, citable by hash.

**Relay** — any node holding a copy of a receipt that is not its recipient and
not its author.

---

## Decision

### 1. The content of a receipt is question → answer. The envelope is not.

The triple is `(DID, question, answer)` — subject, predicate, object. That is
RDF, and Dgraph is a triple store, so this is the storage engine's native shape
rather than something modelled on top of it.

The split is the one `SealedReceipt` already has:

| Envelope — machinery, never a question | Content — questions and answers |
|---|---|
| `schema`, `did`, `publicKey`, `signedAt` | every field |
| `contentHash`, `signature`, `previousHash` | |

*"What is your signature?"* is not a question anybody asked. Forcing the
envelope into the Q&A model would make the receipt's provenance
indistinguishable from its subject matter, which is precisely the distinction
ADR-015 exists to protect.

### 2. A question is identified by a stable id. The wording is a label.

**The wording cannot be the key.** Reword *"What is your date of birth?"* to
*"When were you born?"* and the node forks: two predicates, one fact, nothing
relating them. This is the problem RDF namespaced URIs solve, and it will not
solve itself.

```
question:
  id:        q:person/birth-date          ← the predicate. Never changes.
  answer:    date
  asks:
    en-GB:   "What is your date of birth?"
    cy:      "Beth yw eich dyddiad geni?"
```

Changing wording is free. Changing `id` is a new question, and existing answers
stay attached to the old one — correctly, because they answered a different
thing.

### 3. Answers are typed, because Dgraph requires it anyway

`string`, `int`, `datetime`, `bool`, `uid`, `[uid]` — the existing predicate list
already types every entry. Extending that to declared questions costs nothing
and is what makes the graph queryable rather than a bag of strings. An untyped
answer cannot be indexed, ranged over, or compared.

Q-level types map down: `date`, `money`, `did`, `text`, `choice`, `boolean`,
`reference`.

### 4. A schema package is content-addressed, and the receipt cites its hash

This is where the two ideas join.

`vault.ts` already names a locked file by its own hash and the test already says
that name is a CID. A schema package gets the same treatment, and every receipt
carries the address of the package it answered:

```
{ "asked": "content://sha256:b3f1…", "answers": { "q:person/birth-date": "1970-11-10" } }
```

A reader who has the receipt can always fetch the exact questions, in the exact
wording, that produced those answers. **The receipt becomes self-describing, and
stays so after the schema has moved on five versions.** For an evidence system
this is not a convenience; it is the difference between data and evidence.

It also means a federation publishes a schema by publishing a hash. No registry
to run, no version negotiation, no central list to be on.

### 5. Every answer carries what it may be used for

`channels.ts` already does this at receipt level with `uses`. The same shape,
per answer:

```
given · shown-to-me · pooled · modelled
```

`given` is the answer existing at all. Each step beyond it is a separate,
revocable statement — recorded in the receipt, not in a settings toggle,
because a settings toggle is not evidence of anything.

**This is the part where the system could violate its own principle.** A
knowledge graph of your own answers, in your own folder, is straightforwardly
yours. Answers pooled across people into a shared model is a different act with
a different consent, and "the DID is the key and the answer is the value" is
exactly the shape that makes the second easy to do by accident. Without this
field, "free to give, never free to take" has nothing behind it at the level
where the taking would actually happen.

### 6. Derived values live in a separate namespace from answers

The audit review proposes `intent`, `entities`, `summary`, `sentiment`,
`energy` on every receipt. None of those is an answer anyone gave — they are
inferences, and some are inferences about a person.

They go under a prefix that says so (`derived:` against `q:`), they carry what
derived them, and **they are never the subject of a proof**. In an evidence
system, a guess the model made and a statement a person signed cannot share a
namespace; if they do, no reader downstream can tell which is which.

### 7. A relay holds a copy in quarantine, and keeps only the fact that it did

The lifecycle:

```
author ──▶ relay ──▶ relay ──▶ recipient
             │         │            │
             │         │            └─ pins it. Their copy is now
             │         │               the source of truth their end.
             │         │
             └─────────┴─ held sealed, unread, unpinned once the
                          recipient has it. What survives is a relay
                          receipt: I carried this, I no longer hold it.
```

- A relay never opens what it carries. It is sealed to the recipient, so it
  cannot, and this is a property of the cryptography rather than a rule it is
  trusted to follow.
- A relay receipt is a **dolphin** in the existing taxonomy: high frequency,
  short life. It is the thing that survives the deletion, and it is what makes
  the delivery auditable without any node retaining the delivered thing.
- "Self-destroy" is **unpinning**, not deletion. This is native to IPFS:
  unpinned blocks are garbage-collected. Nothing needs building to make a relay
  forget — it needs building to make a relay *remember*, which is the relay
  receipt.

### 8. Sealing happens before storage, not in the store

A store's encryption at rest is not what makes a receipt safe to relay.
Dgraph's is one **cluster-wide** master key, given to every Alpha, optionally
fetched from HashiCorp Vault — Vault holds that one key, not a key per person
or per record. It defends against a stolen disk. It does nothing against the
operator, and nothing at all for a blob sitting on someone else's relay, whose
operator would hold the key to everything it carries. (It is also still an
enterprise feature under the Dgraph Community License; the Apache-2.0 story
belongs to the 2018 relicensing, which kept encryption on the paid side.)

`seal.ts` already does the stronger thing: X25519 to named recipients, **before**
anything reaches a store. What is handed over is ciphertext, so at-rest
encryption is irrelevant to it.

**The consequence, which is the design and not a cost.** If content is sealed
before storage, a store can only index the envelope. There is no globally
searchable knowledge graph over sealed receipts — there is a rich local graph
for whoever can decrypt, plus whatever each person or group deliberately
publishes. Anything that appears to offer both is offering to hold the keys.

> "It is federated by choice. Absolutely… a local club, a local academic
> research group can have their own federation and their own questions and
> their own discovery, and then they can choose what to publish in their
> research papers and evidence. That's the power of it… Free to give, never
> free to take. That's always the golden rule."
>
> — Darren, 2026-09-19

See §11 for what that buys.

### 9. The envelope: what a receipt shows to be carried

> "What is the key meta that a receipt must carry to be universal, to be seen,
> to be relayed, to continue, to spawn, without what it is ever being known?"

A relay needs four things and no more: a name for the thing, a way to know it
is for someone, a way for that someone to open it, and a reason to stop holding
it.

| Field | What it is | What it leaks |
|---|---|---|
| `v` | suite version — how to parse and decrypt | nothing |
| `cid` | content address of the sealed bytes | nothing; it is a hash of ciphertext |
| `tag` | blinded recipient tag, rotating per receipt | nothing linkable — see below |
| `epk` | ephemeral public key for key agreement | nothing; fresh per receipt |
| `exp` | when a relay may stop holding it | a coarse lifetime |

Everything else goes **inside**: the type, the schema address, the author, the
parent or branch link, the `uses` of §5, the questions, the answers, and the
signature.

**The signature is inside.** Signing the outside names the author to every
relay that touches it. Authenticity is proven on opening, not in transit.

**The branch link is inside.** A receipt that spawns another must hide the
relation, or the graph shape is readable from outside even when every payload
is shut. Relays see unrelated blobs; only the holder reconstructs the tree.

#### The tag, because addressing is the hard part

Routing requires addressing and addressing leaks — this is the whole problem,
and it does not go away. A recipient DID in the clear is a social graph in the
clear.

A blinded tag is the standard answer: sender and recipient already share a
secret through X25519, so `tag = HMAC(shared, cid)` is recognisable to the
recipient and to nobody else, and two receipts for the same person cannot be
linked to each other. Relays route on a **prefix** of it — n bits gives an
anonymity set of 2^n and a tunable trade between privacy and how much a relay
must store.

#### What can never be hidden

- **existence** — that a receipt was published
- **size** — pad to buckets, but never to nothing
- **timing** — batch and delay, but never to nothing
- **fetch patterns** — unless every recipient fetches everything, or someone
  pays for private information retrieval

These are the residual leak of any relay network. They are a property of
relaying, not of the cryptography, and no envelope design removes them.

#### What the current format would leak, today

`SealedToPeople` and `SealedReceipt` were written for a file in your own folder,
where all of this is fine. On a public relay they are not fit:

| Field | Why it cannot travel |
|---|---|
| `recipients[].did` | **every recipient, named.** The social graph, in the clear |
| `forWhom` | a human-readable description of who it is for |
| `SealedReceipt.did`, `publicKey` | the author, named |
| `SealedReceipt.source`, `schema` | what kind of receipt it is |
| `signedAt` | when |

The smallest useful change is the first one: drop `did` from `recipients` and
let a recipient trial-decrypt each entry. For small recipient counts the cost
is nothing, and it removes the social graph leak outright. The `did` is there
only to produce a friendlier error message, which is a poor trade once a
receipt leaves the folder.

#### The question this opens

If the signature is inside, a relay cannot tell a real receipt from a blob of
noise, and carrying is not free. Something has to make junk expensive:
proof-of-work, a staked or spent token — the federation cloud tokens are
already in the design — or plain size and rate limits per tag prefix. **Not
settled here, and it is the difference between a relay network and an open
dump.**

#### Relay receipts must not be public either

"I carried `cid` at time T", published, hands an observer exactly the timing and
topology the envelope was built to hide. A relay receipt should be sealed to
the author, or — better — aggregated: a Merkle root over everything carried in
a window, which proves the service without naming any one item. The
`receipt.chain` type and the hash-lock idea in the audit review are already the
right shape for this.

### 10. Examine IPFS as the substrate, but decide the privacy question first

In its favour: content addressing is already in the codebase under another name;
pinning is the lifecycle above, already implemented by someone else; the relay
topology is what IPFS is.

**Against, and this is not a detail: IPFS is public by default.** Content
addressing means anyone holding the CID can fetch the block. Sealed receipts
survive that — the contents stay shut — but three things leak and cannot be
sealed:

- **existence** — that a receipt of this size was published
- **timing** — when
- **graph shape** — who pinned what, and therefore who is talking to whom

For an evidence system serving people who may have adversaries, traffic
analysis on a public DHT is a real exposure, and it is not fixed by better
encryption. A private swarm, or IPFS for public artefacts only with sealed
traffic elsewhere, are both live options. **This question is upstream of any
IPFS work and this ADR does not settle it.**

### 11. A federation is a namespace of questions and a membership

Everything above composes into this: a group — a club, a course, a research
team — declares its own questions, answers them among its own members, and
publishes what it chooses. inQbeta's ADR-017 already settles federation
boundaries and namespace sovereignty; what is new here is that the namespace
contains **questions**.

#### The instrument is citable, so the study is pre-registered

A content-addressed question set is a research instrument with a hash.

Publish the hash **before** collecting answers and there is nothing left to
trust: the receipts cite the CID of the instrument they answered, so nobody can
later claim to have asked something else. Outcome switching and HARKing stop
being detectable-if-you-are-lucky and become arithmetic — either the cited CID
matches the pre-registered one or it does not.

Replication becomes exact for the same reason. A second group cites the same
CID and is using the same instrument, not "a similar questionnaire adapted
from".

#### Publish the finding without publishing the subjects

A paper can carry the schema CID, the aggregate, and a proof that N sealed
receipts answered that instrument — while every participant's answers stay
sealed in their own folder, under the `uses` they gave in §5. The evidence for
the claim travels; the people do not.

#### Federated by choice is fragmented by default

Two federations asking the same thing under different question ids cannot be
compared, and this will happen constantly. The fix is **not** a central schema
authority — that is the thing being built away from.

The fix is citation. A group that means the same thing as another group cites
that group's question id rather than minting its own. A question gains
authority by being reused, not by being blessed, and reuse is countable: Dgraph
can rank a question by how many federations cite it. A widely-cited question
becomes a standard the way a well-worn path becomes a road.

That also gives Open question 2 its answer, or at least its shape: `sameAs`
between two ids is itself a signed statement by whoever asserts it, and a
reader weighs it by who signed. There is no arbiter, and there does not need to
be one.

#### Where the golden rule is actually mechanised

"Free to give, never free to take" now has three places where it is enforced
rather than asserted:

| | |
|---|---|
| §5 | `uses` per answer — giving an answer is not giving it for everything |
| §8 | sealed before storage — no store operator can take what it holds |
| §9 | the envelope — a relay is given no reason to know what it carries |

If a future change weakens one of those, it is weakening the rule, whatever the
commit message says.

---

## Explicit non-goals

- No claim that Dgraph, IPFS or any particular store is chosen. This describes a
  shape; the substrate is a separate decision, and §8 has to land first.
- Not a schema registry. The point of content addressing is that there is no
  registry.
- Not a migration. Existing receipts predate `asked` and stay valid; a receipt
  with no schema address is a receipt whose questions were not written down, and
  that is a true statement about it.
- No model is trained by anything here. §5 is the prerequisite for that
  conversation, not the start of it.

---

## Consequences

**Good**

- A federation defines its own receipt types without a code change, and
  publishes one by publishing a hash.
- Every answer is queryable from the day the question exists, because the
  predicate is declared rather than discovered.
- Receipts stay readable after their schema moves on.
- Consent is recorded where the evidence is, at the granularity where it
  matters.

**Costly**

- Two identifiers per question — id and wording — and people will use the
  wording as the key at least once. A validator should refuse it.
- Question ids are forever. A badly-chosen id is a badly-chosen id for good;
  the only fix is a new question and a statement relating the two.
- `taxonomy.ts` becomes a bootstrap set rather than the list, and something has
  to resolve declared predicates into a live Dgraph schema. That is real work
  and it is not small.
- A content-addressed schema that cannot be fetched makes its receipts
  unreadable. Schema packages need pinning in more places than receipts do.

**Risky**

- The pooling question in §5 is the one that decides whether this is an evidence
  system with a knowledge graph in it, or a data collection exercise with
  receipts on top. Nothing technical distinguishes them. The field does.

---

## Open questions

1. Who may declare a question — anyone, or a federation? If anyone, how does a
   reader tell a considered question from a careless one?
2. `sameAs` between two federations' ids — signed by whom, and weighed how?
   §11 says there is no arbiter and reuse is the real mechanism, which is a
   shape rather than an answer.
3. Does a question ever get answered by someone other than the subject — a
   doctor, an examiner, an employer? If so the triple needs a fourth term, and
   the model in §1 needs revisiting before it is built.
4. Can an answer be withdrawn, and what does the graph show where it was?
5. §10 — public DHT or private swarm. Everything downstream waits on this.
6. §9 — what makes carrying junk expensive, when a relay cannot verify a
   signature it is not allowed to see? Proof-of-work, a spent token, or limits?
7. How many bits of tag prefix? It is a dial between a relay storing everything
   and a relay knowing who talks to whom.

---

## First steps, if accepted

1. Settle §10. It is the only question with nothing behind it and everything in
   front of it.
2. Drop `did` from `SealedToPeople.recipients` and trial-decrypt instead. Small,
   self-contained, and it is the one leak that is live in the code today — it
   only does not matter yet because receipts have not left the folder.
3. Redeclare **one** existing receipt type as a question set — the channel is
   the smallest — and see what the shape costs in practice.
4. Write the schema package format and its content address. Prove one receipt
   citing one schema, fetched back and read by its questions.
5. Only then look at relays. The lifecycle is worth nothing until there is
   something with a stable shape to relay.
