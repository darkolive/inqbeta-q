# A place is a channel

**2026-09-20 — the fourth and last of the day.**

> "Each hard drive that you've plugged in or flash drive that you've plugged
> in has its own DID. You can describe it so it's a flash drive or it was a
> mini PC, that's the device information. And it's either available or
> unavailable. But you know what it is. And I called that one flash drive
> 2026… They're the channels."

Yes. And it is the same shape as `channels.ts`: a named, described, verified
route to somewhere, identified by a **DID** rather than by a path. Built as
`q-core/src/places.ts`, 136 tests passing.

---

## What the two have in common, and the one place they part

A channel is a way **you** can be reached. A place is a way **your data** can
be reached. Same receipt, same verification, same "drop the receipt and the
route ends".

They part on one thing, and it is good news. A channel's address must be
sealed to a **service** key, because a sending service has to resolve it while
you are not there. **Nothing ever resolves a place except you.** So a place is
a channel with no service in it: simpler, and nobody else can read where your
things are. Worth keeping as two files.

## The DID is the label on the drive

This is why archiving works at all. You write *flash drive 2026* on a drive
with a marker, put it in a drawer, and months later you walk to the drawer and
find it. The DID is that label in a form a receipt can name.

So a receipt can say **what** it is on without saying **where** that is — and
a person can still go and get it. That is the whole trick, and it is why a
physical archive beats a clever one.

**And therefore a place's DID is never announced.** Publishing it to Mainline
would tell a public network that this key owns a flash drive, permanently, to
anyone who was crawling. Routing only, announcement opt-in — this morning's
rule, third application. `mustNotAnnounce()` returns true for every kind, as a
function rather than an assumption, so that whoever wants an exception one day
has to come and argue for it in front of a test.

## One correction, and it matters

> "BitTorrent's DNS addressing works as a favour because you've got a way of
> going, you can find this file here and that address is permanent."

Mainline gives a permanent **name**, not a permanent **address**. The record
itself expires in about two hours and has to be republished, and a flash drive
in a drawer has no network address at all.

That is not a problem, because the name is the useful half. The DID is a
permanent label; reachability is a separate, changing fact — which is the
`checked` versus `told` distinction from the lifecycle note, one level up.
`situationOf()` keeps them apart: *away* for a drive means it is in the drawer
where it should be; *away* for a folder means it has been moved, renamed or
deleted. Same word, opposite news.

## "This is a cache. It can be destroyed without notice."

That sentence is better than the paragraph `keeping.ts` currently uses, and it
is now the warning. Two reasons it wins:

- **Cache is the honest word.** Everybody already knows a cache is something
  that gets cleared. "Browser storage" sounds like storage.
- **It is short enough to be read.** The seven-day ITP detail is true and
  belongs somewhere, but a paragraph about timers is a paragraph nobody
  finishes, and the warning that nobody finishes is the one that failed.

There is a test asserting the sentence stays under sixty characters. That is
not a gimmick — length is the property that made the old warning useless.

## Confirmed means tried, not supported

> "If you've got a hard drive on your computer using Chrome and you can access
> it, it's created, found, findable, and can be written to and read, then that
> becomes a live confirmed storage."

The important words are **and read**. A browser reporting that it supports
folders is a *capability*; a byte written and read back is a *fact*. Q has
already been caught believing the first kind once.

So `confirmation()` takes the result of a round trip and has four outcomes,
and the one worth naming is the third:

| | what happened | what it says |
|---|---|---|
| untried | nothing written yet | *Q will write something small there and read it back, to be sure.* |
| refused | would not take it, or would not give it back | *do not keep anything here until that is understood* |
| **damaged** | **written, read back, and different** | ***it is changing what is stored in it — stop using it*** |
| confirmed | written, read back, identical | *it works* |

`damaged` is worse than `refused`, because a place that refuses is obvious and
a place that quietly alters things looks like it is working. Naming it
separately is the difference between finding that out now and finding it out
when a record is needed.

## Three free accounts really are three fates

> "If you've got a free Dropbox, a free Google Drive and a free Microsoft
> account and you've got enough data to sit on all three within your
> allowance, then you may just go, well, may as well, it's free."

Sound reasoning, not just thrift: three different companies are three genuine
fates, so this is real redundancy rather than the illusion of it. Two folders
inside one Dropbox are still one.

One caveat, one sentence, no lecture: **if all three are recovered through the
same email address, that address is the fate, not the companies.**

## Where this leaves the shape

```
who are you            → a DID from a passkey
where are you          → places, each its own DID
      ├ cache          → not a place. one sentence of warning.
      ├ folder         → confirmed by round trip, or it is not confirmed
      ├ synced         → a company holds a sealed copy
      ├ bucket         → S1, S2, S3, or all three — the person's choice
      └ drive          → a label in a drawer, away by design
how safe is it         → ways to survive, not copies
when must it move      → archive due, escalating
```

Every layer is questions and answers. None of it needs us to exist.

## Next

- The tier names from `where-it-lives.md` are still Darren's call.
- `q:place/*` needs to become a real question set in `apps/q`, with the four
  questions above and `channels`-style multiple answers.
- `folder.ts` needs the round trip itself — write a small file, read it back,
  compare, remove — so `confirmation()` has something real to judge.
- `keeping.ts` should adopt the cache sentence and demote its paragraph to a
  second line.
- Then the network page, showing ways rather than literals.

## Sources

Internal: `channels.ts`, `keeping.ts`, `lifecycle.ts`, `mainline.ts`,
`where-it-lives.md`, `research-2026-09-20-mainline-addressing.md`.
