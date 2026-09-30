---
implementation: current
decision: adr-q-005
updated: 2026-09-28
---

# Going live: inqbeta.com and inqbeta.dev

**Live 27 September 2026.** Both addresses serve their branches from the one
Vercel project (`inqbeta-q-q`): `main` → inqbeta.com, `test` → inqbeta.dev.
To update the test site: `git checkout test && git merge main && git push`.

**28 September: no `q.` subdomain.** Q is served at the bare domains
**inqbeta.com** and **inqbeta.dev** (Darren). Each address has its own
browser storage, so any other address (a `q.` or `www.`) should only redirect
to these. Passkeys are unaffected: they belong to the root either way.

**Decided 26 September 2026 (Darren).** Passkeys belong to the root
**inqbeta.com**; Q lives at **inqbeta.com**. The test site is
**inqbeta.dev** — a separate root, so test passkeys can never mix with real
ones. `inqbeta.local` stays the permanent schema *name*. All ten inqbeta
domains are at Namecheap; DNS stays there and points at Vercel.

| Where | Git branch | Vercel environment | `PUBLIC_Q_PASSKEY_DOMAIN` | Identities |
|---|---|---|---|---|
| inqbeta.com | `main` | Production | `inqbeta.com` | Real — only once Darren says so |
| inqbeta.dev | `test` | Preview (scoped to `test`) | `inqbeta.dev` | Test |
| `*.vercel.app` | any other | Preview | unset | Throwaway |
| localhost | — | — | unset | Throwaway |

## 1. The root must never lapse

inqbeta.com and inqbeta.dev expire 19 January 2027. Whoever holds the root
could ask browsers for its passkeys, and in Q a passkey opens an identity. In
Namecheap, for both:

- renew for the longest term offered, and turn on **auto-renew**;
- turn on the **registrar lock**;
- make sure the Namecheap account has **two-factor sign-in**.

## 2. Vercel project

vercel.com → Add New → Project → import GitHub `inqbeta/q`.

- **Root Directory:** `apps/q` (leave "include files outside the root" on —
  Q uses `packages/q-core` and `packages/q-ui`).
- **Framework:** SvelteKit (detected). Install and build commands: defaults
  (pnpm is detected from `pnpm-lock.yaml`).
- **Production branch:** `main`.

## 3. Environment variables

Settings → Environment Variables. Use **different secrets** for Production and
the `test` Preview, so nothing made on the test site can open anything real.

| Name | Production | Preview (branch `test`) |
|---|---|---|
| `PUBLIC_Q_PASSKEY_DOMAIN` | `inqbeta.com` | `inqbeta.dev` |
| `Q_SERVICE_SEED` | new 32 bytes | different 32 bytes |
| `Q_OTP_SECRET` | new random string | different random string |
| `RESEND_API_KEY` | from Resend | same is fine |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from Google Cloud | same client |
| `CF_TURN_KEY_ID`, `CF_TURN_KEY_TOKEN` | from Cloudflare (optional) | same |

Make a seed: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## 4. Domains

Vercel → Project → Settings → Domains:

- add `inqbeta.com` → Production;
- add `inqbeta.dev` → assign to Git branch `test`.

Vercel then shows the DNS record each one needs — use exactly what it shows.

## 5. DNS at Namecheap

Domain List → Manage → **Advanced DNS** → Add New Record, for each domain:

| Type | Host | Value |
|---|---|---|
| A (apex) | `@` | the value Vercel shows for the bare domain |

Keep Namecheap's own nameservers — that leaves email and the other records
alone. Vercel issues the HTTPS certificate once the record resolves (minutes,
occasionally an hour).

## 6. Google Drive

Google Cloud Console → APIs & Services → Credentials → the OAuth client:

- Authorised JavaScript origins: `https://inqbeta.com`, `https://inqbeta.dev`
- Authorised redirect URIs: `https://inqbeta.com/channels/google`,
  `https://inqbeta.dev/channels/google`

## 7. Protection

Vercel's standard deployment protection covers Preview deployments, so
inqbeta.dev asks for a Vercel sign-in before it opens. Production is public;
nobody needs to know it is there until it is announced.

## 8. The test branch

```sh
git checkout -b test && git push -u origin test
```

Pushing to `test` deploys inqbeta.dev; merging to `main` deploys
inqbeta.com.

## Checks once it's up

- inqbeta.dev loads over HTTPS; make a passkey; the keychain entry says
  **inqbeta.dev**.
- Back up now on iPhone (share sheet) — the audit's last untested step.
- Connect Google Drive from inqbeta.dev.
- A call between the phone and the Mac on different networks.
- Do not make a real vault on inqbeta.com until you decide it is time; then
  make a recovery card straight away.
