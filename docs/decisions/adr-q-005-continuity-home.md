# ADR-Q-005: A continuity home — preserve what signs

**Status: accepted, 25 September 2026 (Darren: "option B").**
Follows the audit of 25 September (*Q audit — storage channels and the incubator
doctrine*). Supersedes the line in `passkey.ts` that says losing the passkey
loses everything "because there is nothing held anywhere to reset from".

**Built, 25 September (steps 1–5):** Keys → *Ways back in* makes a recovery
card (shown once; saved only after you type its last group back), adds a
security key or a passkey on another device, and removes a way (never the
last). Sign-in: founding passkeys work exactly as before; a way-in passkey
opens the envelope, or asks for a backup and opens the vault from it
(`q-core/ways-back-in.ts`, `passkey.ts`, `WaysBackIn.svelte`, `SignIn.svelte`).
Step 5, 25 September: the recovery card signs you in — Find → Unlock → Sign → Reconnect.

**Core:** `q-core/continuity.ts` — wrap, open, sign and
check the envelope; add and remove ways in; the recovery card format. Nine tests
(`test/continuity.test.ts`, 11 with §6). **Not yet wired** into sign-in, Keys or backups;
see *Build order*.

---

## The problem, said plainly

Q's seed is one passkey's PRF output. The DID, the vault key and every site key
sealed to the DID all come from it. So:

- **Lose that passkey and everything sealed to it stays sealed.** Every backup
  is a locked box with the key inside one keychain. Ten perfect copies do not
  help.
- **The DID is tied to a domain.** A passkey belongs to one site, so localhost,
  a Vercel preview and the real Q each make a *different* DID. Moving Q to a
  new domain would orphan every vault made before the move.
- **Publish is live** (`66a651f`), so the Dark Olive site key — an asset — now
  sits behind that one passkey. ADR-Q-003 said this phase must come before that.

The incubator names exactly this (T2-SOV-006 §3.1; recovery charter §7): a
passkey is a **verification carrier**, *re-bindable, not continuity*. The
continuity home holds **the DID, the Ed25519 seed and an unlock envelope**, and
the rule is **preserve what signs; rebuild what displays**.

## Decision

**1. The seed stays; the envelope is added.** For everyone who already has a
DID, the founding passkey's PRF output remains the seed. Nothing is re-derived
and no DID changes. What is new is a small signed file, `continuity.json`, that
holds the same 32-byte seed wrapped once for each *other* way back in:

| Way in | Its secret | What it is for |
|---|---|---|
| **passkey** | that passkey's PRF output | a second device, a hardware key, Q on another domain |
| **recovery** | a 32-byte recovery key, printed on a card | when every passkey is gone |

Each wrap is AES-GCM-256 under HKDF of the secret, with the DID and the wrap's
own description as additional data, so a wrap cannot be moved onto another
person's envelope or quietly relabelled.

**2. The envelope is signed by the DID it serves.** Only the seed can sign, so
nobody without it can add a way in. Anyone can check whose it is without
opening anything — the same property that made "open from backup" work.

**3. It travels everywhere the vault goes, in the clear.** `continuity.json`
sits at the top of the vault beside `dostudy.json`, goes into every backup and
every storage channel, and a copy is kept in the browser. It is ciphertext and
a signature; the only thing it reveals is the DID and how many ways in there
are. It *must* be readable before unlocking — that is its job.

**4. The recovery key never travels.** It is shown once, as a card to print or
write down (11 groups of five characters, with a check that catches a typo). It
is never emailed, never stored in a channel, never kept by Q. The incubator is
explicit: *plaintext signing keys in email* is an unbounded disclosure channel,
and a recovery key is as powerful as the signing key.

**5. A passkey for each world.** A personal passkey and a business passkey are
two founding passkeys: two seeds, two DIDs, two envelopes, two recovery cards,
their own storage channels and their own dashboard layout (itself a receipt in
that world's vault). Nothing crosses unless a link is signed (`links.ts`). The
passkey's name in the keychain says which world it opens ("Q — Business").
If both passkeys sync through one Apple or Google account, that account reaches
both worlds; for real separation, the business passkey lives on a hardware key.

**6. A first-time person is untouched; nobody else gets a DID by accident.**
Darren: *"create a new user … first time user. They're not going to have any
history. So let's make sure that's not affected."* The passkey itself says which
it is, through its WebAuthn user handle (`passkeyRole()` in `continuity.ts`):

| Passkey | How it was made | Its handle | What sign-in does |
|---|---|---|---|
| **Founding** | *Create* on the landing page — a new person, or a new world | random, as today | PRF output **is** the seed. New DID at once, nothing asked. Every passkey made before this ADR is founding, so none of them changes |
| **Way in** | *Add a way back in* under Keys, while signed in | `q1w` + a hash of the DID | PRF output only opens the envelope. If the envelope cannot be found, Q asks for a backup or a channel — it never mints a stranger |

Two tests hold this: a random handle is always founding, and a way-in passkey
fits its own envelope and no other.

## The recovery ritual (charter §3)

```
Find       the recovery card, or any backup — continuity.json is inside
Unlock     type the card, or touch any passkey that is a way in
Sign       the seed rebuilds the same DID; Q signs a new way in for this device
Reconnect  open the vault from the backup or a channel, at your own pace
```

The first word on screen is never *restore*, *reset* or *verify your identity*.

## Build order

1. ✅ `continuity.ts` and its tests (pure; no behaviour change).
2. ✅ Carry `continuity.json`: `belongsInVault`, backups, `backupOwner` reads it;
   on restore the envelope signed later stands (`keepEnvelope`).
3. ✅ Keys → **Ways back in**: list the ways, add this device's passkey (one
   touch re-derives the seed; the seed is never held between actions), make the
   recovery card (shown once, printable), remove a way (never the last).
4. ✅ Sign-in: founding passkey → seed exactly as today (first-time users
   included); way-in passkey → open the envelope, or ask for it (§6).
5. ✅ Recovery screen: the four verbs above, one per step, pause always allowed
   ("Lost your passkey? Use your recovery card" on sign-in; `recoverWithCard`,
   `RecoverWithCard.svelte`, state kept in `lib/recovery.svelte.ts` so the
   ritual survives the sign-in it causes).
6. Worlds (to do): name the passkey's world at creation; show which world is open.
7. ✅ Tell the truth on `/network`: a vault with no second way in says so, first.
   Ways are counted by fate (`waysStanding`): passkeys in one keychain are one
   way; a recovery card or a security key is its own.

Each step lands with tests before the next starts.

## Non-claims

This does **not**:

- protect against someone who holds your recovery card, or who can unlock a
  device holding one of your passkeys — those *are* ways in, by design;
- rotate a compromised seed (that is a new DID and a signed succession — later,
  with `revocation.ts`);
- add threshold or shared recovery (2-of-3 among people you trust) — a later
  ADR, alongside site-key handover in ADR-Q-003 §8;
- use a passphrase in place of the recovery key (it would need a slow KDF such
  as Argon2 to be safe; not now);
- make any server a party to recovery. Nothing here needs Q, Dark Olive or any
  company to exist.

## Forbidden assumptions

- **Do not** treat the envelope as secret. It is public by design; the wraps are
  what protect the seed.
- **Do not** treat a cloud sign-in (Google, Apple, Dropbox) as a way in. Signing
  in to a provider opens a storage channel; it never unlocks an identity.
- **Do not** store the recovery key anywhere Q can read it later, "for
  convenience".
- **Do not** let a passkey that is not a way in derive and use a new DID
  without the person being told, plainly, that it is a different identity.

## Still to decide

- ~~**Q's production domain.**~~ Decided 26 September: passkeys belong to the
  root **inqbeta.com** (`PUBLIC_Q_PASSKEY_DOMAIN`), Q at inqbeta.com, tests on
  inqbeta.dev. See `docs/q/going-live.md`.
- **Recovery card form:** printed card, hardware key, or both.
- **Where the browser copy of the envelope lives** — IndexedDB beside the
  folder handle is the obvious place; Safari may clear it, which is why it is
  also in every backup.

## Sources

Incubator: `architecture/catastrophic-recovery-ritual-charter.md` §3, §7;
`architecture/t2-sov-006-continuity-home-doctrine-review.md` §3.1;
`architecture/t2-sov-004-portable-authority-seam-discovery-review.md`.
Q: `adr-q-003-sites-as-keys.md` §"The vault has to be bulletproof first";
`docs/q/copies-and-doors.md`; `q-core/passkey.ts`, `sites.ts`, `continuity.ts`.
