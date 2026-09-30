# ADR-Q-007: Federations, membership and strands

**Status: accepted, 28 September 2026.** Darren: "let's not limit or
overcomplicate it … a federation may be something so simple as a stamp
collectors club … a place where everyone agrees to be nice … each strand type
will have specifics it has to do and cannot do. And that's the way we start
from in the building blocks." On seats filled by lot: "it's variable. And it's
determined by the Federation itself."

**Built (28 September), build-order step 1 and part of 2:**
`q-core/federations.ts` — drafts (unsigned, editable, reopened as often as you
like), founding with two signatures naming the manifest (Layer A principles +
Layer B constitution), the founder's `federation.joined` as member one, and
the caretaker mandate as a UCAN that expires; 10 tests. Every founding is
checked by the core action `federation.found` (q-actions, ADR-Q-009) before
it is kept; 6 more tests. In Q: New federation → a draft at
`/federations/draft`, listed under Drafts; **Found it** founds it. Records
from the old `federation.ts` are shown as "Old record".

**Then membership (same day):** `q-core/membership.ts` — invitations signed by
the federation key and carried in a link's `#fragment` (or a QR code); on
**open** and **invite** policies the invitation is a standing offer, so
signing the agreement makes a member at once, no round trip; on **ask to
join**, the signed request goes to the caretaker, who countersigns and sends it
back. Leaving is signed by the member alone. Removal is signed by the
federation, cites a clause and says why, and leaves every earlier receipt
valid. 11 tests. Checked by three more core actions — `federation.join`,
`federation.leave`, `federation.remove` — 7 more tests. In Q:
`/federations/one` (invite, members, remove, leave) and `/federations/join`
(where every link lands).

**Suspension (Darren, same day: "some members get a month ban").** Still a
member, paused until a date, then back on its own. Signed by the federation,
citing a clause and saying why; it must end, within a year (anything longer
is a removal); it cannot be backdated; it can be lifted early; it never stops
someone leaving. Checked by `federation.suspend`. Removals, suspensions and
liftings each give the caretaker a link to send the member, whose Q keeps it
with their membership.

**Consent, step by step (Darren, same day: "a consent form … done in
neurodivergent steps rather than overwhelm … each federation can build its own
blocks into the consent form").** A federation adds its own consent blocks in
the draft (suggestions: photos, subs, looking after children, keeping in
touch, what we keep); every federation also has two it cannot drop — the
agreement, first, and what can never change, last. Joining shows one step per
screen, each agreed on its own, with "Not for me" at every step (nothing is
signed). The joining names every step agreed, by hash; `federation.join`
refuses one that skipped any.

**How a member is known is part of their consent:** anonymous, name only, or
name and a small picture (96 px). The card is sealed to the federation key —
only the caretaker opens it — and named by hash in the signed joining, so it
cannot be swapped; it can never carry more than was chosen
(`federation.join/cannot/share-more-than-chosen`, checked on both sides).
Not yet: Plans, Offices and the other blocks;
renewing the caretaker; links carried over MQTT instead of by hand.

---

## The idea in one paragraph

A federation is a **key founded by a person**, the same way a site is
(ADR-Q-003). Every federation has the same tiny **core**. Everything else is a
**block** that switches on when the federation starts doing the thing the
block governs, and each block brings its own **must** and **cannot**. A
**strand** (club, association, CIC…) is only a preset: a named bundle of
blocks. A stamp club is the core and nothing more; a CIC is the core plus the
blocks the law requires.

## Where it comes from

The incubator (inQbeta repo), read in full on 28 September:

- **The chain** — `docs/architecture/adr-003-identity-membership-mandate-doctrine.md`:
  Identity → Membership → Mandate → Authority, no skipping. "Membership does
  not create authority." "Founder attribution does not create perpetual
  authority."
- **Joining is a person signing** — `t2-gate-001-…`: "Membership belongs to a
  subject — not a session." "Joining is not authentication." Admin-assigned
  membership is invalid.
- **Membership is not mandate** — `t2-gate-002-…`: "Belonging may support
  legitimacy. It must never substitute for mandate." PA11: a role column must
  never gate governance.
- **Offices and mandates** — `t2-fed-002-…`, `t2-mandate-001-…`: "Office names a
  slot — mandate authorizes acting within it." Every mandate has scope, term,
  grantor, revocability. "Mandates expire." AI may never hold office.
- **The seam** — personal Sign, refusal, exit and the continuity home sit above
  every institution. "Committee vote = personal consent" is forbidden.
- **Genesis** — `observations/obs-001-lms-as-receipt-reader.md` §5.4: the
  founder signs, the new federation key signs back. "Without anybody, it
  cannot exist. That's the safeguard."
- **Layered constitution** — `federation-boundary-manifest-discovery.md` §6:
  immutable principles / manifest / local rules.
- **Honest about capture** — `constitutional-hostile-reality-pressure-test-frozen-doctrine.md`:
  "Captured votes look constitutionally valid." The defence is structure
  (short, split, recallable power; cheap exit), not detecting bad people.

What the incubator never settled, and this ADR does: how office-holders are
chosen, how one person gets one vote, whether the rules for changing rules
can be voted on, and how a small club avoids all of it.

---

## 1. The federation key

Founded exactly like a site (ADR-Q-003):

1. A random Ed25519 key is made and held in the founder's vault.
2. `federation.founded` is signed by **both** the founder's DID and the new
   federation key, and names the manifest hash. Neither signature alone
   founds anything.
3. The federation key delegates a UCAN to the founder for the caretaker
   mandate (§3), with an expiry.
4. The federation DID is published the same way as a site's
   (`_inqbeta.<domain>` TXT and/or the DHT), when it has a public name.

The Federation ID **is the federation key's DID**. The random `fed_` string
goes. Other incubator ID shapes (`fed.slug`, UUIDs) become names bound to the
DID, never the identity.

The key is transferable and rotatable like a site key (`generation` counts).
Holding the key is custody, not authority: what it may sign is governed by
the manifest.

## 2. The manifest: three layers

| Layer | What | Who changes it |
|---|---|---|
| **A. Principles** | Fixed for every federation (below). | Nobody. Not votable. |
| **L. Legal form** | What the law requires of this strand (CIC, co-op, CIO, company). Empty for an informal club. | Legislation. A federation may add to it, never go below it. |
| **B. Constitution** | Purpose, the shared agreement, which blocks are on and their settings. | The federation, by the rules in its own Plans block. |

**Layer A — the principles every federation carries:**

1. Anyone may leave, at any time, alone, keeping their receipts.
2. The person sits above the federation: no federation owns a member's DID,
   keys, receipts or consent.
3. Nothing institutional is permanent: every office has a term.
4. Removal ends belonging only; past receipts stay valid.
5. One person, one vote, wherever votes exist.
6. The rules for changing the rules are not themselves votable below
   Layer A's floor (§6).

Every manifest version is a receipt; `federation.founded` and each change
name the hash.

**Written by an interview.** Layer B is drafted by an AI-guided set of
questions, as DoStudy's course creation was (and the incubator's Friendship
Federation questionnaire and Plugin Permission Interview). The interview asks
only about blocks that apply — a stamp club gets three questions, a CIC the
full set — and explains each trade-off as it goes. **The AI drafts; people
sign.** A manifest exists only when the founder and the federation key sign it.

## 3. The core — every federation has this and nothing else is required

- **Federation key** (§1) and **manifest** (§2).
- **Shared agreement.** The "we agree to be nice": a short code of conduct in
  plain words. Every member signs it when joining.
- **Membership receipts** (§4): joined, left, removed.
- **Caretaker.** The founder holds a caretaker mandate with a term (default
  one year). It lapses unless renewed by the members; it cannot renew itself.
  The caretaker can admit members (if the join policy needs it) and remove
  someone only by citing the agreement.
- **Closure.** `federation.closed`, signed by the caretaker or by the Plans
  block's decision. Closure ends the federation, never the people; receipts
  survive.

That is the whole of the stamp club.

## 4. Membership

Membership is **belonging and nothing more** — no role, no power. Three
receipts:

| Receipt | Signed by | Notes |
|---|---|---|
| `federation.joined` | The person's DID **and** a countersigner: whoever holds the admit mandate, or the federation key under an open join policy. | Names the manifest hash, so the person consented to the rules as they stood. Includes signing the shared agreement. |
| `federation.left` | The person alone. | Exit never needs permission. |
| `federation.removed` | A holder of the remove mandate. | Must cite a clause of the agreement or constitution. The person keeps everything they had. |

Join policy is a setting of the constitution: `open`, `request` or `invite`.
An invitation is a signed object (the incubator never had one): it names the
invitee if known, expires, and still needs the person's own signed join.

Rejoining after removal needs a fresh signed join. Nothing is restored
automatically.

A person's worlds (ADR-Q-005 step 6) are separate DIDs; each membership is
held by one of them.

## 5. The blocks

A block turns on when the federation **does** the thing, not when it calls
itself something. When a federation starts doing it without the block, Q says
so: "You're holding money now — the Money block is needed."

| Block | Turns on when | Must | Cannot |
|---|---|---|---|
| **Plans** | Members want to agree things together | Anyone may propose; one person, one vote; ballots open and close at fixed times; eligibility is snapshotted at open; results are receipts | The caretaker deciding alone once there are other members |
| **Offices** | Someone acts for the group | Each office is a named slot with scope, term and a recall path; holding it is a UCAN mandate from the federation key with `exp` | Be permanent; renew silently; be held by an AI |
| **Money** | Subs, fees or any funds are held | A treasurer mandate; two signatures on any spend; accounts published as receipts | One person holding the purse alone |
| **Standing** | Votes carry real stakes (offices, money, constitution) | Voting and standing for office need vouching by members plus a waiting period; vouchers stay on record | New joiners voting at once |
| **Board** | There is a management body | Staggered terms; consecutive-term limit; a seat mix set by the federation (elected, by lot, or both); recall by petition | Winner-takes-all without the interview having shown what that allows |
| **Committees** | The board delegates a job (events, treasury…) | Narrow scope, short term, mandate from the board | Outlive their term; widen their own scope |
| **Legal form** | It is a CIC, co-op (Community Benefit Society), CIO or company | Everything the law requires for that form (§7) | Anything below the statutory floor |
| **Safeguarding** | Children or vulnerable adults take part | A named safeguarding lead | Being switched off while it applies |
| **Treaties** | It deals with other federations | Bilateral, signed by both, scoped, time-limited | "Trusting the other federation" in general |
| **Components** | It uses outside components (ADR-Q-006) | Approval as receipts signed by holders of the approve mandate | Approval by membership alone |

Each block's Must and Cannot are its **charter** (ADR-Q-008): checked by every
reader, and a federation's own version may only add to them, never loosen.

Blocks depend on each other where they must: Board needs Offices, Standing
and Plans; Money needs Offices.

## 6. Elections and changing the rules

**An election result is a mandate.** Closing a ballot produces a
`decision.outcome` receipt; for an office, that receipt is followed by the
federation key's UCAN delegation to the winner, with the office's scope and
the term as `exp`. No receipt, no mandate.

**Seats by lot are variable** — each federation chooses in its Board block:
all elected, all by lot, or a mix. Lots are drawn from members with standing,
using randomness anyone can check (the hash of the ballot-close receipt).

**Multi-seat elections are proportional by default** (single transferable
vote), so a 51% bloc cannot take every seat. A federation may choose
otherwise only after the interview has shown what that allows.

**Changing the constitution** (Layer B) needs a supermajority, a quorum, and
a cooling-off period before it takes effect, during which anyone may leave
with their receipts. **Changing the seat mix, term limits, recall or voting
method counts as a constitutional change** — otherwise a bloc that has just
won could vote the protections away straight after.

**Layer A cannot be changed by any vote.** This settles the incubator's open
contradiction between `docs/wiki/Rules-and-Governance.md` (rules amendable by
the same process) and the hostile-reality doctrine (meta-rules must be fixed).

**Founder handover.** When the Board block turns on, the caretaker mandate
ends at the first election, which must be held within the time the
constitution sets.

**Conflicts of interest** are recorded, as the incubator requires (a record,
never a score or a veto). A federation may add a recusal rule in Layer B; Q
does not impose one.

**The last defence is leaving.** Members hold their own receipts, so a
captured federation can be abandoned and re-founded with its history. There
is little to win by capturing something people can walk out of intact.

## 7. Legal forms

Where a federation is also a legal body, the law sets Layer L. Summary (to be
checked with a lawyer before building on it):

- **CIC** (usually limited by guarantee). Directors run it; members appoint
  directors as the articles say, can remove any director by ordinary
  resolution (Companies Act 2006 s168), and change the articles by special
  resolution (75%). Asset lock; annual community interest report.
- **Community Benefit Society** (co-operative). One member, one vote is part
  of the model — the closest legal fit to Layer A.
- **CIO** (charity). *Association* model: voting members elect trustees.
  *Foundation* model: trustees only.
- **Informal club / unincorporated association**: Layer L is empty; the
  constitution decides.

**Receipts are evidence, not the filing.** An election that appoints a CIC
director produces the mandate receipt; the Companies House filing still has
to be made. Q can prepare it from the receipt.

## 8. Strands are presets

| Strand | Blocks on by default |
|---|---|
| **Circle / club** | Core only; Plans if wanted |
| **Association** | Plans, Offices; Money usually |
| **CIC / co-op / CIO / company** | Legal form, which pulls in Offices, Money, Standing, Board, Plans |
| **Event** | Core with a fixed end date (the incubator's federation-as-a-window); Money and Safeguarding as they apply |

A strand is where the interview starts, not a limit. Any federation may turn
on more blocks as it grows; Q prompts when activity needs one.

## What changes in the code

`q-core/federation.ts` today does what this ADR forbids:

- the founder is a permanent role, and `rules.canRemove: ['founder']`;
- roles (`founder | admin | member | observer`) live on the membership record;
- `calculateTrustScore()` scores federations (the incubator: "trust as a
  sentence, never a score");
- the ID is a random `fed_` string with no key; sealing is single-signature;
- `joinFederation` / `leaveFederation` are stubs that write nothing.

It is replaced, not patched.

## Build order

1. **Core.** Federation key and two-signature `federation.founded`; manifest
   Layer A + B as a checked, AI-readable data structure (same style as
   ADR-Q-006 manifests); shared agreement; `joined` / `left` / `removed`
   receipts; caretaker mandate as a UCAN with `exp`; `closed`. Tests.
2. **The interview** for the core and the Circle/club strand.
3. **Plans and Offices**: proposals, ballots with eligibility snapshots,
   `decision.outcome` receipts, mandates from outcomes, recall.
4. **Money** (two-signature spends, accounts as receipts).
5. **Standing, Board, Committees**: vouching, waiting period, STV, lots,
   staggered terms.
6. **Legal form** presets for CIC, co-op and CIO, starting with the one Dark
   Olive needs.
7. **Treaties, Safeguarding, Components approval** as they are needed.

## Non-claims

This does **not**:

- decide where a federation's shared state lives (ADR-Q-006 open question) —
  receipts are person-held; a shared index is still open;
- give legal advice — §7 is a summary to be checked;
- provide secret ballots yet — pseudonymous voter tokens are a design
  requirement of the Plans block, not built;
- prove personhood — vouching makes one-person-one-vote accountable, not
  certain;
- detect or label people — the incubator's markers of "behavioural risk" or
  "neurodivergent traits" are not used; protection comes from structure;
- implement any of it yet.

## Open questions

- **Vouching numbers and waiting period** — defaults, and whether in-person
  vouching (the incubator's Proximity Handshake) counts for more.
- **Secret ballot mechanism** — how a pseudonymous voter token is issued
  against a snapshot without the issuer learning the vote.
- **Nesting** — is a working group a committee (a block inside one
  federation) or its own federation under a treaty? This ADR assumes
  committee; the incubator left it open.
- **Events and organisations** — the incubator separates a long-lived
  Organisation from time-bound federations. Here an Event is a strand; whether
  it should be a child of a longer-lived federation is open.
- **Caretaker default term** — one year is a starting guess.
