# Heat bands and bundling

**2026-09-20 — a design note. Built as `q-core/src/bands.ts` later the same
day, once places were real; the ordering argument in the last section is kept
as written.**

> "Seven phases, each based on how cold the storage blob was, on its time delay
> of use. Every file in that time band that fits that score can be bundled
> together… as you get to seven the file size is getting smaller and singular
> because it is a subparticle of everything else."

The shape is right and it is what every serious storage system does. Three
things need correcting, and one of them is upside down.

---

## 1. The size direction is inverted — and both readings are true

The **subparticle** insight is correct about *contents*. In a chain of *what
changed*, an old step's delta is one line: a name corrected, a link added. Band
seven is full of subparticles, exactly as described.

But the **container** must go the other way. Cold means **fewer, larger**
objects, not smaller ones — because small objects are expensive in a way that
is easy to miss:

- object stores bill a **minimum billable size per object** regardless of
  actual size (Storj: 50–100 kB depending on tier). Ten thousand 2 kB receipts
  are billed as ten thousand 50 kB ones;
- retrieval of many small objects is dominated by round-trips, not bytes;
- every object carries index overhead, on their side and ours.

So the correct shape is:

| going colder | |
|---|---|
| the particles | **smaller** — a delta, a line, a single answer |
| the containers | **larger** — one bundle holding thousands of them |
| the pointers | **smaller** — a hash and an offset |

Build it the other way and band seven becomes thousands of tiny objects in the
tier where each one costs the most. `zip.ts` already writes a store-only
archive by hand and is the right tool for the container.

## 2. Bundling fights deletion — and the fix is the one built this afternoon

Bundle ten thousand receipts into one blob, then somebody withdraws one. You
would have to rewrite the bundle — which changes its content address, and
breaks every reference anybody holds to it. The alternative is not being able
to delete, which is not an alternative.

**So each item inside a bundle is sealed to its own key, and the keys live in
the manifest.** Destroy one key and:

- the bundle stays **byte-identical**, so its hash holds;
- every reference to the bundle stays valid;
- that one item is noise, permanently, wherever the bundle has spread.

Which is precisely `archive.ts`, one level down. The mechanism composes:

```
archive key        →  opens the manifest
  bundle           →  content-addressed, never rewritten
    item key       →  opens one receipt
      destroy it   →  that receipt is gone, everything else untouched
```

Same idea at three scales, which is usually the sign of a right idea.

## 3. Bands must be one-way, with hysteresis

If a file can drift between band four and band five on each run, bundles get
rewritten forever. That is **bundle churn**, and it is how tiering systems
usually fail in practice.

The rule:

- **Promote instantly.** Touched is hot, immediately, no waiting.
- **Demote slowly.** Only after the full dwell time for that band has elapsed,
  and never by more than one band per pass.
- **Once bundled, stay bundled.** Touching something in band seven makes a new
  hot copy; it does not unpack the bundle. The cold copy is still correct, and
  unpacking would rewrite it.

## Why not seven?

Seven is a good number looking for a job. The number of bands should be the
number of **distinct destinations**, because a band that lands nowhere new is
a band that does nothing.

Right now there are four places — `here`, `synced`, `cold`, `archive`. That is
four bands, and **adding a place adds a band**. Dwell times are the thing that
gets tuned, not the count.

## And connection really is the foundation

> "That's the point that you can refuse and unlock and therefore connect also
> in history."

Right, and the reason is worth stating: **you cannot re-band what you cannot
reach.** So every file has two bands, not one:

- the band it **should** be in — computable offline, always, from timestamps
  alone;
- the band it **is** in — knowable only when a place answers.

Which makes this a **reconciler, not a scheduler.** It never "runs the archive
job at midnight". It continuously narrows the gap between what should be and
what has been confirmed, and reports the gap honestly in between. That is what
lets it survive the three things that will actually happen: a laptop shut mid-
run, a drive not plugged in, a bucket unreachable.

And it lands on `places.ts`: a place is a channel, and a channel is where
something can **refuse**. Every move this engine makes goes through a place,
and a place is allowed to say no.

## Why this is not built

Seven modules went in today. Ninety-three tests. **Nothing in `apps/q` calls
any of them** — see `what-is-real.md`. An eighth would be the wrong answer to
that.

There is also a dependency that settles the order. `/network` currently shows
invented numbers, and it cannot show true ones until **places are real data**:
a `q:place/*` question set, answers stored, `confirmation()` fed by an actual
round trip in `folder.ts`. A band engine has nowhere to send anything until
destinations exist as records rather than as a type.

So the order is:

1. `q:place/*` as a real question set — the four questions from
   `places-are-channels.md`, answered and stored like any other.
2. The round trip in `folder.ts`, so `confirmation()` judges something real.
3. `/network` showing `howSafe()` and `standingOfPlace()`, literals deleted.
4. **Then** bands, because by then they have somewhere to go.

Steps 1–3 were done, and step 4 with them: `bands.ts`, twelve tests. All four
corrections above are code rather than prose — `BANDS` is `Tier` reused so
there is one vocabulary and not two, `oneStep()` warms by any distance and
cools by one, `reconcile()` leaves a bundle alone and makes a new copy, and
`gapOf()` returns ready and waiting as two lists so a drive in a drawer never
reads as a failure.

What is NOT built: anything that moves a byte. `bands.ts` decides; nothing
acts on its decisions yet, and it has no caller. The honest next step is a
screen showing the gap, which needs things with touch times — and nothing in Q
records when a receipt was last opened.

## Sources

Internal: `zip.ts`, `archive.ts`, `places.ts`, `lifecycle.ts`, `chain.ts`,
`what-is-real.md`, `research-2026-09-20-rented-storage.md` (Storj minimum
billable object sizes).
