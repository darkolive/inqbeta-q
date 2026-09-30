# Buying a terabyte so nobody has to

**2026-09-20 — the business model, and the principle underneath it.**

The idea: Dark Olive, or an incubator, or a federation, rents bulk space from
a storage network and offers it to members. Nobody individually needs a
terabyte. Collectively they need one, and then some.

And underneath it, the thing that actually matters:

> **The most current version is always the one in front of you.**

That sentence is the architecture. Everything below follows from it.

---

## 1. The principle, stated properly

**The device holds the original. The network holds copies.**

This is the inverse of every cloud product, and it is deliberate. What follows
from it is not a set of preferences but a set of consequences:

- **Nothing merges on a server, ever.** There is no conflict resolution in the
  cloud because there is no authority in the cloud. The device wins. Always.
- **A remote copy is allowed to be stale** — and Q must say how stale, in
  words, unprompted. A backup whose age nobody knows is a guess.
- **Restore is an act, not a sync.** A person asks for a copy back. It never
  arrives behind their back and overwrites something newer.
- **The remote store needs no intelligence whatsoever.** It is a bag of sealed
  blobs named by their own hash. Content addressing means a copy either
  matches its name or it does not; there is no version logic to get wrong,
  and no server that has to understand anything about a person.
- **You can work forever with no network** and nothing degrades. The network
  is how you get a copy *back*, not how you get work *done*.

This is now in `keeping.ts`: `federation` and `network` are places, `canKeep`
returns false for both, and `howStale()` says how far behind a copy is in the
words a person would use. Somewhere that can only ever be behind is not
somewhere work lives.

## 2. The economics, with real numbers

Current wholesale, checked today:

| | storage | egress | minimum |
|---|---|---|---|
| [Fil One](https://www.fil.one/) (was Storacha) | **$4.99/TB/mo** | **none** | $4.99/mo |
| [Storj](https://storj.dev/dcs/pricing/tiered) Active Archive | $6/TB/mo | $0.02/GB | $5/mo, 30-day min |
| Storj Regional | $10/TB/mo | 1× free, then $0.01/GB | $5/mo |
| Storj Global | $15/TB/mo | 1× free, then $0.02/GB | $5/mo |

Storj's tiered pricing took effect 1 November 2025 and is a increase on what
came before. Fil One is currently both the cheapest and — because egress is
free — the most predictable.

**What a member actually uses.** Receipts are sealed text triples. Cards are
small. The avatar is derived from the DID and weighs nothing. Attachments are
the only real variable. Being generous at 200 MB per member per year:

- 1 TB ≈ **5,000 members** ≈ **$0.001 per member per month**.
- Wildly generous at 2 GB each: 500 members per TB ≈ **$0.01 each**.

So storage is not the cost. A pound a month from one member covers the
storage of a thousand. **The cost of this business is support, compliance, and
the person who picks up the phone when it breaks.** Price it on that, not on
gigabytes, or the numbers will look like a mistake.

**And the real argument is not cheapness — it is the floor.** Fil One's
minimum is $4.99/month. An individual who wants 50 MB of backup has to buy a
terabyte to get it. Pooling does not save them 20%; it removes a £4 floor on a
£0.001 need. That is the sentence for the website.

## 3. Three risks, in the order they will bite

### Egress is where resale models die

Fil One charges nothing for egress. That is a *policy*, not a property of the
universe, and Storj's November increase shows how quickly policy moves. The
model has to survive egress charges appearing.

It does — **because of the principle in §1.** If the device holds the
original, restores are rare by construction. A member downloads their vault
when they get a new laptop, not every morning. The architecture protects the
business model, which is a good sign that both are right.

What this forbids: any feature where the cloud copy is read routinely. No
"browse your archive online", no server-side search, no streaming from the
bucket. Those all sound like value and all convert egress into your largest
line item.

### You become a data controller the day you take money

The ICO's position is that [pseudonymised data is still personal data](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/pseudonymisation/)
in the hands of anyone holding the additional information — but data may be
"anonymous information in their hands" for a recipient with no means of
re-identification.

Holding only sealed blobs, with keys that live in members' passkeys and never
touch us, is a genuinely strong position — far better than an ordinary cloud
service. But be clear about where the exposure actually is:

**The ciphertext is not the problem. The metadata is.** Which DID has an
account, how many objects, how large, how often they push, from which
addresses. None of that is sealed, all of it is ours, and all of it is
personal data.

On erasure: because the member holds the key, **crypto-shredding is
self-service** — they can make their own data unreadable without asking us,
which is a better story than any competitor can tell. We still have to
actually delete the objects, which is precisely why Arweave was excluded.

*I am not a lawyer. Before taking a single payment for this, get advice on the
controller/processor split and on what the metadata obliges.*

### The concentration risk, which is the one that matters

If Dark Olive holds the account, then Dark Olive going away takes every
member's backup with it. That does not merely damage the offer — it makes the
offer a lie.

**The test, and it should be written on the wall:**

> Can a member restore everything if Dark Olive does not exist?

If the honest answer is no, we have built the thing we set out to replace,
with better marketing. Ways the answer can be yes:

- the member's vault carries its own bucket location and a scoped credential,
  so a restore needs a client and nothing else;
- or a federation holds a second pinset and can be handed the keys;
- or — simplest and most honest — the member's folder on disk is the backup,
  and the network copy is the convenience.

Whichever we choose, it has to be true before the first pound is taken, not
retrofitted after somebody asks.

## 4. What this makes Dark Olive

Not a storage company. Storage is a pass-through commodity at a tenth of a
penny.

What is actually being sold is **the thing in front of the person** — an app
that holds the real version, seals it before it leaves, knows where the copies
are and how old they are, and does not need us in order to work. The rented
terabyte is plumbing behind that, bought in bulk because buying in bulk is
the only sane way to buy it.

That is a defensible business. "We hold your data" is not.

## 5. Next

- Decide the restore-without-us answer. It is a design constraint, not a
  policy, and it changes what the vault file has to contain.
- Then a `push` that writes sealed, content-addressed blobs to an S3 endpoint
  and nothing more — the narrowest surface, replaceable in an afternoon, per
  the Storacha lesson.
- `howStale()` needs to appear on a screen, because a promise about currency
  that is never shown is not a promise.

## Sources

- [Fil One pricing](https://www.fil.one/)
- [Storj tiered pricing](https://storj.dev/dcs/pricing/tiered) · [node payouts](https://storj.dev/node/payouts)
- [ICO: pseudonymisation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/pseudonymisation/) · [ICO: encryption and data protection](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/security/encryption/encryption-and-data-protection/)
- Companion notes: `research-2026-09-20-rented-storage.md`, `research-2026-09-20-mainline-addressing.md`
