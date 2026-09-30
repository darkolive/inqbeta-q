# Handover to Claude — Saturday 19 September 2026

> Everything done today. Read this to pick up where we left off.
>
> **Corrected 19 Sep, evening.** Parts of §1 and §6 described designs as though
> they were working. See `what-is-real.md`, which is checked against the tests
> rather than against anyone's memory — read that first.

---

## 1. What We Built

### 1.1 Download State Tracking (`packages/q-core/src/offline-queue.ts`)

Added receipt lifecycle tracking for offline sync:

```typescript
type ReceiptState = 'pending' | 'receiving' | 'received' | 'opened' | 'failed';

interface QueuedReceipt {
  direction: 'incoming' | 'outgoing';
  state: ReceiptState;
  progress?: number;      // 0-100
  startedAt?: number;
  completedAt?: number;
}
```

New functions:
- `updateReceiptState(id, state, progress)`
- `fetchReceiptWithProgress(url, options)` — tracks download progress
- `getReceiptsByState(state)`, `getReceiptsByDirection(direction)`

---

### 1.2 Preloader Component (`apps/q/src/lib/components/ReceiptPreloader.svelte`)

Shows spinner/progress bar while receipt downloads:
- `pending` → spinner "Waiting to receive…"
- `receiving` → progress bar with percentage
- `received`/`opened` → show content
- `failed` → error message

---

### 1.3 Ledger Integration (`apps/q/src/lib/ledger.ts`)

Added download state tracking to the ledger:
- `downloadStates: Map<string, ReceiptDownloadState>`
- `getReceiptDownloadState(receiptId)`
- `setReceiptDownloadState(receiptId, state, progress)`

---

### 1.4 Trigger Engine (`packages/q-core/src/triggers.ts`) — OUTLINE ONLY

**The conditions evaluate. The actions do not do anything.** Every branch of
`executeAction` is a `console.log` and a comment, except `refresh_ui`, which
dispatches a `CustomEvent`. There are no tests. It is a shape to build against,
and it should not be described as working until it is.

Two of the actions below should stay unimplemented until an ADR question is
answered:

- **`run`** — executing a command against a person's own data is the largest
  open question in ADR-Q-002. Implementing this action answers it by accident.
- **`auto_unseal`** — `createTreatyAutoOpenTrigger()` opens a seal because
  something arrived, with no person in the loop. The whole passkey argument is
  that the touch is the gate.

The shape, for reference:

**Conditions:**
- `did` — match by DID (supports wildcards)
- `receipt_type` — match by type (`identity.linked`, `federation.treaty.*`)
- `lifecycle` — match by state (`received`, `opened`)
- `and/or` — compound conditions

**Actions:**
- `notify` — in-app or email
- `auto_unseal` — decrypt sealed container
- `refresh_ui` — reload UI
- `queue_sync` — queue for sync
- `run` — custom command

**Helper functions:**
- `createReceiptEvent()`, `createLifecycleEvent()`, `createCommandEvent()`
- `createLinkRequestTrigger()`, `createTreatyAutoOpenTrigger()`, `createSyncCompleteTrigger()`

---

### 1.5 Auth Flow Fix (`+layout.svelte`, `SignIn.svelte`)

Fixed the sign-in/sign-out flow to be deterministic:

**Guard 1** — Not signed in → `/keys`:
```typescript
$effect(() => {
  const currentlyKnown = identity?.did ?? remembered();
  if (!answered || identity || currentlyKnown || openPath(path)) return;
  goto('/keys');
});
```

**Guard 2** — Signed in but on `/keys` → `/`:
```typescript
$effect(() => {
  if (!answered || !identity || path !== '/keys') return;
  goto('/');
});
```

**Sign out** — Now properly clears session:
```typescript
onclick={() => { 
  forget(); 
  sessionStorage.setItem('q-signed-out', '1'); 
  goto('/keys'); 
}}
```

---

### 1.6 Background Sync (`offline-queue.ts`, `+layout.svelte`)

Background sync every 5 minutes:

```typescript
startBackgroundSync(intervalMs, kernelUrl, onSync)
stopBackgroundSync()
isBackgroundSyncRunning()
triggerSync()
```

Integration:
- Starts on sign-in
- Stops on sign-out
- Logs sync results

---

### 1.7 Storage Sources Page (`/nodes`)

Enhanced `/nodes` (Copy Locations) with:
- Background sync status badge (on/off)
- Last auto-sync timestamp
- Shows sync is active when signed in

---

## 2. Documents Created

| Document | Purpose |
|----------|---------|
| `docs/q/receipt-lifecycle.md` | Trigger system design |
| `docs/q/audit-review-2026-09-19.md` | Session audit |
| `docs/q/dom-control-architecture.md` | Header-as-source-of-truth |

---

## 3. Files Changed

### New Files
- `packages/q-core/src/triggers.ts` — Trigger engine
- `apps/q/src/lib/components/ReceiptPreloader.svelte` — Preloader
- `docs/q/receipt-lifecycle.md` — Documentation
- `docs/q/audit-review-2026-09-19.md` — Audit
- `docs/q/dom-control-architecture.md` — Architecture
- `docs/q/handover-to-claude.md` — This file

### Modified Files
- `packages/q-core/src/offline-queue.ts` — Download state + background sync
- `packages/q-core/src/index.ts` — Export triggers
- `apps/q/src/lib/ledger.ts` — Download state in ledger
- `apps/q/src/routes/+layout.svelte` — Auth guards + background sync
- `apps/q/src/routes/nodes/+page.svelte` — Sync status UI
- `apps/q/src/lib/components/SignIn.svelte` — Redirect after sign-in/out

---

## 4. Test Results

| Test | Status |
|------|--------|
| `pnpm test` | ✅ All pass (46 q-core + darkolive smoke) |
| `pnpm --filter @inqbeta/q run check` | ✅ 0 errors, 3 warnings |
| `pnpm --filter darkolive run check` | ❌ 32 pre-existing errors (not our work) |

---

## 5. Known Issues

1. **Darkolive TypeScript errors** — 32 pre-existing Svelte 5 runes errors. Not our work, not critical.

2. **a11y warnings** — 3 in SearchDrawer.svelte (non-blocking)

---

## 6. What's Working

- ✅ Auth flow: sign in → `/`, sign out → `/keys` — walked by hand
- ⚠️ Download state tracking — types and transitions exist, no tests
- ⚠️ Preloader UI component — renders; nothing yet drives it with real progress
- ⚠️ Background sync — runs every 5 minutes against a kernel in a **separate
  repository** (`~/inQbeta/services/kernel-spin`). No tests
- ⚠️ Storage sources page — shows sync status; the storage figures are literals
- ❌ Trigger engine — conditions evaluate, actions are stubs (see §1.4)

Twenty-one of twenty-nine `q-core` modules have no test, including everything
in this list. `what-is-real.md` has the full account.

---

## 7. What Was Discussed But Not Implemented

1. **Content replication vision** — Self-replicating DID storage
2. **Trigger persistence** — On-chain vs local-only
3. **Google Drive storage source** — Add during sign-in or settings

---

## 8. Quick Start for Claude

**Read `docs/q/what-is-real.md` first.** Then the two ADRs in
`docs/decisions/` — they carry decisions made on the 19th that are easy to
undo by accident, and two open questions that gate the next work:

1. ADR-Q-001 §10 — IPFS public DHT or private swarm? Nothing about relays
   should be built before this is settled.
2. ADR-Q-002 open question 1 — what sandbox does a federation's method get?
   `triggers.ts` has a `run` action waiting on the answer.

**The working rule:** one vertical finished before the next is started.
Finished means a person can do it end to end and there are tests that fail if
it breaks. Three days of surface got ahead of what could be verified; that is
the thing to correct, not to continue.

To continue working on this codebase:

```bash
# Install and run
cd ~/inqbeta-q
pnpm install
pnpm dev:q

# Run tests
pnpm test

# Type check
pnpm --filter @inqbeta/q run check
```

### Key Files to Look At
- `packages/q-core/src/offline-queue.ts` — Queue + background sync
- `packages/q-core/src/triggers.ts` — Trigger engine
- `apps/q/src/routes/+layout.svelte` — Auth guards
- `apps/q/src/routes/nodes/+page.svelte` — Storage sources

---

## 9. Next Steps — revised 19 Sep, evening

**Next:** cards. A card is a selection of question ids plus the channels for
that purpose, signed — and it is a UCAN delegation, which is already built,
tested and revocable offline (ADR-Q-002 §4). It finishes the vertical the
questions work started: answer things, then choose what a given audience sees.
It needs no new mechanism, and it is what makes the case this is all for work —
hold your own data, decide what to show.

**Then, in order:**

1. Tests for the modules a page already depends on — `folder`, `exchange`,
   `offline-queue` — before anything new is built on them.
2. Settle the two ADR questions. They are research, not code, and everything
   downstream waits on them.
3. Make one invented page real, or take it out. `/network` and `/balance` show
   numbers nobody produced.
4. Fold `second-factor.ts` and `zk-2fa.ts` into channels, by ADR rather than
   quiet deletion.
5. darkolive's type errors — a separate job, unrelated to Q.

**Not yet:** trigger persistence, Google Drive, receipt UI templates. Each adds
surface. The surface is the problem.

---

**End of handover.**
