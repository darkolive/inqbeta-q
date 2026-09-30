# Observations: inqbeta-q Repo Analysis

**Date**: 2026-09-17  
**Context**: Review of `inqbeta-q` in light of `~/inQbeta` research

---

## 1. Current Repo State

### What Exists

| Component | Location | Status |
|-----------|----------|--------|
| **q-core** | `packages/q-core` | Implemented - passkey identity, UCAN, vault, links |
| **q-ui** | `packages/q-ui` | Implemented - components, icons, roles, levels |
| **Q Dashboard** | `apps/q` (port 3100) | Working - keys, files, receipts, federations, devices |
| **Dark Olive** | `apps/darkolive` (port 5173) | Working - DoStudy integration |

### What's Missing (Gap Analysis)

| Gap | Location | Notes |
|-----|----------|-------|
| **Receipt kernel** | Not in this repo | Lives in `~/inQbeta/services/kernel-spin/internal/receipt` |
| **Badger offline store** | Not in this repo | Lives in `~/inQbeta/services/kernel-spin/internal/offlineexchange` |
| **Evidence bundle** | Not in this repo | ADR-006 defines it in kernel-spin |
| **Dgraph integration** | Not connected | Need API to push receipts |

---

## 2. Architecture Connections

### How It Should Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Vercel)                           │
│  ┌─────────┐  ┌──────────────┐                                     │
│  │ Q App   │  │ Dark Olive   │  ← q-core (browser WebCrypto)     │
│  └────┬────┘  └──────┬───────┘                                     │
│       │               │                                              │
│       │  ┌────────────▼────────────┐                                │
│       │  │  Sign Receipts (local) │  ← passkey identity            │
│       │  └────────────┬────────────┘                                │
└───────┼───────────────┼─────────────────────────────────────────────┘
        │               │
        │    ┌──────────▼──────────┐
        │    │   RECEIPT KERNEL    │
        │    │ (kernel-spin/receipt)│  ← POST /receipts
        │    └──────────┬──────────┘
        │               │
        │    ┌──────────▼──────────┐
        │    │      BADGER         │  ← Offline receipt store
        │    │ (offlineexchange)  │  ← ADR-008
        │    └──────────┬──────────┘
        │               │
        │    ┌──────────▼──────────┐
        │    │      DGRAPH         │  ← Indexed queries
        │    └──────────┬──────────┘
        │               │
        ▼               ▼
   ┌─────────┐   ┌──────────────┐
   │SeaweedFS│   │   Devices    │
   │ (S3/IPFS)│   │   (nodes)   │
   └─────────┘   └──────────────┘
```

### What's Implemented vs What's Referenced

| Implemented in q-core | References (not implemented) |
|----------------------|----------------------------|
| `passkey.ts` - WebAuthn PRF → identity | Receipt kernel API |
| `ucan/` - UCAN tokens, policies, revocation | Badger store connection |
| `vault.ts` - Local encrypted storage | Dgraph push endpoint |
| `folder.ts` - Local folder via File System Access API | SeaweedFS replication |
| `links.ts` - Identity links via receipts | Evidence bundle format |
| **NEW 2026-09-17** | |
| `receipts.ts` - Kernel client | |
| `offline-queue.ts` - Offline receipt sync | |
| `evidence-bundle.ts` - ADR-006 format | |
| `offline-exchange.ts` - ADR-008 receipts | |
| `dgraph.ts` - Dgraph client | |
| `seaweedfs.ts` - SeaweedFS client | |
| `session.ts` - Session management | |
| `access.ts` - Hybrid access control | |
| `taxonomy.ts` - Evidence taxonomy (categories, types, Dgraph predicates) | |
| `keys.ts` - Key types & conditions (passkey, time, location, multi-sig) | |
| `second-factor.ts` - 2FA via email/SMS OTP | |
| `zk-2fa.ts` - Zero-knowledge 2FA (hash of DID+email, no contact stored) | |

---

## 3. Key Observations from ~/inQbeta Research

### ADR Insights Relevant to Q

1. **ADR-006** - Evidence bundle semantics
   - PATH A: fingerprint (for identity)
   - PATH B: equivalence (for comparison)
   - Q should emit receipts in this format

2. **ADR-008** - Offline peer exchange receipt primitive
   - Two participants, two signatures
   - Deterministic canonical commitment bytes
   - Local Badger store, not global settlement
   - **This is what Q receipts should become**

3. **ADR-015** - Audit attestation evidence boundary
   - Receipts prove what happened, don't prescribe action
   - Q receipts should be audit-ready

### "Free to Give, Never Free to Take"

The core principle from the architecture:
- Every action is an **attestation** (signed receipt)
- Attestations are stored in Badger (indexed)
- Evidence lives wherever the receipt points (hash reference)
- Nothing can be "taken" - only given willingly

---

## 4. Next Steps

### Immediate (P0) — ✅ DONE 2026-09-17

1. **Connect Q to Receipt Kernel**
   - ✅ `packages/q-core/src/receipts.ts` - KernelClient class
   - ✅ Connects to kernel-spin on port 8787
   - ✅ Endpoints: appendReceipt, getReceipt, getChain, listSubjects

2. **Offline Queue in IndexedDB**
   - ✅ `packages/q-core/src/offline-queue.ts`
   - ✅ Queues receipts when offline, syncs when online
   - ✅ Auto-sync on connectivity change

3. **Evidence Bundle Format (ADR-006)**
   - ✅ `packages/q-core/src/evidence-bundle.ts`
   - ✅ PATH A: fingerprintBundle()
   - ✅ PATH B: canonicalForEquivalence()
   - ✅ verifyBundle(), isCanonical()

### Hybrid Access Control — ✅ DONE 2026-09-17

4. **Session Management**
   - ✅ `packages/q-core/src/session.ts`
   - ✅ Random session ID (privacy-preserving)
   - ✅ 24-hour expiry, auto-refresh on activity

5. **Hybrid Access Control**
   - ✅ `packages/q-core/src/access.ts`
   - ✅ Three levels: anonymous → read (session) → attest (passkey)
   - ✅ Read: works offline, session-based
   - ✅ Attest: passkey required for any change
   - ✅ "First action enforces the contract"

### Short-term (P1) — ✅ DONE 2026-09-17

6. **Badger Offline Store (ADR-008)**
   - ✅ `packages/q-core/src/offline-exchange.ts`
   - ✅ OfflineExchangeReceipt type
   - ✅ buildOfflineExchangeReceipt()
   - ✅ validateReceipt()

7. **Dgraph Integration**
   - ✅ `packages/q-core/src/dgraph.ts`
   - ✅ DgraphClient class
   - ✅ Query by subject, author, event
   - ✅ Full-text search
   - ✅ Combined ReceiptClient (kernel + dgraph)

8. **SeaweedFS Replication**
   - ✅ `packages/q-core/src/seaweedfs.ts`
   - ✅ SeaweedClient class (S3-compatible)
   - ✅ upload, download, delete, list
   - ✅ syncFolder() helper

### Long-term (P2)

7. **Mobile App (Apple)**
   - Native filesystem access
   - Each device = evidence node

8. **Constitutional Index (ADR-021)**
   - Navigate evidence by dependency graph
   - Not yet implemented

---

## 5. Questions to Resolve

1. **Where does receipt kernel run?** Same server as Dgraph? Separate service?
2. **Badger deployment** - Embedded in kernel-spin, or standalone?
3. **Sync protocol** - How do devices discover each other for SeaweedFS?
4. **Offline-first strategy** - Queue receipts locally, or require initial connection?
5. **Evidence location** - User's folder only, or require at least one external copy?

---

## 7. Known Issues — both solved 2026-09-19

### Issue 1: Passkey DID not persisting across the dashboard — SOLVED

**The 18th's diagnosis was wrong.** It supposed `watch()` ought to rebuild the
identity from the remembered DID via the PRF extension on page load. It cannot,
and should not:

- the DID is an **output** of the derivation, not an input — you cannot go back
  from it to the seed, which is the whole point of it being safe to leave in
  `localStorage`;
- a browser will only produce a PRF result off a real user gesture, so nothing
  can resume silently on load even in principle.

`passkey.ts` was behaving exactly as designed. The keys live in memory for the
life of the tab, and `remembered()` exists so the interface can say "signed in —
touch to resume".

**The real fault was in `apps/q`.** The guard in `+layout.svelte` ran inside the
`watch` callback, which fires immediately with `null` on every load. Any page
outside a list of five was redirected to `/auth` at that instant — so the touch
that would bring the keys back was on the page the person had just been thrown
off. Nothing in the app called `remembered()` outside the small header button,
which was never reachable in time.

Two further faults in the same block:

- the guard read `page.url.pathname` inside the subscriber, so it never ran
  again on client-side navigation — a reload and a nav behaved differently;
- its comment said "verified but no passkey → keys", and the code sent people to
  `/user`.

**What changed:**

- the subscription and the guard are separate effects; the guard reads
  `page.url.pathname` in the effect body, so it re-runs on every navigation;
- **a remembered DID is not signed out.** It is one touch away, and the guard
  leaves it alone;
- `lib/components/Resume.svelte` — the touch, shown in the layout above any page
  whenever a DID is remembered and the keys are not held;
- only a browser with nothing remembered is sent away, and then in the designed
  order: `/auth` if the contact is not verified, `/keys` if it is.

### Issue 2: Folder not being created in Chrome — SOLVED

Not a File System Access problem. `chooseFolder()` reports its failures properly
and `FolderPanel` displays them.

The folder card on `/keys` linked to **`/files`**, which is not a route — the
files page is at `/data`. The one path from the keys page to the folder picker
was a dead link, and the old guard made it worse by bouncing anyone who did
reach a gated page. The same `/files` string was in the layout guard's allowed
list, so the real files page was never exempt from the redirect either.

Both are corrected. The folder flow is now reachable and should be re-tested on
Chrome; if a picker failure remains, it will now say so on screen rather than
doing nothing.

---

## 8. Related Documentation

- `docs/identity/README.md` - Passkey identity overview
- `docs/identity/kernel.md` - How Q plugs into receipt kernel
- `docs/identity/ucan-in-q.md` - UCAN implementation details
- `~/inQbeta/docs/decisions/adr-006-evidence-bundle-semantics.md`
- `~/inQbeta/docs/decisions/adr-008-offline-peer-exchange-receipt-primitive.md`
- `~/inQbeta/docs/decisions/adr-015-audit-attestation-evidence-boundary.md`
