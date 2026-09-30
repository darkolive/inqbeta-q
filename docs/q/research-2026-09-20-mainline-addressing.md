# Addressing a DID on BitTorrent's Mainline DHT

**2026-09-20 — research. Follows `research-2026-09-20-clusters-ipfs-relays.md`.**

The thought was: BitTorrent's Mainline DHT has a public-key address lookup,
it has been running forever, and it will keep running. Could we put DID
addressing on the back of it?

**Yes. It is already a specification, and our keys already fit it.**

---

## What exists

Two layers, same mechanism.

**[BEP 44](https://www.bittorrent.org/beps/bep_0044.html)** is the BitTorrent
extension that lets the DHT store arbitrary data. Its *mutable item* form is
the interesting one: you sign a value with an **Ed25519** key, and the item is
stored at `SHA-1(public key [+ salt])`. Anyone who knows the public key can
find it. Only the holder of the private key can change it. A monotonic `seq`
orders versions, and `cas` gives compare-and-swap.

**[Pkarr](https://github.com/pubky/pkarr)** — Public Key Addressable Resource
Records — puts *DNS records* in that slot. An Ed25519 public key, z-base-32
encoded to 52 characters, becomes a sovereign TLD. No registrar, no registry,
no renewal fee.

**[`did:dht`](https://did-dht.com/)** is the DID method built on exactly that,
and it is not a side project: it lives under
[decentralized-identity](https://github.com/TBD54566975/did-dht), the DIF
organisation. A DID Document is encoded as DNS resource records per RFC 1035,
compressed, and published as a BEP 44 mutable item. The identifier is
`did:dht:<z-base-32 of the Ed25519 identity key>`.

## Why this is a straight fit rather than an integration

The spec says Ed25519 is required because "Mainline exclusively supports the
Ed25519 signature system."

Our DID is already Ed25519. It comes out of the passkey PRF through HKDF, and
`didFromPublicKey()` in `q-core/src/did.ts` already has the raw key in hand.
`did:key` and `did:dht` are **the same key, addressed differently** — one is
the key written down, the other is the key written down *and made findable*.

There is nothing to convert. There is a publish step, and a resolve step.

## The constraints, exactly

These are hard numbers and they shape the design, so they are written down
rather than discovered later.

| constraint | value | what it means for us |
|---|---|---|
| value size | **1000 bytes**, bencoded — storing nodes MAY reject more | the entire DID Document, DNS-packed and compressed, must fit |
| signature | Ed25519 over `3:seqi<n>e1:v<len>:<value>` | we already have the signer |
| address | `SHA-1(pubkey [+ salt])` | lookup needs the key, and only the key |
| salt | max **64 bytes** | one key can publish several independent items — one per purpose |
| expiry | **~2 hours** without re-announcement | nothing published stays published |
| republish | **hourly**, SHOULD | a phone cannot be relied on to do this |
| lookup latency | seconds on a cache miss | not an interactive path without a cache |
| browsers | cannot speak UDP, so cannot join the DHT at all | every lookup from `apps/q` goes through an HTTP relay |

`did:dht`'s answer to the republish problem is **gateways with retention
challenges**: a gateway keeps your DID alive in exchange for a proof-of-work
(SHA-256, minimum 26 bits of leading zeros), renewed before expiry. So the
work is paid in CPU rather than money or trust — which is the right shape, and
still means something other than the phone is doing the announcing.

## The warning, which is the important part

The `did:dht` spec states plainly that "Mainline is a public network," making
it "unsuitable for storing private or personally identifying information."

That is not boilerplate. There is a well-documented case.

**Vanish** (2009) was a system for self-destructing data: it split keys across
the Vuze DHT and relied on DHT churn and expiry to make old messages
unrecoverable. Researchers defeated it by crawling. The
[retrospective](https://vanish.cs.washington.edu/pubs/dhts.pdf) is blunt about
why: a crawler joins with a set of nodes and hops around the address space
every few seconds, harvesting values through the DHT's own replication. About
**600 attacker nodes** were enough to capture a quarter of all messages. Keys
did disappear through churn — but "attackers could preserve captured keys
indefinitely."

The lesson, stated once so it does not have to be learned twice:

> **Expiry is not deletion. A public DHT is a public broadcast that anyone
> can archive forever, cheaply.**

This is yesterday's finding again, one layer down. Yesterday: a relay cannot
be made to delete, so seal and pad and expire instead. Today: **the DHT cannot
be made to forget, so publish only what you would be content to have published
permanently.**

## What follows

It gives us a clean rule, and the rule is the useful output of today.

**Mainline carries routing. Mainline never carries content.**

Publishing a DID says: *this key exists, and here is how to reach whoever
holds it.* Nothing else goes in — no channels, no cards, no answers, no
question sets, no hint of what a person has said or who they know. Not because
the 1000 bytes are tight, though they are, but because anything put there is
put there forever, in public, for anyone who was crawling.

That slots exactly into yesterday's conclusion on ADR-Q-001 §10 — *content
addressing always, announcement never by default*. Mainline is now the
**announcement** layer, and the rule is that announcement carries routing
only. The two answers agree, which is a good sign that both are right.

The rule is now a tested function in `q-core/src/mainline.ts`, not a paragraph
in a document, because the last three times a rule lived only in prose it got
broken by the next screen that touched it.

## The convergence worth noticing

Yesterday's note flagged [iroh](https://github.com/n0-computer/iroh) — "dial
keys, not IPs", stateless relays that store nothing, built-in blob transfer,
no DHT and the FAQ calling that a gap.

There is a crate called
[`iroh-mainline-address-lookup`](https://crates.io/crates/iroh-mainline-address-lookup).

So the gap has already been filled by exactly this: **Mainline for finding a
key, iroh for connecting to it.** Two days of reading arrive at a complete
addressing-and-transport story in which we run no DHT, operate no gateway, and
invent no protocol:

```
passkey PRF → Ed25519 → did:dht           (who)
       ↓
  BEP 44 mutable item on Mainline          (where — routing only, 1000 bytes)
       ↓
  iroh QUIC, dialled by key                (how — e2e encrypted, relays blind)
       ↓
  content-addressed receipts               (what — sealed, padded, expiring)
```

Each layer is someone else's maintained, standardised infrastructure. None of
it requires us to be trusted, and none of it asks a person to trust us.

## Open questions, for the ADR rather than for today

1. **The identity key cannot be rotated.** In `did:dht` the DID *is* the
   identity key, so losing the passkey loses the name, permanently and
   publicly. The spec's answer is rotation-by-linkage: a new DID that the old
   one points to, leaving an auditable trail. We should decide whether that
   trail is acceptable, because it is a public record of "this person changed
   identity" that never goes away.
2. **Lookups leak.** Resolving a DID over an HTTP relay tells the relay
   operator who is looking up whom. Running our own relay moves the problem
   rather than solving it. Delegated routing has the same shape.
3. **Does a DID have to be announced at all?** A DID exchanged in person, or
   over Wi-Fi Aware, or on a card, needs no DHT entry. Announcement should
   probably be opt-in per DID, not automatic — the same decision the
   federation makes about content.
4. **Salt.** One key, several items. Tempting for per-purpose addressing
   (a card at one salt, a service endpoint at another). Also a way to make a
   person's several faces linkable by anyone who guesses the salts. Needs
   thinking about before it gets used.

## Sources

- [BEP 44 — storing arbitrary data in the DHT](https://www.bittorrent.org/beps/bep_0044.html)
- [Pkarr](https://github.com/pubky/pkarr) · [introduction](https://github.com/pubky/pkarr/blob/main/docs/introduction.md) · [demo](https://app.pkarr.org/)
- [The DID DHT Method Specification](https://did-dht.com/) · [repo](https://github.com/TBD54566975/did-dht) · [registry](https://did-dht.com/registry/)
- [Geambasu et al., *Experiences Building Security Applications on DHTs*](https://vanish.cs.washington.edu/pubs/dhts.pdf)
- [Wang & Kangasharju, *Real-world sybil attacks in BitTorrent mainline DHT*](https://nymity.ch/sybilhunting/pdf/Wang2012a.pdf)
- [Pubky: Mainline DHT censorship resistance](https://pubky.org/explore/technologies/mainline-dht/)
- [`iroh-mainline-address-lookup`](https://crates.io/crates/iroh-mainline-address-lookup)
