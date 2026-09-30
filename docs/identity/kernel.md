# Plugging into the receipt kernel

The kernel (`receipt.ts`, `verifier.ts`, after inQbeta's evidence model) asks very
little of an identity system. This is the whole contact surface.

## What the kernel needs

| The kernel needs | The identity gives | Where |
|---|---|---|
| A key to sign with | `identity.signing` (Ed25519 `CryptoKeyPair`) | `receipt.sign(r, by, keys)` |
| A public key to name the author | `identity.publicKey` (base64url) | `Author.publicKey`, `Signature.publicKey` |
| A way to open sealed bodies | `{ did, opening }` as an `Opener` | `check(parsed, { opener })` |
| Somewhere to keep evidence | `saveOut(into, name, text)` | the locked folder, or a download |

Nothing else crosses. The kernel never sees the PRF secret, the vault key or the
folder. The identity never decides whether a receipt holds up.

`signing-key.ts` is the switch: signed in, receipts are signed with the passkey
identity; signed out, with the older per-browser key, so nobody is ever stopped
from putting their name to something.

## The four questions stay four — and a fifth, kept apart

The verifier answers, and never lets one settle another:

1. **Does it hold up?** — signatures, chain, content hash.
2. **Can you read it?** — open / sealed / opened. *The passkey only ever changes this one.*
3. **Do you trust who signed it?** — never decidable by us.
4. **Does anybody vouch for them?** — the credential.

5. **Were they allowed?** — for a receipt made under someone else's power. The
   receipt names the UCAN invocation (`authority`, signed with the receipt); the
   bundle carries the tokens (`ucan`); the chain is walked back to the course's
   owner as it stood when the receipt was signed. Decidable, offline — and it
   never changes the answer to question 1. See [ucan-in-q.md](ucan-in-q.md).

A DID makes question 3 *answerable* — it names a key that can be followed — but
never answers it. A sealed receipt with no passkey still holds up; a wrong passkey
does not make it invalid (both asserted).

## The same rule as genesis

Genesis says a federation cannot exist without a person who signs it into being,
and the federation key signs back. The passkey identity is the person half of that:
a founder's own keys, rebuilt from their fingerprint, with nothing held by the
software. When founding gets a screen, it should found with the passkey identity.

## What a receipt must capture — and nothing more

A receipt is a capture, not a container. It needs:

| Field | Why it cannot be left out |
|---|---|
| `event` | what happened |
| `at` | when |
| `by` — the signer's key (DID) | who agreed to it |
| `subject` — e.g. `courseId` | what it is about |
| `contentHash` | **the pointer to the source.** Whoever holds the source can prove it is the one |
| `previousHash` | where it sits in the chain |
| `signature` | that `by` really agreed |

The body is optional and always was: the signature covers `contentHash`, not the
content. So the source file can live anywhere — in the locked folder, on a USB
stick, sealed to three reviewers — and the receipt still stands. Finding the source
again is a matter of hashing candidates, not trusting a path. A location hint can
travel with a receipt, but outside what is signed: a path is a claim, a hash is a
fact.

See [devices-and-branches.md](devices-and-branches.md) for what this becomes when a
person has more than one key.
