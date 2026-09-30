# Q Architecture

**Generated**: 2026-09-17

This document describes the complete Q architecture built on the inQbeta protocol.

---

## The Four Pillars

| Pillar | Description |
|---------|-------------|
| **Identity** | Passkey → DID, no PII stored |
| **Contacts** | ZK contact exchange, versioned |
| **Events** | Everything is an attestation |
| **Exchanges** | Bilateral transfers, credits, assets |

---

## Identity Layer

```
Passkey → WebAuthn PRF → Seed → Keys → DID
```

- No passwords
- No accounts
- No central storage of identity
- Works offline

---

## Zero-Knowledge Contact System

```
User: "I'm happy for you to contact me"
  ↓
  hash(DID + email) → contactHash (stored)
  ↓
  System: Has hash, not email
  ↓
  OTP → email → user verifies
```

### Contact Features

- Versioned contacts
- Sync controls (I choose if you get updates)
- Revoke/replace
- Channel permissions (call, message, email)

---

## Events (Attestations)

Every action is an **event** with a **receipt**:

| Event Type | Description |
|------------|-------------|
| `course.completed` | Learning achievement |
| `badge.earned` | Credential earned |
| `message.sent` | Communication |
| `contact.shared` | Contact exchanged |
| `permission.granted` | Access given |
| `federation.joined` | Federation membership |

### Receipt Structure

```json
{
  "id": "receipt_id",
  "event": "course.completed",
  "by": "did:key:z6M...",
  "subject": "course:123",
  "contentHash": "sha256...",
  "previousHash": "...",
  "signature": "..."
}
```

---

## Exchanges (Value Transfer)

Based on ADR-008 (offline exchange) and ADR-023/024 (asset classes).

### Exchange Types

| Type | Description |
|------|-------------|
| `value` | Credit transfer |
| `gift` | One-way transfer |
| `trade` | Two-way exchange |
| `contract` | Agreement |
| `settlement` | Final payment |

### Asset Classes

| Class | Divisible | Expirable |
|-------|-----------|-----------|
| `credit` | ✅ | ❌ |
| `bearer` | ❌ | ❌ |
| `bond` | ❌ | ✅ |
| `equity` | ✅ | ❌ |
| `commodity` | ✅ | ❌ |
| `service` | ✅ | ❌ |
| `token` | ✅ | ❌ |

---

## Balance Sheet

The balance sheet shows:

- Current balance per asset class
- Transaction history
- Total net worth

```
Balance = Sum of all exchanges where I was:
  - receiver (+) minus
  - giver (-)
```

---

## Access Control

Three levels:

| Level | Requires | Can Do |
|-------|----------|---------|
| `anonymous` | - | Nothing |
| `read` | Session | Browse |
| `attest` | Passkey | Create, sign, seal |

### Second Factor (Optional)

- ZK-2FA with email/SMS OTP
- No contact stored (hash only)
- Human verification

---

## The Contract

**"Free to give, never free to take"**

Every action requires:

1. **Attestation** - You chose to act
2. **Receipt** - Signed evidence created
3. **Chain** - Linked to previous state
4. **Permission** - You were allowed

---

## Data Flow

```
┌─────────────────────────────────────────────┐
│              USER INTERFACE                    │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Receipts│ │ Contacts │ │ Balance   │  │
│  └────┬────┘ └────┬─────┘ └─────┬─────┘  │
└───────┼───────────┼──────────────┼─────────┘
        │           │              │
        ▼           ▼              ▼
┌─────────────────────────────────────────────┐
│              ATTESTATION LAYER                │
│  ┌─────────────────────────────────────┐  │
│  │ createReceipt() │ createExchange()    │  │
│  └─────────────────────────────────────┘  │
└────────────────────┬──────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│              STORAGE LAYER                  │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ IndexedDB │ │ Badger   │ │ Dgraph  │ │
│  │ (local)  │ │ (kernel) │ │ (query) │ │
│  └──────────┘ └──────────┘ └─────────┘ │
└─────────────────────────────────────────────┘
```

---

## Key Files

| Module | Purpose |
|--------|---------|
| `passkey.ts` | Identity from biometrics |
| `contacts.ts` | ZK contact exchange |
| `exchange.ts` | Events & value transfer |
| `receipts.ts` | Kernel client |
| `access.ts` | Hybrid access control |
| `zk-2fa.ts` | Zero-knowledge 2FA |
| `taxonomy.ts` | Evidence types |
| `keys.ts` | Key conditions |
