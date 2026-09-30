# Q Architecture - Extended Vision

**Generated**: 2026-09-18

This document extends the core Q architecture with the resource marketplace and federation model.

---

## 1. Two Trust Domains

The system is divided into two completely separate execution contexts:

### 1.1 Secure Header (Root of Trust)

The header runs in a **locked namespace** that only the user's DID can access:

```
┌─────────────────────────────────────────────────────┐
│  HEADER - SECURE CONTEXT                            │
│  ┌─────────────────────────────────────────────┐   │
│  │  Passkey → DID → Keys → Unlocked Vault    │   │
│  │                                              │   │
│  │  - Identity management                      │   │
│  │  - Key signing/sealing                      │   │
│  │  - Receipt creation                         │   │
│  │  - Access control validation               │   │
│  │                                              │   │
│  │  ONLY talks to local storage                │   │
│  │  (IndexedDB, Badger)                       │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                          ▲
                          │ Operations requested
                          │ (signed, validated)
                          ▼
┌─────────────────────────────────────────────────────┐
│  PAGE CONTENT - APPLICATION DOM                    │
│  ┌─────────────────────────────────────────────┐   │
│  │  Read-only view of permitted data           │   │
│  │                                              │   │
│  │  - UI state (instant)                       │   │
│  │  - Cached data                             │   │
│  │  - Resource metrics                        │   │
│  │  - Federation views                        │   │
│  │                                              │   │
│  │  Cannot access keys directly                │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 1.2 Operation Types

| Type | Latency | Requires | Example |
|------|---------|----------|---------|
| **Local** | <1ms | None | UI state, navigation |
| **Trusted Call** | ~10ms | Header validation | Create receipt, sign |
| **Resource** | Variable | Compute/AI/GPU | Generate content, sync |

---

## 2. Resource Marketplace

Users can offer compute resources to the network:

### 2.1 Resource Types

| Resource | Capability | Use Case |
|----------|-----------|----------|
| **CPU** | Compute cycles | Validation, processing |
| **GPU** | AI/ML inference | Content generation |
| **Storage** | Data capacity | Backup, sync |
| **Bandwidth** | Network transfer | Federation sync |

### 2.2 Offering Model

```typescript
interface ResourceOffer {
  // Identity
  owner: string;           // DID of offering user
  
  // Resource specs
  type: 'cpu' | 'gpu' | 'storage' | 'bandwidth';
  capacity: number;        // Amount available
  available: number;       // Currently free
  
  // Access control
  scope: 'global' | 'federation';
  allowedFederations?: string[];
  
  // Economics
  pricePerUnit: number;    // Credits per unit
  reputation: number;      // Trust score
}
```

### 2.3 Trust Scoring

Resources are rated based on:
- Uptime reliability
- Response quality
- Previous transaction history
- Membership in trusted federations

---

## 3. Federations

### 3.1 Federation Structure

```
┌─────────────────────────────────────────────────────┐
│  FEDERATION                                         │
│  ┌─────────────────────────────────────────────┐   │
│  │  Name: "Dart College Incubator"            │   │
│  │  Created: 2026-09-01                       │   │
│  │  Purpose: Sandbox for testing ideas         │   │
│  └─────────────────────────────────────────────┘   │
│                                                      │
│  MEMBERS ────────────────────────────────────────   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Member A  │ │ Member B │ │ Member C │  ...   │
│  │ (founder) │ │          │ │          │         │
│  └──────────┘ └──────────┘ └──────────┘         │
│                                                      │
│  SHARED RESOURCES ───────────────────────────────   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ CPU Pool │ │ GPU Farm │ │ Storage │          │
│  └──────────┘ └──────────┘ └──────────┘         │
└─────────────────────────────────────────────────────┘
```

### 3.2 Federation Operations

| Operation | Description |
|-----------|-------------|
| `federation.create` | Create new federation |
| `federation.invite` | Invite member |
| `federation.join` | Accept invitation |
| `federation.leave` | Exit federation |
| `federation.share` | Share resources |
| `federation.trust` | Extend trust |

### 3.3 Membership Levels

| Level | Permissions |
|-------|-------------|
| **Founder** | Delete federation, manage rules |
| **Admin** | Approve members, manage resources |
| **Member** | Use shared resources |
| **Observer** | View only |

---

## 4. Live Metrics Dashboard

### 4.1 Network View

The "Network" section shows:

```
┌─────────────────────────────────────────────────────┐
│  MY NETWORK                                         │
│  ┌─────────────────────────────────────────────┐   │
│  │  PERSONAL FARM                              │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐         │   │
│  │  │ CPU    │ │ GPU    │ │ Storage│         │   │
│  │  │ 8 cores│ │ 4 VRAM │ │ 500GB │         │   │
│  │  │ 100%   │ │ 75%    │ │ 40%   │         │   │
│  │  └────────┘ └────────┘ └────────┘         │   │
│  └─────────────────────────────────────────────┘   │
│                                                      │
│  FEDERATION SHARES ─────────────────────────────   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Dart College     [12 members] [Trust: 98%] │   │
│  │  CPU: 240 cores available                    │   │
│  │  GPU: 48 VRAM available                     │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Test Network       [5 members] [Trust: 87%]│   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 4.2 Metrics Tracked

| Metric | Description |
|--------|-------------|
| **Latency** | Response time per operation |
| **Throughput** | Operations per second |
| **Reliability** | Uptime percentage |
| **Trust Score** | Composite reputation |
| **Resource Usage** | CPU/GPU/Storage consumed |
| **Cost Basis** | Credits spent vs earned |

---

## 5. Economic Model

### 5.1 Credit System

```
┌─────────────────────────────────────────────────────┐
│  CREDIT FLOW                                        │
│                                                      │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐  │
│  │ External │────▶│  Credit  │────▶│ Resource │  │
│  │ Payment  │     │  Wallet  │     │ Purchase │  │
│  │ Portal   │     │          │     │          │  │
│  └──────────┘     └──────────┘     └──────────┘  │
│       │                                    │        │
│       │ £5 = 500 credits                   │        │
│       │ £20 = 2200 credits (+10%)          │        │
│       │ £100 = 12000 credits (+20%)        │        │
│       ▼                                    ▼        │
│  ┌─────────────────────────────────────────────┐   │
│  │  BACKED BY:                                │   │
│  │  - Compute cost basis                      │   │
│  │  - Resource availability                  │   │
│  │  - Federation trust                       │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 5.2 Incentive Structure

| Action | Credit Change |
|--------|---------------|
| Provide CPU | + (based on usage) |
| Provide GPU | + (higher rate) |
| Provide Storage | + (based on retention) |
| Use resources | - (cost basis) |
| Complete course | + (bonus) |
| Create content | + (quality bonus) |

### 5.3 Incubator Special

For Dart College:
- **£5** = 500 credits = ~50 hours compute
- Students can offer their own machines
- Federations can pool resources
- Course creation credits the creator

---

## 6. Implementation Priorities

### Phase 1: Core Infrastructure
- [x] Passkey identity
- [ ] Receipts system
- [ ] Federation creation UI
- [ ] Resource offer interface

### Phase 2: Federation Features
- [ ] Invite system
- [ ] Shared resource pools
- [ ] Trust scoring
- [ ] Metrics dashboard

### Phase 3: Marketplace
- [ ] Credit purchase flow
- [ ] Resource allocation
- [ ] Usage tracking
- [ ] Payment integration

### Phase 4: AI Integration
- [ ] GPU resource offers
- [ ] Content generation
- [ ] Model fine-tuning
- [ ] Inference marketplace

---

## 7. Key Files (Updated)

| Module | Purpose |
|--------|---------|
| `passkey.ts` | Identity from biometrics |
| `receipts.ts` | Attestation system |
| `federations.ts` | Federation management |
| `resource.ts` | Resource offers & allocation |
| `credits.ts` | Credit economy |
| `exchange.ts` | Value transfer |
| `access.ts` | Hybrid access control |

---

## 8. Questions for Next Session

1. Should federations be invite-only or open-join?
2. How do we handle resource payment disputes?
3. What's the minimum viable credit purchase amount?
4. How do we verify GPU capacity claims?
5. Should AI generation be real-time or queue-based?
