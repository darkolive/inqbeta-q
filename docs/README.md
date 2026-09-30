---
implementation: current
decision: none
updated: 2026-09-26
---

# Q docs — index

**Start with [`where-we-are.md`](where-we-are.md)**: what's built, what's
uncommitted, and what to consider next.

Every doc below has a status, so nobody (person or model) treats an old plan as
a description of the code:

| Status | Means |
|---|---|
| **current** | Describes how things are now. Keep it true when the code changes. |
| **decision** | An accepted ADR. Changed only by a later ADR. |
| **design** | Worked out, not (fully) built. Not a description of the code. |
| **research** | Findings from outside. Not a decision. |
| **record** | True on the day it was written. Read for history. |
| **superseded** | Replaced; the note says by what. |

Statuses were set on 26 September from each doc's date, `q/what-is-real.md`
and the 25 September audit — not from a line-by-line re-read. Correct one when
you find it wrong, and move each doc to front-matter
(`implementation:` / `decision:`) as it is next touched.

## Decisions

| Doc | Status | Note |
|---|---|---|
| [ADR-Q-001 Questions as predicates](decisions/adr-q-001-questions-as-predicates-and-relay-lifecycle.md) | decision | Needs a Non-claims section |
| [ADR-Q-002 Receipt lifecycle and cards](decisions/adr-q-002-receipt-lifecycle-and-cards.md) | decision | Needs a Non-claims section |
| [ADR-Q-003 A website is a key](decisions/adr-q-003-sites-as-keys.md) | decision | Publish live; later phase: publish from the device |
| [ADR-Q-004 Calls](decisions/adr-q-004-calls.md) | decision | Work not committed |
| [ADR-Q-005 Continuity home](decisions/adr-q-005-continuity-home.md) | decision | Steps 1–5, 7 built; step 6 (worlds) to do |
| [ADR-Q-006 Components, manifests and blocks](decisions/adr-q-006-components-and-manifests.md) | decision | Steps 1–2 built (uncommitted) |
| [ADR-Q-007 Federations, membership and strands](decisions/adr-q-007-federations-membership-and-strands.md) | decision | Accepted 28 Sep; nothing built — replaces `federation.ts` |
| [ADR-Q-008 Must and cannot](decisions/adr-q-008-must-and-cannot.md) | decision | Kernel principle: every action has must / may / cannot; nothing built |
| [ADR-Q-009 Actions, action index and engine](decisions/adr-q-009-actions-index-and-engine.md) | decision | Cedar (browser WASM + Rust on Spin); MQTT for news only; spike passed (~0.25 ms per decision); `packages/q-actions` built, 25 tests; Rust and Spin 4.1 agree with WASM |
| [Safari saves; Back up now is the safety](decisions/2026-09-23-safari-saves-back-up-now.md) | decision | Button since made proven (audit phase 0) |

## Current

| Doc | About |
|---|---|
| [where-we-are.md](where-we-are.md) | Status and next steps — supersedes `q/status-2026-09-19.md` |
| [q/going-live.md](q/going-live.md) | inqbeta.com and inqbeta.dev: Vercel, Namecheap DNS, env, checks |
| [q/storage-channels.md](q/storage-channels.md) | Storage channels, auto-sync, Google Drive; Dropbox/OneDrive next |
| [q/block-controls-plan.md](q/block-controls-plan.md) | Write: blocks, Style panel, full screen, drag and drop |
| [q/static-pages.md](q/static-pages.md) | A published page that carries its own receipt |
| [q/site-as-a-receipt.md](q/site-as-a-receipt.md) | The site is the blocks; a release is one signature |
| [q/channels.md](q/channels.md) | Contact channels (email works; SMS does not) |
| [q/places-are-channels.md](q/places-are-channels.md) | A place is a channel — the principle behind storage channels |
| [q/copies-and-doors.md](q/copies-and-doors.md) | More copies always help; more doors only if more than one is needed |
| [q/where-it-lives.md](q/where-it-lives.md) | Tiers as data ages (tier names still to choose) |
| [q/dnd-kit-and-the-vocabulary.md](q/dnd-kit-and-the-vocabulary.md) | Why the block vocabulary is closed; drag and drop |

## Design (not fully built)

| Doc | Note |
|---|---|
| [q/receipt-lifecycle.md](q/receipt-lifecycle.md) | Trigger engine as designed; actions not built |
| [q/self-executing-receipts.md](q/self-executing-receipts.md) | Vision |
| [q/revocation-and-the-kernel.md](q/revocation-and-the-kernel.md) | Revoking a lost drive |
| [q/heat-bands.md](q/heat-bands.md) | `bands.ts` tested, unused |
| [q/home-node.md](q/home-node.md) | The mini PC as media server and federation node: Compose, Nebula mesh per federation, local Dgraph. Research list in §8 |
| [q/federation-cloud.md](q/federation-cloud.md) | Federation hosting — see ADR-Q-006 open question on shared state; governance and membership now in ADR-Q-007 |
| [q/cloud-devices.md](q/cloud-devices.md) | Cloud-only devices |
| [q/network-architecture.md](q/network-architecture.md) | Network |
| [q/pooled-storage-as-a-service.md](q/pooled-storage-as-a-service.md) | Pooled storage |
| [q/dom-control-architecture.md](q/dom-control-architecture.md) | DOM control |
| [q/architecture.md](q/architecture.md), [q/architecture-extended.md](q/architecture-extended.md) | Early architecture (17–18 Sep) |
| [q/receipt-architecture.md](q/receipt-architecture.md), [q/receipt-schema.md](q/receipt-schema.md) | Early receipt design (18 Sep) |
| [identity/devices-and-branches.md](identity/devices-and-branches.md) | Proposal |

## Research

| Doc |
|---|
| [q/research-2026-09-20-clusters-ipfs-relays.md](q/research-2026-09-20-clusters-ipfs-relays.md) |
| [q/research-2026-09-20-mainline-addressing.md](q/research-2026-09-20-mainline-addressing.md) |
| [q/research-2026-09-20-rented-storage.md](q/research-2026-09-20-rented-storage.md) — input to the bucket-provider decision |
| [identity/ucan-analysis.md](identity/ucan-analysis.md) |

## Reference (16 September — predates ADR-Q-005)

Passkey identity as first built. Where these say nothing is stored and the
passkey is the only way in, ADR-Q-005 now governs.

[identity/README.md](identity/README.md) · [how-it-works](identity/how-it-works.md) ·
[kernel](identity/kernel.md) · [permissions](identity/permissions.md) ·
[threat-model](identity/threat-model.md) · [ucan-in-q](identity/ucan-in-q.md) ·
[using-it](identity/using-it.md)

## Record (true when written)

| Doc | Note |
|---|---|
| [q/what-is-real.md](q/what-is-real.md) | 20 Sep: what was tested, used, invented. Its "tested and unused" list still holds |
| [q/audit-review-2026-09-19.md](q/audit-review-2026-09-19.md) | |
| [q/handover-to-claude.md](q/handover-to-claude.md) | §6 overstates the trigger engine |
| [q/thinking-2026-09-19-evening.md](q/thinking-2026-09-19-evening.md) | |
| [q/what-changed.md](q/what-changed.md) | |
| [q/gap-check-green-space-dark-skies.md](q/gap-check-green-space-dark-skies.md) | |
| [q/dashboard.md](q/dashboard.md), [q/modules.md](q/modules.md) | 16–17 Sep maps; the code has moved on |
| [observations.md](observations.md) | |

## Superseded

| Doc | By |
|---|---|
| [q/status-2026-09-19.md](q/status-2026-09-19.md) | [where-we-are.md](where-we-are.md) |
| [q/design-principles.md](q/design-principles.md) §2 | Passkey first (OTP-before-passkey is the opposite of Q) |
| [q/audit-review-2026-09-18.md](q/audit-review-2026-09-18.md) | A design record, not a report of built things (`what-is-real.md`) |

## Outside this repo

- **Q audit — storage channels and the incubator doctrine** (Claude doc, 25 Sep):
  <https://claude.ai/code/artifact/91d2474e-96ac-42e8-92b1-359aab8ca0a4>
- **The incubator** — `~/inQbeta/docs`: plugins and manifests (`plugins/`,
  `wiki/*Manifest*`), recovery charter and continuity-home reviews
  (`architecture/`).
