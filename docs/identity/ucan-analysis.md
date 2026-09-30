# Can Q adopt UCAN fully? An analysis

**Status: adopted and built the same day** — see [ucan-in-q.md](ucan-in-q.md) for what was built,
the decisions taken, and what building it found. This page is the analysis as written.

**Original status: analysis and recommendation, nothing built.** Written 2026-09-16, at Darren's
request: *"a full analysis to see if we can adopt the UCAN specification fully and take
it forward."*

## The short answer

**Yes, for permissions. No, as a replacement for everything.**

UCAN (User-Controlled Authorization Networks) answers one question: *is this key
allowed to do this?* It does that very well, offline, with the same `did:key` Ed25519
keys Q already makes from your fingerprint. Q's **permissions** (CRUD + Grant) should be
UCAN, in full and to the letter, so any UCAN tool can read Q's grants.

UCAN does not answer Q's other questions, and should not be bent to:

| Q question | Answered by | UCAN's part |
|---|---|---|
| Does it hold up? (evidence) | kernel receipts | none. A UCAN *Receipt* records the result of a command, not a piece of evidence |
| Can you read it? | sealing (`sealTo`) | none. UCAN has no encryption |
| Whose key is this? | link receipts | partly: a "powerline" delegation says *K may act for R*, not *K is R* |
| **Are they allowed?** (the fifth question, from permissions.md) | **UCAN** | all of it |

So: adopt UCAN fully *inside its own lane*, and have evidence receipts point at the
UCAN that allowed them.

## What UCAN is (as of September 2026)

| Part | What it does | Status |
|---|---|---|
| Core spec | the model, `did:key`, envelopes | README says "Version 1.0.0"; the repo page and the libraries say **1.0.0-rc.1**; no GitHub releases |
| Delegation | "`iss` lets `aud` run `cmd` on `sub`, within `pol`, until `exp`" | 1.0.0 (same caveat) |
| Invocation | "`iss` runs `cmd` on `sub` with `args`; here are my proofs (`prf`)" | 1.0.0 (same caveat) |
| Revocation | an invocation of `/ucan/revoke` naming a delegation's CID. Any issuer up the chain may revoke. Append-only, gossiped, offline-tolerant | 1.0.0-rc.1 |
| Receipt | the signed result of an invocation (`out: ok / error`) | v0.1.1, in a separate repo |
| Promise | pipelining one result into the next command | draft |
| Container (`ctn-v1`) | carrying a bundle of tokens as one blob (CBOR, optional gzip, base64) | spec'd |
| Varsig | a header that says which signature algorithm and encoding were used | v1 |

**How it is written.** A token is DAG-CBOR: `[signature, { h: <varsig header>,
"ucan/dlg@1.0.0": payload }]`. Tokens are named by CIDv1 (SHA-256). Times are Unix
seconds. Ed25519 is the recommended algorithm; P-256 and secp256k1 must also be
accepted.

**Commands and policy.** Commands are paths (`/crud/read`, `/msg/send`), and a
delegation of `/crud` covers `/crud/read`. `/` means everything. The policy (`pol`) is a
small jq-like language over the invocation's arguments: `==`, `!=`, `<`, `like`, `and`,
`or`, `not`, `all`, `any`.

**Powerline.** A delegation with `sub: null` passes on *everything the issuer can do*.
The spec's own example is one user across several devices without sharing keys, which is
exactly Q's multi-device case.

**Libraries.**

| Language | Library | UCAN version | Gaps |
|---|---|---|---|
| Go (kernel) | `github.com/ucan-wg/go-ucan` | 1.0.0-rc.1 | delegation, invocation and container done; **revocation and promise not implemented** |
| JavaScript (browser, Q, Dark Olive) | `iso-ucan` (hugomrdias/iso-repo) | 1.0 line | custom signers (`EdDSASigner`), works in browsers; small, one maintainer |
| Rust | `ucan` (ucan-wg/rs-ucan), crate 0.8 | 1.0.0-rc.1 | "work in progress", "not formally audited" |
| Swift (iOS Q) | **none found** | — | own implementation, or Rust through FFI |

The biggest production user is Storacha (ucanto). I could not confirm which spec version
ucanto follows, so it should not be treated as proof that 1.0 is battle-tested.

## How Q's design maps onto UCAN

### Keys: a clean fit

The passkey PRF → HKDF → Ed25519 → `did:key:z6Mk…` path is UCAN's recommended key type
with no changes. UCAN never sees WebAuthn. It sees an Ed25519 signature, which is what Q
already makes. The same DID signs kernel receipts and UCANs.

`q-core` already has a `Signer` (`did`, `publicKey`, `signCanonical`). UCAN needs one
more method, "sign these bytes", to plug into iso-ucan's custom signer.

*Side note, not a UCAN issue:* `passkey.ts` imports the Ed25519 private key as
extractable (to read its public half from the JWK). It could be re-imported
non-extractable straight after. This is worth doing whether or not UCAN goes ahead.

### Permissions (CRUD + Grant): a fit, with two real conflicts

| permissions.md | In UCAN |
|---|---|
| Every permission is a receipt; a chain back to creation | a delegation chain (`prf`), root first. Native |
| **Create**: creator holds every permission | the creator is the `sub` (resource owner) and needs no delegation. Per-thing permissions go in `pol`: `[["==", ".args.thing", "<cid of the create receipt>"]]` |
| **Read**: open, or sealed to DIDs | a `/q/read` delegation **records** the grant; `sealTo` **enforces** it. Both happen together, as permissions.md already says |
| **Update: branch free** | no UCAN needed: branching needs nobody's permission |
| **Update: merge gated** | `/q/merge` delegation; policy can pin the branch (`.args.branch`) |
| **Delete: withdraw / shred** | `/q/withdraw`, `/q/shred` commands. Shredding a key stays a Q action |
| **Delete: revoke** | `/ucan/revoke`, standard |
| **"You can only grant what you hold"** | native: a delegation can only narrow (attenuation) |
| `caveats.until` | `exp` (Unix seconds) |
| `parent` | `prf` |
| A system may ask, never be handed | the ask is an invocation of `/q/request` by the system; the grant is a normal delegation that names the approving person in `meta` |

**Conflict 1: Grant as a fifth verb.** permissions.md says that without Grant as its
own permission, "anyone holding Update could pass it on". **UCAN 1.0 has no way to stop
re-delegation**: no "non-delegable" flag and no depth limit. This is deliberate. Anyone
holding a power can always act as a proxy for someone else, so a ban cannot be enforced
by cryptography anyway. What UCAN gives instead is **visibility**: every pass-on is in the
proof chain, signed, so the chain shows who handed it on.

The honest options:

- **(a) Follow UCAN.** Grant stops being a gate and becomes an audit trail. "Nobody may
  pass this on" becomes a stated expectation, and a breach is visible and attributable.
- **(b) Keep a Q rule on top.** Q's verifier rejects chains longer than the grant allows,
  for example with `meta.q.regrant: false`. Standard UCAN tools would still accept those
  chains, so this is a Q extension and not "UCAN fully".

**Conflict 2: the two-signature kill switch.** Killing a whole thing needs the creator
**and** a second signature (the council). **UCAN delegations are signed by the issuer
alone; there is no multi-signature or threshold.** It can be approximated: `/q/destroy`
could require `.args.approval` (the CID of a council-signed receipt) through policy, and
Q's executor checks that receipt. The policy language can require the field to be
present, but only Q's code can check what it points to. So this is a Q convention built
on UCAN, not UCAN itself.

### Link receipts: expressible, but they say something slightly different

A Q link says **"K is R"**, signed by **both** K and R (the genesis rule: no key is
claimed without its owner agreeing). It covers everything K ever signed. An unlink
applies forward only.

A UCAN powerline delegation (`iss: R, aud: K, sub: null, cmd: "/"`) says **"K may act
for R"**, signed by R alone, valid from `nbf` to `exp`.

A faithful mapping uses two standard tokens:

1. K's **request**: an invocation by K of `/q/identity/link`, with `args: { root: R,
   label, origin }`. This is K's own signature, its consent.
2. R's **approval**: a powerline delegation R → K, with `meta: { "q/link": <CID of the
   request> }`.

The Q verifier treats the pair as a link. Unlinking becomes `/ucan/revoke` on the
delegation, which UCAN already makes forward-only. The "covers past signatures" rule
stays a Q reading: UCAN checks authority when something is *run*, not who a key belonged
to last year.

### Evidence receipts: keep them, point them at UCAN

Kernel receipts are canonical JSON with detached Ed25519 signatures. They are readable by
eye, which matters for evidence, and they are what Stage 1 of inQbeta is built on.

Re-encoding them as DAG-CBOR UCAN Receipts would lose readability and misuse a spec
meant for command results. Instead:

- A receipt made under someone else's permission carries
  `authority: <CID of the UCAN invocation>`, and the bundle carries the tokens as a
  `ctn-v1` container.
- The verifier's fifth question, "are they allowed?", checks that chain with the UCAN
  library. The other four questions don't change.

### Content addresses: easy

`content://sha256/<hex>` and a CIDv1 (`raw` codec, SHA-256, `bafkrei…`) hold the same
digest. q-core can give both, and UCAN policies and `args` should use the CID. File
names can stay as they are (`<hex>.dsv`) because the mapping is exact.

### Offline and nodes: a good fit

UCAN is built to be checked with no server, which matches Q's rule that nothing is ever
looked up. Revocations are the one thing that must *travel*. The copy locations and
community nodes (SeaweedFS) already carry files, so a `revocations/` store in the folder,
synced like everything else, is the natural home. The same caution as the spec applies: a
revocation takes effect where it has arrived.

### Sealing: untouched

UCAN has nothing to say about encryption. `sealTo` / `openWith` and the locked folder
stay exactly as they are.

## Risks

1. **Version ambiguity.** "1.0.0" in one place, "1.0.0-rc.1" in another; revocation is
   rc; Receipt is v0.1.1; Promise is a draft. Pin to 1.0.0-rc.1 and to its test vectors,
   and write the version into every Q token's metadata.
2. **Thin libraries.** The JS library has one maintainer. The Go library lacks revocation.
   Rust is unaudited. There is no Swift library. The Go kernel would need its own
   revocation check, which is simple (is this CID in the store?).
3. **Two encodings in one system.** DAG-CBOR for permissions, canonical JSON for evidence.
   This is manageable because they stay in separate lanes, but it needs a clear
   boundary in q-core (`ucan.ts`).
4. **Stage 1 posture.** The inQbeta README forbids login and self-sovereign-identity
   claims. UCAN stays inside Q and inqbeta-q until an ADR says otherwise, and `~/inQbeta`
   is not touched.
5. **Revocation lag offline.** This is inherent. Short `exp` times on powerful grants
   (merge, destroy) limit the damage.

## Recommended path

| Phase | Work | Proves |
|---|---|---|
| 0: spike | `q-core/src/ucan.ts`: iso-ucan with Q's passkey `Signer`; make and check a delegation and an invocation; round-trip the same bytes through go-ucan; run the spec test vectors | the browser key and the Go kernel agree |
| 1: permissions | rewrite permissions.md as a **command namespace** (`/q/read`, `/q/merge`, `/q/withdraw`, `/q/shred`, `/q/destroy`, `/q/request`) with policies; the verifier's fifth question | CRUD + Grant in standard tokens |
| 2: links | request invocation + powerline delegation; unlink = `/ucan/revoke`; keep reading existing KeyLink JSON | multi-device without key sharing, the standard way |
| 3: CIDs | `cid()` beside `contentAddress()` | content addresses UCAN can name |
| 4: revocations | a `revocations/` store in the folder, synced by copy locations and nodes | offline revoke that travels |
| 5: kernel | receipts carry `authority` + a `ctn-v1` container; the Go kernel checks them with go-ucan | evidence says who allowed it |
| 6: iOS | Swift implementation against the same test vectors (or rs-ucan through FFI) | the App Store Q speaks the same tokens |

Each phase is small enough to test on its own, and nothing already signed stops holding
up.

## Decisions for Darren

1. **Scope.** UCAN for permissions and links only, with evidence receipts kept as they
   are (recommended)? Or evidence re-encoded too?
2. **Grant.** Follow UCAN (anyone may pass on what they hold, and it always shows), or
   keep a Q-only no-regrant rule and accept that it is an extension?
3. **Kill switch.** Is the council-approval convention on `/q/destroy` acceptable, given
   UCAN has no two-signature delegation?
4. **Libraries.** iso-ucan + go-ucan, or a small Q-owned TypeScript implementation (Q
   already has canonical encoding, SHA-256 and Ed25519; it would add DAG-CBOR and
   varsig)?
5. **Namespace.** `/q/…` for commands, or a name tied to the schema address
   (`/inqbeta/…`)?

## Sources

- UCAN spec: https://github.com/ucan-wg/spec
- Delegation: https://github.com/ucan-wg/delegation
- Invocation: https://github.com/ucan-wg/invocation
- Revocation: https://github.com/ucan-wg/revocation
- Receipt: https://github.com/ucan-wg/receipt
- Overview, libraries, container, varsig: https://ucan.xyz/specification/ · https://ucan.xyz/libraries/
- Go: https://github.com/ucan-wg/go-ucan · Rust: https://github.com/ucan-wg/rs-ucan
- JS: https://github.com/hugomrdias/iso-repo (iso-ucan)
- Storacha's UCAN use: https://docs.storacha.network/concepts/ucan/ · https://github.com/storacha/ucanto
