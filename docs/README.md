---
implementation: current
decision: none
updated: 2026-10-06
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

ADRs 010–043 were added on 6 October 2026 from each ADR's own status and as-built notes. Statuses were set on 26 September from each doc's date, `q/what-is-real.md`
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
| [ADR-Q-010 Messages](decisions/adr-q-010-messages.md) | proposed | Built: sealed person-to-person messages through the node's post office; office post (ADR-Q-037/038) |
| [ADR-Q-011 Read aloud](decisions/adr-q-011-read-aloud.md) | built | Recorded voice; the story player uses it |
| [ADR-Q-012 The vault pointer](decisions/adr-q-012-vault-pointer.md) | built | Needs a passkey that can carry it |
| [ADR-Q-013 Your own AI keys, or Q credits](decisions/adr-q-013-ai-keys-and-credits.md) | proposed | Not built; the story engine uses the host's key on localhost |
| [ADR-Q-014 The bellboy, the directory and the storage unit](decisions/adr-q-014-bellboy-directory-storage-unit.md) | proposed | The node runs all three (HETZNER.md) |
| [ADR-Q-015 Cards with a purpose](decisions/adr-q-015-cards-with-a-purpose.md) | proposed | Started: profile, templates, CardFace, tabs, sharing by ticking |
| [ADR-Q-016 Incubator is a federation](decisions/adr-q-016-incubator-is-a-federation.md) | proposed | Started: home federation, joining, announcements, notifications |
| [ADR-Q-017 Incubator runs the commons](decisions/adr-q-017-incubator-runs-the-commons.md) | proposed | Started: usage from receipts; storage allowance at the gate |
| [ADR-Q-018 Install on your own computer first](decisions/adr-q-018-install-local-first.md) | proposed | Started: local mode, set-up cards, Services |
| [ADR-Q-019 Copies, and the master they come from](decisions/adr-q-019-copies-and-the-master.md) | proposed | Trust travels down built 6 Oct: core fingerprinted as served, branches name their source, clubs through their host |
| [ADR-Q-020 Federations are a plugin](decisions/adr-q-020-federations-are-a-plugin.md) | proposed | Started: the host's Federations switch |
| [ADR-Q-021 Directory Enquiries](decisions/adr-q-021-directory-enquiries.md) | proposed | Registration with Incubator, receipt pages, the directory (6 Oct) |
| [ADR-Q-022 Voice messages, and the receptionist](decisions/adr-q-022-voice-messages-and-the-receptionist.md) | proposed | Started: Part A steps 1–2 |
| [ADR-Q-023 Credits, rewards and the exchange](decisions/adr-q-023-credits-rewards-and-the-exchange.md) | proposed | Started: the four credit actions in Cedar, balances, the Credits page |
| [ADR-Q-024 The balance sheet](decisions/adr-q-024-the-balance-sheet.md) | proposed | Not started (job G1) |
| [ADR-Q-025 Agreements](decisions/adr-q-025-agreements.md) | proposed | Started: receipts and standing, six rules, Write an agreement |
| [ADR-Q-026 Offers by link](decisions/adr-q-026-offers-by-link.md) | decided | Built 3 Oct: open and standing offers, shops |
| [ADR-Q-027 Minting against reserves](decisions/adr-q-027-minting-against-reserves.md) | decided | Test mode end to end; currency (D1), drift, the safety valve, the ledger lock (D2–D4) |
| [ADR-Q-028 Copies in order](decisions/adr-q-028-copies-in-order.md) | decided | Steps 1–7 built |
| [ADR-Q-029 Component sets](decisions/adr-q-029-component-sets.md) | decided | The four sets built |
| [ADR-Q-030 The network market](decisions/adr-q-030-the-network-market.md) | proposed | Step 1 started: kept storage by the month |
| [ADR-Q-031 Crowdfunding and test beds](decisions/adr-q-031-crowdfunding-and-test-beds.md) | proposed | Not started |
| [ADR-Q-032 A message that carries things](decisions/adr-q-032-a-message-that-carries-things.md) | accepted | Step 1 built: the message card and attachments |
| [ADR-Q-033 The story player and engine](decisions/adr-q-033-the-story-player-and-engine.md) | accepted (player) | Player built; engine first draft; storyboard for courses is a separate branch (q/storyboard-courses-brief.md) |
| [ADR-Q-034 The door and the playground](decisions/adr-q-034-the-door-and-the-playground.md) | decision | Door and tester passes built; development site's own gate |
| [ADR-Q-035 The federation's bank](decisions/adr-q-035-the-federation-bank.md) | decision | Bank tab, statement, cashing-out account, reconciliation |
| [ADR-Q-036 Credits held by rule](decisions/adr-q-036-credits-held-by-rule.md) | proposed | Not started (grants; attestations for ADR-Q-043) |
| [ADR-Q-037 Ask the office, not the person](decisions/adr-q-037-ask-the-office.md) | decision | Built: the coin's contact office, office post, office hours |
| [ADR-Q-038 Acting in role](decisions/adr-q-038-acting-in-role.md) | decision | Built: offices, declarations (Nolan), in-role receipts, records and the shelf, two signatures, minuted decisions, the federation's account (C4) |
| [ADR-Q-039 Working for an organisation](decisions/adr-q-039-working-for-an-organisation.md) | proposed | Not started |
| [ADR-Q-040 The day photo](decisions/adr-q-040-the-day-photo.md) | proposed | Not started |
| [ADR-Q-041 Behind closed doors](decisions/adr-q-041-behind-closed-doors.md) | proposed | Not started |
| [ADR-Q-042 Treaties and settlement](decisions/adr-q-042-treaties-and-settlement.md) | proposed | E1–E4 built in q-core/q-actions; the page (E5) and the burns not yet |
| [ADR-Q-043 The stimulus valve](decisions/adr-q-043-the-stimulus-valve.md) | proposed | The valve, queues and capacity gift in q-core, tested; three questions for Darren |
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
| [q/showing-money.md](q/showing-money.md) | How Q shows numbers, money, health and proof — the design language to keep site-wide |

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
