# ADR-Q-012: The vault pointer — the passkey remembers where your vault is

**Status: built, 29 September 2026 — needs a passkey that can carry it (below).**
Darren: "when you use a passkey … can it leave a timestamp … last time used …
with some kind of Git ID so it knows where the source of truth is. Whether
that's the Google Drive or on the browser device." Then: "it should happen on
syncing and on signing out … something that you learn to do … an important
feature of it being an offline function."

## Decision

A short note is kept **inside the passkey**, using WebAuthn's `largeBlob`
extension, not the Passwords app's notes (a website cannot touch those). It
is read at the same touch that signs you in, with no network, on any device
the passkey syncs to; and written with one touch at the moments you are
already acting on your vault on purpose.

**The note** (`q-core/src/pointer.ts`, under 512 bytes, nothing secret):

| | |
|---|---|
| `at` | when it was noted |
| `head` | the vault's fingerprint — SHA-256 of its sorted file paths. Locked files are named by content, so same files = same head, like a Git commit id (`folder.ts` `vaultHead()`) |
| `files` | how many |
| `from` | the device, "Safari on Mac" |
| `copies` | where copies were carried then — "Google Drive", "Downloads" |

**Written** (one touch each — learnt as part of the action):
- **Sync now** on Copy locations (Google Drive) — after the sync.
- **Back up now** (the vault icon) — after the download; the dialog says "Now
  touch your passkey — it notes where this copy is."
- **Sign out** (Keys) and **Leave No Trace** — before the browser forgets.
  Closing the prompt still signs out.

**Asked, in Q's own words, before the browser's box** (added the same day).
The passkey box belongs to the browser and says "Sign in" whatever the
touch is for — no site can reword it, on purpose. Darren saw "Sign in"
while signing out. So each of the moments above first shows a small
dialog (`NoteTouch.svelte`): what the touch does, and "Your browser will
call this 'Sign in' — it's the same touch." Skip is always there, and the
action carries on either way. Good, honest truth, before the surprise.

Not on the five-minute auto-sync: a touch every five minutes would be noise.

**Read** at sign-in, and shown on the Overview: "Your passkey noted your vault
Tue 14:32, from Safari on Mac — copies in Google Drive." Then one of: *this
copy is that one*; *this copy is behind it — open the newer one first*; *this
copy has changes since then*.

## Where it works

The passkey has to be made asking for `largeBlob` — support is fixed at
creation. From today, every passkey Q makes asks (founding and way-in).
iCloud Keychain and Google Password Manager honour it (Chrome desktop 140+,
Safari with iCloud Keychain); Chrome on Android and most third-party
managers (1Password, Bitwarden) do not. **Passkeys made before today almost
certainly cannot carry a note**; the first write says so plainly, once.
Signing in never depends on it: a browser that refuses the read is asked
again without it.

For Darren's own identity: the founding passkey's PRF secret is the seed, so
it cannot be remade without a new DID. A **way back in** passkey (ADR-Q-005,
Keys → Ways back in), made now, opens the same identity and can carry the note.

## Open

1. Try it: make a way-in passkey, sign in with it, Sync now or Back up — the
   Overview should show the note on the next sign-in, on any device.
2. Whether the note should also be signed with the identity key, so a copy
   can prove who noted it. Only the passkey holder can write it today, so not
   yet.
