# Cloud-Only Devices

**Concept**: 2026-09-18

This document describes the architecture for devices that have no local storage and rely entirely on cloud storage (Google Drive) for their data layer.

---

## The Problem

Not all devices have local storage:
- Chromebooks
- Cloud-first laptops
- Managed corporate devices
- Shared/public terminals
- Mobile devices with limited space

These devices need a way to participate in the Q ecosystem without local BadgerDB or IndexedDB.

---

## The Solution: Cloud Storage as Primary

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUD-ONLY DEVICE                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐    ┌─────────────┐                       │
│   │   Passkey   │    │  Google     │                       │
│   │  (secure   │    │   Drive     │  ← Primary storage    │
│   │  element)  │    │   (OPFS)    │                       │
│   └─────────────┘    └─────────────┘                       │
│           │                  │                              │
│           ▼                  ▼                              │
│   ┌─────────────────────────────────────┐                  │
│   │         Q App (no local DB)         │                  │
│   └─────────────────────────────────────┘                  │
│                    │                                          │
│                    │ internet                                │
│                    ▼                                         │
│   ┌─────────────────────────────────────┐                  │
│   │         Kernel (BadgerDB)            │  ← Receipt storage
│   │         (remote server)              │                  │
│   └─────────────────────────────────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Google Drive Integration

### Storage Structure

The Q app creates a dedicated folder in Google Drive:

```
Google Drive/
└── inqbeta-q/
    ├── receipts/          # All receipts, hashed by key
    │   ├── 00/           # First 2 chars of hash
    │   │   └── <hash>.json
    │   └── ...
    ├── cache/            # Temporary cache
    ├── sync/             # Sync state
    └── dostudy.json      # Device identity
```

### API Integration

> **Corrected 2026-09-19.** This section described a "Google Drive File System
> API (available in Chrome)" that mounts Drive as an origin private file system.
> There is no such API, and nothing mounts Drive as OPFS.
>
> The correction is good news. Drive is reached over **plain HTTPS**, through
> its REST API, which every browser can do. It has nothing to do with Chrome and
> nothing to do with the File System Access API. So a cloud vault is
> browser-independent — and it is the answer for Safari, which has no folder
> picker and therefore cannot keep anything locally.

There is no file-system handle. Drive is a REST API: list, get, create, update,
each an HTTPS call with a bearer token.

```typescript
/* A vault kept in Drive. The same shape as a local one from the caller's side:
 * sealed bytes in, sealed bytes out, named by their own hash. */
interface DriveVault {
	list(): Promise<{ id: string; name: string; size: number }[]>;
	get(name: string): Promise<Uint8Array>;
	/* Content names make this idempotent: writing the same name twice must
	 * REPLACE, so the Drive file id is looked up first and updated, never
	 * created twice. Drive allows duplicate names in a folder; the vault must
	 * not. */
	put(name: string, bytes: Uint8Array): Promise<void>;
	remove(name: string): Promise<void>;
}
```

### Authentication Flow

```
1. User visits Q on a browser that cannot keep a folder
2. Q requests the drive.file scope — which grants access ONLY to files Q
   itself created, never to the rest of somebody's Drive
3. User authorises → OAuth token
4. Q reads and writes sealed files through the Drive REST API
```

Needs a registered OAuth client and a redirect, so Q gains a server-side piece
for the client secret. It already has server routes for channels, so this is
not new territory, but it is real work and not a small add.

### What Google can and cannot see

- **Cannot**: read anything. Every file is sealed to a passkey before it leaves
  the browser, and named by its own hash. Google holds ciphertext.
- **Can**: how many files, how big, and when they change. That is the same
  metadata leak ADR-Q-001 §9 already accepts for any relay — existence, size,
  timing. Worth stating rather than glossing.

### What it costs the promise

Q's local story is "no accounts, no cloud". A Drive vault is an account with
Google and a network connection. That is a different product on Safari from the
one on Chrome, and the wording has to say so rather than implying one thing
works everywhere.

### The cheaper thing, first

On a browser that CAN keep a folder, a person can simply choose a folder inside
iCloud Drive, Dropbox or OneDrive. Sync across devices, for free, with no
OAuth, no Google account, and no code at all. It does not help Safari — but it
is the multi-device answer, and it should be offered before anybody builds an
integration.

---

## Device Types

### Type 1: Local-First (Standard)

| Component | Storage |
|-----------|---------|
| Keys | Local (passkey + IndexedDB) |
| Receipts | Local BadgerDB |
| Cache | Local |
| Sync | Google Drive (backup) |

**Devices**: Mac, PC, full-featured laptops

### Type 2: Cloud-Only

| Component | Storage |
|-----------|---------|
| Keys | Local (passkey only) |
| Receipts | Remote Kernel + Google Drive cache |
| Cache | Google Drive |
| Sync | Google Drive (primary) |

**Devices**: Chromebooks, cloud laptops, managed devices

---

## Comparison

| Aspect | Local-First | Cloud-Only |
|--------|-------------|------------|
| Offline capable | Yes | No |
| Latency | < 1ms | ~50-200ms |
| Storage limit | Device | Google Drive (15GB free) |
| Requires | None | Internet |
| Sync | Bidirectional | Google Drive API |
| Data residency | Local | Google Cloud |

---

## Sync Strategy

### For Cloud-Only Devices

1. **On load**: Fetch latest from Google Drive
2. **On change**: Write to Google Drive immediately
3. **Periodic**: Sync with Kernel server
4. **Conflict resolution**: Last-write-wins (with hash verification)

### Sync Protocol

```typescript
interface SyncState {
    lastSync: number;        // Timestamp
    localHead: string;       // Latest local receipt hash
    remoteHead: string;     // Latest server receipt hash
    driveHead: string;      // Latest Google Drive state
}

async function sync(): Promise<SyncResult> {
    const state = await loadSyncState();
    
    // Fetch remote changes
    const remote = await kernel.getChain(since: state.lastSync);
    
    // Fetch drive changes  
    const drive = await drive.getChanges(since: state.lastSync);
    
    // Merge (last-write-wins)
    const merged = merge(remote, drive);
    
    // Push to both
    await Promise.all([
        kernel.push(merged),
        drive.write(merged)
    ]);
    
    return { success: true, merged: merged.length };
}
```

### Sync Announcements (Ping System)

When data changes, devices need to know there's something to sync:

```
┌─────────────────────────────────────────────────────────────┐
│                  SYNC ANNOUNCEMENT                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Device A makes a change                                    │
│          │                                                   │
│          ▼                                                   │
│   ┌─────────────────┐                                        │
│   │   Kernel DB    │  ← Receipt stored here                │
│   └────────┬────────┘                                        │
│            │                                                 │
│            │ Announces: "new receipt at hash:xyz"           │
│            ▼                                                 │
│   ┌─────────────────────────────────────┐                  │
│   │  Announcement Channel               │                  │
│   │  (Server-Sent Events / WebSocket)  │                  │
│   └──────────────┬──────────────────────┘                  │
│                  │                                            │
│          ┌───────┴───────┐                                   │
│          ▼               ▼                                   │
│   ┌──────────┐   ┌──────────┐                              │
│   │ Device B │   │ Device C │  ← Pulls changes             │
│   └──────────┘   └──────────┘                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Announcement Types

| Event | Trigger | Action |
|-------|---------|--------|
| `receipt.new` | Receipt added | Fetch and store |
| `receipt.update` | Receipt modified | Merge changes |
| `receipt.delete` | Receipt deleted | Remove locally |
| `sync.request` | Manual sync | Full sync |
| `device.linked` | New device added | Full sync |

#### Client Implementation

```typescript
// Subscribe to sync announcements
function watchForUpdates(callback: (event: SyncEvent) => void) {
    const es = new EventSource('/api/sync/events');
    
    es.onmessage = (e) => {
        const event = JSON.parse(e.data);
        
        switch (event.type) {
            case 'receipt.new':
                // Fetch the new receipt
                kernel.getReceipt(event.hash).then(callback);
                break;
            case 'sync.request':
                // Full sync requested
                syncAll();
                break;
        }
    };
    
    return () => es.close();
}
```

#### Device UI: "Sync Available" Indicator

When you're on any device, you should see if there's a sync to do:

```
┌─────────────────────────────────┐
│  🔔 3 updates available         │
│     ┌─────────────────────┐    │
│     │ Sync now            │    │
│     │ Last sync: 2 min    │    │
│     └─────────────────────┘    │
└─────────────────────────────────┘
```

The user sees:
- How many updates are pending
- When last sync happened
- One tap to sync

---

## Security Considerations

### Data at Rest

- Google Drive encrypts at rest (AES-256)
- Q adds app-layer encryption for sensitive data
- Receipts are signed, so tampering is detectable

### Access Control

- OAuth scopes limit Q to its folder only
- User can revoke access anytime via Google
- No Google account = no Q on this device

### Key Security

- Passkey stays on device (secure element)
- Private keys never leave device
- Only signed receipts go to cloud

---

## Trade-offs

| Benefit | Drawback |
|---------|----------|
| No local storage needed | Requires internet to work |
| Cross-device by default | Google dependency |
| Unlimited storage (paid) | Latency vs local-first |
| Easy device replacement | Privacy considerations |

---

## Access Modes: Local vs Remote

When you're on the road (internet cafe, library, friend's computer), you need to access your data. There are multiple ways:

### Mode 1: Local Network (Phone as Storage)

```
┌─────────────────────────────────────────────────────────────┐
│              LOCAL NETWORK ACCESS                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Your Phone (Storage + Transceiver)                         │
│   ┌─────────────────────────────────────┐                  │
│   │  Q App                            │                  │
│   │  ┌─────────┐   ┌─────────────┐   │                  │
│   │  │ Storage │   │  WiFi AP    │   │                  │
│   │  │(Badger) │   │  or BT     │   │                  │
│   │  └─────────┘   └─────────────┘   │                  │
│   └─────────────────────────────────────┘                  │
│           │              │                                   │
│           │   local IP  │                                   │
│           ▼              ▼                                   │
│   ┌─────────────────────────────────────┐                  │
│   │   Internet Cafe Computer            │                  │
│   │   Browser → http://phone.local:8080 │                  │
│   └─────────────────────────────────────┘                  │
│                                                              │
│   ✓ Works without internet                                   │
│   ✓ Data never leaves your phone                            │
│   ✗ Must be on same WiFi or close enough for BT            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**
1. Phone runs local web server (on port 8080)
2. Phone broadcasts via mDNS (phone.local)
3. Any device on same network can browse to it
4. Data served directly from phone's BadgerDB

### Mode 2: Cloud Backup (Google Drive)

```
┌─────────────────────────────────────────────────────────────┐
│              CLOUD BACKUP ACCESS                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Your Phone                    Cloud                         │
│   ┌─────────────┐            ┌─────────────┐              │
│   │  Q App     │◄──────────►│ Google Drive │              │
│   │            │  internet   │             │              │
│   │  Sync     │            │  /inqbeta-q │              │
│   └─────────────┘            └─────────────┘              │
│                                                              │
│   ✓ Works from anywhere with internet                        │
│   ✓ Data accessible even if phone lost                       │
│   ✓ Automatic sync when online                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**
1. Phone syncs to Google Drive
2. Any device logs into Google Drive
3. Downloads latest data
4. Works offline after first sync

### Mode 3: Federation Network

```
┌─────────────────────────────────────────────────────────────┐
│              FEDERATION NETWORK ACCESS                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Your Phone                    Federation Cloud             │
│   ┌─────────────┐            ┌─────────────┐              │
│   │  Q App     │◄──────────►│  Node       │              │
│   │            │  internet   │  (peer)     │              │
│   │  Cache    │            │  +Storage   │              │
│   └─────────────┘            └─────────────┘              │
│                                                              │
│   ✓ Decentralized (no Google dependency)                     │
│   ✓ Token-based (earn by providing resources)               │
│   ✓ Can run your own node at home                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Access Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│              WHICH ACCESS MODE?                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Where are you?                                             │
│                                                              │
│   ├── Internet cafe / friend's computer                     │
│   │         │                                                │
│   │         ├── Have internet?                              │
│   │         │   ├── Yes → Cloud (Google Drive)             │
│   │         │   └── No  → Local network (phone)           │
│   │         │                                                │
│   │         └── Friend's WiFi?                             │
│   │             ├── Yes → Local network                     │
│   │             └── No  → Use phone as hotspot             │
│   │                                                        │
│   ├── Off-grid / no internet                                │
│   │   └── Local network (phone is server)                  │
│   │                                                        │
│   └── At home with federation node                          │
│       └── Federation network (fastest)                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### The Minimum Viable Access

For internet cafe scenario:

```
┌─────────────────────────────────────────────────────────────┐
│              MINIMUM VIABLE ACCESS                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. QR code on cafe computer screen                        │
│   2. Phone scans → creates session                          │
│   3. Phone serves data locally                              │
│   4. Cafe computer displays via phone's web server          │
│   5. Session ends when you leave                           │
│                                                              │
│   Result: No passwords typed on public computer             │
│           No data stored on public computer                 │
│           Full access to your identity                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Security Properties

| Mode | Data on Public PC | Passwords Typed | Data Exposed |
|------|------------------|-----------------|--------------|
| Local Network | None | None | None |
| Cloud | Cache | Login | Google |
| Federation | Cache | None | Node operator |

---

## The Golden Rule: Capture Everywhere, Survive Anywhere

Every receipt must survive. Regardless of how or where it first appears:

```
┌─────────────────────────────────────────────────────────────┐
│                  RECEIPT DNA SURVIVAL                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Receipt created                                            │
│          │                                                   │
│          ├────► Local (BadgerDB)      ← Immediate           │
│          │                                                   │
│          ├────► Cloud (Google Drive)  ← ASAP                │
│          │                                                   │
│          └────► Kernel (server)      ← Sync                 │
│                                                              │
│   Device dying?                                              │
│          │                                                   │
│          └────► Any available cloud   ← Emergency            │
│                                                              │
│   Offline?                                                   │
│          │                                                   │
│          └────► Queue for later      ← When online          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### The Priority

| Priority | Action | When |
|----------|--------|------|
| 1 | Store locally | Always (fastest) |
| 2 | Sync to cloud | Immediately |
| 3 | Push to kernel | When online |
| 4 | Archive to cold | On schedule |

**The receipt DNA survives no matter what.**

---

## Related

- [architecture.md](./architecture.md) — Core architecture
- [self-executing-receipts.md](./self-executing-receipts.md) — Receipt storage
- [receipt-architecture.md](./receipt-architecture.md) — Receipt flow
