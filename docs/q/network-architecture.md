# Network Architecture

**Concept**: 2026-09-18

This document describes the inQbeta Network — a peer-to-peer resource network where users can offer and consume compute, storage, and network services.

---

## The Vision

```
┌─────────────────────────────────────────────────────────────┐
│                    INQBETA NETWORK                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌────────────┐ │
│   │   Storage    │    │   Compute    │    │   Network   │ │
│   │   Network    │    │   Network    │    │   Peers    │ │
│   └──────────────┘    └──────────────┘    └────────────┘ │
│          │                    │                   │          │
│          ▼                    ▼                   ▼          │
│   ┌─────────────────────────────────────────────────────┐  │
│   │              Resource Receipts                         │  │
│   │  - Allocation receipts (who stores what)            │  │
│   │  - Compute receipts (who runs what)                 │  │
│   │  - Bandwidth receipts (traffic metered)            │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐  │
│   │              Token Accounting                         │  │
│   │  - Storage tokens (GB/month)                        │  │
│   │  - Compute tokens (GPU-hours)                       │  │
│   │  - Network tokens (GB transfer)                     │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Three Resource Types

### 1. Storage Network (SeaweedFS)

Track where files are stored across the network:

```json
{
    "type": "storage.allocation",
    "canonical": {
        "fileHash": "sha256:abc123",
        "volume": "volume-1",
        "dataCenter": "us-east-1",
        "replication": 3,
        "allocatedAt": 1698787200000,
        "expiresAt": 1701475200000,
        "cost": {
            "tokens": 10,
            "currency": "storage"
        }
    }
}
```

### 2. Compute Network (CPU/GPU)

Offer or buy compute resources:

```json
{
    "type": "compute.allocation",
    "canonical": {
        "taskId": "task:abc123",
        "provider": "did:key:z6M...",      // Who runs it
        "consumer": "did:key:z6N...",       // Who pays
        "resources": {
            "cpu": 4,
            "gpu": "A100",
            "memory": "16GB",
            "duration": 3600                 // seconds
        },
        "status": "running" | "completed" | "failed",
        "cost": {
            "tokens": 50,
            "currency": "compute"
        }
    }
}
```

### 3. Network Peers

Other nodes in your network:

```json
{
    "type": "peer.connected",
    "canonical": {
        "peerId": "did:key:z6M...",
        "address": "https://node.example.com",
        "role": "storage" | "compute" | "relay",
        "capacity": {
            "storage": "1TB",
            "compute": "100 GPU-hours/month",
            "bandwidth": "100GB/month"
        },
        "online": true,
        "latency": 45
    }
}
```

---

## Token Economics

Every resource has a token cost:

| Resource | Token Type | Metering |
|----------|-----------|----------|
| Storage | `storage` | GB/month |
| Compute | `compute` | GPU-hours |
| Bandwidth | `network` | GB transferred |

### Token Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    TOKEN FLOW                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Consumer                                                  │
│   ┌─────────────┐                                          │
│   │ Buy tokens  │                                          │
│   └──────┬──────┘                                          │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐    ┌─────────────┐                     │
│   │   Escrow    │───►│   Provider  │                     │
│   │   (receipt) │    │  (earnings) │                     │
│   └─────────────┘    └─────────────┘                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Network Dashboard UI

### What the Network Page Shows

| Section | Displays |
|---------|----------|
| **Storage** | Files, volumes, data centers, replication status |
| **Compute** | Active tasks, providers, capacity |
| **Peers** | Connected nodes, latency, roles |
| **Tokens** | Balance, usage, earnings |

### Visual Representation

```
┌─────────────────────────────────────────────────────────────┐
│  NETWORK DASHBOARD                              [Tokens: Ƀ500]│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   STORAGE       │  │   COMPUTE       │                  │
│  │   ┌─────────┐   │  │   ┌─────────┐   │                  │
│  │   │ ██████░ │   │  │   │ ████░░░ │   │                  │
│  │   │ 500 GB   │   │  │   │ 40 hrs  │   │                  │
│  │   │ of 1 TB  │   │  │   │ of 100  │   │                  │
│  │   └─────────┘   │  │   └─────────┘   │                  │
│  │   3 volumes     │  │   2 active      │                  │
│  │   US East (2)  │  │   1 provider    │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   PEERS        │  │   TOKENS        │                  │
│  │   ┌─────────┐   │  │   ┌─────────┐   │                  │
│  │   │ ● ● ●   │   │  │   │ Storage │   │                  │
│  │   │ 5 online│   │  │   │ Ƀ200    │   │                  │
│  │   │ 45ms    │   │  │   ├─────────┤   │                  │
│  │   └─────────┘   │  │   │ Compute │   │                  │
│  │   2 storage     │  │   │ Ƀ250    │   │                  │
│  │   3 compute     │  │   ├─────────┤   │                  │
│  └─────────────────┘  │   │ Network │   │                  │
│                       │   │ Ƀ50     │   │                  │
│                       │   └─────────┘   │                  │
│                       └─────────────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## SeaweedFS Integration

The storage network uses SeaweedFS:

```typescript
interface SeaweedNetwork {
    // File operations
    assignVolume(): Promise<Volume>;
    allocateFile(hash: string, size: number): Promise<FileLocation>;
    
    // Network topology
    getVolumes(): Promise<Volume[]>;
    getDataCenters(): Promise<DataCenter[]>;
    getPeerStatus(): Promise<PeerStatus[]>;
}
```

### File Distribution Receipts

Every file stored generates a receipt:

```json
{
    "type": "file.stored",
    "canonical": {
        "fileHash": "sha256:...",
        "volume": "volume-42",
        "dataCenter": "us-east-1",
        "rack": "rack-a",
        "server": "server-123",
        "replicas": ["server-456", "server-789"],
        "size": 12345678,
        "storedAt": 1698787200000
    }
}
```

This creates a complete audit trail of where every file is located.

---

## Related

- [architecture.md](./architecture.md) — Core architecture
- [self-executing-receipts.md](./self-executing-receipts.md) — Receipt types
- [receipt-architecture.md](./receipt-architecture.md) — Receipt flow
