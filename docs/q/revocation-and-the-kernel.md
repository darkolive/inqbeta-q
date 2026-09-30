# Revoking a drive you cannot find

**2026-09-20 — the fifth and last. Goes back to the incubator kernel doctrine
on purpose.**

> "I have a flash drive, 2026, it's in my drawer. That's my archive. We got
> robbed. I go rummaging through the drawer. I cannot find that flash drive. I
> need to revoke it."

Everything in Q is a DID — identity, places, channels, cards. So everything
can be *named*, and anything that can be named can be revoked with one
signature. That is real, and most systems cannot do it.

And then the part that has to be said plainly.

---

## Revocation cannot reach the drive

The thief has the bytes. No signature erases them.

This is the **fourth** time today the same truth has surfaced. A relay cannot
be made to delete. A DHT cannot be made to forget. An archive cannot be
checked from here. And now: a revocation cannot be made to travel.

> **The drive is safe because it was sealed, not because it was revoked.**

What revoking actually does, and all three are worth having:

1. **Stops the future.** Nothing that DID produces or claims is accepted
   again, by you or by anyone federated with you.
2. **Fixes the moment.** A signed, timestamped declaration that this place was
   compromised at a known time. That is the compliance artefact — an incident
   record wants the declaration and its time, not a promise about bytes.
3. **Scopes the damage.** Names what lived there, so you know what to re-key
   and whom to tell.

So Darren is right that this is an immediate, instant, defensible reaction.
Just not for the reason it feels like.

## The thing that must be said out loud

**You cannot revoke your way out of a key that still exists.**

If the drive held a vault sealed to his **own identity key**, then the thief
holds ciphertext that *his passkey* opens — not the drive's. Revoking the
drive changes that exposure by precisely nothing.

And it gets worse with this morning's finding: a `did:dht` identity key
**cannot be rotated**. So for an identity-sealed archive, there is no
recovering from it at all. Permanent, public, unfixable.

**The fix is architectural, not procedural: seal an archive to a key of its
own, never to the identity key.** Then losing a drive costs one key, and a key
can be destroyed. That single change is what turns revocation from a gesture
into a remedy, and it should happen before anyone puts a real archive on a
real drive.

`exposureAfter()` exists so a person is told which case they are in:

| what was on it | after revoking |
|---|---|
| opens with identity key, key is fixed | **permanent** — *revoking stops it being trusted from now on; it does not close what is already out there* |
| opens with identity key | **closable** — *change that key and re-seal, or this stays open* |
| own key, still held | **closable** — *destroy that key and the drive becomes noise, wherever it is* |
| own key, already gone | **closed** — *it is already noise* |
| not recorded | **unknown** — *assume it is readable and act accordingly* |

A person told "done" will not re-key and will not tell anyone. That is the
failure this function prevents.

## Back to the kernel, which already anticipated this

The incubator doctrine is where Darren remembered it. `Architecture-Whitepaper.md`
lists among the design invariants:

> - The kernel must remain minimal
> - Evidence must be append-only
> - Capabilities must derive from claims

And `State-of-the-Kernel.md`:

> The kernel does not judge intent. It does not assign guilt. It does not
> punish. It records, flags, and constrains.

Then the last line of `docs/security/kernel-guardrails.md`:

> **Intentionally Deferred:** … Capability expiration/**revocation** (future)

**Revocation was explicitly deferred in the incubator kernel.** This is that
gap, found from the other end, four years of thinking later. Worth noting it
was deferred rather than missed — the shape was right, the piece was known to
be absent.

## What a revocation may contain, and what must never be snuck in

A revocation is the **most widely distributed receipt in the system**. It has
to reach everyone who might accept that DID. Which makes it the last place
anything private belongs — the same rule as Mainline, the fifth application
today.

**The whole of it:**

| field | why |
|---|---|
| `subject` | the DID being revoked. Never a path, a label or a serial number |
| `by` | who declares it. Must control the subject |
| `at` | when. ISO 8601 |
| `because` | optional, free text, in the person's own words |
| `anchor` | optional witness to the time |

**And nothing else.** `checkRevocation()` refuses `content`, `payload`,
`data`, `address`, `location`, `where`, `path`, `serial`, `contents` — tested
one by one, so a future convenience has to come and argue for itself.

Three rules behind that shape:

- **The reason is free text on purpose.** A controlled vocabulary would mean
  the kernel understands reasons, and a kernel that understands reasons is a
  kernel that judges. It records, flags, constrains. It does not judge.
- **An unwitnessed time is your own word.** `timeStanding()` says so rather
  than implying proof: *fine for your own records; not proof to someone
  disputing it.* An anchor — a federation counter-signature, a hash chain — is
  what makes it hold up.
- **Found is not unrevoked.** `canBeUndone()` returns false. If the drive
  turns up in a coat pocket, it is enrolled as a new DID. A revocation that
  can be taken back is not a revocation, and an append-only journal cannot
  hold one.

158 tests pass.

## Next, in order

1. **Seal archives to their own key.** Nothing else here matters as much, and
   it is the difference between the `permanent` row of that table and the
   `closable` one.
2. A `q:revoke` receipt in `apps/q`, signed, appended, and shown as an event
   rather than a setting.
3. Then how a revocation reaches a federation — which is the first thing today
   that genuinely needs the network, and so needs §7 and §9 settled first.

## Sources

Internal (incubator): `docs/security/kernel-guardrails.md`,
`docs/security/incident-response.md`, `docs/wiki/Architecture-Whitepaper.md`,
`docs/wiki/State-of-the-Kernel.md`.
Internal (Q): `mainline.ts`, `places.ts`, `ways-in.ts`, `ucan/`,
`places-are-channels.md`, `copies-and-doors.md`.
