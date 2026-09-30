# DOM Control Architecture

> Full DOM control through the header as single source of truth

---

## 1. Core Principle

**The Header is the Single Source of Truth**

All decisions about what appears in the main content flow from the header state:

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER (source of truth)                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ Auth    │  │ Search  │  │ Notifs  │  │ Theme   │     │
│  │ State   │  │ Query   │  │ Count   │  │ Toggle  │     │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘     │
│       │            │            │            │            │
│       └────────────┴────────────┴────────────┘            │
│                         │                                 │
│                         ▼                                 │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ GATE (simple pass-through)                          │ │
│  │ • Read header state                                 │ │
│  │ • Determine content based on permissions            │ │
│  │ • Render appropriate component                     │ │
│  └─────────────────────────────────────────────────────┘ │
│                         │                                 │
│                         ▼                                 │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ MAIN CONTENT                                       │ │
│  │ (templates only — no logic here)                   │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Header State Model

```typescript
interface HeaderState {
  // Authentication
  auth: {
    identity: Identity | null;     // Current signed-in identity
    remembered: string | null;    // Remembered DID from localStorage
    sessionValid: boolean;        // True if session is valid
    justSignedOut: boolean;       // Flag for fresh sign-out
  };
  
  // Navigation
  nav: {
    currentPath: string;
    searchOpen: boolean;
    notificationsOpen: boolean;
  };
  
  // Preferences
  prefs: {
    theme: 'light' | 'dark';
    speechEnabled: boolean;
    navLayout: 'rail' | 'sidebar';
  };
  
  // Permissions (derived from identity)
  permissions: {
    canAttest: boolean;
    canCreateFederation: boolean;
    canWrite: boolean;
  };
}
```

---

## 3. The Gate Rules

| Header State | Route | Gate Decision |
|--------------|-------|----------------|
| Not signed in | `/` | Show landing page |
| Not signed in | `/keys` | Show sign-in form |
| Not signed in | `/receipts` | Redirect to `/keys` |
| Signed in | `/keys` | Redirect to `/` (already authenticated) |
| Signed in | `/` | Show dashboard |
| Folder not ready | Any | Show folder setup prompt |

**Principle**: The gate is **stateless** — it only reads the header state and renders accordingly. No side effects, no redirects logic scattered across pages.

---

## 4. Current Issues to Fix

### 4.1 Sign-In/Sign-Out Flow

**Problem**: Currently unpredictable — signs in → goes to various places

**Goal**: 
- Sign in → Always go to `/` (dashboard)
- Sign out → Always go to `/keys` (sign-in page)
- No intermediate states

**Fix Required**:
1. SignIn component: On success → `goto('/')`
2. SignIn component: On sign out → `forget()` → `goto('/keys')`
3. Layout guard: If authenticated and on `/keys` → redirect to `/`

### 4.2 Dashboard Rendering

**Problem**: Dashboard shows when there's no identity in memory (post-reload)

**Goal**: 
- Empty session → Show sign-in prompt, not dashboard
- Dashboard only when truly authenticated

**Fix Required**: Guard must check both memory AND localStorage, handled consistently

---

## 5. Component Library

Reusable templates for main content:

### 5.1 Receipt Components

```typescript
// Template: ReceiptList
// - Shows list of receipts with status
// - Filtering by type, date, holds status
// - Click to open detail drawer

// Template: ReceiptDetail  
// - Full receipt JSON view
// - Signature verification status
// - Copy/Save actions

// Template: ReceiptTimeline
// - Chronological view of receipts
// - Visual graph of connections
```

### 5.2 Search Components

```typescript
// Template: SearchOverlay
// - Full-screen search (Cmd+K)
// - Real-time results
// - Keyboard navigation

// Template: SearchResults
// - Paginated results
// - Faceted filtering
// - Empty states
```

### 5.3 Data Components

```typescript
// Template: FileTree
// - Hierarchical folder view
// - Drag-and-drop support
// - Context menus

// Template: DataCard
// - File/document preview
// - Metadata display
// - Action buttons
```

---

## 6. Security Principles

### 6.1 No Breaking Points

- **No inline redirects** — All routing through gate
- **No scattered auth checks** — Single guard in layout
- **No stale state** — Always read fresh from header

### 6.2 Session Integrity

- **Sign out = full destroy**: Clear localStorage + sessionStorage + memory
- **Sign in = fresh start**: No carry-over from previous session
- **Reliability**: Deterministic behavior, no race conditions

### 6.3 DOM Control Standards

- **One-way data flow**: Header → Gate → Content
- **Immutability**: Never mutate header state directly
- **Composition**: Build complex views from simple templates

---

## 7. Implementation Checklist

- [ ] Fix sign-in redirect to always go to `/`
- [ ] Fix sign-out redirect to always go to `/keys`
- [ ] Add redirect from `/keys` to `/` if already signed in
- [ ] Create ReceiptList component template
- [ ] Create ReceiptDetail component template
- [ ] Create SearchOverlay component template
- [ ] Document all gate rules
- [ ] Add integration tests for auth flow

---

## 8. Related Documents

- `receipt-lifecycle.md` — Download state and triggers
- `audit-review-2026-09-19.md` — This session's work
- `design-principles.md` — Core design philosophy
