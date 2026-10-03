---
status: decided
implementation: built 3 October 2026 — the exchange set (from-head.ts; agreementNow; ExchangeCard, ExchangeNow, ExchangeTimeline); the writer set (writer/StepWriter: host set-up, backups, your card and the agreement writer); the share set (lib/share.ts behind ShareLink and ShareLinks); the sign-in set's one rule (signin-stay.ts: signing in leaves you where you are). Next: calls, link requests and invitations onto the exchange set
updated: 2026-10-03
---

# ADR-Q-029 — Component sets: one group for what repeats, each use saying only its exceptions

**Status: decided, 3 October 2026; the four sets are built.** Where Q repeats a pattern — an offer
answered and settled, a writer in steps, sharing a link, signing in — the
pattern becomes one **component set**: components that go together, holding
the normal behaviour once. Each place that uses it states only what's
different. And a chain of signed steps is read **from its head**: the latest
hash vouches for everything before it.

## Context

Darren, 3 October 2026:

> "Thinking about these components as component groups that go together to
> make a component set. Because they keep repeating throughout the site …
> where replication is, there should be a singular group that has all of that
> held in. Because again, it comes down to those rules, everything except.
> And as we're finding with the hashing of the hash, the end of the story is
> much more efficient than the beginning in telling the whole story."

The same day showed the cost of copies: the agreement writer's Next button
stayed greyed out because of a bug in one of four separate step writers; a fix
there leaves three others able to break the same way.

What repeats today:

| Pattern | Copies |
|---|---|
| **Exchange**: offer → answer → settle, a chain of signed steps | agreements, shop purchases, offer links, calls (ring → answer/decline), link requests (ask → approve), federation invitations (invite → join) |
| **Writer in steps** | host set-up, backups, your card, the agreement writer |
| **Sign-in** | `SignIn`, `SignInBlock`, `NoteTouch`, `SignSite` |
| **Share** | `ShareLink`, `ShareLinks`, `ShareCard` |
| **Picture story** | already one set: `PictureStory` plus each story's scenes — the model for the rest |

This is ADR-Q-006's step 3 ("assemble first") made concrete: sets assembled
from components Q already has, before anyone writes new ones.

## Decision (proposed)

### 1. A set holds the normal; a use states the exceptions

Like the rules engine (everything allowed except what a rule forbids), a set
does the usual thing unless told otherwise:

- the **shop** is an exchange where countering and declining aren't allowed;
- an **open offer** is one where the other side isn't known yet;
- a **call** is one that runs out after 90 seconds and settles nothing;
- a **writer** for a shop offer has one extra field (how many).

So a new use is mostly a short list of exceptions, and a fix to the set fixes
every use.

### 2. Read from the head

Every step of an exchange names the step before it by hash, so the latest
step's hash commits to the whole story. A set keeps the **head** and rebuilds
"where it stands" backwards from it, checking each step as it goes — what
`standingOf` already does for agreements, made general.

`chain.ts`'s caution holds: a head proves *a* history, not *the* history,
until the other side has signed it too. Exchanges have both sides sign the
step that counts (agreeing, settling), so they get the strong version.

### 3. The sets

1. **Exchange**
   - q-core: one chain reader, given a set of step rules (who may take which
     step, from which phase, answering which hash). Agreements are the first
     rules; calls and link requests follow.
   - Screens: `ExchangeCard` (who, what each gives, where it stands),
     `ExchangeNow` (only the buttons open to you, each checked by the rules
     before it's signed), `ExchangeTimeline` (every step as a sentence, the
     magnifier opening its receipt).
2. **Writer** — `StepWriter`: steps as data (title, what it asks, when it's
   ready to go on), one Next/Back footer, one read-back, sending at the end.
3. **Share** — one `Share`: AirDrop and more (the device's share sheet), email,
   WhatsApp, text, a code to scan, copy.
4. **Sign-in** — one `SignIn`, staying where you are unless told otherwise.

Each set's components get a manifest (ADR-Q-006), so the brief a model reads
says what the set promises and what a use may change.

## Build order

1. The exchange set; agreements and the shop move onto it, behaviour
   unchanged, tests first.
2. The writer set; the four writers move onto it.
3. The share set and the sign-in set.
4. Calls, link requests and federation invitations onto the exchange set, one
   at a time.

## As built (3 October 2026)

- **Exchange:** what you can do is decided in `agreementNow` (q-core, tested);
  the page draws `ExchangeNow`, `ExchangeCard`, `ExchangeTimeline`. The
  timeline ends by reading the story back from its head (`fromHead`).
- **Writer:** `StepWriter` holds the steps, Next, Back, the finishing button,
  the "Next wakes up" hint and errors. Each writer passes only its steps, what
  makes a step ready, and its exceptions (saving before moving on, steps you
  can't go back to, a way out on the first step).
- **Share:** one module (`lib/share.ts`: the share sheet, copying, the plain
  share addresses) behind the two components, which stay separate because
  they do different jobs — sending one person a link, and telling the world
  about Q. `ShareCard` (choosing what a card shows) already used `ShareLink`.
- **Sign-in:** the copies differ on purpose (the front door's calm block, the
  compact one, the touch that notes where your vault is, signing a website),
  so the set is one rule rather than one component: signing in leaves you
  where you are (`signin-stay.ts`). Only the Keys page goes home after.

## Non-claims

Moving onto a set must change nothing a person sees or signs: receipts keep
their schemas, and the rules keep deciding. A set is a way of writing Q once,
not a new protocol.

## Related

ADR-Q-006 (components, manifests, blocks — step 3), ADR-Q-008 (must and
cannot: everything except), ADR-Q-009 (actions and the engine), ADR-Q-025
(agreements), ADR-Q-026 (offers and shops), `q-core/src/chain.ts`.
