# Q Design Principles Update

**Generated**: 2026-09-18

This document captures the new design principles established since the initial architecture was documented.

---

## 1. Receipt-Based UI Pages

### Principle
Every UI element, page layout, and component is stored as a receipt. Users own their interface.

### Implementation
- **UI Receipts**: Custom pages stored as JSON receipts in user's folder
- **Receipt Schema**: `{ schema, source, did, publicKey, signedAt, contentHash, signature, content }`
- **Namespace**: `inqbeta:ui:page`, `inqbeta:ui:component`, `inqbeta:ui:template`
- **Blocks**: Header, federation-list, recent-activity, course-grid, balance-summary, contacts-list, receipts-list

### Benefits
- User interface is portable and verifiable
- Pages are cryptographically signed by the user
- Can be shared between federations as templates

---

## 2. The passkey is first — superseded 2026-09-19

**This section described OTP verification before passkey access. Q no longer
works that way, and the wording is kept only so the change is legible.**

The old order sent a code before there was an identity to attach it to, so the
two were never tied together. The passkey is tier one: press it, your DID is
derived on the spot, and you are signed in. Addresses are claimed afterwards, by
an identity that already exists, and no code is sent at all — the message
carries a receipt location and nothing else.

`q:sessionVerified` is gone. It was a second gate that one line in a console
walked past, and the passkey was always the real one.

See `channels.md` for what replaced it.

## 3. Intelligent Folder Discovery

### Principle
Folders should be discoverable or auto-creatable based on user identity.

### Implementation
- **Suggested Naming**: `Incubator - Master - [shortDid]`
- **Auto-Discovery**: System looks for existing folder on device
- **Browser Storage**: Safari uses OPFS (Origin Private File System)
- **Folder States**: checking, unsupported, no-identity, none, asleep, lost, ready

### Key Functions
- `suggestFolderName(did)` - Generates folder name from DID
- `watchFolder()` - Starts folder watching system
- `refresh()` - Re-scans for folder

### Benefits
- No manual folder setup required
- Works across devices (disk, browser, USB)
- Folder name includes DID for identification

---

## 4. Voice-First Search

### Principle
Search is a core navigation element that should work hands-free.

### Implementation
- **Location**: Fixed in header between logo and toggles
- **Voice Commands**: Navigation via speech ("go to keys", "show files")
- **Real-Time**: Debounced navigation to search page
- **Web Speech API**: Native browser speech recognition

### Voice Commands Supported
```
home, overview → /
keys → /keys
files → /data
receipts → /receipts
federations → /federations
nodes → /nodes
devices → /devices
contacts → /contacts
exchanges → /exchanges
pages, my pages → /my-pages
balance → /balance
settings → /settings
```

### Benefits
- Hands-free navigation
- Accessible interface
- Instant response to queries

---

## 5. Live Search Page

### Principle
Search should be a first-class page, not a modal. Results update live.

### Implementation
- **Route**: `/search?q=query`
- **Live Updates**: Results appear as you type (300ms debounce)
- **Result Types**: Navigation, Data, Suggestions
- **Continuation**: "Show me more", "Find related", "Tell me more"

### Layout
```
┌─────────────────────────────────────────┐
│ Search Results for "query"              │
├─────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ │ Keys    │ │ Files   │ │ Feder...│ │
│ │ Manage  │ │ Your    │ │ Manage  │ │
│ └─────────┘ └─────────┘ └─────────┘ │
├─────────────────────────────────────────┤
│ CONTINUE CONVERSATION                   │
│ [Show me more] [Find related] [More]  │
└─────────────────────────────────────────┘
```

### Benefits
- Full page for complex results
- Room for AI conversation continuation
- Maintains navigation during search

---

## 6. Minimalist Header Design

### Principle
Header should be clean: logo, search, essential toggles only.

### Components
- **Left**: Logo + Terminal icon
- **Center**: Search bar with microphone
- **Right**: Theme toggle, Speech toggle, Passkey button

### Design Decisions
- Search bar is prominent and always visible
- Toggles use switch-style for on/off states
- Icons are consistent (FaIcon)

---

## 7. Session Persistence

### Principle
User sessions should persist across browser sessions.

### Storage Keys
- `dostudy-passkey-did` - Passkey DID (from passkey module)
- `q-key-place` - Preferred key location
- `q:sessionVerified` - OTP verification status
- `q:verifiedContact` - Verified email/phone
- `q:sessionAnchor` - Session anchor for continuity

### Benefits
- No repeated OTP verification
- Remembers passkey preference
- Smooth return experience

---

## Summary

These principles create a cohesive user experience:

| Principle | Goal |
|-----------|------|
| Receipt-Based UI | User owns their interface |
| Two-Stage Auth | Security through layers |
| Folder Discovery | Zero-setup data storage |
| Voice Search | Hands-free navigation |
| Live Search | Real-time results |
| Minimal Header | Clean, focused interface |
| Session Persistence | Seamless return visits |

---

## Related Documents
- [Architecture](architecture.md) - Original architecture
- [Receipt Schema](receipt-schema.md) - Receipt format
- [Modules](modules.md) - Core modules
