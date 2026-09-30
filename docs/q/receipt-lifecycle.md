# Receipt Lifecycle Triggers

> Draft — for review before implementation

## Overview

Receipts in Q go through a lifecycle from creation to consumption. This document defines the triggers that move a receipt through its states, both for UI display and command execution.

## Download States

```
pending → receiving → received → opened
              ↓
           failed
```

| State | Meaning |
|-------|---------|
| `pending` | Queued for transfer, not yet started |
| `receiving` | Download in progress (0-99%) |
| `received` | Download complete (100%) — can verify signatures |
| `opened` | Decrypted and readable |
| `failed` | Transfer failed — can retry |

---

## UI Lifecycle Triggers

### Page Load Flow

Every page displaying receipts must show a preloader until the receipt is `received`.

```
Page navigation starts
        │
        ▼
┌───────────────────┐
│   preloader:      │
│   skeleton UI     │ ◄── triggers: pageinteractive, receipt:pending
│   loading state  │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  receipt:         │
│  receiving (x%)   │ ◄── triggers: progress events from fetch
└────────┬──────────┘
         │
         ▼ (100%)
┌───────────────────┐
│  receipt:         │ ◄── trigger: download complete
│  received         │
└────────┬──────────┘
         │
         ▼ (if sealed + key available)
┌───────────────────┐
│  receipt:         │ ◄── trigger: unsealed successfully
│  opened           │
└───────────────────┘
```

### SvelteKit Implementation

```svelte
<script>
  let { receipt } = $props();
  let progress = $state(0);
  let status = $derived(
    progress === 0 ? 'pending' :
    progress < 100 ? 'receiving' :
    receipt.opened ? 'opened' : 'received'
  );
</script>

{#if status === 'pending' || status === 'receiving'}
  <Preloader progress={progress} />
{:else}
  <ReceiptContent {receipt} />
{/if}
```

---

## Command Lifecycle Triggers

Commands (functions that process receipts) have three trigger points:

```
┌─────────────┐
│   START     │ ◄── trigger: command invoked
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   DURING    │ ◄── trigger: progress events, chunk processing
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    END      │ ◄── trigger: complete, failed, or cancelled
└─────────────┘
```

### Trigger Types

| Trigger | When | Payload |
|---------|------|---------|
| `command.start` | Command begins | `{ commandId, receiptHash, type }` |
| `command.progress` | During processing | `{ commandId, percent, chunk? }` |
| `command.complete` | Success | `{ commandId, result }` |
| `command.failed` | Error | `{ commandId, error }` |
| `command.close` | Cleanup | `{ commandId, duration }` |

---

## Event-Based Triggers

Receipts can trigger other actions based on events:

### By DID

```typescript
trigger: {
  type: 'did',
  pattern: 'did:key:z...',  // specific DID
  // or
  pattern: 'did:key:z...*', // wildcard prefix
}
```

### By Receipt Type

```typescript
trigger: {
  type: 'receipt_type',
  pattern: 'identity.linked',
  // or
  pattern: 'federation.treaty.*',
}
```

### By Lifecycle State

```typescript
trigger: {
  type: 'lifecycle',
  state: 'received',  // when download completes
  // or
  state: 'opened',    // when decrypted
}
```

### Compound Triggers

```typescript
trigger: {
  type: 'and',
  conditions: [
    { type: 'did', pattern: 'did:key:z...' },
    { type: 'receipt_type', pattern: 'identity.linked' },
    { type: 'lifecycle', state: 'received' }
  ]
}
```

---

## Examples

### Example 1: Link Request Notification

> When someone requests to link their key to your identity, notify immediately upon receipt (even if sealed).

```yaml
trigger:
  type: and
  conditions:
    - type: receipt_type
      pattern: identity.linked
    - type: lifecycle
      state: received

action: notify
notify:
  channel: in-app
  urgency: high
```

### Example 2: Treaty Auto-Open

> When a treaty receipt is fully received and you have the key, auto-unseal.

```yaml
trigger:
  type: and
  conditions:
    - type: receipt_type
      pattern: federation.treaty
    - type: lifecycle
      state: received

action: auto_unseal
auto_unseal:
  if: key_available
  then: open
  else: prompt
```

### Example 3: Sync Complete

> After syncing pending receipts, refresh the UI.

```yaml
trigger:
  type: command
  command: sync_pending
  state: complete

action: refresh_ui
```

---

## Open Questions

1. **Persistence**: Should trigger rules be stored on-chain (as receipts) or local-only?
2. **Ordering**: If multiple triggers match, what's the priority?
3. **Rate limiting**: How to prevent trigger storms from rapid receipts?
4. **Offline**: Triggers that require network (e.g., "notify other party") — queue or fail?

---

## Next Steps

- [ ] Review this draft
- [ ] Decide on persistence model
- [ ] Implement download state tracking in `offline-queue.ts`
- [ ] Add SvelteKit preload data to receipt pages
- [ ] Write trigger engine
- [ ] Add tests
