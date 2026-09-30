# ADR-Q-008: Must and cannot — the rules of every action

**Status: accepted, 28 September 2026. Kernel principle.** Darren: "a receipt
is capturing a block of data. And what's key are the two parts, what it can do
and what it cannot do … what it cannot do is just as important and puts locks
in place that can't be tampered. And those cannots can be specific to every
block … Let's lock that in as the core principle rules, really close to the
kernel truth."

**Words (changed 28 September, ADR-Q-009):** what this ADR first called a
*charter* is an **action definition** — the must / may / cannot of an
**action** (something that can happen). A block or receipt is an action that
happened. ADR-Q-009 makes these definitions Cedar policies.

**Built:** nothing new yet. ADR-Q-006 is the first instance: a component's
manifest declares what it may touch and what it promises, and a block "never
carries code".

---

## The principle

**Every action has a definition: what it must do, what it may do, and what
it cannot do. A block that breaks its action definition is not a valid block of that
kind — for anyone, anywhere, checked by anyone.**

"Block" here means every kind of thing a receipt captures: a page block, a
component, a membership, a vote, a payment, a call, a site founding. Same
rule for all of them.

## Where it comes from

- **ADR-Q-006** — manifests with a closed list of touches (may), promises with
  ids (must), and "a block never carries code" (cannot).
- **ADR-Q-007** — each federation block (Money, Offices, Board…) already has a
  Must and a Cannot column.
- **ADR-Q-001 §4** — a schema package is content-addressed and every receipt
  cites its hash. The action definition joins that package.
- **UCAN** (`docs/identity/permissions.md`) — you can only pass on what you hold,
  and only narrower.
- **The incubator** — "free to give, not free to take"; template derivation
  "only as a subset of the parent's powers"; the hostile-reality doctrine's
  "exclusions + immutable meta-rules" as what survives capture.

## The rules

### 1. Every action has a definition

A definition has three lists:

| List | Means |
|---|---|
| **must** | What every block of this kind has to carry or satisfy. |
| **may** | What it can do. **Closed: anything not listed is impossible.** |
| **cannot** | Named locks — things it can never do, however it is later extended. |

Each rule has an id (`money.spend/cannot/payee-signs`), one plain sentence, and
a check. The action definition is AI-readable in the same way as an ADR-Q-006 manifest.

**Why name cannots when "may" is already closed?** Because a closed list only
says what is possible *today*. A named cannot binds every later version and
every action definition derived from this one: nobody can add a *may* that contradicts
it. The cannot is the lock; the closed *may* is the wall.

### 2. Cannot wins

If a *may* and a *cannot* ever meet, the cannot wins. No setting, vote,
mandate or emergency overrides a cannot.

### 3. Definitions only tighten downward

An action definition can be derived from another — a federation's own `money.spend` from
Q's core one; a strand from its blocks; a component from its template. The
child:

- inherits **every** must and cannot of its parent;
- may **add** musts and cannots;
- may only **narrow** the *may*;
- can never remove or soften anything.

The checker refuses a derived definition that loosens its parent. This is the
same shape as UCAN attenuation.

### 4. Definitions are content-addressed and never change

An action definition is named by its hash. Every block cites the action definition it was made
under. A new version is a new hash; an old block is always judged by the
action definition it cites. So changing a rule is never silent, and a rule added later
never reaches back to make past blocks invalid.

### 5. Checked by every reader, not only the writer

A lock only the writer checks is a promise, not a lock. So:

- **the writer** refuses to create a block that breaks its action definition;
- **the verifier** refuses to accept one — offline, needing nothing but the
  block, its chain and its action definition;
- **the index** refuses to count one.

The verifier's first question, *does it hold up?*, now means: signatures,
chain, content hash, **and its action definition**. A block that breaks a cannot does not
hold up. (The other questions — can you read it, do you trust the signer, does
anyone vouch, were they allowed — stay separate, as in
`docs/identity/kernel.md`.)

### 6. Refusals cite rules

Every refusal says which rule, by id, in a sentence, and reports every broken
rule at once — as `checkComponentManifest` already does.

### 7. Honest about what isn't checked yet

A rule whose check can't be done mechanically yet is marked **declared**, and
shown as such wherever it appears. It is never presented as enforced.

### 8. Musts with a deadline become visible obligations

Some musts are about time ("accounts published within 30 days of the year
end"). A missed one shows on the chain as an open obligation. It is never
silently dropped.

## The kernel cannots — every block, always

These are not data. They live in the verifier's code, so no action definition can leave
them out and no action definition lacking them is accepted.

| Id | Every block cannot… |
|---|---|
| **K1** | be changed after signing. It can only be superseded by a new block that cites it. |
| **K2** | exist without a signer — a person, or a key founded by one. |
| **K3** | grant more than its signer holds. |
| **K4** | sign, consent or act for a person who did not sign. (The seam.) |
| **K5** | reach back: a later block cannot make an earlier valid block invalid. Revocation works forward only. |
| **K6** | leave out the action definition it was made under. |
| **K7** | present a guess as an answer: derived values stay in `derived:`, never `q:` (ADR-Q-001 §6). |
| **K8** | widen its own use: going beyond `given` needs a separate consent (ADR-Q-001 §5). |

And every block **must** carry: its kind, its action definition hash, `at`, `by`,
`contentHash`, `signature`, and `previousHash` where it sits in a chain.

## Example: `money.spend`

| | Rule |
|---|---|
| **must** | Two signatures, each from a holder of a live spend mandate. |
| **must** | State amount, currency, payee and purpose. |
| **must** | Cite the budget decision when above the federation's threshold. |
| **must** | Chain to the federation's money ledger. |
| **may** | Record money moving from the federation to the payee. |
| **cannot** | Be signed by the payee. |
| **cannot** | Count one person twice (two DIDs linked as the same person's worlds are one signer). |
| **cannot** | Exceed the budget line it cites. |
| **cannot** | Be dated earlier than the block it follows. |
| **cannot** | Be approved by an AI. |

A camping club may derive its own `money.spend` adding "cannot exceed £200
without a members' vote". It cannot drop "two signatures".

## Where this sits

```
Kernel cannots (K1–K8, in the verifier)
   └─ Core actions (Q: site.founded, federation.joined, money.spend, component, …)
        └─ Strand / federation versions (add, never loosen)
             └─ The block itself (cites its action definition by hash)
```

## Build order

1. The action definition format, the checker and derivation ("only
   tightens") — now as Cedar policies in a separate package (ADR-Q-009), not
   `q-core` — and K1–K8 in the verifier. Tests for each K rule and for
   a derived definition that tries to loosen.
2. Action definitions for what already exists: `identity.linked`, `site.founded`, call
   receipts, `component` blocks (lifting ADR-Q-006's rules into the action definition
   form).
3. The ADR-Q-007 core: `federation.founded`, `joined`, `left`, `removed`,
   caretaker mandate, `closed`.
4. Then each ADR-Q-007 block as it is built — Money's action definitions first among
   them.

## Non-claims

This does **not**:

- make any existing receipt check its action definition yet;
- decide how checks are written portably — code pinned by hash, or a small
  predicate language (ADR-Q-001's questions-as-predicates is the candidate);
- stop a person from breaking the law or a promise off the chain — it makes
  a block that claims otherwise fail to hold up;
- prevent someone from making a *new kind* with looser rules — but that kind
  cannot claim an existing kind's name or action definition, and readers see which
  action definition every block cites.

## Open questions

- **Where action definitions are published** so any reader can fetch one by hash
  (vault, relay, DHT — same question as ADR-Q-001 §10).
- **Check language** — code pinned by hash vs declarative predicates.
- **Who may publish a core action definition.** Proposed: Q's core action definitions are
  released like core components (ADR-Q-006, `by: "q:core"`); federations
  publish derived ones under their own key.
