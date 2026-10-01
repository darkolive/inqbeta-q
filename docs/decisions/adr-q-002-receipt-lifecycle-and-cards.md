# ADR-Q-002: The life of a receipt, and the cards a person shows

**Date**: 2026-09-19
**Status**: Proposed — nothing here is built
**Follows**: [ADR-Q-001](adr-q-001-questions-as-predicates-and-relay-lifecycle.md) — questions as predicates, and the relay lifecycle
**Builds on**: inQbeta ADR-001 (derived lifecycle above append-only audit), ADR-015 (audit / attestation / evidence boundary), and the UCAN work in `packages/q-core/src/ucan/`

---

## Context

> "A key carrier of a receipt is: has it been actioned, has it been read, has it
> been received? Because each DID is effectively a lookup. And if that lookup
> looks at the source of truth and goes, okay, that has been read — so I have now
> fulfilled my purpose of being a relay and I can destroy, knowing it's met its
> end. The lifecycle's completed."

> "I was thinking about the neurodiversity. The problem was people didn't want to
> share their own experiences, but they wanted to know if their experiences
> showed that they were on the spectrum. So that's the thing of holding your own
> hard data, the actual copy version of truth — you can look at that and do what
> you like with it, share it, whatever. And this is where the cards come in.
> Your business card is what information you share. Friends card is what
> information you share. Contact card — if you want to send me an email, here's
> my encrypted key. Anything that comes to communicate with you looks at what you
> have for that purpose, and that's all it ever accesses."

— Darren, 2026-09-19

### What already exists

| | |
|---|---|
| inQbeta ADR-001 | derived lifecycle **above** append-only audit; never replaces it; always regenerable; references raw event ids |
| `packages/q-core/src/ucan/` | UCAN 1.0 — delegation, policy, revocation, invocation |
| `packages/q-core/src/contacts.ts` | `ContactChannels` — `canCall`, `canMessage`, `canEmail` |
| `packages/q-core/src/channels.ts` | `uses` — a revocable statement of what a channel is for |
| `apps/q/src/routes/cards/+page.svelte` | a page, and `// TODO: Card types — each card type defines what fields are shared` |

---

## Problem statement

1. A relay has no defined reason to stop holding a copy, other than an expiry it
   was given at the start.
2. "Has it been read" is the obvious signal to use for that — and it is also a
   read receipt, which is a surveillance channel. The obvious implementation is
   the dangerous one.
3. A person has one graph of answers and many audiences. There is no way to show
   a slice of it to one audience without handing over the rest.
4. The case that motivates all of it: someone will not hand over their
   experiences, but does want to know what their experiences indicate. Any
   architecture that requires the data to move to be analysed cannot serve them.

---

## Decision

### 1. Lifecycle is derived, never a field

`received`, `read` and `actioned` are **recognised states**, projected from
acknowledgement receipts, exactly as inQbeta ADR-001 projects lifecycle from the
append-only audit. A receipt is immutable; nothing writes a flag back onto it.

The states are not equivalent and must not be collapsed:

| State | What it means | Who may learn it |
|---|---|---|
| `received` | a copy reached the recipient's hands | the sender — it is mechanical, and they need it to stop resending |
| `read` | the seal was opened | **the recipient's choice, off by default** |
| `actioned` | the recipient did something and says so | the recipient, by writing a receipt — voluntary by construction |

Collapsing `read` into `received` is how an evidence system becomes a
surveillance system by accident. "Delivered" is about the message. "Read" is
about the person.

### 2. A relay is told, not asked

> "each DID is effectively a lookup… that lookup looks at the source of truth"

**No lookup.** A per-DID source of truth a relay queries is three bad things at
once:

- a **tracking point** — whoever runs it sees who asks about whom, and when,
  which is precisely the graph ADR-Q-001 §9 spent an envelope hiding;
- a **liveness dependency** — a relay that cannot reach it cannot collect;
- a **central truth** in a system whose whole argument is that there is not one.

Instead the recipient **emits**, and the relay **matches**:

```
ackTag = HMAC(shared, cid || "ack")
```

The recipient publishes ack tags. A relay compares them against the tags it
holds. On a match it unpins. It learns that the thing it was carrying arrived,
which is all it needed, and nothing else — not who, not what, not from whom.
No lookup, no reachable authority, no DID anywhere.

### 3. Expiry is the default; acknowledgement is the optimisation

If a relay only drops on acknowledgement, an unread receipt lives for ever and
the recipient must acknowledge to get their privacy back. That is coercion by
architecture.

So `exp` from ADR-Q-001 §9 is the guarantee, and an ack merely frees the space
sooner. A person who never opens anything is not penalised for it.

Acks should batch. One ack per receipt, emitted immediately, is a timing
channel; a handful emitted together on a loose schedule is much less of one.

### 4. A card is a signed view over your own graph, and a capability

A card is not a copy of your details. It is a **selection of question ids**, plus
the channels reachable for that purpose, signed by you:

```
card:
  name:      "Business"
  questions: [ q:person/name, q:person/role, q:org/name ]
  channels:  [ <channel id — email> ]
  uses:      [ shown-to-me ]
```

Because predicates are stable ids (ADR-Q-001 §2), a card is just a predicate
list. That is the first real dividend of treating schema as questions: a view
over the graph costs nothing to express.

**A card is a UCAN delegation.** The `ucan/` package already does scoped,
revocable, signed authority — a card is that authority narrowed to a set of
predicates and a set of channels. Revoking a card is revoking a delegation,
which is already implemented and already checked offline.

> "Anything that comes to communicate with you looks at what you have for that
> purpose, and that's all it ever accesses."

That sentence is a capability model. It is the one in `ucan/`.

### 5. The analysis travels to the data

The case that motivates this ADR is an asymmetry: *I will not give you my
experiences, and I do want to know what they indicate.*

Every conventional architecture resolves that by moving the data to the
analysis, and so cannot serve the person. This one can resolve it the other way:

```
a federation publishes    an instrument   (question set, content-addressed)
                     and  a method        (a scoring receipt, content-addressed)
                                │
you hold your own answers       │  both fetched, neither reveals anything
        │                       ▼
        └──────────▶  run locally, against your own folder
                                │
                                ▼
                    a result that is yours
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
     publish nothing      publish the result     contribute to an aggregate
```

The pieces exist or are already designed: a sealed local folder; a
content-addressed question set; a question→answer graph; and the
"self-executing receipt" of the 2026-09-18 review, where the receipt carries
what it does. A scoring method is a `command` receipt that runs against your own
answers and no one else's.

Nothing is sent. Nothing needs to be trusted not to keep what it was sent,
because it was never sent.

**Two honesties this obliges.** A locally-run instrument is a screening
instrument, and a screening instrument is not a diagnosis — the result must say
so in its own words, and a federation publishing one must publish what it was
validated against. This is not a disclaimer bolted on; it is the same evidence
standard the rest of the system holds itself to, and an instrument that
overstates what it can tell someone is bad evidence. Second: a result derived
locally is `derived:`, not an answer (ADR-Q-001 §6), and must never be filed
where a reader could mistake it for something the person stated.

---

## Explicit non-goals

- No claim about any specific screening instrument, its validity, or its use.
  This ADR describes where a computation runs, not what it should compute.
- Not a messaging protocol. Acks are a garbage-collection signal, not delivery
  semantics for conversation.
- Cards do not replace channels. A channel is how to reach someone; a card is
  what they show for a purpose. A card may cite a channel.

---

## Consequences

**Good**

- A relay collects without asking anyone anything.
- "Delivered" and "read" stop being the same event, which they never were.
- One graph, many audiences, without copying anything.
- Revocation of a card is revocation of a UCAN — already built, already offline-checkable.
- The motivating case is served rather than compromised.

**Costly**

- Ack tags mean a relay must hold a tag index and scan it. Cheap, but not free.
- A card is only as good as the stability of its question ids. A federation that
  churns ids breaks every card citing them.
- Running methods locally means shipping code that executes against a person's
  own data. That is a far larger security surface than reading a receipt, and it
  is not addressed here at all.

**Risky**

- §1's three states will be tempting to collapse into one boolean, and the
  boolean will be `read`. The whole argument of this ADR is that it must not be.

---

## Open questions

1. What sandbox does a locally-run method get? This is the largest unanswered
   thing in the ADR and probably wants its own.
2. Does a relay ever need to prove it collected, or is forgetting unprovable and
   fine?
3. Can a card be shown without revealing that it is a card rather than a whole
   graph? Probably not, and probably it does not matter.
4. When an aggregate is contributed, what stops the aggregator counting one
   person twice, or a person contributing twice? That is a real protocol, not a
   footnote.

---

## First steps, if accepted

1. Write the three lifecycle states and their projection rules against inQbeta
   ADR-001, and check nothing there has to change.
2. Define `ackTag` and prove the match works without a lookup — a test, not a
   deployment.
3. Give `/cards` a real type: a predicate list and a channel list, signed, and
   expressed as a UCAN delegation rather than a new mechanism.
4. Leave §5 alone until question 1 has an answer.

## Addendum, 1 October 2026 — one profile, cards from templates

Darren: "I don't like the way you've got the cards concept quite answering
questions. I think we just need templates or create a new card … your profile,
your cover image … and you get to choose what is shown on those address cards
and what is just for you."

What changed is what you see; the model in §4 stands.

- **One profile**, filled in like a form (`/cards`, `ProfileEditor`): cover,
  picture, name, what you do, who for, where roughly, your page, about you.
  Still an answering of `q/your-profile`, which gained `q:person/picture`,
  `q:person/cover` (small images made on the device) and
  `q:profile/just-for-me`.
- **Shown on cards / Just for me**, one switch per detail. `cardView` honours
  "just for me" above any card, older ones included, so the one function that
  decides what leaves still decides it (`test/cards.test.ts`).
- **Cards from templates**: Basic (new, the public face), Friends, Business,
  Contact, or Blank. A live preview draws the card as its holder will see it
  (`CardFace`).
- **Not yet**: giving a card to a person (the UCAN step); powers — details kept
  for you that let a card prove something without showing it; friends' cards in
  the address book drawn the same way.
