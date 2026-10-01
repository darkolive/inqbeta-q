---
status: proposed
implementation: none
updated: 2026-10-01
---

# ADR-Q-016 — Incubator is a federation

**Status: proposed, 1 October 2026.**

## Context

Darren, 1 October:

> "Even this incubator Q website … is a receipt Q website itself. So all the
> blocks, everything is built as Q receipted. And therefore its functioning —
> AI modelling, email route, all of those things — can live in a federation,
> and the whole incubator rules is a federation. So when someone signs up their
> contract is with Incubator and by doing so they become a member … Then the
> federations, storage, bellboy and directory are all controlled through
> Incubator's federation console. And only I can access that because it's just
> my thumbprint … And all people see is what they see about any federation …
> how many members, how many websites … but only if we need to know."

Today the opposite holds in places: Q's services are configured by environment
variables on a server (`PUBLIC_BELLBOY_*`, `Q_MAIL_FROM`, AI keys), which is
exactly the kind of quiet central control a federation exists to replace, and
the reason the bell can't simply go live.

## Decision (proposed)

### 1. Incubator is founded like any federation

- Founded in Q, from Darren's root, with the federation flow everyone uses
  (ADR-Q-007): a name, a purpose, an agreement, consent steps, the principles
  no vote can change. Darren is its caretaker.
- Its **founding and manifest are published**, signed by the federation key,
  at a fixed address on inqbeta.com (`/incubator.json`). Every Q reads them and
  checks the signatures; it never trusts the server that served them.
- It holds **no special power**. It is a federation like any other, with the
  same offer and the same cannots (ADR-Q-010 §10, the commons).

### 2. Signing up is joining

- After the passkey (which always comes first), a new person is shown
  Incubator's consent steps, one at a time, and signs their joining. Their
  contract is with Incubator; they become a member.
- A **standing invitation**, signed by the federation and published with the
  manifest, admits anyone who signs, so joining needs no one's approval.
- Incubator holds only what each member chose to send — anonymous, name, or
  name and picture (ADR-Q-007). Leaving needs no one's permission.

### 3. Everything Incubator runs is a service of the federation

| Service | What it is | Replaces |
|---|---|---|
| **Bellboy** | Mosquitto (ADR-Q-014) | `PUBLIC_BELLBOY_URL` |
| **Directory** | Dgraph | — |
| **Storage unit** | SeaweedFS | the storage address inferred from the bellboy |
| **AI** | Q credits (ADR-Q-013) | server AI keys |
| **Email route** | the sending service and address | `Q_MAIL_FROM`, `RESEND_API_KEY` as policy |

- Each service is a **record signed by the federation key**: where it is, what
  it must and cannot do, its capacity (ADR-Q-008, ADR-Q-010 §10).
- Q **reads its services from the signed list**, not from server settings. A
  list that doesn't check out is refused, so nobody who controls a server can
  redirect members to their own bellboy.
- Secrets stay where they must (an email provider's API key lives with the
  service that sends), but which service is used, and its rules, is the
  federation's signed statement.

### 4. The console is the federation's Settings, and only the caretaker opens it

- Bellboy, directory, storage, AI and email are managed from the federation
  page's **Settings** tab, which opens only when the federation key unseals —
  and it is sealed to the caretaker's passkey. Darren's thumbprint is the lock.
- There is no admin password and no server-side admin route. Changing a service
  writes a new signed record; the old one stays as evidence.
- Later, the same console serves a Board (ADR-Q-007 §5) when there is one.

### 5. What people see: only what Incubator chooses to publish

- Visitors and members see Incubator's public face like any federation's: its
  purpose, its agreement, what can never change — and **published facts**:
  members, websites, nodes, when they were counted.
- Facts are **published by the caretaker, signed and dated**, never tracked
  live, and only what's useful for deciding to join ("need to know"). No
  member is ever listed.

## Consequences

- **The bell can go live** once the bellboy has a public secure address
  (ADR-Q-010 §6, e.g. a TLS name in front of Mosquitto) and members sign in to
  it with their key rather than a shared password (ADR-Q-010 §5). The signed
  service list tells every Q where it is.
- **Server environment variables shrink** to secrets and the passkey domain.
- **Every other federation works the same way**, so a club running its own
  bellboy and storage uses the same console, and its members' Q finds them the
  same way.

## Build order

1. **Found Incubator** in Q (Darren, on inqbeta.com) and publish its founding,
   manifest and standing invitation at `/incubator.json`; Q reads and checks it.
2. **Signing up joins Incubator**: consent steps after the passkey; a
   membership card appears in every member's Cards page.
3. **Signed service records** in the console (the Nodes section grows into
   Services: bellboy, directory, storage, AI, email); Q reads them instead of
   env settings — the bell first.
4. **Published facts** on the home page and Incubator's Home tab.
5. **The bellboy's public address and DID sign-in**, so the bell works on
   inqbeta.com.

## Non-claims

This does **not**:

- decide Incubator's agreement or consent steps — Darren writes those when
  founding it;
- make Incubator's caretaker permanent: the caretaker mandate expires and
  renews like any federation's (ADR-Q-007), and a Board can take it over;
- move any secret into a browser.

## Related

ADR-Q-007 (federations, membership, blocks), ADR-Q-008 (must and cannot),
ADR-Q-010 (messages; §5 sign-in, §6 reaching it, §10 offers and the commons),
ADR-Q-013 (AI keys and credits), ADR-Q-014 (bellboy, directory, storage unit),
ADR-Q-015 (cards; membership cards).
