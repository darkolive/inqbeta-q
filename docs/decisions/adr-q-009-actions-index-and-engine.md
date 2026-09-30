# ADR-Q-009: Actions, the action index and the rule engine

**Status: accepted, 28 September 2026.** Darren: "I kind of look at them as
actions … an action can happen, may happen, and cannot happen are all equally
useful … does that warrant there being a search index of actions? … every
federation created would generate its charter list … this is suddenly making a
rule engine … a really fast way in WASM of interpreting and deciding on the
spot." On Cedar: "I like your suggestion as fits." The incubator runs on Spin
(spinframework.dev); he is also interested in Spin's MQTT messaging.

**Built:** a spike, `spikes/cedar-actions/`, **run 28 September on Darren's
Mac (Cedar 4.13.0):** 11 of 11 `money.spend` cases as expected, refusals
naming every broken rule by `@id`, **~0.25 ms per decision** warm, policies
type-checked against the schema, and a federation `permit` refused.
Then **`packages/q-actions`** (uncommitted): definition checker, hashing,
derivation, AI-readable brief, engine with Cedar passed in, `money.spend` as
the first core action — **25/25 tests** on Darren's Mac. **Rust agrees with
WASM** (`spikes/cedar-rust`): same action hashes, same decision and same rule
ids on every case, 0.13 ms per decision native. **Spin agrees too**
(`spikes/cedar-spin`, Spin 4.1): all 20 decisions over HTTP identical to the
browser's. One engine, three places — browser, native, node — same answer.

---

## Words

| Word | Means |
|---|---|
| **Action** | Something that can happen — `member.join`, `money.spend`, `site.found`. Its definition holds its must / may / cannot (ADR-Q-008). |
| **Receipt** | An action that happened. It names its action by hash. |
| **Action index** | The searchable list of every action definition. |
| **Engine** | What decides, on the spot, whether a receipt keeps its action's rules. |

ADR-Q-008's "charter" is this ADR's **action definition**.

## 1. An action definition is policy, not prose

Each action is published as:

- a **schema** — the facts the engine is given about a receipt of this action;
- a **policy set** — one **permit** (the *may*) and a **forbid** for every
  must and every cannot, each with an `@id` a refusal can cite;
- a plain-language description of each rule, AI-readable (ADR-Q-006 style).

All three are content-addressed together; the hash is the action's identity.

## 2. The engine is Cedar

[Cedar](https://www.cedarpolicy.com) (open source, Apache-2.0, Rust) fits
ADR-Q-008 almost exactly:

| ADR-Q-008 | Cedar |
|---|---|
| *may* is closed — anything not listed is impossible | Default deny: nothing is allowed without a permit |
| Cannot wins | Any forbid beats any permit |
| Refusals cite rules | The response names the policies that decided it |
| Only tightens | Checkable with Cedar's open-source analysis tools — and, with rule 3 below, true by construction |
| Fast, on the spot, offline | Rust, compiled to WASM; no network |

**One engine, two places, same answer:**

- **In Q (browser, desktop, iOS):** the WASM build (`@cedar-policy/cedar-wasm`).
- **On nodes (Spin):** the `cedar-policy` Rust crate inside a Rust Spin
  component — `services/kernel-spin-rs` is already Rust.

The Cedar version is pinned in every action definition (`engine.cedar`), and
the engine refuses a definition written for another version, so every reader
runs the same engine and reaches the same decision.

**Weight, and waking (decided 28 September, built):** the browser build is
4.3 MB (1.4 MB gzipped). It is never loaded on first paint, and never by a
public site page. Instead:

- **Signing in wakes it.** Once the passkey has answered and the browser is
  idle, Q starts Cedar in its own Web Worker and loads the core actions, so
  the engine is ready before anyone acts, and the screen never waits on it
  (`apps/q/src/lib/actions/engine.ts`, `engine.worker.ts`). Signing out puts
  it to sleep.
- **Downloaded once per device.** The service worker does not fetch it at
  install; it keeps it, on first use, in a cache of its own named after the
  Cedar version (`q-engine-cedar-4.13.0`), which deploys do not remove. Only a
  deliberate Cedar upgrade (`q-actions/src/version.ts`) replaces it.
- **In the iOS and desktop apps** it ships inside the app: no download, and
  offline from install.
- **"Where your work is kept"** says whether the engine is ready, which
  Cedar, how long waking took, and what is loaded.

A device does not need Spin: it already has the same engine and gives the
same answer. Spin runs on nodes, for what happens while you are away —
accepting others' receipts, relaying, checking before indexing. Offline, the
device decides alone; back online, the node checks too, because every reader
checks. A slimmer Cedar build (authorization only) is worth trying later.

## 3. Federations add forbids only

A federation's version of an action (the camping club's `money.spend`) may add
**forbid** policies. It may never add a **permit**. Adding a forbid can only
refuse more, so "charters only tighten" (ADR-Q-008 rule 3) is guaranteed by
the shape of the thing, not by review.

Permits come only from the core action. A federation that needs something the
core action cannot do needs a new core action — which is a Q release, not a
federation setting.

## 4. The engine decides; the kernel gathers facts

Cedar deliberately cannot count, loop or look anything up — that is why it is
fast and can be analysed. Facts that need the chain are gathered by Q's
verifier first and passed in as context:

- how many *different* people signed (worlds linked to one person count once);
- which signers held a live mandate at the receipt's time (UCAN walk);
- what is left on a budget line; whether a cited decision exists and passed.

So the order for every receipt is:

1. **Kernel** — signatures, hash, chain, and the kernel cannots K1–K8, in the
   verifier's own code. No policy can switch these off.
2. **Facts** — gathered from the chain for this action's schema.
3. **Engine** — the action's policy set (core + the federation's forbids).
4. **Result** — holds up, or doesn't, with the `@id`s of every rule broken.

## 5. The action index finds; the hash decides

Every action definition — core, and every federation's derived version — goes
into the **action index**, in Dgraph, searchable:

- "What can a treasurer do in this club?"
- "Which actions move money?"
- "Which federations forbid spending over £200 without a vote?"

The AI interview (ADR-Q-007) builds a federation by choosing existing actions
and adding forbids — assemble first, as ADR-Q-006 says.

**But the index never decides.** A receipt names its action by hash; the
engine fetches that exact definition (from cache, vault, relay or anyone who
has it) and checks the hash. If the index is down, wrong or captured, every
decision still comes out the same. This keeps ADR-Q-001's "no registry to run".

Each entry names its parent by hash, so the index is also the family tree of
every action: which federations derived what from which core action.

## 6. Messages: MQTT carries news, never evidence

Spin v4 can **publish** MQTT messages (QoS at-least-once or at-most-once);
receiving needs the separate `spin-trigger-mqtt` plugin. The incubator's
kernel-spin already uses Spin's Redis trigger for internal streams.

MQTT is a good fit for **telling a federation something happened** — a new
receipt, a ballot opening, a spend waiting for its second signature — and
for **ringing** (ADR-Q-004 b), to nodes and to Q clients (browsers over
MQTT-over-WebSockets).

**Redis stays, for a different job.** In the incubator, Redis is a node's
short-term memory — sessions, rate limits, and a queue between components on
one machine (`inq:stream:kernel:auth`). Browsers and phones can't talk to it,
and it isn't built to face the internet. **Redis inside a node; MQTT between
nodes and devices.**

Rules:

- **To a federation, a message carries a receipt's hash and kind, not its
  content.** Whoever cares fetches the receipt and checks it. (ADR-Q-001:
  relays keep only the fact that they carried something.) **To one person**
  (a ring), it may carry the signed receipt sealed to them — the broker can
  neither read nor alter it.
- **Every message is signed.** The broker is not trusted; it only passes on.
- **Topics are opaque.** A topic name must not reveal who is a member of what
  (ADR-Q-001 §9, the tag). Per-federation topics use an identifier derived
  from the federation key, not its name.
- **Delivery is not evidence.** A missed message loses nothing: the receipts
  are still reconciled by sync. Spin's docs say its MQTT sender "is known to
  occasionally drop errors, especially if under load" — so nothing may depend
  on a publish succeeding.
- **One broker per federation, on its own mesh** (the home-node plan: Docker,
  Nebula), not a shared public broker.
- **MQTT reaches only devices that are awake.** A sleeping phone is woken by
  push (Apple push / Web Push) carrying nothing but "wake up".

## Build order

1. ✅ **Spike** (`spikes/cedar-actions`): eleven `money.spend` cases, core
   alone and core + a camping club's forbid — all as expected, ~0.25 ms warm.
2. ✅ **A separate package, `packages/q-actions`** — q-core keeps no
   dependencies.
3. **The action definition format** ✅ (`inqbeta.action/1`: facts, rules with
   kind / says / checked / policy, parent hash, Cedar version) and
   `money.spend` ✅. Still to do: the pipeline in §4 — the kernel cannots
   and gathering facts from a real chain.
4. **Actions for what exists** — `site.found`, `identity.link`, calls,
   `component` blocks — then the ADR-Q-007 federation core.
5. **Rust** ✅ and **Spin** ✅ — same hashes, decisions and rule ids as WASM
   on every exported case (`spikes/cedar-rust`, `spikes/cedar-spin`). The
   Spin component is 6.4 MB (1.5 MB gzipped). Next: move `kernel-spin-rs`
   from Spin 2.5 to 4.1 and put the engine in it.
6. **Action index** in Dgraph.
7. **MQTT** announcements on the home-node mesh.

## Non-claims

This does **not**:

- run anywhere but the spike — nothing in Q calls Cedar yet;
- claim Cedar's analysis tools are wired in — rule 3 makes most of that
  unnecessary, and they are a later check;
- let a federation extend an action's schema — a club that wants a new fact
  (e.g. "cites a members' vote") needs it in the core schema for now;
- make MQTT part of any decision.

## Open questions

- **New facts for federations.** How a federation adds a fact its forbid
  needs without a core release — probably schema extensions that can only
  add optional fields.
- **Musts with deadlines** (ADR-Q-008 rule 8) are about time passing, not a
  single receipt. They likely need a scheduled check that produces an
  "obligation open" receipt, rather than the engine.
- **Spin version.** `kernel-spin-rs` pins Spin v2.5 (Fermyon git); MQTT
  outbound as described is from the v4 docs.
- **Where definitions are fetched from** by hash — same question as
  ADR-Q-001 §10 and ADR-Q-008.
