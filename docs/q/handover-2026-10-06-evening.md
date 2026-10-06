---
updated: 2026-10-06 (late)
about: Tuesday evening handover. What one long thread built on 6 October from the morning's job sheet, what Darren needs to do, and the next jobs in order. Read first in a new thread; it follows handover-2026-10-06.md (the job sheet, still the reference for tracks).
---

# Handover — Tuesday 6 October 2026, evening

## Start here

1. **Commit and push** what's on disk since the last commit (D2–D5 below and
   the docs). Use `GIT_OPTIONAL_LOCKS=0` for any git command run from a Claude
   session: a plain `git status` there can leave `.git/index.lock` behind
   (the session can't delete files), which blocks the next commit.
2. **Update the node** (A3): rsync and recreate the gate. It now carries the
   revoked list (`/revoked/<federation>`), the office post list
   (`/offices/<federation>`) and the ledger lock (`x-ledger-tip`). Until then
   the host's servers fall back safely: no list means nothing known to be
   revoked, no holders means the caretaker answers, no tip means the old
   unlocked filing.
3. Pick the next job below; start a fresh thread with this file.

## Built today (all tested; svelte-check 0 errors; build passes)

| Job | What | Where |
|---|---|---|
| A1, I1, I2 | Housekeeping: tsc clean (decks), 7 use-before-declaration bugs fixed, svelte-check and build run in a cloud copy | `decks/index.ts`, `CreditFlowDisplay`, `balance/[mint]` |
| B1 | The door proved over HTTP (Darren in; Tess refused, passed, in, taken back, refused); **Publish refused on the development site** (it wasn't) | `q-core/test/door-rig.test.ts`, `api/host/money` |
| D1 | **One credit = one unit of the mint's currency** (`Q_CURRENCY`, picker on Publish); `pencePerCredit` gone | `q-core/currency.ts`, ADR-Q-027 as built |
| C1 | **Offices**: caretaker, treasurer, secretary, chair, safeguarding lead, steward, **verifier, reviewer, compliance officer**; appointed by the caretaker as UCAN mandates with a term; stand down, recall; `office.appoint` / `office.end` in Cedar | `q-core/offices.ts`, `q-actions/core/federation-offices.ts`, federation page Members → Offices |
| C2 | **Acting in role, checked by servers**: take-up and set-down receipts; asks carry `acting`; `actingCovers`; reconcile asks for the office | `q-core/inrole.ts`, `api/mint` |
| — | **Taking up an office is a declaration** (no conflict, or the interest declared) under the Nolan principles, every time; a **standing interest** in the mandate must be declared | `inrole.ts`, `RoleSwitch`, ADR-Q-038 addenda |
| — | **Endings published**: recall or stand-down → federation-signed notice on the node; servers refuse at once | `offices.ts` `revocationNotice`, gate `/revoked`, `lib/server/revoked.ts` |
| C3 | **The coin's contact office** (`Q_COIN_CONTACT`, coin designer) | ADR-Q-037 as built |
| — | **Evidence reports and external verification**: internal compliance writes in role; a verifier of another federation weighs it knowing the declaration | `q-core/attestation.ts`, `lib/attestation.ts`, `/attest` |
| D2–D4 | **Drift**, the **safety valve** (cash-outs pause over 20% drift or 30 days unreconciled; Cedar too), the **cash-out lock** (gate files one at a time on the books it was decided on) | `q-core/mint.ts` `valveOf`, gate ledger, ADR-Q-027 as built |
| C5 | **The office's post**: holders publish where its post goes; **Ask the treasurer** reaches them; office post only in role, answered as the office | `offices.ts` `officePost`, gate `/offices`, `lib/messages.ts` `askOffice`, desk |

Tests: q-core 596 pass, q-actions 61 pass.

**A note on names**: q-core already has `assurance.ts` (evidentiary bars, from
September). The new compliance work is `attestation.ts`. Check a name is free
before creating a file.

## Next, in order

1. **E1–E4 treaties** (ADR-Q-042): unblocked now that offices (C1) and
   currency (D1) exist. Banking card, treaty receipts, swap-first settlement,
   the Cedar rules.
2. **Co-signing**: a second office holder signs the same receipt (the Money
   block's two signatures; ADR-Q-038 §6 when an action touches the declared
   interest or the holder's own account). It unblocks C4.
3. **C4, the federation's account in role** (ADR-Q-038 §8): needs co-signing
   and evidence of the decision (until the Plans block, a minuted decision
   receipt signed in role by the secretary or chair).
4. **F1**: write ADR-Q-043, the stimulus valve (economy-controls.md).
5. Smaller: the office's card; post for the caretaker; the story view (a
   receipt's history in order); I3 phone pass; I4 docs README (ADRs 010–043);
   I5 battery bell keys into `storage.ts`.

## Decisions waiting on Darren

Still open from the morning's list (treaty defaults, rate sources, the valve's
settings for economy controls, drift thresholds — now built at 10% / 20% / 30
days, change if wanted — urgent alerts out of role, handover of open
threads, who can open a seal). New:

- Should a role **set itself down** after a while (end of day, closing the
  tab)? Today it stays until set down or signed out.
- **Caretaker post**: should the caretaker publish an office post too (from
  the founding grant), so "Ask" reaches them inside Q rather than by the
  messages link?

## Later that night: records, registration, trust travels down

| What | Where |
|---|---|
| **An office's records belong to the federation**: each office has its own key, handed on with every appointment and turned over when someone leaves; its archive is on the federation's node; whoever holds the office reads its history | `offices.ts` keyrings and archive, gate `/archive/<fed>/<officeKey>`, ADR-Q-038 |
| **The office shelf**: office post lives in your working folder under *Office records*, sealed to the office, never in your personal backup, emptied when the office ends | `folder.ts` `shelf*`, `lib/office-post.ts` |
| **Registering with Incubator**: the federation card (visibility: public, only its people, unlisted), Incubator's countersignature, a receipt page with QR and **Go to site**, the directory | `q-core/registration.ts`, `api/registry`, `/registered/<fed>`, `/directory`, gate `/registry`, ADR-Q-021 |
| **Trust travels down**: every build writes `/_q/core.json` naming its core chunk; Incubator fingerprints the bytes the site serves and finds *unchanged*, *a branch* (source named on the card, with **See what's different**) or *changed* (refused). Incubator signs each release it runs, by itself. **Before you join** shows the host (and club) as Registered, A branch of Q, Testing or Not registered | `core-files.json`, `vite.config.ts`, `q-core/core-served.ts`, `lib/server/core.ts`, `HostTrust.svelte`, gate `/core-releases`, ADR-Q-019 addendum |

Proved end to end on a rig (a site, the gate, Incubator on localhost): the
straight copy registered as unchanged, a changed core refused, the same change
with its branch named registered as a branch.

**Clubs, through their host**, also built: the club's founder sends a link,
the host's caretaker signs once, Incubator countersigns, the club registers
and holds only while its host does. Proved on the rig, refusals included.

**Darren, on top of Start here:** node/HETZNER.md **Step 8** is the whole node
update: the registrar key, its DID into `/srv/node/.env` as `GATE_REGISTRAR`
(compose now passes it to the gate; before, it couldn't), rsync, recreate,
check `/registry` and `/core-releases`.

**Next on this thread:** the manifest rules a host must meet; a host
withdrawing a club; renewal reminders; "only its people" visibility.

## Late on 6 October: live, registered, and tested

**Done and live on inqbeta.com:**

- The node update (HETZNER.md Step 8). `GATE_REGISTRAR` is set, and compose
  now passes it to the gate.
- inqbeta.com is registered with Incubator, so the chain starts at its root.
- The registry finds Incubator's node from the home file bundled at build
  time. Reading it from the server's disk failed on Vercel.
- A role now lasts only as long as the sign-in. A fresh sign-in sets down a
  role left from a lapsed one, so every sign-in declares afresh (ADR-Q-038
  addendum). Pressing Sign out already set it down.
- **Testing** (`docs/q/testing.md`, `q/testing.md` in the project):
  - 73 checklists hold 688 page checks, plus 15 that every page gets and one
    per language: 2,221 checks in all.
  - Testers take a checklist with a signed claim, then send a signed report.
  - The AI runner is `apps/q/scripts/run-checks.mts`.
  - The node keeps reports at `/checks`, and only from testers.
  - Darren's first real report (the Legal checklist) is on the node.

**Ideas Darren raised, not yet worked on:**

- Roles as their own contained parts of the repo. Each office (treasurer,
  verifier, compliance and so on) could be a self-contained piece, the way a
  plugin is.
- The testing engine as part of the plugin builder. A plugin, or a
  component, comes with its own checklists, so building one means writing
  how it's tested.

**Branches to hand off on their own:**

- **The storyboard, for writing courses**: `q/storyboard-courses-brief.md`.
  Give a new thread that file alone, and work on a branch
  (`story/courses`).

**Next on the main thread**, in order:

1. Fix what the AI runner found: the legal pages' and footer's links under
   44 pixels; empty tab titles on Setup, Attest and the Google channel page;
   the story Play button; the Files page's sign-in button.
2. Give the runner its key and a tester pass, run it against inqbeta.com, and
   write the first page-specific AI tests.
3. Then the job sheet: treaties E1–E4, co-signing, C4, F1 (ADR-Q-043).
