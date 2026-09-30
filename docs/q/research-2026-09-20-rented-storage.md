# Renting space on somebody else's disk

**2026-09-20 — research. Third of the day, follows the clusters/IPFS and
Mainline notes.**

The picture Darren described: you work in the browser, you press push, and
your receipts go to your storage locations — a federation's cluster, or the
open network. This is about what the open network actually is, who is
selling space on it in 2026, and which of them are worth trusting with
anything.

---

## The three tiers, which are layers and not competitors

1. **Your vault.** A folder on your disk. Built. The only tier where you
   are not trusting anyone.
2. **A federation's cluster.** SeaweedFS, or Kubo with
   [IPFS Cluster](https://ipfscluster.io/) keeping a pinset at a declared
   replication factor. Run by a club, a practice, a research group —
   someone you can name.
3. **The open network.** Strangers' disks, paid in tokens.

The rule from the last two days extends to tier 3 without modification:
**sealed, padded, content-addressed, and never the only copy.** The
provider is a disk, not a confidant. That is not a criticism of any of them
— it is how we should treat AWS too, and mostly do not.

## What is actually usable now

### Storj — the boring one, and therefore the first to try

[Storj](https://storj.dev/) erasure-codes a file into pieces, spreads them
across geographically separate nodes, encrypts client-side before anything
leaves the machine, continuously audits nodes by asking for random pieces
back, and automatically repairs when a file's surviving pieces approach the
recovery threshold. There is an S3-compatible gateway, so `apps/q` would
talk to it the same way it talks to SeaweedFS.

It is two-sided, which is the part that matters for the model: you can rent
space, and you can *be* the space. [Node payouts](https://storj.dev/node/payouts)
as of 1 September 2026 are **$1.35/TB/month stored**, **$1.00/TB egress**,
**$1.00/TB** for audit and repair traffic.

**The catch, and it is a real one.** Payment is in STORJ tokens on Ethereum
L1, and the zkSync L2 option is being **discontinued on 1 September 2026**.
Their own rule is that they "will not send a transaction where the fee for
the transaction is more than 25% of the value of the transaction" — so at
$12.50 average fees the minimum payout becomes **$50**. A small operator can
be owed money they cannot practically collect. Anyone we encourage to host
should be told that before they plug in a drive, not after.

### Sia — the one that matches our philosophy

[Sia](https://sia.tech/) is the closest in spirit to what we are building:
you run `renterd` yourself and form storage contracts directly with hosts.
No satellite, no company in the middle of the data path. `s3d` gives an
S3 gateway, and the [March 2026 update](https://sia.tech/blog/the-state-of-sia-march-2026)
shows it actively shipping — `renterd` 2.9.0, `hostd` 2.7.0 with consensus
pruning, multipart upload support in `s3d`, and storage apps on iOS and
Android.

The cost of that independence is that you manage contracts, allowances and
host selection yourself. It is more like running infrastructure and less
like buying a bucket. For a **federation** that is a feature; for an
individual it is work.

### Filecoin — and a cautionary tale worth more than the recommendation

I went looking for **Storacha**, the Filecoin "hot storage" layer, because
it was built on **UCAN** with DID-identified Spaces and delegation chains —
the same primitives already sitting in `q-core/src/ucan`. On paper it was
the closest thing to a storage layer that speaks our language.

`storacha.network` now **redirects to [fil.one](https://www.fil.one/)**,
which presents as S3-compatible object storage at **$4.99/TB/month** with
11-nines durability, no egress fees, and US/EU regions. The front of the
product makes no mention of UCAN, DIDs or Spaces.

Take the lesson rather than the service:

> **A protocol you depend on can become a product that does not need you.**

Had we built on Storacha's UCAN spaces a year ago, we would be rewriting
now. Our UCAN implementation is ours, in `q-core`, and that is the right
place for it. Anything we adopt from these networks should be **an S3
endpoint and nothing more** — the narrowest possible surface, replaceable
in an afternoon.

## Worth knowing about, not worth building on yet

- **[Walrus](https://www.mystenlabs.com/blog/announcing-walrus-a-decentralized-storage-and-data-availability-protocol)**
  (Mysten Labs, on Sui). Erasure-coded blob storage with a serious
  [paper](https://arxiv.org/pdf/2505.05370) behind it — Danezis is not a
  light-weight. Young. Watch it.
- **Arweave.** Pay once, stored permanently. **This is wrong for us, on
  purpose.** Permanence is precisely the property personal data must not
  have. A receipt someone withdraws must be able to stop existing, and
  Arweave's entire proposition is that nothing does. It is excellent for
  publishing and unusable for people.

## The compute side, which is what "token-based DigitalOcean" actually is

[Akash](https://akash.network/) is the literal answer to the question:
a marketplace where providers bid to run your container, settled in AKT.
It is where a federation's Dgraph, or a receipt kernel, could live without
anyone signing a datacentre contract.

It belongs with the WireGuard mesh thinking from Friday evening rather than
with storage, and it should wait until there is something to run.

## What this changes in the design

Darren's sentence — *"those receipts get sent to my storage locations"* —
contains the answer to where this belongs.

**A storage location is a question with answers.** *Where do you keep
things?* is a question like any other, and a person can have several
answers: a folder, a federation, a rented bucket. Each answer is a place,
and each place carries its own risk sentence — which `keeping.ts` already
models, for `disk`, `browser` and `none`.

So the open network does not need new architecture. It needs two more
values in `Keeping` and two more honest sentences:

- `federation` — *someone you know keeps a copy. You can ask them to
  remove it, and they can refuse.*
- `network` — *strangers keep a sealed copy. They cannot read it, and they
  will not delete it because you asked.*

That second sentence is the same truth as the relay finding and the
Mainline finding, said a third time in a third place. If it is true
everywhere, it belongs in one function and every screen should read from
it.

**Next move:** extend `Keeping` with those two places and their sentences,
tested, before any code talks to an S3 endpoint. The rule goes in first;
that is what has been working.

## Sources

- [Storj: decentralization and erasure coding](https://storj.dev/learn/concepts/decentralization) · [node payouts](https://storj.dev/node/payouts)
- [Sia](https://sia.tech/) · [State of Sia, March 2026](https://sia.tech/blog/the-state-of-sia-march-2026) · [renterd](https://github.com/siafoundation/renterd)
- [Fil One](https://www.fil.one/) (storacha.network now redirects here) · [Filecoin: introducing Storacha](https://filecoin.io/blog/posts/introducing-storacha---the-future-of-hot-decentralized-data/)
- [Walrus announcement](https://www.mystenlabs.com/blog/announcing-walrus-a-decentralized-storage-and-data-availability-protocol) · [paper](https://arxiv.org/pdf/2505.05370)
- [Akash Network](https://akash.network/)
- [IPFS Cluster](https://ipfscluster.io/)
