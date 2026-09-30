# Receipt Schema & Storage

## Badger Limits

| Limit | Value | Implication |
|-------|-------|-------------|
| **Value threshold (default)** | 1 MB | Values under this go in fast LSM tree |
| **Value log file** | 1 GB max | Values over 1MB go to vlog |
| **Max value size** | ~4 GB | Theoretical limit (uint32 offset) |
| **Recommendation** | < 1 MB | Keep receipts under 1MB for performance |

---

## Receipt Schema

```typescript
interface Receipt {
  // Core
  id: string;           // Unique receipt ID
  type: string;        // e.g., "ui.page", "action.create"
  by: string;          // DID of signer
  at: number;          // Timestamp (Unix ms)
  
  // Content
  subject: string;      // What it's about
  content: any;        // The data (keep < 1MB)
  
  // Integrity
  contentHash: string; // sha256 of content
  previousHash: string;// Chain link
  signature: string;    // Ed25519 signature
  
  // Indexing (for dgraph)
  namespace: string;    // "identity", "ui", "federation", etc.
  source: string;      // "inqbeta:..." source of truth
}
```

---

## Namespace Structure

```
inqbeta:{namespace}:{source}

Example:
- inqbeta:identity:passkey        → Key registration
- inqbeta:folder:receipt          → File stored
- inqbeta:federation:member       → Federation membership
- inqbeta:ui:page                → Page layout
- inqbeta:ui:component          → Reusable component
- inqbeta:action:sign-in         → User action
- inqbeta:evidence:course.complete → Learning achievement
```

---

## Receipt Types

### Identity Layer
```typescript
{ type: "inqbeta:identity:key.added", content: { publicKey: "..." } }
{ type: "inqbeta:identity:device.linked", content: { deviceId: "..." } }
```

### Folder/Data Layer
```typescript
{ type: "inqbeta:folder:file.created", content: { name: "...", size: 1234 } }
{ type: "inqbeta:folder:receipt.created", content: { ... } }
```

### Federation Layer
```typescript
{ type: "inqbeta:federation:created", content: { name: "Dart College", id: "fed_xxx" } }
{ type: "inqbeta:federation:member.joined", content: { federationId: "...", role: "member" } }
```

### UI Layer
```typescript
{ type: "inqbeta:ui:page", content: { 
  id: "my-dashboard",
  blocks: [
    { type: "header", title: "My Dashboard" },
    { type: "federation-list" },
    { type: "recent-activity" }
  ]
}}

{ type: "inqbeta:ui:component", content: {
  id: "course-card",
  template: { ... }
}}
```

### Evidence Layer
```typescript
{ type: "inqbeta:evidence:course.complete", content: { 
  courseId: "course-123",
  completedAt: 1699999999999
}}
```

---

## Storage Strategy

### Badger (Local Kernel)
- **Key**: `{did}:{receipt_id}`
- **Value**: Full receipt JSON
- **Index**: By DID for fast lookup

### Dgraph (Indexed Queries)
- **Predicate**: `receipt_by`
- **Index**: `type`, `namespace`, `subject`, `at`

---

## Example: Full Receipt

```json
{
  "id": "receipt_abc123",
  "type": "inqbeta:ui:page",
  "by": "did:key:z6Mkr1...",
  "at": 1699999999999,
  "subject": "my-dashboard",
  "content": {
    "blocks": [
      { "type": "header", "title": "Welcome" },
      { "type": "federation-list", "filter": "member" }
    ]
  },
  "contentHash": "sha256:abc123...",
  "previousHash": "sha256:def456...",
  "signature": "ed25519:xyz789...",
  "namespace": "ui",
  "source": "inqbeta:ui:page"
}
```

---

## Size Budget

| Receipt Type | Typical Size | Fits in 1MB? |
|-------------|--------------|---------------|
| Identity key | 200 bytes | ✅ |
| File metadata | 500 bytes | ✅ |
| Federation membership | 300 bytes | ✅ |
| UI page layout | 2-10 KB | ✅ |
| UI component | 5-50 KB | ✅ |
| Evidence (course complete) | 400 bytes | ✅ |
| Large file reference | 1 KB | ✅ |

**Conclusion**: Keep receipts under 1MB for fast LSM tree storage. For larger content (images, videos), store reference in receipt, content elsewhere.

---

## Implementation Priority

1. ✅ Identity receipts (existing)
2. ✅ Folder receipts (existing)
3. ⏳ Federation receipts (in progress)
4. ⏳ UI receipts (schema defined)
5. ⏳ Evidence receipts (schema defined)
