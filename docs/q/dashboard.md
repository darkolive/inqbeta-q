# Q — the dashboard, mapped

Darren, 2026-09-16: *"The Q site could effectively be an interface dashboard that
would list all your federations and your file directory and your keys and your
devices, and be a central syncing portal across all of your nodes… that
effectively is inQbeta. It can be a desktop app, an iOS phone app. And each type
of federation can add features and UI."*

Q is **your** side of inQbeta: the place your root key, your locked folder and
your copies live, and where every federation you belong to shows its screens.
Sites never depend on it being reachable (decided 2026-09-16): each signs you in
on its own and links its key to your root with a signed link (two UCAN tokens).

## The map

The same places, in the same order, on every platform — the map never moves.

| Place | Route | What it shows | Status |
|---|---|---|---|
| **Overview** | `/` | A tile per place, with the one number that says how it stands; the newest things Q understands | built |
| **Keys** | `/keys` | Your passkey (where it is, sign in, check it is the same you), linked keys, approving link requests, unlinking, **permissions** given and held (take back) | built |
| **Devices** | `/devices` | This device, linked sites, linked devices | built (phones: when the app exists) |
| **Files** | `/data` | Everything in the locked folder: add, open (system dialogs), lock, readable copy, delete | built |
| **Copy locations** | `/nodes` | Main folder + other places the folder is kept (USB, synced cloud folder, a node's share); sync both ways, never overwrite | built |
| **Federations** | `/federations` | Federations you founded or belong to (from founding records and credentials in the folder); the features each adds | built — founding screen still to come |
| *Federation features* | `/f/<id>` | Each federation's own screens | DoStudy **Courses** built |

Planned places, not built: **Permissions** (CRUD + Grant — `docs/identity/permissions.md`),
**Activity** (every receipt, as a timeline), **Settings**.

## Platforms

| | How | Notes |
|---|---|---|
| **Web** | `apps/q`, SvelteKit, prerendered, offline copy | Chrome/Edge for the folder; others fall back to downloads |
| **Desktop** | The same build wrapped in a desktop shell (Tauri is the natural fit — small, uses the system web view) | Real file system without the browser's permission prompts |
| **iOS** | A native app using the same formats (`did:key`, `.dsv`, sealed envelopes, UCAN tokens — see ucan-in-q.md for the Swift port); passkey PRF is in Apple's AuthenticationServices since iOS 18 | The phone becomes the carried root; its own private storage replaces the folder picker |
| **Android** | Same as iOS, via Credential Manager | |

What keeps them one product is `packages/q-core` (the formats and rules) and
`packages/q-ui` (the language of headings, blocks and components). A native app
re-implements q-core's formats to the letter — the tests are the spec.

## Feature packs — what a federation adds

`apps/q/src/lib/features/registry.ts`. A pack says:

- which **federation** it belongs to,
- what it **recognises** in your folder (by schema name only — nothing imported
  from the federation's own code),
- where its **screens** live, and its icon.

Q lists packs under Federations, adds their screens to the sidebar, and lays out
everything they find with the same `Item`, `Tile` and heading roles. The first
pack is **DoStudy — Courses**: courses (title → `title`, aim → `description`,
level/author/steps/date → `meta`, last event → `status`), reads, sealed notes,
founding records and memberships.

## Standardised, for everyone — and for neurodiversity

Every screen is built from the same few things, so the pattern is learned once:

- **Page** — one title, one lead sentence, then sections.
- **Section** — a heading, a one-line description, its contents.
- **Tile** — what it is, how many, where it goes. One target.
- **Item** — title, subtitle, description, small print, a state in words, actions.
- **Status** — always words; colour only confirms.
- **Empty** — says plainly why there is nothing and what would put something there.

The **language of headings** (`packages/q-ui/README.md`) gives every piece of text
a role — `title`, `description`, `meta`… — that decides its look (one Skeleton token
each: all titles are `h5`) and what speech says before it ("Title: …").
