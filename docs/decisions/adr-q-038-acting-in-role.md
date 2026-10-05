# ADR-Q-038 — Acting in role: say which hat you're wearing

**Status:** proposed 5 October 2026. Step 1 is built: the switch, with
caretaker as the only office (`lib/role.svelte.ts`, `RoleSwitch`, `RoleBand`).
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

## Related

- ADR-Q-007: federations, offices, mandates, the caretaker.
- ADR-Q-008: must and cannot.
- ADR-Q-009: the engine checks every action.
- ADR-Q-010: messages.
- ADR-Q-015: cards with a purpose.
- ADR-Q-035: the federation's bank (its Bank tab is open to anyone).
- ADR-Q-037: ask the office, not the person.
- ADR-Q-039: working for an organisation; scanning in can take up the role.
