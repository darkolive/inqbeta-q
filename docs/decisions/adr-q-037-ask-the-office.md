# ADR-Q-037 — Ask the office, not the person: the coin names who answers

**Status:** proposed 5 October 2026, not yet built. It builds on offices and
mandates (ADR-Q-007 §5–6), messages (ADR-Q-010), the receptionist (ADR-Q-022)
and the federation's bank and its coin (ADR-Q-035 §3).

## Why

Today the **Ask {bank}** button on a coin's statement opens a conversation with
the federation's **founder**, by their DID
(`routes/balance/[mint]/+page.svelte`). That's a person, and people move on.

Darren, 5 October 2026:

> "The ask incubator button to contact the minter … went to the name, the
> person, and that needs to go to the role person that's assigned that button.
> So when you're creating a mint, who should we contact and say it's the
> treasurer? Then whoever has the role treasurer that year is the person that
> would receive that message, or that department, whatever that role base might
> be. But you put that in the coin, which is part of the organisational tree."

A coin outlives whoever minted it. The question "who answers for these books?"
has a lasting answer, which is an office: the treasurer, the finance committee,
the board. Who holds that office changes every term. So the coin names the
office, and the federation's own records say who holds it today.

## Decided (proposed)

### 1. The coin names an office

When a federation publishes its coin (`MoneyPublication`, set in the coin
designer beside the name and design), it names **who answers for it**: an
office from its Offices block (ADR-Q-007 §5), such as `treasurer`. It's stored
like the coin's name, as a setting line (`Q_COIN_CONTACT`), and signed with the
rest of the publication.

- It defaults to **treasurer**, because the Money block already requires a
  treasurer mandate.
- It can name any office or committee in the federation's tree, for example
  "finance committee", "board" or "grants officer" for a grant (ADR-Q-036).

### 2. The message goes to whoever holds it now

**Ask** is resolved when the message is sent, not when the coin was made. The
federation's records say who holds the office today: the current, unexpired
mandate (a UCAN from the federation key with the office's scope and the term as
`exp`, ADR-Q-007 §6). The message is sealed to that holder.

- When the term ends and someone new is elected, the button reaches them,
  without the coin changing or anything being republished.
- An old receipt never points at someone who has since left.

### 3. An office can be a department

If the office is held by several people (a committee, a team), the message is
sealed to **every current holder**, and any of them can answer. The reply is
signed by the person who wrote it, saying the office they answer under: "Sam,
for the Treasurer of Green Space".

### 4. The receipt names the office, and the mandate it reached

The message receipt records the office it was sent to and the mandate of the
holder or holders it reached. Later, anyone can show that the question went to
the person who held the office at the time, which is the compliance point of
**Ask** (ADR-Q-035 §3).

### 5. The button says the office, in words

The button reads **Ask the treasurer** (or "Ask the finance committee"), with the
federation's name beside it. It doesn't show a person's name, because the person
isn't the point. It can say who holds the office today if the federation chooses
to show it.

### 6. A vacant office says so

If nobody holds the office (a term lapsed, an election is still open), the
button says so plainly, for example "No treasurer at the moment", and offers the
caretaker instead (ADR-Q-007: the caretaker has a term too). It never quietly
goes to somebody else.

### 7. This holds everywhere Q speaks for an organisation

Anywhere a button contacts **an organisation**, it names an office, not a
person:

- the coin's statement and its verify page ("Who stands behind it");
- a shop or offer ("Ask the seller" as the shop's office);
- the safeguarding lead (ADR-Q-007 Safeguarding block);
- a grant's office (ADR-Q-036);
- the receptionist (ADR-Q-022). It can answer at the front of an office, say so
  and pass the call on, but it can never **hold** an office, because AI may
  never hold office (ADR-Q-007).

A person's own card still reaches that person. Only an organisation's buttons
name offices.

### 8. The coin is part of the organisational tree

The coin points into the federation's tree: federation → board → committees →
offices. Its contact is one branch of that tree, and so is everything else that
answers for the coin, such as who can reconcile, who signs cash-outs (two
signatures, ADR-Q-007 Money block) and who signs a grant. As the tree is built,
"the founder" disappears from these places, and the office that holds the duty
takes its place.

## Open question

**Handing over a conversation.** Messages are sealed to the holders at the time.
When the office changes hands, an open conversation needs to reach the new
holder. The proposal is that handing over the office (the new mandate) re-seals
the office's open threads to the new holder, as part of the handover receipt, so
history is passed on deliberately and is recorded. This is not yet decided.

## What this does not claim

- **That offices exist yet.** The Offices block (ADR-Q-007) isn't built. Until it
  is, the founder answers as **caretaker**, and the button says "Ask the
  caretaker", not the founder's name.
- **That an office answers quickly.** It names who is responsible, not how fast
  they reply.
- **That anyone outside the office can read the conversation.** It's sealed to
  the holders, like any message (ADR-Q-010).

## Build order

1. **The coin's contact**: `coinContact` on `MoneyPublication`,
   `Q_COIN_CONTACT` in host services, and a choice of office in
   `CoinDesigner`, defaulting to treasurer.
2. **Interim**: the mint API returns the contact office and today's answerer
   (the founder, as caretaker), and the **Ask** button and `CoinCheck` show the
   office's name.
3. **Resolving the office**: `officeHolders(federation, office, at)` from
   mandates, when ADR-Q-007 Offices is built. Messages are sealed to every
   holder.
4. **The receipt** names the office and the mandate it reached.
5. **Vacancy** and the caretaker fallback, said in words.
6. **Handover of open threads**, once the open question is settled.
7. **Everywhere else** (§7): shop, safeguarding and grant buttons move to
   offices.

## Related

- ADR-Q-007: federations, offices, mandates, the caretaker.
- ADR-Q-010: messages.
- ADR-Q-022: the receptionist.
- ADR-Q-035: the federation's bank; Ask the federation.
- ADR-Q-036: credits held by rule; the grant's office.
- `q/showing-money.md`: the design language this sits in.

## As built, 6 October 2026 (steps 1–2; job C3)

- **The coin's contact** is an office: `coinContact` on `MoneyPublication`
  (signed in when published), `Q_COIN_CONTACT` in Money, chosen in the coin
  designer under "Who answers for it" (treasurer, secretary, chair,
  compliance officer or caretaker), treasurer unless chosen.
- **The mint** reports `contact: { office, called, answerer, answererOffice }`.
  Until office holders are published to the host, the answerer is the
  caretaker (the founder).
- **The coin statement's button** says "Ask the treasurer … of Green Space,
  whoever holds it now", and the coin check says questions go to the office,
  never to a named person.
- **Next (step 3)**: publish who holds each office to the host, so the button
  reaches the holder, not the caretaker.

