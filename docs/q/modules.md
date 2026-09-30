# q-core Modules

**Generated**: 2026-09-17

This document catalogs all modules in `packages/q-core/src/`.

---

## Core Identity

| Module | Purpose |
|--------|---------|
| `passkey.ts` | WebAuthn PRF → Ed25519/X25519 keys → DID. Identity from biometric. |
| `did.ts` | did:key encode/decode, key conversion |
| `seal.ts` | Seal/unseal with X25519 |
| `vault.ts` | Encrypted .dsv file format |

---

## Storage

| Module | Purpose |
|--------|---------|
| `folder.ts` | File System Access API + IndexedDB folder |
| `fsx.ts` | Browser filesystem helpers |
| `replicas.ts` | Copy locations for folder sync |

---

## UCAN (Permissions)

| Module | Purpose |
|--------|---------|
| `ucan/token.ts` | UCAN delegation/invocation tokens |
| `ucan/validate.ts` | Token validation, policies |
| `ucan/store.ts` | localStorage UCAN container |
| `ucan/policy.ts` | Policy language (selectors) |
| `ucan/revoke.ts` | Revocation handling |
| `ucan/cid.ts` | CIDv1 with SHA-256 |
| `ucan/cbor.ts` | DAG-CBOR encoding |
| `ucan/varsig.ts` | Ed25519 signature format |
| `ucan/container.ts` | ctn-v1 containers |
| `permissions.ts` | CRUD + Grant as UCAN |
| `links.ts` | Identity link receipts |

---

## Evidence & Receipts

| Module | Purpose |
|--------|---------|
| `receipts.ts` | Kernel client (kernel-spin:8787) |
| `offline-queue.ts` | IndexedDB queue, sync when online |
| `evidence-bundle.ts` | ADR-006 bundle format (PATH A/B) |
| `offline-exchange.ts` | ADR-008 offline exchange receipts |
| `keys.ts` | Key types & conditions (time, location, multi-sig) |

---

## Backend Connectors

| Module | Purpose |
|--------|---------|
| `dgraph.ts` | Dgraph client (queries, mutations) |
| `seaweedfs.ts` | SeaweedFS client (S3-compatible replication) |

---

## Access Control

| Module | Purpose |
|--------|---------|
| `session.ts` | Session tokens (24h, privacy-preserving) |
| `access.ts` | Hybrid: read (session) → attest (passkey) |

---

## Taxonomy

| Module | Purpose |
|--------|---------|
| `taxonomy.ts` | Evidence types, categories, Dgraph predicates |
| `canonical.ts` | Canonical JSON, SHA-256 |

---

## Module Dependency Graph

```
passkey.ts ──► did.ts ──► seal.ts
     │
     └──► vault.ts
     │
     └──► folder.ts ──► fsx.ts
                    └──► replicas.ts

ucan/* ──► permissions.ts ──► links.ts

receipts.ts ──► offline-queue.ts
      │
      ├──► evidence-bundle.ts
      ├──► offline-exchange.ts
      └──► keys.ts

dgraph.ts ◄── receipts.ts
seaweedfs.ts

session.ts ◄── access.ts ◄── passkey.ts
```

---

## Usage Examples

### Sign in with passkey
```ts
import { unlock, watch } from '@inqbeta/q-core/passkey';

const result = await unlock();
if (result.ok) {
  console.log('Signed in as:', result.identity?.did);
}
```

### Check access level
```ts
import { getAccessLevel, requireAttest } from '@inqbeta/q-core/access';

const level = getAccessLevel(); // 'anonymous' | 'read' | 'attest'

await requireAttest(); // Prompts for passkey if needed
```

### Create a receipt
```ts
import { createKernelClient, buildReceipt } from '@inqbeta/q-core/receipts';
import { queueReceipt } from '@inqbeta/q-core/offline-queue';

const kernel = createKernelClient('http://localhost:8787');

const receipt = buildReceipt({
  type: 'attestation',
  subject: 'course:123',
  canonical: { completed: true }
});

// Works offline - queues if needed
await queueReceipt(receipt, 'course:123');
```

### Query Dgraph
```ts
import { createDgraphClient } from '@inqbeta/q-core/dgraph';

const dgraph = createDgraphClient('http://localhost:8080');
const receipts = await dgraph.getReceiptsBySubject('course:123');
```

### Check key rules
```ts
import { checkKeyRule } from '@inqbeta/q-core/keys';

const result = await checkKeyRule(
  { type: 'time', time: { validFrom: ... } },
  { currentTime: Date.now() / 1000 }
);
```

### Evidence taxonomy
```ts
import { getEvidenceType, createEvidenceDID } from '@inqbeta/q-core/taxonomy';

const type = getEvidenceType('application/pdf');
// → { category: 'document', subtype: 'pdf', ... }

const did = createEvidenceDID({ type, contentHash: '...' });
// → did:inqbeta:evidence/document/pdf/...
```
