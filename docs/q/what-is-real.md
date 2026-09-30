# What is real — 20 September 2026
<!-- Updated whenever the answer changes. If this file and the code disagree,
     the code is right and this file is a bug. -->

> Read this before believing any other document in `docs/q/`.
>
> Several of them describe things that do not exist yet. Not dishonestly —
> they were written as designs and then read as reports. This file exists so
> the difference is written down somewhere, and it is kept honest by being
> checked against the tests rather than against anyone's memory.

---

## How to check this yourself

```bash
pnpm --filter @inqbeta/q-core test      # what is actually held to a standard
pnpm check                              # svelte-check: the only thing that reads .svelte
```

Anything not in the first list is unverified, however good it looks.

**A test suite that only exercises what the code produces tests the code
against itself.** On 20 September 302 tests passed while the page builder could
not save a single page: every test built a block the way code does (`says` as a
field) and none built one the way the builder does (`settings['q:block/says']`,
because the settings panel is generated from a question set). The validator read
only the first spelling. Nothing was wrong with the tests individually; they
were all the same shape, and it was not the shape a person makes.

**`tsc` is not a check on this app.** It does not read `.svelte` files at all,
so "tsc clean" says nothing about any component, template or page — only about
the `.ts` beside them. On 20 September a claim of tsc-clean was made repeatedly
about work that was more than half Svelte; `pnpm check` then found three real
type errors in one page. Only `svelte-check` counts.

---

## Load-bearing — tested, and depended on

| Module | What it does |
|---|---|
| `canonical`, `did` | canonical JSON, SHA-256, did:key |
| `passkey` | WebAuthn PRF → seed → Ed25519 + X25519 + vault key |
| `seal` | seal to people (X25519), sign, and **check** — `checkReceipt` verifies a receipt, `whose` says if it is yours, theirs, unsigned or broken. **Run by the ledger on every file.** |
| `vault` | lock bytes to the passkey; a file named by its own hash |
| `links` | identity links between a site key and a root |
| `permissions`, `ucan/` | UCAN 1.0 — delegation, policy, revocation |
| `channels` | a verified way to be reached; hash, dual seal, service proof |
| `questions` | schema as questions; answers as triples; content-addressed sets |
| `cards` | what you show, to whom, for what; `cardView` decides what leaves; both storage shapes read |
| `storage` | every browser key Q writes, and which ones sign-out clears |
| `keeping` | whether a place is fit to keep work in, and what to say about it |
| `zip` | a store-only archive, written by hand, opened by any unzip |
| `browser` | what this browser may be trusted with — keep, read, or neither |

Two of Q's own rules are pure functions tested from here, because both had
already gone wrong once inside a component where nothing could see them:
`apps/q/src/lib/guard.ts` (where a person is sent, walked route by route) and
the storage registry above.

**98 tests.** This is the part you can build on.

Q's own question sets and card presets are data, not code, and they are tested
too (`test/q-sets.test.ts`): every set is well formed, no two sets share an
address, no preset names a question nobody asks, and `q/a-card` asks exactly
the three questions `cardFromAnswers` reads. A mistyped predicate in a
preset would otherwise make a card that shows less than intended and says
nothing about it.

---

## Tested and unused — the 20th of September's problem

A whole day went into rules: seven modules, ninety-three tests, six design
notes. Every rule is held to a standard. **Nothing in `apps/q` calls any of
them.**

That is its own category and it needs naming, because it is the most
flattering kind of nothing. A tested pure function no screen calls is not
protecting anybody — it is a design document that happens to compile. The
tests prove the rule is coherent. They prove nothing about the product.

| Module | The rule it holds | Called by |
|---|---|---|
| `mainline.ts` | what may be published to a public DHT — routing only, never content | nothing |
| `lifecycle.ts` | here / synced / cold / archive; checked vs told; ways to survive, not copies | **`/network`** (`howSafe`, `standingOfPlace`) |
| `places.ts` | a place is a channel; confirmed means written **and read back**; damaged is worse than refused | **`/network`, `lib/places.ts`, `folder.proveFolder()`** |
| `ways-in.ts` | a copy is as strong as its strongest, a way in as weak as its weakest | nothing |
| `revocation.ts` | the smallest shape that travels, and what revoking actually buys | nothing |
| `chain.ts` | what changed; a chain is not a blockchain; confidence decays, records do not | nothing |
| `archive.ts` | an archive key of its own, so a lost drive is closable | nothing |
| `bands.ts` | where a thing should be against where it is; warm instantly, cool one band a pass; never unpack a bundle | nothing |
| `touches.ts` | read is a fact about you, reviewed is a claim about the thing, wrote already exists | nothing |
| `corroboration.ts` | counting signatures measures redundancy; counting origins measures trust | nothing |
| `blocks.ts` | a closed vocabulary with settings as questions; a template carries nothing that runs | **`/my-pages`, `q-ui/BlockView`** |
| `pages.ts` | publishing merges the design, never the answers; one file, one address | **`/my-pages`, `lib/pages.ts`** |
| `assurance.ts` | a set declares what must be TRUE, not what to collect; the ladder never bends | **`questions.ts` — every answering carries `held`; `seal.checkReceipt` reports what it cannot test** |

`keeping.ts` gained `federation` and `network` the same day and **is** called,
so it is in the load-bearing table above rather than here.

**What would move a row out of this table.** One screen reading it, and the
literals it replaces deleted.

**Three rows have moved.** `/network` was storage used, compute hours, four
peers with latencies and three token balances — every figure a literal. It now
lists places a person has written down and says what can honestly be said
about each, through `howSafe()`, `standingOfPlace()` and `confirmation()`.
The invented numbers are **deleted rather than zeroed**, because a zero would
be as untrue as the five hundred that was there, and the page now says plainly
what Q cannot yet measure.

`places.ts` also has real data behind it: `q/a-place` is a question set,
`provePlace()` runs a round trip through `folder.proveFolder()`, and answering
again writes a new answering rather than editing the old one.

And **signatures are now checked**. Until 20 September every receipt Q wrote
was signed and nothing anywhere verified one; every list was built from files
that were parsed and believed. The ledger now runs `checkReceipt` once per
file and carries the answer on every entry, so no reader can forget to ask.
A file that fails is **still listed** — it is the one a person most needs to
see, and a folder that looks clean because the evidence of it not being clean
was swallowed is worse than no folder.

Still true of the other five rows, and of 20 September as a whole: the
thinking got much better and most of the product did not change.

The one exception worth stating fairly: `archive.ts` is proved with real
crypto, not asserted — there is a test showing that once the wrapped key is
gone, the passkey that wrote the archive cannot open it. That property is real
whether or not a screen uses it yet. It still needs wiring before it protects
anything.

---

## Outline — the shape exists, the behaviour does not

| | State |
|---|---|
| `triggers.ts` | conditions evaluate. **Every action is a `console.log`.** `notify` does not notify, `auto_unseal` does not unseal, `queue_sync` does not queue, `run` does not run. Only `refresh_ui` dispatches an event. No tests. |
| `dgraph.ts`, `seaweedfs.ts`, `receipts.ts` | clients written against real APIs. Nothing in `apps/q` calls them with real data. Untested. |
| `offline-queue.ts` | queues and states exist; background sync runs every five minutes against a kernel in a **separate repository** (`~/inQbeta/services/kernel-spin`). Untested. |
| `exchange.ts`, `federation.ts`, `ui-receipts.ts`, `taxonomy.ts` | written, imported by pages, never tested. |
| `second-factor.ts`, `zk-2fa.ts` | superseded by `channels.ts` in everything but name. Should fold in or go. |

**Twenty-one of thirty-six `q-core` modules have no test.** All of them were
written between the 17th and the 19th. The seven added on the 20th all have
tests and no callers, which is a different failure and is tabled above.

---

## Invented — pages that show numbers nobody produced

`/balance` · `/exchanges` · `/network` · `/search`

They render. The figures in them are literals in the source.

---

## What the other documents get wrong

| Document | Correction |
|---|---|
| `handover-to-claude.md` §6 | "✅ Trigger engine (conditions + actions)" — the conditions work; the actions do not |
| `audit-review-2026-09-18.md` | a design record, not a report of built things. Its "Files Created" are real; its capabilities largely are not |
| `design-principles.md` §2 | superseded — it describes OTP-before-passkey, which is the opposite of what Q does |
| `receipt-lifecycle.md` | describes the trigger engine as designed, not as built |

---

## Half-done on purpose

**A template library needs a layout vocabulary. There is now one, and it
renders.**

`blocks.ts` (20 September) closes the vocabulary at ten kinds, refuses
behaviour by name, and makes a picture a content address rather than a URL.
Both decisions that were open are made: the vocabulary is closed and `custom`
is gone, and a template carries nothing that runs.

`q-ui/BlockView.svelte` draws all ten kinds and `PageView.svelte` lays them out
by width. `/my-pages` builds, reorders, previews and publishes. The preview is
drawn by the same component as the published page, because a preview using a
different renderer lies most convincingly about the thing you are about to
share.

`AskSet.svelte` was extracted from `/questions` so block settings are asked by
the **same renderer as every other question set in Q** — the claim would
otherwise have been aspirational, and a hand-rolled settings form beside it
would have made it a lie within a week.

`ui-receipts.ts` is **gone**. Published pages are recognised by
`inqbeta.page/1`, list with what is on them and whether the receipt holds up,
and **open** — drawn by the same `PageView` as the preview. Pages written in
the old shape are still read, in both spellings it was written in: a receipt
already signed is not rewritten to a newer taste. What was deleted is the way
to write more, not the ability to read what was written.
See `dnd-kit-and-the-vocabulary.md`.

**The avatar is drawn, not uploaded.** `q-ui/Avatar.svelte` derives an emblem
from the DID with a plain non-cryptographic hash. It is for recognising your
own things at a glance and is **not** a way to check who somebody is — a few
thousand patterns is not a few thousand identities. `fingerprint.ts` is what
people compare by eye. An uploaded image would be an `image` answer holding a
content address; that does not exist yet.

---

## A browser is not a home

Learned the hard way on 2026-09-19: a folder was lost to browser storage, on
Safari, which has no folder picker and so was silently the default.

**Safari's ITP deletes all script-writable storage after seven days of no
interaction with the site** — IndexedDB, localStorage, and the origin-private
file system with them. Not on a clean: on a timer. A person who does not open Q
for a week loses everything in it, silently. Clearing website data does it
sooner, which is what actually happened.

It would break a folder on disk too, if Safari had a picker, because the HANDLE
lives in IndexedDB and goes on the same schedule. Q would keep the files and
forget where they were.

What survived was the passkey, because it lives in a keychain rather than in
the page. The identity half of the promise is real. The keeping half was not.

`keeping.ts` now says this in the words a person would use, at the top of the
panel rather than in a hint at the bottom, and it is tested — the sentences are
the product here, so they are held to the same standard as the code.

**What Safari actually gives, precisely.** It has no folder picker, but it does
have `<input type="file" webkitdirectory>` — which hands over every file under
a folder to READ. What it cannot do is write back (the File API is read-only,
and the only road out is a download) or be remembered (you get `File` objects,
not a handle). So it is not one API with an option missing: the file input
gives bytes to read now, File System Access gives a durable capability to read
and write later, and Safari implements the first.

**That is enough for a vault, if the vault is a folder and the browser is a
copy of it.** `openVaultFrom()` reads a chosen folder in; `closeVault()` zips
the working copy out. Content names make it safe — putting the zip back
replaces each file with itself, opening the same vault twice is the same as
opening it once, and two vaults merge by union with nothing to resolve.

The honest cost is that a vault you forget to close loses the day's work, so
the panel counts what has been written since the last export.

**A browser that cannot keep a folder is a READER** (decided 2026-09-19).
It opens a vault, shows what is in it and checks every signature. It does not
let anything be made, because anything it made would live in a cache with a
seven-day fuse and look exactly as convincing as a real receipt while it
lasted.

Enforced in `saveLocked` — the one place everything that makes a receipt goes
through, and therefore the one place to refuse. Reading a vault IN does not go
through it. The check is on the capability, never the user-agent: a browser
that ships a folder picker tomorrow becomes a keeper tomorrow.

The practical consequence, stated plainly: **you need Chrome or Edge to add
anything.** Safari shows you everything and changes nothing.

**A download cannot be the vault.** It was considered and it does not work: a
page can trigger a download but never read Downloads back, browsers rename on
collision (`a1b2.dsv`, `a1b2-2.dsv`) which breaks the idempotency content names
exist for, and there is no delete and no listing, so nothing can be reconciled.
Pointing Safari's download folder AT the vault folder is still worth doing — it
shortens close-and-take-out to one step — but it is a convenience, not a
mechanism.

**Multi-device, tonight, for nothing:** keep the vault in a folder that already
syncs — iCloud Drive, Dropbox, OneDrive. Every device, no OAuth, no account
with anybody new, no code. Q suggests it at the moment of choosing, which is
the only moment the advice is free, and asks afterwards whether the folder
syncs — because a browser hands over a folder's NAME and nothing else, so it
cannot tell and must not pretend to.

The picker also no longer opens in Downloads. People empty Downloads, and
cleaning tools empty it for them; a vault chosen there is a vault waiting to be
thrown away.

**Drive as a vault is designed, not built.** `cloud-devices.md` has the
corrected shape — Drive is plain HTTPS and works in any browser, including
Safari, which is what makes it the answer there. It needs OAuth with the
`drive.file` scope (Q sees only what Q created), a server route for the client
secret, and a `cloud` kind in `keeping.ts`. Google would hold ciphertext it
cannot read, and would see how many files, how big, and when they change.

**Still to do:** `apps/q/ios/QApp.swift` is a stub. A native app is the real
answer on a browser that cannot keep anything — open and close is honest, but
it is still a person remembering to close a door.

---

## The two questions that gate the next real work

Both from the ADRs, both unanswered, both upstream of code somebody will
otherwise write anyway:

1. **ADR-Q-001 §10** — IPFS as a public DHT, or a private swarm? Sealing hides
   contents; existence, size, timing and graph shape leak regardless. Nothing
   about relays should be built before this is settled.

2. **ADR-Q-002, open question 1** — what sandbox does a federation's method get
   when it runs against a person's own data? `triggers.ts` already has a `run`
   action waiting for an implementation. It should keep waiting.

---

## The rule that would have prevented this file

**One vertical finished before the next is started.** Finished means: a person
can do it end to end, and there are tests that fail if it breaks.

The questions work is the only thing from the last three days that meets that
bar, and it is the only part nobody has to check before trusting.
