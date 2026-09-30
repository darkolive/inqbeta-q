# Receipt-Driven Architecture

**Philosophy: "Everything is a receipt"**

---

## Namespace Convention

```
inqbeta:{namespace}:{source-of-truth}
```

| Namespace | Purpose |
|----------|---------|
| `identity` | Your DID, keys, device links |
| `folder` | File storage, receipts |
| `federation` | Group membership, trust |
| `ui` | Page layouts, components |
| `action` | Any user action |
| `evidence` | Learning, achievements |

---

## Receipt Model

Every action creates a receipt indexed by DID:

```json
{
  "id": "receipt_id",
  "type": "ui.page" | "action.create" | "federation.join" | "evidence.course.complete",
  "by": "did:key:z6M...",
  "subject": "anything",
  "content": { ... },
  "contentHash": "sha256...",
  "previousHash": "...",
  "signature": "..."
}
```

---

## UI as Receipts

**Page views can be receipts!**

- If you have the DID + `type=ui` → you see the intended view
- Page layouts are stored as receipts
- Components are receipts
- Templates are receipts

### Benefits:
1. **Portable UI** - Your layout travels with you
2. **Versioned** - Every change is a receipt
3. **Federation-aware** - Federations can share UI templates
4. **Page builder** - Drag-and-drop components, saved as receipts

---

## Example: Building a Page

```
1. Create page receipt:
   type: "ui.page"
   content: {
     blocks: [
       { type: "header", title: "My Dashboard" },
       { type: "federation-list", filter: "member" },
       { type: "recent-activity" }
     ]
   }

2. Render: Look up page receipt by your DID
   - If you have the DID + page exists → show your custom layout
   - If not → show default layout

3. Move blocks around in page builder
   - Each change creates a new ui.page receipt
   - Previous versions are preserved
```

---

## Federation UI Templates

Federations can share UI templates as receipts:

```
Federation creates:
- type: "ui.template.course-card"
- content: { template for how courses display }

Members can:
- Use federation's templates
- Override with their own receipts
- Mix and match
```

---

## Implementation

### Receipt Types

```typescript
type ReceiptType = 
  // Identity
  | 'identity.key.added'
  | 'identity.device.linked'
  
  // Data
  | 'folder.file.created'
  | 'folder.receipt.created'
  
  // Federation
  | 'federation.created'
  | 'federation.member.joined'
  | 'federation.trust.extended'
  
  // UI
  | 'ui.page'
  | 'ui.component'
  | 'ui.template'
  
  // Evidence
  | 'evidence.course.completed'
  | 'evidence.badge.earned'
  
  // Action
  | 'action.anything'
```

### Indexing

All receipts are indexed by:
1. `by` (DID) - what did this
2. `type` - what kind of receipt
3. `subject` - what it's about
4. `contentHash` - integrity

---

## Benefits

| Benefit | How |
|---------|-----|
| **Auditability** | Every action = receipt = traceable |
| **Portability** | UI layouts travel with your DID |
| **Federation** | Share templates, inherit views |
| **Offline** | All receipts local, indexed |
| **Versioning** | Chain of receipts = history |
| **Page Builder** | Components as receipts |

---

## The Flow

```
User Action
    ↓
Create Receipt (signed by DID)
    ↓
Store in Folder (local IndexedDB)
    ↓
Index by DID + Type
    ↓
Query: "Show my ui.page receipts"
    ↓
Render Custom Page
```

---

## Next Steps

1. Extend receipts system to support `ui.*` types
2. Create page builder UI
3. Implement federation template sharing
4. Add "my pages" to navigation
