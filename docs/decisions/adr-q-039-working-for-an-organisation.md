# ADR-Q-039 — Working for an organisation: the verified business card

**Status:** proposed 5 October 2026, not yet built. It builds on federations,
offices and mandates (ADR-Q-007), cards with a purpose (ADR-Q-015), credits and
rewards (ADR-Q-023), asking the office (ADR-Q-037) and acting in role
(ADR-Q-038).

## Why

Darren, 5 October 2026:

> "I think this is part of what the business card is … someone, just like a
> federation, needs to create the business. And that person is then responsible
> for all the information: if there's departments, what's the name of the
> departments, populating what the company is. So then when someone comes along
> and goes, I work for that company, they can get verified by the company, with a
> receipt between them. And therefore they have permissions to act on behalf of
> that company in that capacity."

> "That's a really good way that a company can control HR staffing, and switch
> off powers for suspensions … whilst the end user who works for that company is
> able to log in, get scanned in, scanned out … what their role is, volunteer,
> what they get, free lunch, have to clock in, scan in at nine in the morning, scan
> out at five o'clock, earn so many points … It's registering that you work, but
> it's not the same as being registered on HMRC, although you are able to share
> the company's tax codes if you are linked, without needing to know them."

Today a Business card (ADR-Q-015) is something **you** make: "you at work",
drawn from your profile. Nobody vouches for it. Anyone can say they work for
Green Space. This ADR makes the business card **verified**: drawn from a receipt
signed by both you and the organisation.

## Decided (proposed)

### 1. An organisation is a federation, and someone creates it

A business, charity, club or council in Q is a federation (ADR-Q-007), with a
strand to match (company, CIC, charity, club). Like any federation, **someone
founds it**, and that person is responsible for describing it:

- what it is: name, purpose, picture, address;
- **its tree**: departments ("Kitchen", "Front of house", "Finance") and the
  offices within them ("Treasurer", "Head chef", "Volunteer coordinator");
- **the kinds of engagement** it offers (employee, volunteer, contractor,
  trustee) and the terms that go with each.

The tree is what the coin's contact names (ADR-Q-037), what the role switch takes
up (ADR-Q-038) and what an engagement places you in.

### 2. "I work here" is an engagement, signed by both

When someone says "I work for that organisation", they ask to be engaged. If the
organisation agrees, the person and an office holder with HR's mandate both sign
an **engagement** receipt (`inqbeta.engagement/1`). It names:

- the person (DID) and the organisation (federation ID);
- **the kind**: employee, volunteer, contractor or trustee;
- **where they sit**: department and office or offices;
- **what it gives them**: the mandate scopes they can act under, in role;
- **its terms**: start, review or end date, and what comes with it ("free lunch
  on shifts over four hours", "clock in required", "10 points an hour");
- who signed for the organisation, under which mandate.

It's an agreement (ADR-Q-025): two faces, what each must and cannot do, and two
signatures. The person keeps their copy in their own vault.

### 3. The verified business card is drawn from it

Your business card for that organisation stops being a claim and becomes
evidence:

- it shows your face, and theirs: "Sam · Head chef, Kitchen · Green Space";
- it carries a mark that it's **verified by Green Space**, which anyone can
  check, as with a coin (ADR-Q-035);
- **it's how to reach you in that capacity only.** Messages through it go to
  your office's post, seen when you're in role (ADR-Q-038 §5), never mixed into
  your own inbox;
- when the engagement ends, the card says so. It no longer reaches you as their
  staff.

You may hold several verified cards (a job, a volunteer post, a trusteeship),
each kept separate.

### 4. HR acts by receipt: suspend, change, end

The organisation manages its people through the same receipts:

- **Changing a role** is a new engagement that replaces the old one, with the
  previous one named.
- **Suspending** switches off the mandate's powers until a date, said with the
  reason and the clause (as membership suspension already works,
  `suspendMember`). The person still holds their card and their receipts. They
  just can't act in role.
- **Ending** closes the engagement. The person keeps everything they've been
  given and everything they signed (Layer A: anyone may leave and keep their
  receipts).

Nothing is switched off silently, and nothing is taken back from the person's
vault.

### 5. Scanning in and out

Where the terms say so, a shift is recorded in receipts:

- **Scan in** at the door: a QR code the organisation shows at its entrance,
  scanned with your thumbprint (as on a receipt page). That signs an **in**
  receipt with the time and place. **Scan out** signs an **out** receipt.
- Both sides hold the record: you and the organisation have the same hours.
- **Scanning in can take up your role** (ADR-Q-038) and scanning out sets it
  down, so arriving at work and acting for the organisation are the same step,
  and leaving gives you your peace and quiet back.

### 6. What it earns

The engagement's terms can turn time into rewards, through the organisation's
coin (ADR-Q-023, ADR-Q-035):

- points or credits for hours worked or volunteered, paid by receipt at
  scan-out or at the end of a period;
- perks, such as a free lunch or a travel allowance, are agreements that settle
  on their own when the terms are met;
- volunteers can show their hours to anyone they choose, as evidence (for a
  reference, a course or a grant, ADR-Q-036).

### 7. Not a tax registration, but able to carry the organisation's references

An engagement records that you work there. It isn't registration with HMRC,
right-to-work evidence or payroll.

But being engaged lets you **pass on the organisation's own references without
holding them**. Examples include its VAT number on an expense claim, its
PAYE reference for a form, or its charity number for a supplier. The detail
stays the organisation's (a card names details, never copies them, ADR-Q-002
§4). You attach it by name, the recipient gets it from the organisation, and
the organisation's receipt says you were entitled to pass it on. You never need
to know it.

### 8. Holds no more than it must

The organisation holds the engagement and the hours, not your profile. Your
personal details stay yours, shared by ticking as on any card (ADR-Q-015). An
employer that needs more (bank details for pay, emergency contacts) asks for it
as a detail you choose to share, and the sharing is a receipt.

## What this does not claim

- **Employment law.** Contracts of employment, working time regulations,
  minimum wage, right to work, holiday pay and statutory duties need proper
  advice and their own systems.
- **Payroll or tax.** Q records hours and rewards; it doesn't run PAYE or
  report to HMRC. Points and credits may have tax consequences that need advice.
- **Background checks.** DBS and safeguarding checks for volunteers aren't made
  here. An organisation can record that a check was done, signed by whoever is
  responsible for it.
- **Data protection for HR.** A real deployment needs a data protection review.
  The design minimises what's held, but doesn't remove the duty.

## Build order

1. **The organisation's tree**: departments and offices in the federation's
   manifest, and the kinds of engagement it offers.
2. **The engagement receipt**: asking, agreeing, two signatures. It's kept in
   both vaults.
3. **The verified business card**, drawn from it, with "verified by" checkable
   like a coin. Messages through it go to the office's post.
4. **HR**: change, suspend and end, each a receipt that names the clause.
5. **Scan in and out**: the door's QR, in and out receipts, and taking up the
   role on scan-in.
6. **Rewards**: points or credits for hours, and perks as self-settling
   agreements.
7. **Carrying the organisation's references** without holding them.

## Related

- ADR-Q-002 §4: a card names details, never copies them.
- ADR-Q-007: federations, strands, offices and mandates; suspension.
- ADR-Q-015: cards with a purpose; the business card.
- ADR-Q-023: credits, rewards and the exchange.
- ADR-Q-025: agreements.
- ADR-Q-035: the federation's bank and its coin.
- ADR-Q-036: credits held by rule.
- ADR-Q-037: ask the office, not the person.
- ADR-Q-038: acting in role.
