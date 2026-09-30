# Audit Review — Saturday 19 September 2026

> What we did, discovered, tried, and found out.

---

## 1. What We Built

### 1.1 Download State Tracking (`packages/q-core/src/offline-queue.ts`)

**Problem**: Offline signal loss during receipt transfer = partial downloads. System didn't know if it had the full file.

**Solution**: Finite state machine for receipt lifecycle:

```
pending → receiving → received → opened
              ↓
           failed
```

**Implementation**:
- Added `ReceiptState` type: `'pending' | 'receiving' | 'received' | 'opened' | 'failed'`
- Added fields to `QueuedReceipt`:
  - `direction: 'incoming' | 'outgoing'`
  - `state: ReceiptState`
  - `progress?: number` (0-100)
  - `startedAt?: number`
  - `completedAt?: number`
- Added functions:
  - `updateReceiptState(id, state, progress)` — update download state
  - `fetchReceiptWithProgress(url, options)` — fetch wrapper that tracks progress
  - `getReceiptsByState(state)` — filter by state
  - `getReceiptsByDirection(direction)` — filter by direction

---

### 1.2 Preloader Component (`apps/q/src/lib/components/ReceiptPreloader.svelte`)

**Purpose**: Show loading state before receipt content is ready.

**Implementation**:
- Maps receipt states to UI states:
  - `pending` → spinner with "Waiting to receive…"
  - `receiving` → progress bar with percentage
  - `received`/`opened` → show content
  - `failed` → error message with partial download info

---

### 1.3 Ledger Integration (`apps/q/src/lib/ledger.ts`)

**Purpose**: Track download states in the ledger for UI access.

**Implementation**:
- Added `downloadStates: Map<string, ReceiptDownloadState>` to Ledger interface
- Added `getReceiptDownloadState(receiptId)` function
- Added `setReceiptDownloadState(receiptId, state, progress)` function

---

### 1.4 Trigger Engine (`packages/q-core/src/triggers.ts`)

**Problem**: Need to react to receipt lifecycle events — notifications, auto-open, UI refresh.

**Solution**: Event-based trigger system with conditions and actions.

**Condition types**:
- `did` — match by DID (supports wildcards like `did:key:z...*`)
- `receipt_type` — match by type (e.g., `identity.linked`, `federation.treaty.*`)
- `lifecycle` — match by state (`received`, `opened`)
- `and/or` — compound conditions

**Actions**:
- `notify` — in-app or email notification
- `auto_unseal` — decrypt sealed container
- `refresh_ui` — reload the UI
- `queue_sync` — queue for remote sync
- `run` — custom command

**Helper functions**:
- `createReceiptEvent()` — fire receipt trigger
- `createLifecycleEvent()` — fire state change trigger
- `createLinkRequestTrigger()` — example: notify on link request
- `createTreatyAutoOpenTrigger()` — example: auto-open treaties
- `createSyncCompleteTrigger()` — example: refresh after sync

---

### 1.5 Auth Flow Fix (`apps/q/src/routes/+layout.svelte`, `SignIn.svelte`)

**Problem**: 
1. `/keys` page rendered inside full shell layout when not signed in
2. After sign-out, layout used stale "remembered" state
3. Sign-out didn't properly clear session

**Solution**:
1. Made `/keys` a standalone auth page (no header/nav) when not signed in
2. Fixed redirect guard to always check fresh from localStorage
3. Added sessionStorage flag (`q-signed-out`) to signal just-signed-out state

**Changes**:
- `+layout.svelte`: Show clean layout for `/` and `/keys` when `!identity && !known`
- `+layout.svelte`: Guard checks `remembered()` fresh each time
- `SignIn.svelte`: On sign-out: `forget()` → set flag → redirect to `/keys`

---

### 1.6 Background Sync (`packages/q-core/src/offline-queue.ts`, `+layout.svelte`)

**Problem**: Need efficient way to sync receipts between devices without manual action.

**Solution**: Background sync every 5 minutes using the queue.

**Implementation**:
- `startBackgroundSync(intervalMs, kernelUrl, onSync)` — Start periodic sync
- `stopBackgroundSync()` — Stop sync
- `isBackgroundSyncRunning()` — Check status
- `triggerSync()` — Manual sync trigger

**Integration**:
- On **sign-in**: starts background sync (5 min interval)
- On **sign-out**: stops background sync

---

## 2. What We Discovered

### 2.1 Pre-existing TypeScript Errors

The darkolive app has 32 pre-existing TypeScript errors (Svelte 5 runes migration issues with `$state`, `$derived`). These are **not** related to our current work and existed before this session.

```
darkolive:check: svelte-check found 32 errors and 0 warnings in 6 files
```

### 2.2 Race Condition in Auth Guard

The original guard used a stale `known` value from component state instead of reading fresh from `localStorage` on each navigation. This caused the redirect loop after sign-out.

**Fix**: Read fresh from `remembered()` on each guard evaluation.

### 2.3 Content-Addressable Replication Vision

Discussed a powerful design pattern:
- User folder has subfolders for federations, documents, media
- Each shared copy gets its own DID → becomes its own sharing point
- Storage = replication = availability
- Self-replicating content-addressable storage

```
User folder/
├── receipts/
│   ├── federations/my-fed/
│   ├── documents/
│   └── media/
└── shared/ (copies with their own DIDs)
```

---

## 3. What We Tried

### 3.1 SvelteKit Preload Data (Deferred)

Initially considered adding SvelteKit `load` functions for preloading receipt data, but the current architecture reads from local IndexedDB via the ledger. This works well for now.

### 3.2 Trigger Persistence Model

Started documenting trigger rules persistence (on-chain vs local-only), but deferred implementation to focus on core sync.

---

## 4. What We Found Out

### 4.1 Session Storage Behavior

- `localStorage` persists across tabs/sessions — used for remembered DID
- `sessionStorage` is per-tab — used for the `q-signed-out` flag
- `forget()` in passkey module clears localStorage but the layout may still use stale state

### 4.2 Download Progress Tracking

The `fetchReceiptWithProgress` wrapper:
1. Tracks progress via `ReadableStream` reader
2. Updates IndexedDB state on each chunk
3. Returns a new Response with accumulated body for downstream use

### 4.3 Background Sync Logic

- Runs immediately on start, then at interval
- Skips if offline
- Calls optional callback with sync results
- Stops on sign-out to prevent sync without identity

---

## 5. Files Changed

### New Files
- `docs/q/receipt-lifecycle.md` — Trigger documentation draft
- `docs/q/audit-review-2026-09-19.md` — This document
- `packages/q-core/src/triggers.ts` — Trigger engine
- `apps/q/src/lib/components/ReceiptPreloader.svelte` — Preloader component

### Modified Files
- `packages/q-core/src/offline-queue.ts` — Download state + background sync
- `packages/q-core/src/index.ts` — Export triggers
- `apps/q/src/lib/ledger.ts` — Download state integration
- `apps/q/src/routes/+layout.svelte` — Auth flow + background sync
- `apps/q/src/lib/components/SignIn.svelte` — Redirect after sign-in/out
- `apps/darkolive/src/lib/speech-text.js` — Added JSDoc types (minor fix)

---

## 6. Test Results

| Test | Status |
|------|--------|
| `pnpm test` | ✅ All pass (46 q-core + darkolive smoke) |
| `pnpm --filter @inqbeta/q run check` | ✅ 0 errors, 3 warnings |
| `pnpm --filter darkolive run check` | ❌ 32 pre-existing errors (not our work) |

---

## 7. Open Questions / Deferred Work

1. **Darkolive TypeScript errors** — 32 pre-existing Svelte 5 runes errors
2. **Trigger persistence** — On-chain vs local-only for trigger rules
3. **Content replication** — The self-replicating DID vision not yet implemented
4. **a11y warnings** — 3 warnings in SearchDrawer.svelte (non-blocking)

---

## 8. Storage Sources & Sync

### 8.1 Current Discovery

When signing in, files automatically become available - suggesting Q uses a browser/platform-specific folder:
- Safari Keychain stores the passkey
- A folder (likely in browser data) stores the user data
- This is automatic and transparent to the user

### 8.2 Requirements

**Problem**: Need to know/verify which storage sources are authorized:
- Current device's local storage
- Other devices (via sync)
- External sources (Google Drive, iCloud, etc.)

**Solution**: Storage source management:
1. **Trusted Sources List**: Record all authorized storage locations
2. **Sync Dashboard**: Show sync status, last synced, manual sync button
3. **Add Storage Source**: During sign-in or in settings, add:
   - Google Drive
   - iCloud
   - Other device
   - Custom folder

### 8.3 Implementation Plan

1. **Storage Source Interface**:
```typescript
interface StorageSource {
  id: string;
  type: 'local' | 'googledrive' | 'icloud' | 'custom';
  name: string;
  connected: boolean;
  lastSync?: string;
}
```

2. **Sync Dashboard Widget**:
- Show connected sources
- Last sync time
- Manual sync button
- Add new source button

3. **Add Source Flow**:
- During sign-in: "Add another storage source?"
- In Settings: "Storage Sources" section

---

## 9. Open Questions / Deferred Work

1. Fix darkolive TypeScript errors (Svelte 5 runes migration)
2. Implement trigger persistence (on-chain or local)
3. Add more trigger actions (email, webhooks)
4. Consider the content replication vision
5. Add tests for trigger engine
6. **NEW**: Implement storage source management (see 8.3)
