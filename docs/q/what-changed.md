# What changed

**2026-09-20 — the sixth. The chain, and why 42 is the right joke.**

> "The very first creation question is: who are you? The answer is my
> identity. So the next question then becomes: what's next? And the answer will
> be based on the answer to the previous question. So we have a continual
> hashing versioning git path, and all you're recording each time is what
> changed."

Yes. That is event sourcing over a Merkle chain, and it is the right shape.
Genesis has no parent and answers **who are you**. Everything after answers
**what's next** and records only the difference. Current state is the fold.
Nothing changed is the identity element — the last thing it was.

`q-core/src/chain.ts`, 170 tests passing.

---

## The joke is better than it looks

Deep Thought returned 42 and it was useless, because nobody had kept the
question.

That is the entire argument for storing **question-and-answer pairs** rather
than values, made forty-five years ago as a gag. A value without its question
is 42: unfalsifiable, uninterpretable, and impossible to disagree with
usefully. Every step in the chain carries what it was asked, which is why a
receipt from 2019 still means something in 2036 when the software that wrote
it is gone.

Worth keeping in the design notes rather than the jokes.

## Three things the shape does not give you for free

### A hash chain is not a blockchain

It proves nobody edited the middle without redoing the end. It does **not**
prove there is only one chain.

The signer holds the key. They can sign two different *what's next* from the
same parent and show one to you and another to somebody else. That is
**equivocation**, and it is the exact thing consensus machinery exists to
prevent — the expensive part of a blockchain is not the hashing, it is
agreeing which chain is the chain.

So: **the chain authenticates a history, not the history** — until somebody
else has witnessed the head. A federation counter-signature on the current
head is enough, and it is the same `anchor` a revocation needs. Two
requirements, one mechanism.

### "What's next?" branches

Two devices, both offline, both answer. So this is a **DAG**, not a line.

Which is good news, because a merge is itself a receipt answering *which of
these do you keep?* — so the decision is **auditable rather than silent**.
Most systems resolve conflicts invisibly and hope. Here the resolution is a
step with a signature on it, and "who decided this, and when" has an answer.

`forkAt()` reports a fork without guessing why, because from the steps alone
Q cannot tell an honest offline branch from a dishonest one. It names both
readings and lets a person judge.

### Folding from genesis gets slower forever

Git keeps trees. Event stores keep snapshots. Without checkpoints, a
twenty-year identity takes minutes to open.

The rule that matters: **a checkpoint shortcuts history, it never replaces
it.** Otherwise the holder could forge their own past by checkpointing a lie —
which would hand back exactly the property the chain was for.

## Decay, and the incubator already had it right

Darren remembered Euler's decay from the incubator documents. The renewal map
has it, and its wording is sharper than "decay":

> **decaying** — Social or interpretive **trust** and **confidence** lose
> strength over time **even when records persist** — *trust signal ≠ permanent
> trust.*

So the record never decays. **The confidence does.** That is the distinction
the whole taxonomy turns on, and it is the opposite of what a retention policy
does.

`confidence()` is Euler — a half-life, `2^(-age/τ)` — with one deliberate
property: **it never reaches zero.** A curve that bottoms out lets a screen
confuse two different sentences:

- *We no longer rely on this.*
- *This never happened.*

And `howSure()` never says an answer is **wrong**. Only how long since anybody
confirmed it:

| | |
|---|---|
| ≥ 0.75 | Recently confirmed. |
| ≥ 0.5 | Still stands, and it has been a while. |
| ≥ 0.25 | Nobody has confirmed this lately. It may still be true. |
| below | This was true when it was said. Nothing since says whether it still is. |

There is a test asserting none of those sentences contains *wrong*, *false*,
*expired* or *invalid*. An aged answer is not a refuted one, and a system that
blurs those will be used to make decisions about people.

## Where the day lands

Six notes, and the same sentence underneath all of them:

| | what cannot be made to happen |
|---|---|
| relays | cannot be made to delete |
| the DHT | cannot be made to forget |
| an archive | cannot be checked from here |
| a revocation | cannot be made to travel |
| a chain | cannot prove it is the only one |
| an old answer | cannot be made current by looking at it |

Every one is answered the same way: **do not promise it. Make the thing that
would go wrong not matter, and say plainly which you have done.** Sealing
instead of deleting, witnessing instead of asserting, confidence instead of
truth.

That is the design, and it turns out to have been one idea all along.

## Next

1. **Per-archive keys** — still first, still the difference between a
   permanent exposure and a closable one.
2. A head anchor — one mechanism serving both the chain and revocation.
3. `q:what/next` as the real receipt shape in `apps/q`, with `fold()` behind
   the profile page instead of the current stored state.
4. Checkpoints, once there is a chain long enough to need one.

## Sources

Internal (incubator):
`docs/architecture/constitutional-renewal-expiry-decay-periodic-reauthorisation-reconciliation-map.md` §1,
`docs/wiki/State-of-the-Kernel.md`, `docs/wiki/Architecture-Whitepaper.md`.
Internal (Q): `chain.ts`, `revocation.ts`, `questions.ts`, `canonical.ts`.
