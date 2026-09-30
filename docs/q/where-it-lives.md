# Where it lives, as it ages

**2026-09-20 — the storage policy as a question set, and what it costs to be
honest about it.**

The proposal: the policy itself is a receipt. *Who are you* is the first
question. *Where are you* — meaning where does the data live — is the second.
And the answer is not one place but a lifecycle:

| | where | what it is for |
|---|---|---|
| **here** | this device, now | what you are working on; captured where you are |
| **synced** | iCloud, Dropbox, OneDrive | so losing the laptop does not lose the week |
| **cold** | a bucket, or a federation's cluster | kept rather than used; reachable when asked |
| **archive** | a drive you unplug | records you must keep and expect never to open |

**Yes. That is a sound route**, and it is ordinary records practice, which is
a point in its favour rather than against. Three things about it are not
obvious, and each of them is the difference between a screen that helps and a
screen that reassures. They are now in `q-core/src/lifecycle.ts` with tests.

---

## 1. Checked is not the same as told

Q can ask a bucket whether a blob is still there, and get an answer. It cannot
ask a drive in a cupboard anything at all.

So an archive copy is something Q **was told about once and has believed ever
since**. Drawing that with the same green tick as a verified copy is lying by
omission — and it is exactly the kind of lie that is discovered on the day it
matters most.

Every place reports which kind it is: `checked` (asked, answered), `stale`
(could be asked, has not been lately), `told` (cannot be asked; taken on your
word). The sentences are tested, and an archive copy is never described as
"verified" or "confirmed". After a year unseen it stops being tentative and
says the true thing: *Q cannot reach it, so this is a memory, not a fact.*

## 2. Counting copies is not measuring safety

"Three copies, three copies, two copies" is the right instinct and the wrong
arithmetic. Two folders inside the same Dropbox are one copy wearing two
coats: one account suspension takes both. Three folders on one laptop are one
copy, and a false sense of three.

So every place carries a **fate** — what would have to go wrong for it to be
lost. Places sharing a fate count once. `waysToSurvive()` counts fates, not
folders, and `howSafe()` asks the old 3-2-1 rule in plain words: several
copies, more than one kind of place, at least one not in this room.

Q cannot work a fate out for itself — it is asked, the same way `keeping.ts`
asks whether a folder syncs. The browser hands over a folder's name and
nothing else. The person can see their own Finder; Q cannot.

## 3. Age decides retention; need decides placement

These look like one question and they are two.

*How long must this be kept?* is answered by age, and by law, and by what kind
of record it is. *Where should it live?* is answered by how likely you are to
want it and how bad it would be to lose. A receipt from 2019 that someone
opens every week is not archive material however old it is.

So age is an input to placement, never the whole rule. A company retention
schedule — *keep for seven years* — sits on top of this rather than inside it.

## 4. The reminder has to escalate

*"When the time hits, that's your archive warning — time to save."* Right, and
the failure mode is specific: a drive that was due in January and still is not
done in June must not keep showing the same untroubled sentence. It becomes
wallpaper, and then the records are gone with a tick on the screen.

`archiveDue()` changes what it says as it slips. Past six months it stops
being a reminder and names the consequence: *anything from since then exists
only where you are working.* Never archived at all is due immediately, with
the reason to do it now rather than later — *before there is a year of it to
do at once.*

## 5. What a federation actually gives back

*"You can rebuild your receipts from a record of a receipt on the
federation."* True, and worth being exact about, because the difference
decides whether the promise can be kept.

A federation holding only **records** — CIDs, times, question-set addresses,
acknowledgements — can rebuild your **catalogue**: what you had, when, and
where to fetch it. It cannot rebuild the **contents**, because it never had
them.

That is not a lesser thing. For proving something existed on a date — which is
most of what the incubator's evidence work is about, and what
`evidence-bundle.ts` already fingerprints — the catalogue *is* the point. But
for getting the thing itself back, a catalogue is a shopping list. `whatComesBack()`
says which you have, in those terms, rather than blurring them into "backed
up".

## 6. And this answers the open question from this morning

The question left hanging was: **can a member restore everything if Dark Olive
does not exist?**

The policy receipt is the answer. It is a small document that names every
place a person keeps things, what each one's fate is, and what is expected to
be found there. If it travels with the vault, then restoring needs a client
and nothing else — no account with us, no lookup service, no company.

Which means the policy receipt has one property nothing else in the system
has: **it is the map, so it cannot only live inside the territory.** It has to
be somewhere a person can read it when everything else is unreachable — in the
vault, yes, but also plain enough to print. A map sealed inside the box it
describes is not a map.

## Next

- The tier names above are the ones a person reads, so they are worth a
  second opinion before they go into a question set. `here / synced / cold /
  archive` are mine; *live / synced / cold / archive* or *working / syncing /
  kept / sealed away* would do as well. **This one is Darren's call.**
- Then `q:vault/where` as a real question set with `channels`-style multiple
  answers, one per place, each carrying its fate and its last check.
- Then the network page stops showing literals and shows `howSafe()` — ways,
  not copies — with `standingOfPlace()` under each one.
- `replicas.ts` already does copy locations with folder handles. This sits
  above it as policy; they should meet, not duplicate.

## Sources

Internal: `keeping.ts`, `replicas.ts`, `evidence-bundle.ts` (ADR-006),
`pooled-storage-as-a-service.md`, `research-2026-09-20-rented-storage.md`.
