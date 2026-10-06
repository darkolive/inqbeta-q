# ADR-Q-038 — Acting in role: say which hat you're wearing

**Status:** proposed 5 October 2026. Step 1 is built: the switch, with
caretaker as the first office (`lib/role.svelte.ts`, `RoleSwitch`, `RoleBand`).
Step 5, the offices themselves, and step 2, in-role receipts the servers
check, are built (6 October; see *As built* below).
The founder's Website, Services and Settings tabs, Invite, Tell your members,
New this week and Reconcile now show only in role. It builds on offices and
mandates (ADR-Q-007), must and cannot (ADR-Q-008), messages (ADR-Q-010), cards
with a purpose (ADR-Q-015) and asking the office (ADR-Q-037).

## Why

Darren, 5 October 2026, signed in as the founder of his own federation:

> "If I sign in to the federation page, it should know by my roles and my
> permissions that I, in some way, have influence over this page … The person
> who is responsible for that, if it's an organisation, they're doing it in
> their capacity of their job, not as an individual thinking they can do what
> they like just because they work there. So if I have any kind of CRUD control
> other than read … my ability to create, update and delete is because I have a
> role. And if I have a role, then I need to declare that I'm on this page and
> acting in the interests of that role and not my own."

> "I click a toggle that says I'm accepting the role, so the page can look
> different because I'm now in role mode … anything I sign, I sign in the name of
> that federation. And I've already signed an agreement that I will abide by
> federation rules. And I'm accountable now … Then I can click that toggle, take
> off that role, and I'm back into my incubator in my own capacity, and peace and
> quiet. No work is interrupting me. And I can just be me."

Today Q decides what you can do on a federation's page by **who you are**: the
founder sees Settings, Website, Services, the coin designer and Reconcile now.
That's the mixing this ADR removes. Power comes from an office you hold and have
**chosen to take up right now**, never from being you.

## Decided (proposed)

### 1. Reading follows the page's rules; everything else comes from a role

What anyone can **read** is set by the page's own rules: public, members only,
and so on. To **create, update, delete or sign** for a federation, you need a
role, and you must be acting in it. With no role, or the role not taken up, the
page offers you nothing but reading, even if you're the founder.

### 2. The role switch

Wherever you hold an office, the page shows a switch:

> **Acting as:** Me ⟷ Treasurer of Green Space

- **Turning it on is a declaration.** You're saying "I'm here as the treasurer,
  acting for the federation, not for myself." It's signed as an **in-role**
  receipt that names the office, the mandate that gives it to you, and the time.
- **Turning it off sets the role down**, and that's a receipt too. Together they
  record when you were acting for the federation, and when you weren't.
- **One role at a time.** Wearing two hats at once is exactly the mixing this
  prevents. To act as a different office, set one down and take up the other.
- **No office, no switch.** If you hold no office here, the page says so once
  ("You hold no office in Green Space") and nothing changes.

### 3. In role, the page becomes the office's desk

When you take up a role, the page changes to show that you've done so, and shows
what the office does:

- **A clear band** across the top of every page while you're in role, for
  example "Acting as Treasurer of Green Space · Set it down". You can never forget
  which hat you're wearing.
- **The office's work, all in one place**: things to do, questions people have
  asked the office (ADR-Q-037), things to reconcile, jobs ticked off, and news to
  share.
- **Only what the office may do.** The tools shown are the ones its mandate
  covers. The treasurer sees Reconcile, not the website editor.

### 4. What you sign in role, you sign for the federation

Every receipt signed in role carries the office and the mandate, and is signed
in the federation's name: "Sam, as Treasurer of Green Space". The engine checks
the mandate on every action (ADR-Q-009), against the charter you agreed to when
you joined (ADR-Q-007, ADR-Q-008). That agreement is what you're accountable
under, and taking up the role is when it applies.

### 5. Separate hats, separate post

- **Messages to the office go to the office**, and you only see them in role.
  Your own inbox never fills with the club's business, and the club's inbox never
  sees your own.
- **The office has its own card** (ADR-Q-015): "how to reach me in this
  capacity, for this federation only". Give it out as treasurer, and it reaches
  whoever is treasurer. When your term ends, it stops reaching you.
- **Out of role, it's quiet.** Office work doesn't ring your bell while you're
  being yourself. It waits on the desk for whoever next takes up the office.

### 6. Conflicts of interest are said, not hidden

In role you act for the federation, so you can't act for yourself:

- **When an action touches your own account** (your own cash-out, your own
  membership, a payment to you), the page says so and asks for a second holder
  to sign. This is the Money block's two signatures (ADR-Q-007), made visible.
- **Declaring an interest is a receipt.** If you have one, saying so is
  recorded, and the decision goes to another office holder.

### 7. The founder is no exception

Until offices are built, the founder holds one office, **caretaker**, with a
term (ADR-Q-007). The same switch applies:

- out of role, the founder sees the federation like any member;
- in role as caretaker, they see Settings, Website, Services, the coin designer
  and Reconcile now.

The founder's admin isn't a special case; it's the first role.

### 8. One page, two accounts: whose money depends on the hat

Darren, later on 5 October:

> "If I go into that federation page as me, the user … I can see all my
> credits, my personal credits … if I'm allowed to cash out, I have enough, I
> should be able to … my personal bank account … same rights as everybody else
> has. Then if I click on role on that page and I'm then working in the
> capacity of that federation, then the only reason I'm going to be able to cash
> out is because I have either treasurer powers or something that the
> organisation allows my role to do … that may require evidence of decision,
> council, voting, whatever, but it gets signed by the person with the role who
> has the power to action … without needing multiple screens."

The same page shows **one account at a time**, and the switch decides which:

| | As me | In role (for example, Treasurer) |
|---|---|---|
| **Whose credits** | Mine: my statement with the bank | The federation's: its treasury, its reserves, what it holds |
| **Who may cash out** | Me, like any holder, when I have enough (the battery) | Only an office whose mandate covers it |
| **Paid into** | My own payout account, set in my Settings | The federation's account, set by the office in role |
| **What it needs** | My signature | The office holder's signature, **plus evidence of the decision** where the federation's rules ask for it, and a second signature where the Money block requires two (ADR-Q-007) |
| **Recorded as** | My cash-out | The federation's cash-out, signed "as Treasurer", naming the mandate and the decision |

- **Same rights as everyone, as me.** Holding an office gives no extra power
  over my own credits, and takes none away. As me, I cash out exactly as any
  member does.
- **No power over the federation's money, as me.** Out of role, the
  federation's account isn't shown, let alone movable. Even the founder sees it
  only in role.
- **Evidence travels with the action.** A spend or cash-out from the
  federation's account names what authorised it: a `decision.outcome` receipt
  (a council or committee vote, a meeting's minutes, ADR-Q-007 §6), a budget
  line already agreed, or a standing rule. The engine checks that the evidence
  is there and is the right kind before the office holder can sign
  (ADR-Q-009). Who decided and who actioned it are both on the record.
- **No second screen.** There's no separate admin site, bank portal or login.
  It's the same page and the same statement design (`showing-money.md`),
  showing the account of whichever hat you're wearing.

## Open questions

- **Urgent things out of role.** Should a safeguarding alert reach the
  safeguarding lead even when they're being themselves? Probably yes, as the one
  exception, said in words.
- **Leaving it on.** Does a role set itself down after a while, at the end of
  the day or when you close the page, so it isn't left on by accident?
- **Several devices.** Taking up a role on your phone should show the band on
  your laptop too.

## What this does not claim

- **That it stops a determined person.** It makes acting for the federation
  deliberate and recorded. Whether the person behaved well is for the
  federation's rules and its members to judge.
- **That offices exist yet.** Until ADR-Q-007's Offices block is built, the only
  office is caretaker.
- **Employment or governance law.** A real organisation's duties to its staff,
  trustees or directors need their own advice.

## Build order

1. **The switch with one office**: caretaker, for the founder (today's
   `hostFounder`/`own`). Settings, Website, Services, `CoinDesigner` and
   Reconcile now show only in role. Add the band across the top.
2. **In-role receipts**: taking up and setting down. Receipts signed in role
   carry the office, as the founding delegation already does
   (`'inqbeta/office': 'caretaker'` in `federations.ts`).
3. **The office's desk**: things to do, things to reconcile, questions asked,
   news to share.
4. **The office's post and card**: an inbox seen only in role, and a card that
   reaches the office (ADR-Q-037).
5. **Offices** from ADR-Q-007, each with its own switch, scope and term.
6. **Conflicts**: the engine notices when a role action touches the holder's
   own DID and asks for a second holder.
7. **Quiet out of role**: the bell holds office work until you take up the role.
8. **The federation's account in role** (§8): its statement and cash-out on
   the same page, paid into the federation's account, needing the office's
   mandate, the decision's evidence where its rules ask, and two signatures for
   money.

## Related

- ADR-Q-007: federations, offices, mandates, the caretaker.
- ADR-Q-008: must and cannot.
- ADR-Q-009: the engine checks every action.
- ADR-Q-010: messages.
- ADR-Q-015: cards with a purpose.
- ADR-Q-035: the federation's bank (its Bank tab is open to anyone).
- ADR-Q-037: ask the office, not the person.
- ADR-Q-039: working for an organisation; scanning in can take up the role.

## As built, 6 October 2026: offices (step 5; job C1)

- **q-core `offices.ts`**: six offices, each a named slot with a plain-words
  purpose and a scope of federation commands: caretaker (`/fed`, everything),
  treasurer (`/fed/money`), secretary (`/fed/admit`, `/fed/announce`,
  `/fed/minutes`), chair (`/fed/minutes`, `/fed/announce`), safeguarding lead
  (`/fed/safeguard`), steward (`/fed/services`, `/fed/site`).
- **`office.appointed`**: signed by the federation key **and** the caretaker,
  saying how the holder was chosen. It carries one UCAN mandate per command,
  from the federation key to the holder, each ending with the term (1 to 24
  months), plus the caretaker's own grant as their authority, so anyone can
  check it with nothing else to hand.
- **`office.ended`**: the holder stands down (they sign), or the federation
  recalls (it signs, saying why). A term that runs out needs no receipt.
- **The cannots, enforced**: nobody appoints themselves; the caretaker isn't
  appointed (it comes from the founding, and only the members renew it); no
  office without a term; only the caretaker, while their own mandate runs,
  can appoint; offices go to members only. "Not held by an AI" is declared,
  for the Standing block to check.
- **Cedar**: `office.appoint` and `office.end` (q-actions
  `core/federation-offices.ts`), in the core actions every Q loads.
- **`officesHeld(did, federation, …)`**: the caretaker from the founding grant
  while it runs, and every sound appointment not run out or ended; one of each
  office.
- **The app**: in role as caretaker, the Members tab has **Offices**: who
  holds what and until when, **Give an office…** (which office, who, how
  long, how they were chosen) and **Recall…**. The appointment travels as a
  link; opening it keeps it with the holder's membership. The role switch
  offers every office you hold (choose one; one at a time). Taking up a
  non-caretaker office opens its **desk**: what it covers, the term, and
  **Stand down…**.
- **Still caretaker-only**: the founder's tools (Website, Services, Settings,
  Invite, Tell your members, Reconcile) need the federation key, which is
  sealed to the founder. Other offices get their powers on the servers with
  in-role receipts (step 2, job C2) and their desk and post (steps 3–4).

## As built, 6 October 2026: in-role receipts the servers check (step 2; job C2)

- **q-core `inrole.ts`**: `role.taken-up` and `role.set-down` receipts,
  signed by the person without a passkey touch and kept in their vault
  (`roles/`), so there's a record of when they acted for the federation.
  Signing out sets the role down.
- **`acting`**: what an ask made in role carries inside its signed content:
  the office, its mandates (the caretaker's founding grant, or an
  appointment's tokens) and the take-up receipt.
- **`actingCovers(asker, acting, { federation, cmd, founder })`** is the
  server's check: the take-up is the asker's own, for this federation and
  office, made before the ask; the office's scope covers the command; a
  mandate from the federation's key to the asker covers it and is still
  running. The caretaker can also be proved by the federation's signed
  founding, for a founder whose vault isn't on this device. Each refusal is
  one plain sentence ("A secretary can't do money work. Ask the office that
  can.").
- **Reconcile asks for the office, not the founder**: `/api/mint` needs
  `/fed/money/reconcile`, so the treasurer or the caretaker can reconcile,
  in role. The bank's signed reconciliation records `byOffice`, and the coin
  statement says "Darren, as treasurer". Reconcile now shows for whoever is
  in an office that covers it.
- **Not yet**: a recalled or stood-down office still passes a server until
  its term ends, unless the server is told (`revoked`). Publishing endings to
  the host (a revocation list beside the door's) is the next piece. The
  localhost console (`/api/host/*`) stays the installer's (ADR-Q-018), not
  an office's.

## Addendum, 6 October 2026: taking up an office is a declaration

Darren: "if you flip that toggle to say you are now looking at this page as an
officer, that is a point where you make your declaration: I am acting with no
conflict of interest, or I may have a conflict and declare it, then you sign
it, then you're able to access that page with role based on your office. So
we've got a nice, clean, receipted attestation, confirmation, declaration each
time, which enables the separation of the person from the role. And I think
that's a lovely thing we can take from the Nolan principles." He sees the same
applying to compliance positions, verifiers and reviewers: offices of
responsibility, held in the headspace of no conflict of interest.

**Decided and built:**

- **Every take-up carries a declaration**: "I have no conflict of interest", or
  "I may have one, and I declare it" with what it is. The switch opens the
  declaration; only signing it takes the office up. The take-up receipt holds
  the declaration and the exact words signed, under the **seven principles of
  public life** (the Nolan principles, Committee on Standards in Public Life,
  1995: selflessness, integrity, objectivity, accountability, openness,
  honesty, leadership), shown beneath it.
- **Servers refuse a take-up with no declaration.** A declared interest
  doesn't stop you acting: it travels with what you do in role (the bank's
  reconciliation records it as `byInterest`), and the band shows "interest
  declared" or "no conflict declared" the whole time.
- **Three offices of responsibility**: verifier (`/fed/verify`: checks that
  evidence holds, and signs to say so), reviewer (`/fed/review`) and
  compliance officer (`/fed/compliance`: that the federation keeps its own
  rules and the law).

**Next, from §6:** when an action in role touches the declared interest or the
holder's own DID, the engine asks for a second office holder to sign it.

### Why it matters, and what it leads to (Darren, 6 October 2026)

From his time in local government: declarations of interest became "the seed
of corruption by being hidden". Here a declaration never locks you out: "it's
your integrity … your honour of the role, which makes responsibility and
personal accountability so much more." And because the history records
everything, even when something goes wrong "the history can at least show that
it wasn't intentional, or that it was neglectful, or it was incompetence, or
it was downright intentional, by following the history of the story", so
others learn from it: the mycelium, where one thing gets infected and everyone
learns "don't eat that berry".

**Internal compliance, external verification.** An internal compliance
officer is employed by the organisation, so they carry a standing interest:
they won't jeopardise their own job. That doesn't stop them working
diligently and signing off good work. Proper assurance then comes from an
**external verifier**, who looks at the compliance officer's evidence report
knowing they're an employee, asks whether it shows any conflict or bias, and
if not, accepts it as a good and honest answer. "That's amazing empowerment
for everybody."

**Shape (built the same day; see below):**

- **A standing interest** can be written into an appointment ("employed by the
  organisation"), so every take-up carries it without retyping, and it can't
  be left out.
- **An evidence report** is a receipt signed in role (reviewer or compliance
  officer), carrying the take-up and its declaration.
- **An external verification** is a receipt from a verifier outside the
  federation (another federation's verifier, under a treaty, or an
  independent one) that cites the report and its author's declaration, and
  says: accepted; accepted with notes; or not accepted, with the bias or gap
  found. The verifier makes their own declaration too.
- **The story view**: any receipt's history, read in order, so intent,
  neglect or plain error can be seen for what it was.

### As built, 6 October 2026: endings reach the servers at once

A recall, or a stand-down the caretaker notes, now publishes a notice signed by
the federation's key (`inqbeta.mandates-revoked/1`, q-core `offices.ts`
`revocationNotice`) to its storage node: the gate keeps
`/revoked/<federation>`, accepts only notices sealed by a federation it
serves, and anyone may read it. The host's servers read it (30-second cache,
`lib/server/revoked.ts`) and refuse a mandate on it: "Your office as treasurer
has been ended early: recalled, or stood down from." If the node can't be
asked, the last list read stands, and mandates still end with their terms.
The gate needs updating on the node to carry it (job A3).

### As built, 6 October 2026: standing interests, evidence reports, external verification

- **A standing interest** on an appointment (`standingInterest`, "Does the
  office come with an interest?" when giving it) is written into every one of
  its mandates (`inqbeta/interest` in the UCAN). The switch opens the
  declaration with it filled in and "no conflict" not offered; servers refuse
  a take-up that leaves it out ("This office comes with an interest you must
  declare each time you take it up").
- **q-core `attestation.ts`** (named so beside the older `assurance.ts`,
  which is about evidentiary bars and unrelated):
  `writeReport` / `checkReport`: an evidence report signed in role by a
  reviewer or compliance officer (what was checked; meets, meets with notes,
  or doesn't meet; what was found), carrying their acting and declaration.
  `verifyReport` / `checkVerification`: signed in role by a verifier of
  **another** federation, copying the author's declaration word for word,
  with accepted, accepted with notes, or not accepted (and what was found:
  required unless accepted).
- **The app**: a reviewer's or compliance officer's desk has **Write a
  report**; it's kept in the vault (`attestation/`) and sent as a link to
  `/attest`. There a verifier, in role in their own federation, sees the
  finding and, first, **what its author declared**, and signs; the
  verification goes back as a link and is kept with the report.
- **Not yet**: the story view (a receipt's history read in order); finding
  verifiers in the directory; reports published to the federation's page.

