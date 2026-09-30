# Permissions — CRUD + Grant, locked into receipts

**Status: built as UCAN, 2026-09-16** — `packages/q-core/src/permissions.ts`; see
[ucan-in-q.md](ucan-in-q.md). From Darren, 2026-09-16, argued through the same day.

**How it was settled:** grants are standard UCAN delegations under `/inqbeta/…`;
passing a power on follows UCAN (anyone may pass on what they hold, only narrower,
and it always shows — so *Grant* is an audit trail rather than a gate); destroying a
whole thing needs a council approval (`/inqbeta/approve`) named in the destroy. The
JSON grant below was the proposal's shape; the built form is the UCAN delegation.

> *"You've got the create function — the person that spawns this new thing. Then
> update: someone who's reviewing can update, and that creates a new branch. Read —
> an open licence or 'require this key'. And delete: who has the kill switch. A
> system can ask for the kill switch… requesting keys and sending keys, all done
> through this simple system that's locked into the receipt."*

## The shape

Every permission is a receipt. Being allowed is holding a chain of receipts that
leads back to the thing's creation, each signed by someone entitled to sign it.
Any device can check that chain offline.

| Verb | What it is | How it is enforced |
|---|---|---|
| **Create** | `thing.created`, signed by the creator. Genesis for that thing; the creator holds every permission on it to start with. | Signature |
| **Read** | Open (a licence stated on the create receipt), or sealed to named DIDs. | **Encryption.** Granting read = wrapping the content key to the new DID (`sealTo`). |
| **Update** | Two permissions, as in git: **branch** (free to anyone who can read — a reviewer's disagreement needs nobody's key) and **merge** (bringing a branch into the main line — the real permission). | Signature on the merge receipt, checked against a merge grant |
| **Delete** | **Withdraw** (a dated receipt every reader shows), **shred** (destroy the content key; the receipt keeps only the hash), **revoke** (no key works from now on). | Receipt + key destruction |
| **Grant** | Handing a permission to someone else. Without it as its own verb, anyone holding Update could pass it on. | Signature; **you can only grant what you hold, never more** |

A grant receipt:

```json
{
  "event": "permission.granted",
  "issuer": "did:key:z6Mk…creator",
  "audience": "did:key:z6Mk…reviewer",
  "subject": "<hash of the thing's create receipt>",
  "can": ["read", "branch"],
  "caveats": { "until": "2026-10-01T00:00:00Z", "branch": "review-1" },
  "parent": "<hash of the grant that gave the issuer this power, or null for the creator>",
  "signature": "…"
}
```

This is the capability pattern the UCAN standard uses, with the same `did:key`
identities — worth aligning with so other systems can read Q's grants.
See [ucan-analysis.md](ucan-analysis.md) for the full mapping, including the two
places UCAN disagrees with this proposal (re-granting and the two-signature kill switch).

## The arguments that shaped it

1. **Grant is a fifth verb.** Otherwise delegation is uncontrolled.
2. **Branch is free; merge is the permission.** Criticism must never need the
   criticised person's key.
3. **Read is only as real as the encryption.** A read grant persuades a polite
   server; a file already on someone's device is protected only if it is sealed.
   Taking read away works forward only.
4. **Delete cannot erase copies in an offline, append-only world.** It withdraws,
   shreds and revokes. Personal data never goes into a receipt — only a hash
   pointer — so shredding the source is a real erasure (the right-to-erasure answer).
5. **The kill switch is limited, or it becomes a censorship switch.** You may
   withdraw your own work. Killing the whole thing needs the creator **and** a
   second signature (e.g. the council). **Nobody deletes someone else's branch**;
   the main line can only decline to merge it. Past work survives — the same
   principle as membership.
6. **A system may ask; it is never handed.** A request is a receipt. A grant of
   update or delete to a *system* names the person who approved it, has a short
   expiry and a narrow scope, and delete needs two people.
7. **A fifth question, kept apart.** The verifier's four — *does it hold up · can
   you read it · do you trust them · does anybody vouch* — gain **are they
   allowed?** Unlike trust, it is decidable: walk the grants back to the create.
8. **Taking back is never instant offline.** Short expiries, and saying plainly
   "this has expired", as credentials already do.

## How it sits with Q

- Q signs every grant, request and merge through the window, and shows what is
  being granted before it signs.
- Read grants are seals: Q's `sealTo` already wraps a content key per DID.
- Shredding is Q deleting a vault key or a wrapped key; the `.dsv` file becomes
  unopenable by anyone.
- Device links ([devices-and-branches.md](devices-and-branches.md)) are grants
  whose subject is the identity itself.

## Decisions for Darren

1. Who is the default second signature for killing a thing — the council, a named
   co-owner, or chosen at creation?
2. Default read for a new thing: open, or sealed to the creator?
3. Default expiry for grants to systems.
4. Is a merge ever automatic (non-overlapping changes), or always a person's act?
