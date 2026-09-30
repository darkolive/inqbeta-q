# Federation Cloud

**Concept**: 2026-09-18

This document describes how federation members can offer spare compute, storage, and network resources to create a decentralized cloud platform — like AWS/DigitalOcean/Vercel, but owned by the federation.

---

## The Vision

```
┌─────────────────────────────────────────────────────────────────┐
│                    FEDERATION CLOUD                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   PROVIDERS (Federation Members)                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│   │ Server Rack │  │ Home Lab    │  │ GPU Node    │           │
│   │ 10x CPU     │  │ 4x CPU      │  │ 8x A100     │           │
│   │ 64GB RAM    │  │ 16GB RAM    │  │ 128GB RAM   │           │
│   │ 10TB HDD    │  │ 2TB SSD     │  │ 10TB NVMe   │           │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │
│          │                  │                  │                  │
│          └──────────────────┼──────────────────┘                  │
│                             │                                     │
│                             ▼                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              Resource Marketplace                         │   │
│   │  - Capacity listings                                     │   │
│   │  - Pricing (token-based)                                 │   │
│   │  - Allocation receipts                                   │   │
│   └──────────────────────┬──────────────────────────────────┘   │
│                          │                                        │
│   CONSUMERS (Users)      │                                        │
│   ┌──────────────────────┴──────────────────────────────────┐   │
│   │  RENT RESOURCES                                            │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │   │
│   │  │Serverless│ │Database  │ │ AI Model│ │ Storage │    │   │
│   │  │Functions │ │ (Dgraph) │ │ Hosting │ │  (S3)   │    │   │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Provider Model

### What Providers Offer

| Resource | Description | Unit |
|----------|-------------|------|
| **CPU** | Compute cycles | core-hours |
| **GPU** | GPU compute | GPU-hours |
| **RAM** | Memory | GB-hours |
| **Storage** | Disk space | GB-month |
| **Bandwidth** | Network transfer | GB |

### Provider Receipt

```json
{
    "type": "provider.offer",
    "canonical": {
        "provider": "did:key:z6M...",
        "resources": {
            "cpu": { "available": 10, "type": "AMD EPYC" },
            "gpu": { "available": 2, "type": "NVIDIA A100" },
            "ram": { "available": 64, "unit": "GB" },
            "storage": { "available": 1000, "unit": "GB", "type": "NVMe" }
        },
        "pricing": {
            "cpu": 1,      // tokens per core-hour
            "gpu": 10,     // tokens per GPU-hour
            "ram": 0.5,    // tokens per GB-hour
            "storage": 0.1, // tokens per GB-month
            "bandwidth": 0.2 // tokens per GB
        },
        "location": {
            "region": "us-east-1",
            "country": "US"
        },
        "uptime": 99.9,
        "available": true
    }
}
```

---

## Consumer Model

### What Consumers Can Rent

| Service | Description | Like |
|---------|------------|------|
| **Serverless Functions** | On-demand code execution | Vercel, AWS Lambda |
| **Containers** | Persistent Docker containers | DigitalOcean, Railway |
| **Databases** | Managed Dgraph, PostgreSQL | DigitalOcean Managed DB |
| **Object Storage** | S3-compatible storage | S3, DigitalOcean Spaces |
| **AI Hosting** | Model inference endpoints | Modal, RunPod |
| **VPN/Proxy** | Network tunneling | Tailscale, Cloudflare Tunnel |

### Rental Request Receipt

```json
{
    "type": "compute.rent",
    "canonical": {
        "consumer": "did:key:z6N...",
        "service": "serverless",
        "resources": {
            "cpu": 2,
            "memory": "4GB",
            "timeout": 30
        },
        "pricing": {
            "maxTokens": 100,
            "perHour": 5
        },
        "code": {
            "runtime": "node:18",
            "entrypoint": "index.js"
        },
        "deployment": {
            "domain": "myapp.federation.cloud",
            "ssl": true
        }
    }
}
```

---

## Service Implementations

### 1. Serverless Functions (Like Vercel)

```
┌─────────────────────────────────────────────────────────────┐
│                   SERVERLESS PLATFORM                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   User uploads function                                      │
│          │                                                   │
│          ▼                                                   │
│   ┌─────────────┐    ┌─────────────┐                      │
│   │   Router    │───►│   Executor  │                      │
│   │  (Domain)   │    │ (Any Node)  │                      │
│   └─────────────┘    └─────────────┘                      │
│          │                                                   │
│          ▼                                                   │
│   ┌─────────────┐                                           │
│   │   Receipt   │ ──► Evidence of execution                 │
│   └─────────────┘                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**
- HTTP router maps `*.federation.cloud` to functions
- Cold start: spin up container on any available node
- Hot: keep warm containers running
- Execution metered → tokens deducted

### 2. Database Service (Like DigitalOcean Managed DB)

```
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE SERVICE                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────┐   ┌─────────┐   ┌─────────┐                 │
│   │ Primary │───│Replica 1│───│Replica 2│                 │
│   └─────────┘   └─────────┘   └─────────┘                 │
│        │                                                   │
│        ▼                                                   │
│   ┌─────────────────────────────────────────┐              │
│   │  Dgraph / PostgreSQL / Redis            │              │
│   │  Running on federation nodes             │              │
│   └─────────────────────────────────────────┘              │
│                                                              │
│   Automatic replication factor: 3                           │
│   Backups: Nightly to cold storage                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3. Object Storage (Like S3)

```
┌─────────────────────────────────────────────────────────────┐
│                   OBJECT STORAGE                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   PUT /bucket/file.txt                                      │
│          │                                                   │
│          ▼                                                   │
│   ┌─────────────┐    ┌─────────────┐                       │
│   │   SeaweedFS │◄───│   Index     │                       │
│   │  (Volumes)  │    │  (Dgraph)   │                       │
│   └─────────────┘    └─────────────┘                       │
│          │                                                   │
│          ▼                                                   │
│   Receipt: file.stored { location, hash, replicas }         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4. AI Model Hosting (Like Modal/RunPod)

```
┌─────────────────────────────────────────────────────────────┐
│                    AI HOSTING                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────────────────────────────────────────────┐  │
│   │                 GPU Node                              │  │
│   │  ┌─────────────┐  ┌─────────────┐                   │  │
│   │  │   Model    │  │  Inference  │                   │  │
│   │  │  (WASM)    │──│   Server    │                   │  │
│   │  └─────────────┘  └─────────────┘                   │  │
│   │       ▲               │                              │  │
│   │       │               ▼                              │  │
│   │  ┌─────────────┐  ┌─────────────┐                   │  │
│   │  │   Receipt   │  │   Metrics   │                   │  │
│   │  │  (loaded)   │  │ (latency,   │                   │  │
│   │  └─────────────┘  │  tokens)    │                   │  │
│   │                   └─────────────┘                   │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## How It Works

### Finding Resources

1. **Browse marketplace** → List available capacity
2. **Filter** → By region, price, specs
3. **Reserve** → Create allocation receipt
4. **Deploy** → Start service

### Pricing Model

```
┌─────────────────────────────────────────────────────────────┐
│                    PRICING MODEL                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Provider sets price (tokens/hour)                         │
│   ┌─────────────────────────────────────────────┐          │
│   │  Example:                                    │          │
│   │  CPU: 1 token/core-hour                      │          │
│   │  GPU: 10 tokens/GPU-hour                     │          │
│   │  Storage: 0.1 tokens/GB-month               │          │
│   │  Bandwidth: 0.2 tokens/GB                   │          │
│   └─────────────────────────────────────────────┘          │
│                                                              │
│   Consumer pays from token balance                          │
│   ┌─────────────────────────────────────────────┐          │
│   │  Example usage:                              │          │
│   │  2 CPU × 1 token × 24 hours = 48 tokens   │          │
│   │  1 GPU × 10 tokens × 1 hour = 10 tokens    │          │
│   │  10 GB × 0.1 tokens × 30 days = 30 tokens  │          │
│   │  Total: 88 tokens/day                       │          │
│   └─────────────────────────────────────────────┘          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Technical Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **Serverless** | Firecracker, WASM | Lightweight isolation |
| **Containers** | Docker, containerd | Standard packaging |
| **Database** | Dgraph, PostgreSQL | Graph + relational |
| **Storage** | SeaweedFS | S3-compatible, distributed |
| **GPU** | CUDA, WebGPU | ML inference |
| **Networking** | WireGuard, Tailscale | Secure mesh VPN |
| **Orchestration** | Kubernetes (k3s) | Industry standard |

---

## Comparison to Existing Solutions

| Feature | AWS/DigitalOcean | Federation Cloud |
|---------|------------------|------------------|
| Ownership | Corporate | Community |
| Pricing | Fixed | Market-based |
| Location | Fixed regions | Anywhere |
| Control | None | Full |
| Privacy | Limited | End-to-end |
| Tokens | USD | Token-based |

---

## Token Economics

### Token Flow

```
Provider offers capacity (tokens/hour)
         │
         ▼
Consumer rents capacity (pays tokens)
         │
         ▼
Platform takes small fee (e.g., 5%)
         │
         ▼
Provider receives tokens (minus fee)
         │
         ▼
Provider can:
  - Hold for future use
  - Convert to other tokens
  - Sell on exchange
```

### Example Earnings

| Provider | Resources | Utilization | Earnings |
|----------|-----------|-------------|----------|
| Home lab | 4 CPU, 16GB RAM | 50% | ~30 tokens/day |
| Server rack | 64 CPU, 256GB RAM | 80% | ~500 tokens/day |
| GPU node | 8x A100 | 60% | ~2000 tokens/day |

---

## Use Case: Festival LMS

This architecture is perfect for **festival learning** and **field events** where connectivity is unreliable:

```
┌─────────────────────────────────────────────────────────────┐
│              FESTIVAL LMS SCENARIO                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Festival Ground                                            │
│   ┌─────────────────────────────────────────────────────┐  │
│   │  📡 No Signal Zone                                  │  │
│   │                                                      │  │
│   │  Attendee with Q App                                 │  │
│   │  ┌─────────────┐                                    │  │
│   │  │ • Complete workshop                              │  │
│   │  │ • Take photo of stage                           │  │
│   │  │ • Record audio note                            │  │
│   │  │ • Answer quiz                                   │  │
│   │  │ • Capture business card                        │  │
│   │  └─────────────┘                                    │  │
│   │         │                                             │  │
│   │         ▼                                             │  │
│   │  ┌─────────────────────────────────────────────┐     │  │
│   │  │ Receipt captured locally (offline)          │     │  │
│   │  │ - timestamp                                 │     │  │
│   │  │ - GPS coordinates                           │     │  │
│   │  │ - evidence (photo/audio/note)              │     │  │
│   │  │ - completion status                         │     │  │
│   │  └─────────────────────────────────────────────┘     │  │
│   │                                                      │  │
│   │  Later... return to signal... sync to cloud         │  │
│   │                                                      │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Works Offline

- **Capture first** — Receipts saved to local BadgerDB
- **Sync later** — When back in signal, push to cloud
- **Queue if needed** — Offline queue handles retry

### Receipt Types for Festivals

| Receipt Type | Example |
|--------------|---------|
| `workshop.complete` | Completed a workshop |
| `workshop.attendance` | Checked into session |
| `quiz.submit` | Answered quiz questions |
| `note.capture` | Personal note/audio |
| `photo.capture` | Photo evidence |
| `badge.earned` | Earned achievement |
| `contact.exchange` | Met someone |
| `feedback.submit` | Session feedback |

### Receipt Data

```json
{
    "type": "workshop.complete",
    "canonical": {
        "workshopId": "ws:quantum-basics",
        "title": "Quantum Computing Basics",
        "presenter": "Dr. Jane Smith",
        "location": { "lat": 51.5074, "lng": -0.1278, "zone": "Main Stage" },
        "capturedAt": 1698787200000,
        "evidence": {
            "type": "photo",
            "ref": "file:photo123.jpg"
        },
        "syncStatus": "pending" | "synced"
    }
}
```

### The Workflow

```
1. Attendee arrives at workshop
2. Opens Q → checks in (receipt: attendance)
3. Takes notes/photos during workshop (receipt: capture)
4. Completes quiz at end (receipt: quiz.submit)
5. Workshop marked complete (receipt: workshop.complete)
6. All receipts stored locally
7. Later: sync to cloud when in signal
8. LMS credits awarded on server
```

### Why This Works

| Challenge | Solution |
|-----------|----------|
| No signal | Store locally, sync later |
| Quick capture | One-tap receipt creation |
| Evidence | Photo/audio embedded or referenced |
| Verification | Receipts are signed, tamper-proof |
| Attribution | DID proves who captured |
| Location | GPS coordinates in receipt |

This makes festival learning **capture-first, sync-later** — no effort required, full evidence preserved.

---

## Journey Storytelling

After the event, the 3D receipt universe reveals the journey:

```
┌─────────────────────────────────────────────────────────────┐
│              POST-EVENT JOURNEY STORY                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Day 1                          Day 2                      │
│   ┌─────────┐                    ┌─────────┐              │
│   │ Workshop│ ───► Lunch ───► │ Workshop│ ───► Party   │
│   │  10:00 │                    │  14:00  │              │
│   └─────────┘                    └─────────┘              │
│        │                              │                      │
│        ▼                              ▼                      │
│   ┌─────────────────────────────────────────────┐          │
│   │         3D Visualization                     │          │
│   │                                            │          │
│   │    ★ ──► ★ ──► ★ ──► ★ ──► ★            │          │
│   │   (10:00)    (12:00)   (14:00)  (18:00) │          │
│   │                                            │          │
│   │   Connections = interactions               │          │
│   │   Brightness = engagement level           │          │
│   │   Clusters = workshop groups              │          │
│   │                                            │          │
│   └─────────────────────────────────────────────┘          │
│                                                              │
│   Result: Complete visual story of the 3-day journey         │
│           What you learned, who you met, where you went    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### What the Story Reveals

| Pattern | Meaning |
|---------|---------|
| Dense clusters | Deep engagement |
| Scattered | Exploring broadly |
| Connections to others | Networking |
| Time in each zone | Focus areas |
| Photos/notes | Personal mementos |

---

## Peer-to-Peer Relay

Receipts as commands enable P2P networking between devices:

```
┌─────────────────────────────────────────────────────────────┐
│              PEER-TO-PEER RELAY NETWORK                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Desktop (Home Base)                                        │
│   ┌─────────────────┐                                       │
│   │  Full Node     │ ◄── Receives commands                  │
│   │  - Storage    │     via receipts                        │
│   │  - Relay      │                                         │
│   │  - Sync       │                                         │
│   └────────┬────────┘                                        │
│            │ WiFi                                           │
│            │                                                 │
│   ┌────────┴────────┐                                       │
│   │   Phone        │ ◄── Local capture                      │
│   │  - Camera     │     sends receipts to desktop           │
│   │  - GPS        │                                         │
│   │  - Storage    │                                         │
│   └────────┬────────┘                                       │
│            │ Bluetooth (short range)                         │
│            │                                                 │
│   ┌────────┴────────┐                                       │
│   │   Friend's     │ ◄── Relay through nearby device        │
│   │   Phone       │     if out of range                     │
│   └─────────────────┘                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Relay Receipt

```json
{
    "type": "relay.command",
    "canonical": {
        "from": "did:key:z6M...",
        "to": "did:key:z6N...",
        "via": ["device:phone1", "device:phone2"],
        "payload": "...",
        "hop": 1,
        "maxHops": 3
    }
}
```

### How It Works

1. **Phone captures** receipt (photo, note, check-in)
2. **Phone looks** for nearby devices via Bluetooth
3. **Sends** receipt to desktop (or relay through friend)
4. **Desktop** receives and stores
5. **Desktop** syncs to cloud when online

### Use Cases

| Scenario | How It Works |
|----------|-------------|
| Festival with no signal | Phone → friend's phone → desktop |
| Hiking in mountains | Phone → ranger station → base |
| Conference | Phone → venue WiFi → cloud |
| Offline road trip | Phone → car → hotel WiFi → cloud |

### Bluetooth Relay Protocol

```typescript
// Simplified relay protocol
interface RelayProtocol {
    // Discover nearby devices
    discover(): Promise<Device[]>;
    
    // Send receipt to nearest node
    send(receipt: Receipt): Promise<void>;
    
    // Route through multiple hops
    relay(receipt: Receipt, via: Device[]): Promise<void>;
}
```

---

## Receipts as Commands

Everything is a receipt. Everything is a command:

```
┌─────────────────────────────────────────────────────────────┐
│              UNIFIED COMMAND SYSTEM                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Receipt = Command                                         │
│   ┌─────────────────────────────────────────────────┐      │
│   │  {                                                  │      │
│   │    type: "sync",                                   │      │
│   │    canonical: { action: "sync_to_cloud" }        │      │
│   │  }                                                  │      │
│   └─────────────────────────────────────────────────┘      │
│                    │                                        │
│                    ▼                                        │
│   ┌─────────────────────────────────────────────────┐      │
│   │  Execution:                                        │      │
│   │  - sync → uploads to cloud                       │      │
│   │  - relay → forwards to next node                 │      │
│   │  - store → saves to local                        │      │
│   │  - delete → removes from tier 1                   │      │
│   │  - archive → moves to cold storage                │      │
│   └─────────────────────────────────────────────────┘      │
│                                                              │
│   The receipt IS the command. The command IS the receipt.   │
│   Unified. Simple. Powerful.                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

This is why it all works: **receipts are commands, commands are receipts**. One unified abstraction for everything.

---

## Related

- [network-architecture.md](./network-architecture.md) — Network dashboard
- [federation.md](./federation.md) — Federation concepts
- [self-executing-receipts.md](./self-executing-receipts.md) — Receipt types
