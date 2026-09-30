# Copies and doors

**2026-09-20 — where adding a channel helps, and where it is how accounts get
taken.**

> "Building your own personal vault security is about you adding channels. And
> that's not opening up more risk, it is actually opening up more resilience."

Half right, and the half that is not is worth a whole file, because it is the
difference between a vault and a vault with a back door somebody drew on it
themselves.

> **A copy is as strong as its strongest.**
> **A way in is as strong as its weakest.**

---

## Why places and doors behave in opposite directions

Add a **place** — a folder, a bucket, a drive — and you add a *sealed copy*.
Nobody gains a route to become you. Losing one costs nothing. More is better,
without qualification. That part of the instinct is exactly right, and it is
what `places.ts` and `lifecycle.ts` are built on.

Add a **way in** and you add a *route*, and an attacker takes the cheapest one
available. A hardware key, a passkey and a phone number, any one of which gets
you in, is a vault protected by **the phone number**. The other two are
decoration.

This is not a theoretical worry. It is the standard way accounts are taken,
and [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)
now classes SMS as a **restricted authenticator** in revision 4 for exactly
this reason. A phone number is not a possession; it is a customer-service
decision.

So: `q-core/src/ways-in.ts`, 147 tests passing.

## But the instinct is aimed at a real problem

**One passkey and a cleared keychain is the largest genuine risk in Q today.**
Wanting more than one route back into your own vault is correct. The answer is
not more doors. It is three things.

### 1. Separate notifying from letting in

A channel that can only *tell you something happened* adds no risk at all. Add
ten. Add every messenger you have. `channels.ts` already distinguishes
`notify` from `sign-in`, and `risksAccess()` now makes that the test: only
`sign-in` puts a channel on the list that matters.

This is most of the resilience wanted, at no cost to the lock.

### 2. For the ones that do let you in, require more than one at once

Two of three turns every added channel from a subtraction into an addition,
because the cheapest route now costs two things rather than one.

With `hardware`, `passkey` and `sms`:

| needed | what it costs an attacker | what you can afford to lose |
|---|---|---|
| any one | the price of `sms` alone | two |
| two of three | `sms` **and** `passkey` | one |
| all three | everything, hardware key included | none |

`keys.ts` already has `MultiSigCondition`. This is the argument for reaching
for it, and `costToBreak(ways, needed)` is that table as a function — the sum
of the `needed` cheapest, because that is what an attacker actually pays.

### 3. Show the weakest first

Ordering by "most secure first" is comforting and backwards. A list headed by
a hardware key tells a person they are safe; the truth is at the bottom.
`inOrder()` sorts weakest first, and every way in names **its actual attack**
rather than a vague risk:

- **sms** — a phone number can be moved to another SIM by persuading a shop assistant.
- **messenger** — tied to a phone number, and so is getting the account back.
- **email** — only as strong as the email account, which is usually protected by a password and a phone number.
- **person** — they can be convinced it is you. Being helpful is the weakness.
- **password** — guessed, reused elsewhere, or typed into a page that only looked like this one.
- **recovery-phrase** — anyone who has seen the paper, or a photo of it, is in.
- **passkey** — someone would need your device unlocked, or the account your keychain syncs through.
- **hardware** — someone would have to be in the room and take it.

Note what that ranking does to the original list. *Email, WhatsApp, fingerprint,
Ledger* spans the entire range, and with any-one-is-enough the Ledger is worth
precisely nothing.

## The sentence Q says at the moment it matters

`effectOfAdding()` runs when somebody adds a way in, because that is the only
moment the advice is free — afterwards it is a migration and an argument.

- Adding `sms` to `hardware` + `passkey`:
  *Anyone getting in now only needs sms. A phone number can be moved to
  another SIM by persuading a shop assistant.* → **require two of your 3 ways
  at once. Then this adds to your safety instead of subtracting from it.**
- Adding `hardware` to `passkey`:
  *Nothing gets easier for anyone else, and you can now lose 1 and still get
  in.*
- The very first way in:
  *passkey is your only way in. Losing it loses everything.* → **add a second,
  and then require two at once so the second is not a spare key under the mat.**

A person is entirely allowed to trade strength for convenience. They are not
allowed to do it without being told.

## The ordering question, answered properly

> "I can say which one I will prioritise. Or if there's a natural order, the
> most secure goes first."

There is a natural order, and it is not for choosing which to *use* — it is
for showing which one **decides**. Priority ordering only makes sense when any
single way is enough, and that is the configuration we are trying to talk
people out of. Once two are required, ordering stops mattering and the
question disappears.

## Where this leaves the shape

```
places   →  more is better, always          →  strength = the strongest
ways in  →  more is worse, unless k rises   →  strength = the k cheapest
notify   →  free. add everything.           →  no route to become anyone
```

Same receipt, same verification, same DID. Opposite arithmetic. Getting those
two the same way round is what makes a vault a vault.

## Next

- `q:access/*` as a question set: which ways in, and how many are needed.
- `second-factor.ts` currently offers `email | sms` only, which by the ranking
  above are the two weakest things on the list. It should offer hardware and
  passkey, and should say what each costs an attacker when it offers them.
- The threshold itself needs to exist in the unlock path, not just in
  `keys.ts` types.

## Sources

- [NIST SP 800-63B rev 4, Authenticators](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)
- Internal: `channels.ts`, `keys.ts`, `second-factor.ts`, `places.ts`, `places-are-channels.md`
