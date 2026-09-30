# UCAN in Q — what was built

**Status: built 2026-09-16.** Follows [ucan-analysis.md](ucan-analysis.md). Darren's
answers:

- adopt UCAN for permissions and links, and keep evidence receipts as they are;
- follow UCAN on passing powers on;
- destroying a thing needs a council approval;
- commands start with `/inqbeta`.

Q speaks UCAN 1.0 with its own small implementation in `packages/q-core/src/ucan/`
(about 1,500 lines, no dependencies). The spec's own test vectors are what prove it
right, not this document.

## Why Q has its own implementation

- **No packages available.** The package registry refuses `iso-ucan` (and this
  environment can't reach it). Go modules can't be fetched either, so go-ucan can't
  be run here.
- **Q already had most of the parts:** SHA-256, Ed25519 from the passkey, base58 and
  canonical encoding. What was missing was DAG-CBOR, CIDs, varsig, the policy
  language and chain checking.
- **It is checked against the spec,** byte for byte (see [Proof](#proof)).

## The pieces

| File | What it does |
|---|---|
| `ucan/cbor.ts` | Strict DAG-CBOR. It reads only the canonical subset and returns each item's exact bytes, so a signature is checked over what arrived, not over a re-encoding. |
| `ucan/cid.ts` | CIDv1 with SHA-256, written in base58btc (`zdpu…`, as UCAN writes them) or base32 (`bafy…`). `cidFromHex` turns a locked file's name into a `bafkrei…` CID. |
| `ucan/varsig.ts` | The 8-byte Ed25519 + DAG-CBOR header. Other algorithms are named when refusing them, but not verified yet. |
| `ucan/token.ts` | `delegate`, `invoke`, `readToken`. Writes `ucan/dlg@1.0.0` / `ucan/inv@1.0.0`, and also reads the `-rc.1` tags. |
| `ucan/policy.ts` | The policy language: selectors, `== != < <= > >= like and or not all any`. Missing data never passes, and `not` doesn't rescue it. A selector ending in `?` passes when the value is absent. |
| `ucan/validate.ts` | `checkInvocation`: time windows, principal alignment, subject, powerlines, commands, policies and revocations, all as of a given moment. |
| `ucan/revoke.ts` | `revoke` (`/ucan/revoke`) and `asRevocation`, which checks the path witness. |
| `ucan/container.ts` | `ctn-v1` in all six forms (raw or base64 / base64url, with or without gzip), sorted and de-duplicated. |
| `ucan/store.ts` | `folderStore` (`ucan/<cid>.ucan` and `ucan/revoked/<cid>.ucan` in the folder), `browserStore` (one container in localStorage) and `gather`. |
| `permissions.ts` | CRUD + Grant as UCAN (below). |
| `links.ts` | Links as UCAN (below). KeyLink JSON is still read. |

The passkey `Signer` gained `signBytes`. The page never holds an exportable
signing key: it is imported, read for its public half, then imported again as
non-extractable.

## Permissions (`permissions.ts`)

| Power | Command | Notes |
|---|---|---|
| everything | `/inqbeta` | Covers all the commands below. |
| read | `/inqbeta/read` | Records a read grant. **Sealing** is what enforces it. |
| merge | `/inqbeta/merge` | Can be limited to certain branches: `like .branch "review-*"`. |
| withdraw | `/inqbeta/withdraw` | |
| shred | `/inqbeta/shred` | |
| destroy | `/inqbeta/destroy` | `args.approval` must be the CID of a council approval. |
| (ask) | `/inqbeta/request` | A system asking for a power. A message, not a power. |
| (second signature) | `/inqbeta/approve` | Council agreement to a destroy. |

These need no permission at all:

- **Create:** signing the create receipt makes you the owner, and the owner is the
  UCAN subject.
- **Branch:** anyone who can read may branch.

**Rules:**

- **One thing per grant.** Every grant pins its thing by policy
  (`== .thing <id>`), so a grant never reaches the owner's other things.
- **Passing a power on:** `grant(signer, { …, from })` passes on a power you were
  given. UCAN only lets it be the same or narrower, and every pass-on shows in the
  chain.
- **Systems:** `ask` → `answer` gives a system a grant that is narrow (one thing,
  one command) and short (seven days). It names the request and the person who
  approved it. A system is never handed `destroy` or `/inqbeta`.
- **Destroy:** needs `approveDestroy(council, …)`. `isAllowed` checks that the
  approval:
  - is for the same thing and owner;
  - is signed by someone other than the owner and the actor;
  - comes from a listed second signer;
  - hasn't expired.
- **Checking:** `isAllowed(invocation, { proofs, revocations, at, approvals,
  council })` answers the fifth question, and throws a `UcanError` whose `code`
  says why not.

## Links (`links.ts`)

1. **The request:** `requestLinkUcan(siteKey, root, label, origin)` makes an
   invocation of `/inqbeta/identity/link`, signed by the site key about itself.
2. **The approval:** `approveLinkUcan(root, request)` makes a powerline
   delegation root → site key (`sub: null`, `cmd: "/"`), with
   `meta["inqbeta/link"]` set to the request's CID.
3. **Unlinking:** `unlinkKeyUcan(root, approval)` revokes the approval.
4. **Whose key is this?** `rootOfUcan(did, tokens, revocations, at)` answers it.
   A link counts only when:
   - the request is signed by the key itself;
   - the approval answers that exact request;
   - the approval comes from the root the request named;
   - the root hasn't revoked it on or before `at`.

Sites and Q pass links around as **one line of text**: a base64url container that
starts with `C`. `readLinkParcel` accepts either that or the older JSON.

## Evidence (`apps/darkolive`)

- **`authority`:** a receipt made under someone else's power carries
  `authority: <invocation CID>`. It is signed with the rest of the receipt, so it
  can't be added or swapped afterwards.
- **`ucan` in the bundle:** the tokens travel as a container, which also carries
  the site-key link.
- **The fifth question:** `check()` answers it in `allowed`, one entry per receipt
  that claims a power. Each is checked as of the receipt's `at`. A failure never
  changes `holds`.
- **Council:** the reader may pass `council` (the second signers they accept).
  Without it, the page names the second signer and leaves the judgement to the
  reader, as it does for trust.

## Where things are shown

- **Q → Keys:**
  - linked keys, whether written as UCAN or JSON (unlinking writes a revocation);
  - a new **Permissions** section: powers given (with *Take back…*) and powers
    held.
- **Q → Keys → Approve a link request:** takes the pasted line of text, answers it
  and keeps both tokens in the folder.
- **Dark Olive → Passkey → Link to your root identity:** makes the request as a
  line of text and keeps the answered link.
- **Dark Olive → Verify:** a *Were they allowed* section.
- **Copy locations:** carry `ucan/` files like locked files. Each name is checked
  against its CID and nothing is ever overwritten, so revocations travel.

## Proof

`packages/q-core/test/ucan.test.ts` and `permissions.test.ts`, run with
`pnpm --filter @inqbeta/q-core test` (27 tests), cover:

- **Delegation vectors** from the spec and from go-ucan: read, then **re-signed
  from the same key and nonce to identical bytes and CID**.
- **All 20 invocation vectors:** 7 valid ones pass, and 13 invalid ones fail with
  the **same error name** the spec gives.
- **All policy vectors.**
- **All six container vectors** read correctly.
- **Q's own chains:**
  - powerline under a narrower grant;
  - wrong branch, wrong thing and too-wide command refused;
  - revocations: who may revoke, and forward only;
  - destroy with and without a valid second signature;
  - system requests;
  - links in a container, a forged answer, and unlinking.

`apps/darkolive` smoke test (`npm test`), Passkey identity section:

- the verifier follows a UCAN link to its root;
- an allowed merge is shown as allowed;
- missing, swapped, wrong-course, too-wide and taken-back powers are not;
- `authority` is covered by the signature.

## Things found while building

1. **Tag versions differ.** The spec's delegation tag is `ucan/dlg@1.0.0`, but
   go-ucan writes `ucan/dlg@1.0.0-rc.1`. Q writes 1.0.0 and reads both, so **go-ucan
   as it stands would refuse Q's delegations.**
2. **Proof order may differ.** The spec (and its vectors) list proofs **root
   first**. go-ucan's `verifyProofs` appears to walk them the other way. Q follows
   the spec. Check this before relying on go-ucan against Q tokens.
3. **Upstream `policy.json` isn't valid JSON.** Our copy removes one stray pair of
   braces (see `test/fixtures/ucan/README.md`).
4. **The container vectors aren't writer vectors.** Their tokens aren't in the
   bytewise order writers must now use, and they carry an older varsig header.
   They test reading only.
5. **Commands:** every proof must cover the command being run. That is the same
   power as "each narrows the last", and it lets a `/` powerline sit under a
   narrower grant, as the spec's own device example needs.
6. **Revocation dates are the revoker's word.** A revoker could backdate one to
   undo evidence retroactively. Evidence that matters should also be anchored
   (the journal) so a backdated revocation shows up as a dispute.
7. **P-256 and secp256k1 aren't verified yet.** The spec requires them. Q only
   ever signs with Ed25519, so this matters only when reading other people's
   tokens.
8. **Not checked here:**
   - `apps/q` couldn't be built in this environment (a native module is missing),
     but its changed components compile and pass the type check;
   - no live round trip with go-ucan (Go modules couldn't be fetched).

## For the iOS app (Swift)

There's no Swift UCAN library. The Swift port should:

- implement the same modules;
- run the same fixtures in `packages/q-core/test/fixtures/ucan/`;
- reproduce the byte-for-byte delegation test.

CryptoKit's `Curve25519.Signing` gives Ed25519, and DAG-CBOR is the ~250-line
subset in `cbor.ts`.
