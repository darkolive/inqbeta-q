# Q — inQbeta

Q is the inQbeta evidence-capture identity: your passkey, your DID and your locked
folder, offline, carried with you. Live at [inqbeta.com](https://inqbeta.com);
the test site is [inqbeta.dev](https://inqbeta.dev).

Open source: the app and node under the GNU AGPL, the libraries under Apache 2.0,
the docs under CC BY 4.0 — see [LICENSING.md](LICENSING.md). Designed by
Darren Knipe, [Dark Olive CIC](https://darkolive.co.uk). Copyright © 2026 Dark Olive CIC. Contributions welcome: [CONTRIBUTING.md](CONTRIBUTING.md).
Security problems: [SECURITY.md](SECURITY.md).

**Q is not part of inQbeta Stage 1.** It has its own public posture; inQbeta's Stage 1
wording and its guard tests are untouched until an ADR says otherwise (decided
2026-09-16).

## Ports

Fixed, and each app refuses to start on any other (`strictPort`), so two apps never
quietly swap addresses.

| Port | What | Where |
|---|---|---|
| **3100** | Q | `apps/q` |
| **5173** | A site built with Q, e.g. Dark Olive (dev) | its own repo |
| 4100 | Q (preview build) | `apps/q` |
| 3000 | inQbeta portal | `~/inQbeta/apps/portal` — separate repo |
| 8787 | inQbeta kernel API | `~/inQbeta/services/kernel-spin` — separate repo |
| 8080 / 9080 | Dgraph | separate |

On `localhost` a passkey belongs to the host, not the port, so the same fingerprint
gives the same DID on 3100 and 5173. In production each site has its own key, linked
to your root.

## Layout

```
apps/q            SvelteKit + Skeleton — the dashboard: keys, devices, files, copy locations, federations
packages/q-core   the identity: did:key, passkey, sealing, links, the locked folder, copy locations
packages/q-ui     the language of headings, named blocks, icons, shared components
packages/q-actions the rule engine (Cedar)
node/             a node: the post office (Mosquitto) and what grows around it
docs/decisions    ADRs — what was decided and why
docs/q            the dashboard map and designs
docs/identity     how the identity works, permissions, devices
docs/origins      where the thinking began
```

## Run it

```bash
corepack enable          # once, so the pinned pnpm is used
pnpm install
pnpm dev:q               # http://localhost:3100
pnpm test                # q-core tests
```

## Every site signs in on its own

Decided 2026-09-16: no site depends on Q (or anyone) being reachable. Each site
signs you in itself with `@inqbeta/q-core`, deriving keys from the fixed inQbeta
identity address `https://schemas.inqbeta.local/governance/Identity.json`.
Browsers tie a passkey to its site, so each site's key is its own; a signed
**link receipt** — made by the site's key, approved by your root in Q — says they
are one person, and anyone can check it offline. See `packages/q-core/src/links.ts`.

## Deploying

Q is a Vercel project with its root directory set to `apps/q`: `main` deploys
inqbeta.com, `test` deploys inqbeta.dev. Settings are in `apps/q/.env.example`.
