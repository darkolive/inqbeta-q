# What it protects, and what it does not

## Protects

- **Contents of the folder** from anyone who opens it without the passkey —
  including someone at the same computer, a cloud-sync provider, or a stolen backup.
  Names, types and contents are encrypted; tampering is detected (AES-GCM).
- **Sealed receipts** from everyone but the named recipients.
- **Impersonation in receipts.** A receipt signed by a DID can only have been
  signed by someone who unlocked that passkey.
- **Stray use of another person's folder.** A folder belongs to one DID; a
  different passkey is refused, even if it rewrites `dostudy.json`.
- **Server compromise.** There is no server holding keys, passwords or files.

## Does not protect

- **The existence of files.** Count, sizes and times are visible, and anyone with
  access to the folder can delete or replace files. Back it up.
- **An unlocked device.** Whoever can unlock the passkey — the device passcode
  usually does — is you, as far as this system can tell.
- **A compromised page.** Script running on the page while you are signed in can
  use the keys (it cannot copy the vault or opening keys out, but it can use them
  while the tab is open). This is why nothing third-party runs on these pages, and
  why the keys are never put in storage.
- **Files put in the folder by hand** until they are locked. The Data tab lists
  them as *not locked* and offers to lock them.
- **What a recipient does after opening.** Sealing controls who can read, not what
  they do next.
- **Who holds which permission.** UCAN tokens (`ucan/` in the folder, `ucan` in a
  bundle) are not encrypted: they name DIDs, commands and hashes, never content,
  and exist to be shown to whoever checks them.
- **A backdated revocation.** A revocation's date is the revoker's word. Evidence
  that matters should also be in the journal, so a revocation dated before it shows
  as a dispute rather than silently undoing it.
- **Taking a power back instantly, offline.** A revocation counts where it has
  arrived; copy locations and nodes carry it. Short expiries on strong powers.

## Costs

- **No recovery.** Lose the passkey and the identity, the folder and everything
  sealed only to you are gone. There is no reset because nothing is held to reset
  from. *Save a readable copy* is the way out of the lock for anything that matters.
- **One passkey, one identity — today.** A Mac keychain and an Android keychain
  give two unrelated identities. See [devices-and-branches.md](devices-and-branches.md).
- **Tied to the domain.** Moving DoStudy to another domain changes every DID.
  WebAuthn Related Origin Requests can share passkeys across domains Dark Olive
  owns, if that is ever needed.
- **Browser reach.** The locked folder needs Chrome or Edge on a computer.

## Choices made, and by whom

| Choice | Decided |
|---|---|
| Remember only the public DID between visits; one touch to resume | Darren, 2026-09-16 |
| Sign-in button on every page's header | Darren, 2026-09-16 |
| DoStudy as one page with tabs; one dropped file seen by Read and Verify | Darren, 2026-09-16 |
| Folder locked so it cannot be read on the desktop; Data tab to see it | Darren, 2026-09-16 |
| Keys never extractable; secret never stored; assertion not verified | design |
| Who a seal is for is visible on the envelope | design (matches `forWhom`) |
