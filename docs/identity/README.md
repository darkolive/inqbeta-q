# Passkey identity

A sign-in system with no accounts, no server and nothing stored. Your fingerprint
unlocks a passkey; the passkey rebuilds your identity — the same one every time —
and that identity signs receipts, opens what was sealed to you, and locks your
folder. It works offline.

Built for DoStudy on 2026-09-16, then lifted out the same day into **Q**
(`packages/q-core`, `apps/q`). Every site signs in on its own — no site depends on
another being reachable — and a site's key is made one person with your root by a
signed **link receipt** (`packages/q-core/src/links.ts`). It plugs into the receipt
kernel (inQbeta's evidence model) rather than depending on DoStudy.

*History:* for a few hours on 2026-09-16 sites asked a "Q window" to sign for them.
Darren rejected that — it made signing in depend on a second site being reachable —
and it was removed the same day.

> File paths under `src/lib/ceqf/` for `did`, `passkey`, `vault`, `folder` in the
> documents below now live in `packages/q-core/src/`. The identity phrase is now
> `https://schemas.inqbeta.local/governance/Identity.json` (was `dostudy.identity/1`).

## The promise, in one line each

- **One touch, one identity.** Same passkey, same DID, on every device the passkey syncs to.
- **Nothing kept by us.** No account, no password, no database row. The passkey lives in the person's own keychain.
- **Offline.** Signing in, signing, sealing, opening and the locked folder all run in the browser with the network off.
- **Answerable, not trusted.** A DID says who signed. Whether to believe them stays the reader's call — the four questions of the verifier are untouched.

## The documents

| | |
|---|---|
| [how-it-works.md](how-it-works.md) | The key derivation, did:key, sealing to people, the locked folder, the file formats |
| [kernel.md](kernel.md) | How it plugs into the receipt kernel — what a receipt needs from it and nothing more |
| [threat-model.md](threat-model.md) | What it protects, what it does not, and what it costs |
| [using-it.md](using-it.md) | The DoStudy screens: header, tabs, Data, Passkey — and how to test them |
| [devices-and-branches.md](devices-and-branches.md) | **Proposal, not built.** Several devices, one identity; every attestation a branch |
| [permissions.md](permissions.md) | **Built as UCAN.** CRUD + Grant, locked into receipts |
| [ucan-analysis.md](ucan-analysis.md) | **Analysis.** Adopting UCAN for permissions and links — fit, conflicts, risks, phased plan, decisions |
| [ucan-in-q.md](ucan-in-q.md) | **Built.** UCAN in q-core: tokens, policies, revocation, containers, permissions, links, the fifth question — and the test vectors that prove it |

## The module

`packages/q-core` — no dependencies, browser WebCrypto only.

```
src/canonical.ts   canonical JSON, SHA-256, base64url — shared with the receipt kernel
src/did.ts         did:key encode/decode, Ed25519 → X25519, PKCS#8 wrappers
src/passkey.ts     WebAuthn PRF → Identity; make, unlock, hold, forget; signerFor, openerFor
src/seal.ts        sealTo / openWith; the Signer and Opener interfaces
src/vault.ts       lockBytes / unlockBytes — the .dsv file format
src/folder.ts      the chosen folder: remember, check, list, save, lock, delete
src/links.ts       link receipts: requestLink, approveLink, checkLink, rootOf, unlinkKey
src/replicas.ts    copy locations: add, allow, sync (both ways, never overwrite)
test/              node --test
```

`apps/q` (port 3100) — the dashboard: keys, devices, files, copy locations, federations.
`apps/darkolive` (port 5173) — `src/lib/ceqf/identity.ts` signs in locally; `SiteLink.svelte` links its key to your root.

Tests: `pnpm test` — q-core's tests and the DoStudy smoke test.

## Where it runs

| | Sign in | Seal / open | Locked folder | Offline copy |
|---|---|---|---|---|
| Chrome, Edge (Mac, Windows) | yes | yes | yes | yes |
| Safari (Mac) | yes | yes | **no** — files download instead | yes |
| Firefox | depends on the passkey provider | yes | **no** | yes |
| Chrome on Android | yes | yes | **no** folder picker | yes |
| Safari on iPhone | yes | yes | **no** | yes |

"Sign in" needs the WebAuthn PRF extension from the passkey provider. iCloud
Keychain, Google Password Manager and recent 1Password provide it; the page says
plainly when one does not.
