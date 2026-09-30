# Channels — the ways you can be reached

**Decided**: 2026-09-19 · **Revised the same day** — see *The order, and why it changed*

> "We should be storing the verified method and it'd be a DID type email or SMS.
> And they can be stored in as a receipt, for backup. And for marketing or
> messaging, it's useful for all of those channels, isn't it? That's what they
> are, channels."
>
> "Is there a way that the receipt… is somehow a hash of the email and the DID
> of the owner… and when you send an API, you're sending it to a decryption of
> that DID or that hash. And if it doesn't send it to its decrypted email, it
> goes nowhere. And gets rejected."
>
> "The very first thing going on the home page is you need to sign in with your
> passkey… that's a tier one security, and that creates your DID. What's
> happening at the moment, you press the passkey and it goes to verify your
> identity, which is asking you for your email — but it's got no user to send it
> to. It's not tying the two together."
>
> "That message should not have an action at all. It's just information… what is
> sent can be a link to a unique receipt, which this other end can open, read,
> and it will determine what happens next. It is literally just a receipt
> location, a DID address."
>
> — Darren, 2026-09-19

---

## The order, and why it changed

The first build followed `design-principles.md`: OTP first, passkey second. That
is the wrong way round, and it showed — a code was sent before there was any
identity to attach it to, so the two were never tied together.

**The passkey is tier one and comes first.** Press it on the landing page, your
fingerprint derives your DID on the spot, and you are signed in. An address is
something that belongs to an identity, so the identity exists before any address
is claimed.

Putting it that way round deleted code rather than adding it:

| Gone | Why it existed |
|---|---|
| the DID-less attestation | the address was proved before the identity, so the proof could not name one |
| `sessionStorage` carry between `/auth` and `/keys` | something had to hold the proved address across the gap |
| the whole `/auth` route | there is no stage before the passkey any more |
| `q:sessionVerified` | a second gate that was never a gate — one line in a console walked past it |

The proof now names the DID as well as the address, which is strictly stronger:
a proof about one person can no longer be moved onto another person's channel.
There is a test for exactly that.

---

## What a channel is

A verified channel is a receipt about one address. It carries two things:

| | |
|---|---|
| `hash` | `sha256({ did, kind, address })`. Anyone holding an address can check it against this. Nobody can work backwards from it. |
| `address` | The address itself, sealed (X25519, `seal.ts`) to **two** DIDs — yours, and Q's sending key. |

Sealing takes a list of recipients, so that is one seal with two ways in, not
two copies of the address.

It also carries `uses` — what the channel was given for — and `proof`, the
sending service's signed word that a code sent there was answered.

## Why the send API cannot be handed an address

```
  POST /api/channels/claim   { did, kind, address, at, signature }
         │
         ├─ signed by that DID? ─────────────────── no ──▶ 403, nothing sent
         │                                                 (a DID is public;
         │                                                  the signature is not)
         └─ leave a receipt, send its location only

  Later, to reach an existing channel:
         ├─ open the seal with the service key ──── fails ──▶ nothing sent
         ├─ check the address against the hash ──── fails ──▶ nothing sent
         └─ send
```

So:

- no arbitrary recipient can be injected into a send;
- nothing is sent anywhere a signed receipt does not already say belongs to
  that DID;
- dropping the receipt from your folder ends the channel.

The first time, there is nothing to refer to — the person types an address and
is telling us where to write, signed with the passkey they already hold. Every
time after that, it is a reference.

## The service key, said plainly

**Q's sending key can read an address that was sealed for it.** This is not
zero-knowledge from Q, and the Settings page says so rather than implying
otherwise.

It has to be that way. A returning person has not signed in yet — that is the
entire point of a sign-in code — so their own key cannot open anything at the
moment the code must be sent. Either something server-side resolves the channel,
or a code can only ever go to an address typed in again by hand.

`Q_SERVICE_SEED` unset is a supported state: channels then seal to their owner
alone, and nothing can be sent while they are signed out.

## The order of things

```
1.  /            press the passkey. Fingerprint → DID. Signed in. Nothing fetched.
2.  Settings     give an address. The claim is SIGNED by your passkey, because a
                 DID is public and otherwise anyone could have Q write to anyone.
3.  email out    a location. Nothing else. No code, nothing to act on.
4.  /c/<token>   the receipt: the claim, sealed to your DID. A stranger following
                 the link, the mail provider, a browser without the passkey — all
                 get ciphertext.
5.  open it      your passkey unseals it. Inside is a witness: 32 random bytes
                 that exist nowhere else.
6.  confirm      hand the witness back, signed. That says both halves at once —
                 the address received the location, and this identity opened what
                 was there. A code typed off a screen only ever said the first.
7.  the receipt  built and signed in the browser, sealed to you and to Q's
                 sender, written into your folder.
```

Q attests to what it saw. **You** sign the binding of the address to your
identity — that is your statement, never the server's.

### The one hard part

A link in an email opens in whatever browser the mail app chooses, which is not
always the one holding the passkey. Passkeys usually follow through a keychain;
when they do not, `/c/<token>` says so — *sealed to someone else, open this where
your passkey is* — rather than failing blankly. There is no way around this that
does not weaken the seal.

## What the message carries

Nothing. That is the point.

> "If it's used as a one-way system, what is sent can be a link to a unique
> receipt… there's no load on the message."

No code, no token that grants anything, no button that does something. Resend
sees a URL, and that URL yields ciphertext. A claim sent to the wrong address
hands its reader nothing at all — which is why the email can say so plainly
instead of warning them to act.

The claim travels **inside** the link, encrypted under a server-only key. Nothing
is stored: Q runs as functions that come and go, and a claim in a module-level
`Map` is lost the moment another instance answers. Encrypted rather than signed,
because a signed claim would put the address and the witness in the link in
plain sight, and the whole point is that the link says nothing.

**What this does not do.** Without somewhere to count, nothing stops a caller
hammering `/c/<token>`. Unlike a six-digit code there is nothing there to guess —
a witness is 32 random bytes — so the limiter in `lib/server/claims.ts` limits
noise rather than defending a secret. It is still best-effort and per-instance;
a shared store (the Redis already down for pub/sub) is what would make it honest.

## Uses are separate on purpose

`sign-in` · `notify` · `messages` · `marketing`

Answering a code to sign in is not asking to be marketed at. A channel made at
sign-in is `['sign-in']` and nothing else; the rest are added in Settings, one
deliberate press at a time, and each change writes a **new** receipt rather than
editing the old one — so the record reads as a sequence of things you agreed to,
in order. Only the newest counts; the earlier ones remain the evidence for what
was true before.

## Files

| File | What |
|---|---|
| `packages/q-core/src/channels.ts` | the type, the hash, the seal, the proof check |
| `packages/q-core/test/channels.test.ts` | 9 tests — forgery, lifted proofs, replayed signatures |
| `apps/q/src/lib/channels.ts` | the browser's side — claim, confirm, save, change uses |
| `apps/q/src/lib/server/claims.ts` | the encrypted claim, and the witness inside it |
| `apps/q/src/lib/server/signed.ts` | did this request really come from that DID |
| `apps/q/src/lib/server/service-key.ts` | Q's sending identity from `Q_SERVICE_SEED` |
| `apps/q/src/lib/server/emails.ts` | the one email Q sends, which asks for nothing |
| `apps/q/src/routes/api/channels/claim` | signed by the DID, or nothing is sent |
| `apps/q/src/routes/api/channels/confirm` | witness in, attestation out |
| `apps/q/src/routes/api/channels/service` | the DID a browser seals a channel to |
| `apps/q/src/routes/c/[token]` | the receipt location |

## Running it

`apps/q/.env` — Vite loads env from the app directory, **not** the repo root,
which is why the key in the root `.env` was never reaching this app.

```
RESEND_API_KEY=…     # the From: address must be on a domain verified with Resend
Q_SERVICE_SEED=…     # 32 bytes base64url; see .env.example for how to make one
Q_OTP_SECRET=…       # any long random string
```

From: is `Q <q@darkolive.co.uk>` — Dark Olive's domain is the one verified with
Resend today. Moving Q to its own domain is a DNS job in Resend and a one-line
change in `send-otp/+server.ts`.

## Still open

- **SMS.** The kind exists and hashes and seals like email; there is no sender.
  `channels/claim` answers 501 for it rather than pretending.
- **Attempt counting.** See above. Needs the shared store.
- **No tests above q-core.** `claims.ts` and `signed.ts` are checked only by the
  types and by the signature tests in `channels.test.ts`, which sign and verify
  the exact documents the endpoints use. The endpoints themselves are untested.
- **Relays and IPFS.** Written up, not started — see
  `docs/decisions/adr-q-001-questions-as-predicates-and-relay-lifecycle.md`,
  which also covers treating schema as questions. Its §8 (IPFS is public by
  default) has to be settled before any of it is built.
- **`zk-2fa.ts` and `second-factor.ts` now overlap this.** Both store a contact
  hash in `localStorage` with no receipt and no proof. Channels do the same job
  with evidence behind it. They should probably fold into channels rather than
  sit alongside — an ADR, not a quiet deletion.
