---
status: decided
implementation: steps 1–7 built 3 October 2026 — the relay at the gate (/relay, held receipts signed by the node's GATE_SEED key, daily totals at /relay/stats); custody receipts (q-core custody.ts); the pass-through in the five-minute sync (apps/q lib/relay.ts); your own bucket (q-core s3.ts: SigV4 in the browser, checked against botocore; apps/q lib/bucket.ts, BucketSettings on Backups: a full copy, or a pass-through emptied once a cloud has everything; with a bucket, nothing new goes to the host). Settings → Backups (q-core backup-schedule.ts: cloud every five minutes, four times a day or daily; bucket on every save or every five minutes; host pass-through on or off; download weekly, monthly, quarterly or never — kept in the browser and the vault) and the download offered when due (the vault icon asks once; counted from your oldest receipt if you've never made one). Opening from the newest copy: the passkey's vault pointer carries your bucket, sealed with your vault key (q-core pointer.ts; apps/q bucketNote), and a new device signed in with it is offered "Open from your bucket" first, with the note of where the newest copy was; a held file at the host passes on in the first sync. Not yet: step 8, pass-through by the hour (Phase 3)
updated: 2026-10-03
---

# ADR-Q-028 — Copies in order: your browser, your own bucket or the host's relay, your cloud, your download

**Status: decided, 3 October 2026 (revised the same day); steps 1–7 built.** Your vault is
kept in up to four places, quickest first. If you have **your own S3
bucket**, it comes second, and you choose what it is: **a full copy** you keep
(complete sovereignty, relying on nobody) or **a pass-through** that holds
things only until your cloud has them, so the bucket's provider ends up
holding nothing of yours. If you don't have one, **the host's storage is a
pass-through**, never a copy. So the host keeps almost nothing, and space
stays small.

**The principle:** nobody holds anything of yours unless you chose them to.
Every place in between is a pass-through: sealed, temporary, and emptied as
soon as what it holds has arrived where you keep things.

**It's a receipt chain.** Nothing is let go until there's a signed receipt
that it's held somewhere else: letting go is settling, and you can't settle
without confirmation. Until then, whoever has it keeps holding it, in good
faith. And because a pass-through only needs to be there while things are in
transit, **anyone can offer one by the hour**: “my node is open for
pass-through from midday to six.”

## Context

Darren, 3 October 2026, first:

> "The host has storage, and so that can become an immediate syncing copy
> place for your vault … the order of truth is on your browser. Then it would
> be the host's storage. Then it would be the cloud backup like Google Drive.
> And then it would be your own physical download … Each host sets when that
> happens: quarterly, once a day, four times a day, on every save? That again
> can go in your settings."

Then, refining it:

> "Another backup sync option is obviously an S3 bucket. So then anybody can
> just put in their own … and can pull that down from there and be sourced
> from there with all the keys. That's where complete sovereignty, not
> relying on the host or anybody comes in. So that should come before host as
> option. Do you have your own S3 bucket? No. Okay. Use the host's storage.
> This is only there as storage. It's a pass through. So your Google Drive
> will be every five minutes. And therefore, the only reason the file should
> be sat on the host's storage is because something's gone offline with the
> Google Drive. But everybody else keeps flowing through. So we're not having
> to use so much data space then."

And then:

> "Even your S3, you should be able to select whether it's a pass through or
> an archive source, because then again, you may just want an Amazon server
> to just hold it until it's saved with your Google Drive and then Amazon
> don't have anything of yours at all. That's the kind of principle I think
> that would work really well."

And then:

> "That's the receipt chain, isn't it? You cannot settle, i.e. delete, until
> you have confirmation that it's held somewhere else. And until you've heard
> it's elsewhere, you're still holding on to it, in good faith. So that makes
> it very interesting as well from the point of view of people could hire by
> the hour storage. So if things are passing through between midday and 6
> o'clock, I will make my node live and open."

Already built: the browser keeps the working copy; `autosync.ts` brings each
connected channel (Google Drive, Dropbox, OneDrive, other folders) level every
five minutes; `syncChannels` copies sealed items between a vault and a channel
and checks each one; the vault pointer on the passkey notes where the newest
copy is (ADR-Q-012); Leave no trace clears the browser once a copy holds
everything.

**ADR-Q-017 stands.** The host's storage is a holding bay for things in
transit, never for keeping them. The relay below is exactly that: items in
transit to your cloud, held only until they arrive.

## Decision (proposed)

### 1. The places, in order

| | Where | How quickly | What it's for |
|---|---|---|---|
| 1 | **Your browser** | as you work | the working copy: quick, and works offline |
| 2a | **Your own S3 bucket**, if you have one (Amazon S3, Backblaze B2, Wasabi, Hetzner, Cloudflare R2, MinIO at home…) | on every save | you choose: **a full copy** nobody else controls (open your vault from it anywhere), or **a pass-through** that empties once your cloud has everything |
| 2b | **Otherwise, the host's relay** | only when 3 can't take it | a pass-through: holds sealed items while your cloud is unreachable, then lets them go |
| 3 | **Your cloud** (Google Drive, Dropbox, OneDrive) | every five minutes | a full copy you own, held by a company you chose |
| 4 | **A download** (a file in your downloads folder, or a drive) | once a week, a month, or a quarter | a copy nobody else holds |

**The order of truth** when opening your vault somewhere new: your bucket (if
it's a full copy), then your cloud, then your last download, with anything
still in a pass-through (your bucket's or the host's) added on top. The newest signed item wins; every item is signed, so a copy
can't be passed off as newer than it is. The vault pointer says where the
newest copy was last seen (ADR-Q-012).

### 2. Your own bucket: sovereignty, as a full copy or a pass-through

- **You choose what it's for**, in Settings → Backups:
  - **Keep a full copy** (an archive source): everything stays, and a new
    device can open your vault from it. Complete sovereignty.
  - **Pass-through only**: on every save Q puts what's new in the bucket, so
    it's off this computer at once; when your cloud has it, checked, Q deletes
    it from the bucket. The bucket's provider is left holding nothing of
    yours. Works exactly like the host's relay (§3), in a place you chose.

- **Any S3-compatible bucket.** You give Q its address, region, and an access
  key that can only read and write that bucket. Q writes to it straight from
  your browser (signed S3 requests; the bucket allows Q's origin), so nothing
  passes through the host or Q's servers.
- **The keys are yours and stay sealed.** The bucket's access key is kept in
  your vault, sealed to your passkey, and in the vault pointer (ADR-Q-012), so
  a new device signed in with your passkey can find the bucket and open your
  vault from it. Never in a host's settings, never sent anywhere else.
- **What's in it is sealed.** The same boxes as every other channel: the
  bucket's provider holds files it can't open.
- **A channel like the others** in `syncChannels`: every item checked,
  nothing overwritten by an older one.
- With a bucket, in either mode, the host's relay isn't needed: the bucket
  is always there.

### 3. A pass-through: the host's relay, or your bucket in pass-through mode

One mechanism, two places. Below it's described as the host's relay; your own
bucket in pass-through mode does the same, without a time limit set by anyone
but you.

- **Only when your cloud can't take it.** Q copies to your cloud every five
  minutes. If that fails (offline, a token run out, the provider down), the
  sealed items that didn't go are handed to the host's relay at once, so
  they're safe off this computer.
- **It drains.** When your cloud is back, Q (on whichever device you're
  signed in on) moves the items from the relay into your cloud, checks each
  one arrived, and only then deletes it from the relay.
- **It can't read, and it can't keep.** Items are sealed to your passkey.
  Your relay space is named by a key made from your passkey (as your inbox
  is); only you can list, add or remove. Nothing stays longer than the host's
  published limit (like drops: 30 days at most).
- **Small by design.** Because it only holds what's in transit, a host needs
  little space for it, and a modest free allowance covers almost everyone.
  The host publishes the allowance and the time limit in `/terms`.
- **Second devices.** Until it drains, another device you sign in on picks up
  what's in the relay too, so nothing is missing in between.

### 4. Custody: nothing is let go until it's held elsewhere

Every hop is a small agreement with the same shape as ADR-Q-025: hand over,
confirm, then settle (let go).

```
your browser ──hands over──▶ pass-through        browser keeps it
             ◀──"held" ───── (signed by the pass-through: item hash, until when)
                                                  browser may now let go
pass-through ──Q copies on──▶ your cloud or full-copy bucket
             ◀──"arrived" ── (signed by you: your Q read it back and checked its hash, and where)
                                                  only now does the pass-through delete it
```

- **A custody receipt** names the item by its content hash, who holds it,
  where, and when. The pass-through signs "held"; your Q signs "arrived"
  (Google Drive can't sign, so your Q reads the item back, checks it, and
  signs for it).
- **No receipt, no letting go.** A pass-through deletes only on your signed
  "arrived" receipt naming that item, or at its published time limit, and
  never before. Your browser never forgets an item until something has
  signed that it holds it.
- **Good faith in both directions.** A pass-through that goes offline loses
  nothing of yours, because you still have it; one that took something can
  show its "held" receipt and, later, your "arrived" receipt as proof it did
  its job. Those receipts are the evidence it was used, so they are what gets
  paid for (§5).
- The receipts are kept in your vault with everything else, so the record of
  where every item has been can't be lost with the item.

### 5. Pass-through by the hour

Because a pass-through only needs to be there while things are moving, it
doesn't need to be a big, always-on server:

- **Anyone with a node can offer one**, for the hours they choose: "open for
  pass-through, 12:00 to 18:00, up to 20 GB, 1 credit per GB per hour." It's
  a **standing offer in their shop** (ADR-Q-026), so buying it is an
  agreement like any other.
- **Your Q chooses** among the host's relay, your own bucket, and the
  pass-throughs you've hired, preferring ones that are open now. Outside a
  node's hours, Q simply doesn't hand it anything.
- **Settled by the receipts.** What you pay is worked out from the custody
  receipts (how much, for how long), which both sides already hold, so
  nobody has to trust the other's meter.
- **The commons pilot** (`providers-and-the-commons-market.md`: members
  holding sealed blobs for each other) is this, started small.

### 5a. From the flow to a price

Darren: "Once we've got the data on how it flows and how much space is being
used … then we can calculate what the credit cost is. And then once we've got
the credit cost, we can set a price for minting."

1. **Measure.** Each relay publishes daily totals at `/relay/stats`: files
   and bytes in, how many arrived or timed out, and **byte-hours** held, with
   nothing about whose. Each person's own receipts give the same figures for
   their files (`usageOf`).
2. **Cost it.** What a node costs to run (its server, disk and bandwidth per
   month) divided by the byte-hours and bytes it carries gives a cost per
   GB-hour and per GB passed through.
3. **A credit cost.** Pass-through priced in credits per GB-hour (and per GB
   moved), set so a node's earnings cover its running cost.
4. **The minting price.** With what a credit buys known in real terms, the
   host sets its pence per credit (`Q_CREDIT_PENCE`, ADR-Q-027) from that,
   rather than guessing. Test mode is where the figures are gathered.

### 6. When: the host offers, you choose

The host publishes what its relay offers (in `/terms`). Each person chooses,
in **Settings → Backups**:

| Copy | Choices |
|---|---|
| Your bucket | keep a full copy · pass-through only · off (not set up); and on every save · every five minutes |
| Cloud | every five minutes · four times a day · once a day |
| Host's relay | when your cloud can't take it (on) · off |
| Download | once a week · once a month · once a quarter · never (Q reminds you) |

A download can't happen without you: browsers don't save files on their own.
So when one is due, Q asks once, calmly, in the vault icon (no noise between
times), and saves the file in one tap: the same sealed vault, as one file.

### 7. Leave no trace

A copy that holds everything is enough to leave: your bucket as a full copy,
or your cloud. A pass-through counts only for what it's holding in transit,
so on a borrowed computer Q says "Safe to leave" once your copies, plus any
pass-through, together hold everything.

## Build order

1. **The relay at the gate**: per person, keyed like an inbox, items kept at
   most the published time, within a published allowance; list, add, remove;
   tests.
2. **Custody receipts** ("held", "arrived") in q-core, with tests: no
   deleting without one.
3. **Pass-through in autosync**, one mechanism for any place: hand over what
   the cloud couldn't take (or everything new, for a pass-through bucket);
   drain into the cloud, deleting only what arrived and was signed for.
4. **Your own bucket**: S3 signed requests from the browser, setup in
   Settings with a check that the bucket answers, the choice of full copy or
   pass-through, keys sealed in the vault and the vault pointer.
5. **Settings → Backups**: the schedules, within what the host offers.
6. **The download**: one sealed file, offered when due.
6. **Opening from the newest copy**, in order, on a new device (bucket,
   cloud, download, plus the relay).
8. **Pass-through by the hour**: a node's open hours as a standing offer,
   Q choosing an open pass-through, settled from the custody receipts.

## Non-claims

A pass-through is not a backup: if your cloud never comes back and you never
sign in again, what's in the host's relay goes at the time limit. With a
pass-through bucket and no cloud connected, Q keeps everything in the bucket
and says so, rather than deleting what has nowhere else to be. Your own bucket's
provider charges you, not Q or the host.

## Related

ADR-Q-012 (the vault pointer), ADR-Q-014 (storage), ADR-Q-017 (transit only:
kept), ADR-Q-019 (copies and the master), ADR-Q-025 (agreements: settle only on
confirmation), ADR-Q-026 (standing offers), ADR-Q-027 (credits),
`providers-and-the-commons-market.md` (the commons pilot).
