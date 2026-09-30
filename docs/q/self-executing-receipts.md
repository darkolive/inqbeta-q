# Self-Executing Receipts

**Concept**: 2026-09-18

This document describes the self-executing receipt pattern where receipts carry their own execution context, including keys and payloads, enabling fully self-contained cryptographic envelopes.

---

## Unified Content Model

Receipts handle both small and large content uniformly:

### Small Content: Inline (BadgerDB)

For statements, records, form data — capture directly in the receipt:

```json
{
    "type": "statement",
    "canonical": {
        "content": "I agree to the terms and conditions...",
        "captured": true
    }
}
```

**Use for**: Text, JSON, small data (< 1MB)

### Large Content: Reference (SeaweedFS / File System)

For images, documents, media — store externally, reference in receipt:

```json
{
    "type": "document",
    "canonical": {
        "ref": {
            "type": "file",
            "location": "seaweedfs://volume-1/bucket/docs/abc123.pdf",
            "hash": "sha256:...",
            "size": 2500000
        }
    }
}
```

### Web Content: URL Reference

For online content:

```json
{
    "type": "bookmark",
    "canonical": {
        "ref": {
            "type": "url",
            "location": "https://example.com/article",
            "cachedAt": 1698787200000
        }
    }
}
```

### Physical Content: Address Reference

For physical locations:

```json
{
    "type": "property",
    "canonical": {
        "ref": {
            "type": "address",
            "location": "123 Main St, City, Country",
            "coordinates": { "lat": 40.7128, "lng": -74.0060 }
        }
    }
}
```

### Unified Reference Schema

```json
{
    "ref": {
        "type": "file" | "url" | "address" | "did",
        "location": "...",           // Where to find it
        "hash": "...",              // Integrity check (optional)
        "size": 12345,              // Size in bytes (for files)
        "mimeType": "...",          // Media type
        "capturedAt": 1698787200000 // When captured/stored
    }
}
```

### The Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│              RECEIPT CONTENT DECISION                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Is it small enough to inline?                              │
│        │                                                      │
│        ├── Yes (< 1MB) → Store inline in receipt            │
│        │         → Perfect for: statements, form data        │
│        │                                                      │
│        └── No → Use reference                                │
│                  │                                           │
│                  ├── File → SeaweedFS / local filesystem    │
│                  ├── URL → Web address + optional cache      │
│                  ├── DID → Another receipt                   │
│                  └── Address → Physical location             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Storage Strategy Summary

| Content Type | Storage | Receipt Contains |
|--------------|---------|------------------|
| Statement | Inline | Full text |
| Form data | Inline | JSON |
| Image | SeaweedFS | Reference |
| Document | SeaweedFS | Reference |
| Video | SeaweedFS | Reference |
| Web page | URL | Reference + cache |
| Physical location | Reference | Address + coordinates |
| Another receipt | DID | Reference to other receipt |

**The receipt doesn't care what's inside — it just points or contains. Uniform abstraction.**

---

## The Storage Foundation

BadgerDB (the receipt kernel storage) provides generous limits:

| Limit | Value |
|-------|-------|
| Max single value | **4GB** |
| Default vlog file | 1GB |
| Entry limit | 1M entries |

This means any single receipt can contain up to 4GB of data directly — no external file references required.

---

## The Pattern: Self-Executing Receipts

### Traditional Approach (External References)

```
Receipt → references → External file (SeaweedFS)
                → references → Key service
                → references → Template service

Recipient needs: 3-4 round trips to execute
```

### Self-Executing Receipts (All Inline)

```
Receipt {
    type: "command",
    canonical: {
        action: "send_to_third_party",
        payload: { ... },      // Full message
        keys: {                // Keys bundled inline
            ui: "key_ref",
            api: "key_ref"
        }
    },
    hash: "...",
    signatures: [...]
}
```

Recipient needs: **1 message to execute**

---

## Key-Carried Commands

The receipt can carry everything needed for execution:

```json
{
    "type": "command",
    "subject": "user:did",
    "canonical": {
        "action": "render_and_send",
        "template": { ... },      // UI template inline
        "payload": { ... },       // Message content inline
        "keys": {
            "ui": "key:ui:123",   // UI rendering key
            "api": "key:api:456"  // API submission key
        },
        "recipient": "https://third-party.example.com/endpoint"
    },
    "hash": "sha256(...)",
    "signatures": ["sig1", "sig2"]
}
```

### What the Recipient Needs

1. Verify receipt hash (integrity)
2. Look up keys referenced in `canonical.keys`
3. Execute the action

### What the Recipient Does NOT Need

- Call a key service separately
- Fetch a UI template
- Resolve any external references
- Make additional API calls

---

## Implications

### For System Events

Commands, prompts, and system events can be stored entirely in BadgerDB:

- Full prompt text
- Command arguments
- Event payloads
- Execution context

No external file storage needed for these.

### For Code Execution

Code can be embedded directly in receipts:

- WASM modules
- Script payloads
- Execution environment specs

The receipt *is* the code to execute.

### For Third-Party Integration

The third party receives a complete message:

```
┌─────────────────────────────────────┐
│         RECEIPT (single message)    │
│  ┌────────────────────────────────┐ │
│  │ action: "submit_claim"         │ │
│  │ payload: { ... }               │ │
│  │ keys: { ui: "...", api: "..." }│ │
│  │ signature: "..."               │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

They verify, look up keys, execute. Done.

---

## Trade-offs

### When to Use Inline Storage

- Commands and prompts
- Code snippets (< 1MB)
- Event metadata
- Small to medium payloads

### When to Use External Storage (SeaweedFS)

- Large media files (> 100MB)
- Streaming access needed
- CDN distribution
- Deduplication across receipts

---

## Comparison

| Aspect | Traditional API | Self-Executing Receipt |
|--------|----------------|------------------------|
| Round trips | 3-4 | 1 |
| Key resolution | Separate call | In payload |
| Template fetch | Separate call | In payload |
| Audit trail | Fragmented | Complete |
| Offline capable | No | Yes (once received) |

---

## Three-Tier Resilience Model

Without decay, BadgerDB becomes a data graveyard. We propose a three-tier storage system:

### Tier 1: Local (Device)

| Attribute | Value |
|-----------|-------|
| Storage | BadgerDB (on-device) |
| Purpose | Source of truth, always available |
| Latency | Sub-millisecond |
| Capacity | ~4GB per receipt, unlimited receipts |
| Updates | Real-time |

**Use case**: Active work, pending transactions, current session state.

### Tier 2: Sync Backup (Cloud)

| Attribute | Value |
|-----------|-------|
| Storage | Google Drive, iCloud, or equivalent |
| Purpose | Hot backup, disaster recovery |
| Updates | On every save/sync |
| Access | Seconds to retrieve |

**Use case**: Device loss, corruption, cross-device sync.

### Tier 3: Cold Archive

| Attribute | Value |
|-----------|-------|
| Storage | SeaweedFS / S3 / Glacier |
| Purpose | Long-term preservation |
| Retention | 5-10+ years |
| Access | Minutes to hours to retrieve |

**Use case**: Contracts, evidence, legal records, knowledge base.

---

## The Archive Gateway

The gateway handles the transition from hot (Tier 1/2) to cold (Tier 3):

```
┌─────────────────────────────────────────────────────────────┐
│                    ARCHIVE GATEWAY                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   receipts ──► [bundle] ──► [compress] ──► [encrypt] ──► archive │
│       │          │          │             │               │
│       ▼          ▼          ▼             ▼               │
│   daily/     weekly/    monthly/     quarterly/    yearly/ │
│   weekly    monthly    quarterly     yearly        ∞       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Bundle Strategy

| Frequency | Trigger | Contents |
|-----------|---------|----------|
| **Daily** | End of day | All receipts from that day |
| **Weekly** | End of week | 7 daily bundles |
| **Monthly** | End of month | 4-5 weekly bundles |
| **Quarterly** | End of quarter | 3 monthly bundles |
| **Yearly** | End of year | 4 quarterly bundles |

### Bundle Format

```json
{
    "bundle": {
        "period": "2026-Q3",
        "type": "quarterly",
        "createdAt": 1696118400000,
        "from": 1693536000000,
        "to": 1696118400000,
        "receiptCount": 1234,
        "totalSize": "45MB",
        "merkleRoot": "sha256(...)"
    },
    "receipts": [
        { "hash": "...", "compressed": true },
        ...
    ]
}
```

### Decay Policies

Receipts can declare their own decay policy:

```json
{
    "type": "command",
    "subject": "...",
    "decay": {
        "tier1": "immediate",      // Delete from local after sync
        "tier2": "never",          // Keep in cloud backup
        "tier3": "quarterly"       // Archive to cold storage
    },
    "canonical": { ... }
}
```

### Decay Actions

| Action | Description |
|--------|-------------|
| `delete` | Complete removal |
| `compress` | Move payload to cold, keep reference |
| `summarize` | Keep hash + summary, drop payload |
| `retain` | Never decay (contracts, evidence) |

---

## Receipt Types: Dolphins vs Whales

Think of receipts as existing on a spectrum:

### Dolphins (High Frequency, Short Life)

| Characteristics | Examples |
|----------------|----------|
| Beats per second | System heartbeats, sync pings |
| Short lifespan | Hours to days |
| High volume | Thousands per day |
| Can be deleted | No lasting value |

```
Heartbeat:     🐬🐬🐬🐬🐬🐬🐬🐬  → delete after 1 hour
Sync event:    🐬🐬🐬🐬🐬🐬🐬🐬  → delete after 1 day
Command:       🐬🐬🐬🐬🐬        → archive after 1 week
```

### Whales (Low Frequency, Long Life)

| Characteristics | Examples |
|----------------|----------|
| Beats per decade | Contracts, evidence |
| Long lifespan | Years to forever |
| Low volume | Dozens per year |
| Must preserve | Legal/knowledge value |

```
Work session:   🐋           → archive after 1 year
Contract:       🐋           → archive forever
Knowledge:      🐋           → preserve forever
Evidence:       🐋           → archive forever
```

### The Lifecycle Flow

```
                    ┌─────────────┐
                    │   DOLPHIN   │
                    │  (Tier 1)   │
                    │  Fast beat  │
                    └──────┬──────┘
                           │ decay
                           ▼
                    ┌─────────────┐
                    │   ARCHIVE   │
                    │  (Tier 3)   │
                    │   Delete    │
                    └─────────────┘

                    ┌─────────────┐
                    │   WHALE     │
                    │  (Tier 1)   │
                    │  Slow beat  │
                    └──────┬──────┘
                           │ decay
                           ▼
                    ┌─────────────┐
                    │   ARCHIVE   │
                    │  (Tier 3)   │
                    │  Preserve   │
                    └─────────────┘
```

---

## Retention by Receipt Type

| Receipt Type | Tier 1 | Tier 2 | Tier 3 |
|--------------|--------|--------|--------|
| System heartbeat | 1 hour | 1 day | ❌ |
| Command/execution | 1 week | 1 month | 1 year |
| Work session | 1 month | 6 months | 2 years |
| Contract | 1 year | 10 years | Forever |
| Evidence | 1 year | 10 years | Forever |
| Knowledge | Forever | Forever | Forever |

## Receipt Type Schemas

Each receipt type carries specific fields optimized for both AI processing and network delivery. Smaller schemas = faster AI inference = efficient routing.

### Email Receipt

```json
{
    "type": "email",
    "canonical": {
        "from": "did:key:z6M...",
        "to": ["did:key:z6M...", "email:user@example.com"],
        "subject": "Quote for services",
        "body": { ... },
        "attachments": [...],
        
        // Delivery guarantees
        "dkim": {
            "domain": "example.com",
            "selector": "default",
            "publicKey": "base64..."
        },
        "dmarc": {
            "policy": "quarantine",
            "domain": "example.com"
        },
        "spf": {
            "mechanism": "include",
            "domain": "_spf.example.com"
        },
        
        // AI optimization
        "summary": "Short one-line summary",
        "intent": "request_quote",
        "entities": ["service", "price", "timeline"]
    },
    "hash": "...",
    "signatures": ["...", "..."]
}
```

### Command Receipt

```json
{
    "type": "command",
    "canonical": {
        "action": "execute",
        "target": "did:key:z6M...",
        "payload": { ... },
        
        // Execution keys
        "keys": {
            "ui": "key:ui:123",
            "api": "key:api:456",
            "sign": "key:sign:789"
        },
        
        // AI optimization
        "intent": "transfer_credits",
        "entities": ["from", "to", "amount", "asset"]
    },
    "hash": "...",
    "signatures": ["..."]
}
```

### Contract Receipt

```json
{
    "type": "contract",
    "canonical": {
        "parties": ["did:key:z6M...", "did:key:z6N..."],
        "terms": { ... },
        "effectiveFrom": 1696118400000,
        
        // Legal keys
        "keys": {
            "sign": "key:sign:123",
            "witness": "key:witness:456"
        },
        
        // AI optimization
        "summary": "Service agreement - $500/mo",
        "intent": "establish_relationship",
        "entities": ["parties", "terms", "price", "duration"]
    },
    "hash": "...",
    "signatures": ["...", "..."]
}
```

### Knowledge Receipt

```json
{
    "type": "knowledge",
    "canonical": {
        "topic": "quantum_computing",
        "content": { ... },
        
        // Attribution
        "author": "did:key:z6M...",
        "sources": ["doi:10.1234/...", "url:..."],
        
        // AI optimization
        "summary": "Overview of qubit decoherence",
        "intent": "store_knowledge",
        "entities": ["topic", "concepts", "references"]
    },
    "hash": "...",
    "signatures": ["..."]
}
```

### Page/Content Receipt (HTML)

For sharing web pages, the receipt includes social meta tags for search, caching, and link previews:

```json
{
    "type": "page",
    "canonical": {
        "url": "https://example.com/page",
        "title": "My Awesome Page",
        "html": "<!DOCTYPE html>...",
        
        // Open Graph (Facebook, LinkedIn, etc.)
        "og": {
            "title": "My Awesome Page",
            "description": "A great page about things",
            "image": "https://example.com/og-image.jpg",
            "url": "https://example.com/page",
            "type": "article",
            "siteName": "Example"
        },
        
        // Twitter Card
        "twitter": {
            "card": "summary_large_image",
            "site": "@example",
            "title": "My Awesome Page",
            "description": "A great page about things",
            "image": "https://example.com/og-image.jpg"
        },
        
        // DNS / Verifiable
        "dns": {
            "txt": ["did=inqbeta:z6M..."],
            "caa": ["issue letsencrypt.org"]
        },
        
        // Cache hints
        "cache": {
            "maxAge": 86400,
            "staleWhileRevalidate": 604800,
            "vary": ["Accept-Language"]
        },
        
        // AI optimization
        "intent": "share_content",
        "entities": ["url", "title", "author"]
    },
    "hash": "...",
    "signatures": ["..."]
}
```

### Meta Field Reference

| Field Set | Purpose | Used By |
|-----------|---------|---------|
| `og:*` | Link preview | Facebook, LinkedIn, Slack, Discord |
| `twitter:*` | Twitter card | Twitter, X |
| `dns.txt` | Domain verification | DNS validation |
| `cache:*` | CDN caching | Cloudflare, Fastly, Akamai |
| `intent` | AI routing | inQbeta AI classifiers |

### Event Receipt

Events are anything with a time factor — the largest and most diverse receipt type:

```json
{
    "type": "event",
    "canonical": {
        "eventType": "ticket" | "allocation" | "transfer" | "access" | "schedule" | "course" | "*",
        "title": "Jazz Festival 2026",
        "description": "Annual jazz festival",
        
        // Time factors
        "timing": {
            "start": 1698787200000,
            "end": 1698873600000,
            "timezone": "America/New_York",
            "recurrence": "annual",
            "buffer": 900
        },
        
        // Ticket type
        "ticket": {
            "eventId": "jazz-2026",
            "tier": "vip",
            "seat": "A12",
            "price": 150.00,
            "currency": "USD"
        },
        
        // Allocation type
        "allocation": {
            "resource": "room:conference-a",
            "quantity": 1,
            "reservedFor": "did:key:z6M..."
        },
        
        // Transfer type
        "transfer": {
            "from": "did:key:z6M...",
            "to": "did:key:z6N...",
            "asset": "credit:USD",
            "amount": 100.00,
            "scheduledFor": 1698787200000
        },
        
        // Access / QR
        "access": {
            "mode": "entry" | "exit" | "usage",
            "location": "gate:1",
            "qr": {
                "data": "base64...",
                "expiresAt": 1698873600000,
                "uses": 1
            }
        },
        
        // Schedule type
        "schedule": {
            "items": [
                { "time": 1698787200, "title": "Doors Open" },
                { "time": 1698790800, "title": "Main Act" }
            ]
        },
        
        // Course type (scheduled learning)
        "course": {
            "courseId": "quantum-101",
            "modules": [
                { "time": 1698787200, "title": "Intro", "duration": 3600 }
            ],
            "enrollment": 30,
            "maxEnrollment": 100
        },
        
        // AI optimization
        "intent": "attend_event",
        "entities": ["event", "time", "location", "ticket"]
    },
    "hash": "...",
    "signatures": ["...", "..."]
}
```

### Event Subtypes

| Subtype | Key Fields | Example |
|---------|------------|---------|
| `ticket` | eventId, tier, seat, price | Concert ticket |
| `allocation` | resource, quantity, reservedFor | Room booking |
| `transfer` | from, to, asset, scheduledFor | Timed payment |
| `access` | mode, location, qr | Door entry, venue access |
| `schedule` | items[] | Daily agenda |
| `course` | modules[], enrollment | Scheduled learning |
| `*` | custom | Any time-bound event |

The `*` wildcard allows custom event types — the schema is extensible.

### Ping/Announcement Receipt

For sync announcements, we need the smallest possible receipt — just enough to signal "something changed":

```json
{
    "type": "ping",
    "canonical": {
        "event": "receipt.new" | "receipt.update" | "receipt.delete" | "sync.request" | "device.linked",
        "target": "hash:abc123",
        "subject": "user:did",
        "seq": 42
    },
    "hash": "...",
    "signatures": []
}
```

#### Minimal Ping Schema (Minified)

```json
{
    "type": "ping",
    "canonical": {
        "e": "receipt.new",
        "t": "hash:abc",
        "s": "did:abc",
        "n": 42
    }
}
```

**Size: ~80 bytes** — tiny enough for high-frequency pub/sub.

---

## Pub/Sub Infrastructure

For announcements, we need a fast pub/sub system. Options:

### Redis Pub/Sub

```typescript
// Redis is built for this
import Redis from 'ioredis';

const redis = new Redis();
const CHANNEL = 'inqbeta:sync';

// Publisher: announce new receipt
async function announce(event: string, hash: string, subject: string) {
    await redis.publish(CHANNEL, JSON.stringify({
        event,
        hash,
        subject,
        seq: await redis.incr('inqbeta:seq')
    }));
}

// Subscriber: listen for changes
function watchAnnouncements(callback: (event: SyncEvent) => void) {
    const sub = new Redis();
    sub.subscribe(CHANNEL);
    sub.on('message', (_, message) => {
        callback(JSON.parse(message));
    });
    return () => sub.unsubscribe(CHANNEL);
}
```

### Other Options

| System | Pros | Cons |
|--------|------|------|
| **Redis** | Fast, battle-tested, persistent | Single point of failure |
| **Server-Sent Events** | Simple, browser-native | One-way, no ack |
| **WebSocket** | Bidirectional | More complex |
| **Kafka** | Durable, ordered | Overkill for pings |
| **NATS** | Lightweight, fast | Less adoption |

### Recommended: Redis Pub/Sub

```
┌─────────────────────────────────────────────────────────────┐
│                    ANNOUNCEMENT LAYER                        │
├─────────────────────────────────────────────────────────────┤
│   ┌─────────────┐      ┌─────────────┐                   │
│   │   Redis     │◄─────│   Kernel    │                   │
│   │   Pub/Sub   │      │   (Badger)  │                   │
│   └──────┬──────┘      └─────────────┘                   │
│          │                                                    │
│          │ publishes                                        │
│          ▼                                                    │
│   ┌─────────────────────────────────────┐                  │
│   │      Client Subscribers             │                  │
│   │  (Device A, Device B, Device C...)  │                  │
│   └─────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

#### Message Flow

```
1. Receipt created in Kernel
2. Kernel publishes to Redis channel: "receipt.new|hash:abc123|subject:did:xyz"
3. All subscribed devices receive
4. Each device fetches the receipt from Kernel
```

---

## Self-Verifying Notifications

Notifications themselves can be receipts. The minimal notification is just:

```
DID + type (encoded in DID)
```

That's it. ~50 bytes.

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│              SELF-VERIFYING NOTIFICATION                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. Sender creates notification receipt                     │
│      {                                                      │
│        type: "notification",                                │
│        canonical: {                                          │
│          to: "did:key:z6M...",      // Only this!         │
│          notifyType: "email",                              │
│          ref: "hash:abc123"                                │
│        }                                                    │
│      }                                                      │
│                                                              │
│   2. Publishes to Redis channel "did:key:z6M:notes"       │
│                                                              │
│   3. Recipient receives, sees notification                  │
│                                                              │
│   4. Recipient opens → signs "read" receipt                 │
│      {                                                      │
│        type: "notification.read",                          │
│        canonical: {                                         │
│          original: "hash:abc123",                          │
│          readAt: 1698787200000                             │
│        }                                                    │
│      }                                                      │
│                                                              │
│   5. Sends read receipt back to Kernel                     │
│      → Proof the notification was seen                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Minimal Notification Receipt

```json
{
    "type": "notification",
    "canonical": {
        "to": "did:key:z6M...",
        "notifyType": "email" | "sync" | "alert" | "message",
        "ref": "hash:abc123"
    }
}
```

**Size: ~80 bytes** — just DID + type + optional reference

### Read Acknowledgment Receipt

```json
{
    "type": "notification.read",
    "canonical": {
        "original": "hash:abc123",
        "readAt": 1698787200000,
        "device": "did:key:z6M.../device/123"
    },
    "signatures": ["..."]
}
```

This creates a verifiable audit trail:
- Notification was sent
- Notification was received
- Notification was read (and on which device)

### Notification Channels

Each DID gets its own channel:

| Channel | Purpose |
|---------|---------|
| `did:key:z6M...:notes` | All notifications |
| `did:key:z6M...:email` | Email notifications |
| `did:key:z6M...:sync` | Sync updates |
| `did:key:z6M...:alerts` | Urgent alerts |

This allows granular subscription — you might want all notifications, or just email ones.

---

## Related

### AI-Optimized Fields

Every receipt includes lightweight AI fields for fast classification:

| Field | Type | Purpose |
|-------|------|---------|
| `intent` | string | What the receipt is trying to do |
| `entities` | string[] | Key entities involved |
| `summary` | string | One-line human + AI readable summary |

These let AI models quickly route, classify, and process receipts without parsing full payloads.

---

## The Receipt Ecosystem

Once receipts can carry UI templates, a whole ecosystem emerges. Every interaction becomes a receipt.

### Template Receipts

```json
{
    "type": "template",
    "canonical": {
        "templateType": "form" | "evaluation" | "review" | "contract" | "hr" | "survey",
        "title": "Performance Review Q3 2026",
        "version": "1.0",

        // UI definition
        "ui": {
            "layout": "form",
            "sections": [
                {
                    "id": "goals",
                    "title": "Goals Achievement",
                    "fields": [
                        { "id": "goal1", "type": "text", "label": "Goal 1" },
                        { "id": "rating", "type": "select", "options": ["1","2","3","4","5"] }
                    ]
                }
            ],
            "validation": { "required": ["goal1", "rating"] }
        },

        // Workflow
        "workflow": {
            "submitTo": "hr:did",
            "notifyOn": ["submit", "approve", "reject"],
            "deadline": 1698787200000
        }
    },
    "hash": "...",
    "signatures": ["..."]
}
```

### Ecosystem Categories

| Category | Example Receipt Types |
|----------|---------------------|
| **HR** | `performance_review`, `leave_request`, `expense_claim`, `onboarding` |
| **Finance** | `invoice`, `purchase_order`, `budget_approval`, `expense_report` |
| **Legal** | `nda`, `employment_contract`, `service_agreement`, `sow` |
| **Education** | `course_enrollment`, `quiz`, `assignment`, `certificate` |
| **Healthcare** | `appointment`, `prescription`, `medical_record`, `insurance_claim` |
| **Government** | `permit`, `license_application`, `tax_return`, `voting_record` |
| **Personal** | `journal`, `memory`, `conversation`, `idea` |

### Each Receipt Is...

| Property | Description |
|----------|-------------|
| **Captured** | Form data → receipt (no lost papers) |
| **Signed** | Author identity verified |
| **Timestamped** | When created, immutable |
| **Auditable** | Full history in chain |
| **Executable** | Workflow triggers automatically |
| **Searchable** | Dgraph indexes all fields |
| **Verifiable** | Hash proves integrity |

### The Vision

Every human interaction becomes a receipt:
- Signed form → receipt
- Filled survey → receipt
- Completed contract → receipt
- Performed evaluation → receipt
- Medical visit → receipt
- Personal memory → receipt

**Everything captured. Everything understood. Everything verifiable.**

This is the "knowledge base" — not documents, but receipts that can be queried, verified, and acted upon.

---

## Network Resource Receipts

Infrastructure becomes declarative — every resource is a receipt with metrics, commands, and audit trail.

### Node/Server Receipt

```json
{
    "type": "network.node",
    "canonical": {
        "nodeId": "node:abc123",
        "provider": "did:key:z6M...",
        "specs": {
            "cpu": { "cores": 8, "type": "AMD EPYC" },
            "gpu": { "count": 2, "type": "NVIDIA A100" },
            "ram": { "size": 64, "unit": "GB" },
            "storage": { "size": 2000, "unit": "GB", "type": "NVMe" }
        },
        "network": {
            "bandwidth": "1Gbps",
            "uptime": 99.9,
            "region": "us-east-1"
        },
        "status": "online" | "offline" | "maintenance",
        "metrics": {
            "cpuUsage": 45,
            "memoryUsage": 62,
            "diskUsage": 38,
            "networkIn": 125,
            "networkOut": 89,
            "timestamp": 1698787200000
        }
    },
    "hash": "...",
    "signatures": ["..."]
}
```

### Container/Service Receipt

```json
{
    "type": "network.container",
    "canonical": {
        "containerId": "container:xyz789",
        "node": "node:abc123",
        "image": "nginx:latest",
        "resources": {
            "cpu": 1,
            "memory": "512MB",
            "storage": "1GB"
        },
        "status": "running" | "stopped" | "error",
        "metrics": {
            "cpuPercent": 12,
            "memoryPercent": 45,
            "uptime": 86400,
            "restarts": 0,
            "timestamp": 1698787200000
        },
        "ports": [80, 443],
        "environment": {
            "NODE_ENV": "production"
        }
    },
    "hash": "...",
    "signatures": ["..."]
}
```

### API Command Receipts

Every action creates a receipt — infrastructure as code becomes infrastructure as receipts.

```json
{
    "type": "network.command",
    "canonical": {
        "command": "create" | "destroy" | "update" | "start" | "stop" | "restart",
        "resource": "container:xyz789",
        "target": "node:abc123",
        "params": {
            "image": "nginx:latest",
            "resources": { "cpu": 1, "memory": "512MB" }
        },
        "executedBy": "did:key:z6M...",
        "executedAt": 1698787200000,
        "result": "success" | "failed",
        "output": "Container started successfully"
    },
    "hash": "...",
    "signatures": ["..."]
}
```

### Metrics History Receipt

```json
{
    "type": "network.metrics",
    "canonical": {
        "resource": "node:abc123",
        "interval": "5m",
        "samples": [
            { "timestamp": 1698786900000, "cpu": 45, "memory": 62, "disk": 38 },
            { "timestamp": 1698787200000, "cpu": 52, "memory": 64, "disk": 38 }
        ],
        "aggregates": {
            "cpu": { "avg": 48, "min": 32, "max": 95, "p95": 78 },
            "memory": { "avg": 63, "min": 58, "max": 80, "p95": 72 }
        }
    },
    "hash": "...",
    "signatures": ["..."]
}
```

### Network Command Reference

| Command | Description | Creates Receipt |
|---------|-------------|----------------|
| `create` | Deploy new resource | `network.command` |
| `destroy` | Remove resource | `network.command` |
| `update` | Modify resource | `network.command` |
| `start` | Start resource | `network.command` |
| `stop` | Stop resource | `network.command` |
| `restart` | Restart resource | `network.command` |
| `scale` | Scale resource | `network.command` |
| `backup` | Create backup | `network.command` |
| `restore` | Restore backup | `network.command` |

---

## QR Code Verification

A portable offline verifier — your phone becomes a hardware security key.

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│              QR CODE VERIFICATION                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Browser (Desktop)                                          │
│   ┌─────────────────────┐                                    │
│   │                     │  1. Generate challenge            │
│   │   [QR Code]       │ ──────────────────┐               │
│   │   ┌───────────┐   │                    │               │
│   │   │ challenge │   │                    │               │
│   │   │ timestamp│   │                    │               │
│   │   │ session  │   │                    ▼               │
│   │   └───────────┘   │         ┌───────────────┐        │
│   │                     │         │    Phone     │        │
│   └─────────────────────┘         │   (Q App)    │        │
│                                   │               │        │
│                                   │  2. Scan QR  │        │
│                                   │  3. Verify   │        │
│                                   │  4. Sign     │        │
│                                   └───────┬───────┘        │
│                                           │ 5. Return      │
│                   ┌───────────────────────┘                 │
│                   ▼                                          │
│   ┌─────────────────────┐                                    │
│   │   Verified! ✅      │  6. Session confirmed              │
│   └─────────────────────┘                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Offline Verification

- **No internet required** — QR codes work completely offline
- **Phone as HSM** — Your phone holds keys, signs locally
- **Visual confirmation** — You see what you're signing on your phone
- **No clipboard** — Data transferred via camera, not copy-paste

### QR Receipt

```json
{
    "type": "verification.qr",
    "canonical": {
        "challenge": "abc123...",
        "session": "session:xyz789",
        "expiresAt": 1698787200000,
        "action": "login" | "sign" | "verify",
        "origin": "https://app.example.com",
        "verifiedBy": "did:key:z6M...",
        "verifiedAt": 1698787200000,
        "device": "device:phone123"
    },
    "hash": "...",
    "signatures": ["..."]
}
```

### The Flow

```
1. Browser → generates challenge + session ID
2. Browser → displays as QR code
3. Phone (Q App) → scans QR (camera)
4. Phone → verifies challenge is valid
5. Phone → prompts user: "Sign in to app.example.com?"
6. User → confirms (biometric/passkey)
7. Phone → signs verification receipt
8. Phone → shows success, returns session token
9. Browser → receives token, completes login
```

### Use Cases

| Scenario | How It Works |
|----------|-------------|
| **Login** | Scan QR to sign in (no password) |
| **Sign document** | Scan QR, verify on phone, sign |
| **2FA** | Scan QR as second factor |
| **Confirm transaction** | Scan QR, verify amount, approve |
| **Device linking** | Scan QR to link new device |

### Security Properties

| Property | How It's Protected |
|----------|-------------------|
| **Phishing** | Phone shows exact origin, not just URL |
| **Man-in-middle** | Challenge is unique per session |
| **Replay** | Timestamp + session prevents reuse |
| **Offline** | No network needed for verification |

### Comparison

| Method | Online | Secure | Portable |
|--------|--------|--------|----------|
| **QR Verification** | ❌ No | ✅ Yes | ✅ Yes |
| **WebAuthn** | ✅ Yes | ✅ Yes | ❌ No |
| **Magic Link** | ✅ Yes | ⚠️ Medium | ❌ No |
| **Password** | ❌ No | ❌ No | ✅ Yes |

The phone becomes your portable HSM — verify anything, anywhere, offline.

### Metrics Available

| Metric | Description |
|--------|-------------|
| `cpuUsage` | CPU utilization % |
| `memoryUsage` | RAM utilization % |
| `diskUsage` | Disk utilization % |
| `networkIn` | Inbound bandwidth (Mbps) |
| `networkOut` | Outbound bandwidth (Mbps) |
| `uptime` | Time since last restart |
| `latency` | Network latency (ms) |
| `timestamp` | When metrics were captured |

### The Dashboard View

```
┌─────────────────────────────────────────────────────────────┐
│  NETWORK METRICS                                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Node: production-node-01                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  CPU  ████████████░░░░░░░░░░░ 45%                 │   │
│  │  MEM  ██████████████████░░░░░ 62%                 │   │
│  │  DISK ████████████░░░░░░░░░░░░░ 38%               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Live: 14 days, 3 hours                                    │
│  Region: us-east-1                                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Spike Alert: CPU hit 95% at 14:32                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Actions: [Start] [Stop] [Restart] [Destroy]              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

Every action is a receipt. Every metric is a receipt. The entire infrastructure is declarative and auditable.

---

## The 3D Receipt Universe

Using Dgraph's graph capabilities, receipts can be visualized as a 3D universe where:

```
┌─────────────────────────────────────────────────────────────┐
│              3D RECEIPT UNIVERSE                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                        ★ (root receipt)                      │
│                       /│\                                     │
│                      / │ \                                    │
│                     /  │  \                                   │
│                    /   │   \                                  │
│           ┌────────┐  │  ┌────────┐                         │
│           │ child  │  │  │ child  │                         │
│           │receipt │  │  │receipt │                         │
│           └────────┘  │  └────────┘                         │
│                     /│\                                      │
│                    / │ \                                     │
│                   /  │  \                                    │
│              ★★★★★★★★★                                      │
│         (compressed hash lock)                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### The Visual Metaphor

| Aspect | Visualization |
|--------|---------------|
| **Time** | Z-axis (depth) — older receipts further back |
| **Causality** | Connections radiating from source |
| **Clusters** | Related receipts grouped together |
| **Hash locks** | Bright nodes where evidence bundles |
| **Compression** | Receipts collapse as they age |

### How It Works

```
1. Action creates receipt
         │
         ▼
2. Receipt gets timestamp + position in 3D space
         │
         ▼
3. Children (responses, updates) radiate outward
         │
         ▼
4. After N time, receipts compress into hash lock
         │
         ▼
5. Hash lock = single receipt containing all history
         │
         ▼
6. The chain becomes a single point in the universe
```

### The Compression Model

```
┌─────────────────────────────────────────────────────────────┐
│              RECEIPT COMPRESSION                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Day 1: R1 ─► R2 ─► R3 ─► R4 ─► R5 ─► R6               │
│   (6 receipts, full chain visible)                          │
│                                                              │
│   Week 1: ─► [HashLock: R1-R6] ─► R7 ─► R8               │
│   (6 compressed into 1, 2 new)                             │
│                                                              │
│   Month 1: ─► [HashLock: R1-R8] ─► R9                     │
│   (8 compressed into 1, 1 new)                            │
│                                                              │
│   Year 1: ─► [HashLock: All] ─► final                     │
│   (entire history = single receipt)                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Hash Lock Receipt

```json
{
    "type": "receipt.chain",
    "canonical": {
        "lockedAt": 1698787200000,
        "chain": {
            "from": "hash:receipt1",
            "to": "hash:receipt6"
        },
        "merkleRoot": "sha256:abc123...",
        "count": 6,
        "compressed": true
    },
    "hash": "sha256:locked123...",
    "signatures": ["..."]
}
```

### The Story

Every receipt tells a story:

- **Source** — What started it (the "star")
- **Geltas** — All the changes that happened (children)
- **Hash lock** — Evidence bundled together
- **Lifecycle** — The complete journey from action to final state

```
┌─────────────────────────────────────────────────────────────┐
│                  RECEIPT STORY                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Source (action) ──► Geltas (changes) ──► Hash Lock       │
│                                                              │
│   "I created a document"                                   │
│       │                                                     │
│       ├── "I edited it"                                    │
│       ├── "I shared it"                                     │
│       ├── "You viewed it"                                  │
│       ├── "You commented"                                   │
│       └── "We archived it"                                 │
│                      │                                       │
│                      ▼                                       │
│              Hash Lock: All evidence compressed              │
│              = Complete lifecycle in one receipt             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3D Navigation

Users can:
- **Zoom in** — See individual receipts
- **Zoom out** — See hash locks
- **Rotate** — Follow causal chains
- **Time travel** — Scroll through history
- **Collapse** — Compress old receipts into bundles

This is the "incubator" concept — the universe forms as actions create receipts, and they cluster and compress over time into the smallest representation of the complete story.

---

## Relationship Visualization

Beyond infrastructure, the 3D graph reveals human patterns:

```
┌─────────────────────────────────────────────────────────────┐
│           RELATIONSHIP VISUALIZATION                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                   ★ Alice                                    │
│                   ╱│╲                                        │
│                  ╱ │ ╲                                       │
│                 ╱  │  ╲    ╱──────────╲                    │
│                ╱   │   ╲──╱            ╲                   │
│               ╱    │    ╲              ╲                   │
│              ╱     │     ╲              ★ Bob             │
│             ╱      │      ╲            ╱│╲                 │
│            ╱       │       ╲          ╱ │ ╲                │
│           ●────────●────────●─────────●  │  ● Carol        │
│         (2023)    (2024)   (2025)  (2026)                │
│                                                              │
│   Curve shape = relationship pattern                         │
│   Density = interaction frequency                            │
│   Color = energy (positive/negative)                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Patterns Visible

| Pattern | Visualization | Meaning |
|---------|---------------|---------|
| **Strong bond** | Dense cluster, bright | Frequent interaction |
| **Distant** | Sparse, dim | Rare contact |
| **Growing** | Expanding outward | Relationship deepening |
| **Fading** | Contracting inward | Relationship weakening |
| **Cyclic** | Spiral pattern | Regular rhythms |
| **Spiky** | Jagged peaks | Conflict/tense periods |

### Applications

- **Friendships**: How you interact with someone over years
- **Energy exchanges**: Flow of value between parties
- **Business relationships**: Client interaction patterns
- **Health**: Physical activity patterns over time

### Neurodivergent Pattern Recognition

For neurodivergent minds, this becomes powerful:

- **Visual thinkers** see the shape of relationships
- **Pattern recognition** identifies healthy vs unhealthy
- **Time slices** show evolution at any zoom level
- **Energy mapping** reveals where time/energy goes

```
┌─────────────────────────────────────────────────────────────┐
│              NEURODIVERGENT VIEW                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   "What does this relationship look like?"                 │
│                                                              │
│   ┌─────────────────────────────────────────────┐          │
│   │                                             │          │
│   │     ╭───╮     Health check:               │          │
│   │    ╱     ╲    • Dense core = strong       │          │
│   │   │   ★   │   • Expanding = growing       │          │
│   │    ╲     ╱    • Contracted = fading      │          │
│   │     ╰───╯                                 │          │
│   │                                             │          │
│   │   Color meanings:                           │          │
│   │   🟢 Green = positive energy               │          │
│   │   🔴 Red = negative/conflict              │          │
│   │   🔵 Blue = neutral                       │          │
│   │   🟡 Yellow = high activity               │          │
│   │                                             │          │
│   └─────────────────────────────────────────────┘          │
│                                                              │
│   The shape tells the story.                                │
│   No reading required. Just see it.                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### The Insight

The 3D receipt universe isn't just infrastructure tracking — it's a **lens for life itself**:

- Every relationship has a shape
- Every interaction leaves a trace
- Every pattern tells a story
- The whole picture is visible

**See the shape. Know the truth.**

---

## The AI Feedback Loop

The power emerges when AI analyzes the receipt universe:

```
┌─────────────────────────────────────────────────────────────┐
│                 AI FEEDBACK LOOP                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐                                           │
│   │   Receipts   │ ◄── Raw data from user activity        │
│   └──────┬──────┘                                           │
│          │                                                    │
│          ▼                                                    │
│   ┌─────────────┐                                           │
│   │  AI Model   │ ◄── Train on patterns                    │
│   └──────┬──────┘                                           │
│          │                                                    │
│          ▼                                                    │
│   ┌─────────────┐                                           │
│   │  Insights   │ ──► Pattern recognition                   │
│   └──────┬──────┘                                           │
│          │                                                    │
│          ▼                                                    │
│   ┌─────────────┐                                           │
│   │ Predictions │ ──► "You're drifting from X"             │
│   └──────┬──────┘                                           │
│          │                                                    │
│          ▼                                                    │
│   ┌─────────────┐                                           │
│   │   Choices   │ ◄── User decides                          │
│   └─────────────┘                                           │
│          │                                                    │
│          └──────────────────────────────────────────► Receipt │
│          (User action creates new receipt, cycle repeats)     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### What AI Can Do

| Capability | Example |
|-----------|---------|
| **Pattern recognition** | "You interact most with X on weekends" |
| **Anomaly detection** | "This relationship is cooling faster than others" |
| **Prediction** | "Based on patterns, you'll likely need Y soon" |
| **Recommendation** | "Try reconnecting with X — you haven't in 3 weeks" |
| **Health check** | "Your energy exchange with Y is unbalanced" |
| **Risk warning** | "This contract pattern has red flags" |

### The Loop

1. **Collect** — Receipts accumulate
2. **Analyze** — AI finds patterns
3. **Predict** — Forecast future behavior
4. **Recommend** — Suggest actions
5. **User acts** — Creates new receipt
6. **Repeat** — System gets smarter

### AI-Friendly Receipt Fields

Each receipt includes AI-ready fields:

```json
{
    "type": "...",
    "canonical": {
        "intent": "what_is_happening",    // AI classification
        "entities": ["who", "what"],      // Key entities
        "summary": "one line",            // Quick read
        "sentiment": "positive|negative|neutral",  // Emotional tone
        "energy": 5                        // Magnitude (1-10)
    }
}
```

### The Vision

> The universe reveals itself through users and data.
> AI interprets.
> Knowledge loops back.
> Predictions inform choices.
> Choices create new receipts.
> The cycle continues.

The system becomes:
- **Self-learning** — More data = smarter
- **Predictive** — See patterns before they emerge
- **Advisory** — Help users make better choices
- **Evolving** — Always getting better

**The receipt universe doesn't just store history — it reveals the future.**

---

## Related

- [architecture.md](./architecture.md) — Core architecture
- [receipt-architecture.md](./receipt-architecture.md) — Receipt flow
- [receipt-schema.md](./receipt-schema.md) — Receipt schema
