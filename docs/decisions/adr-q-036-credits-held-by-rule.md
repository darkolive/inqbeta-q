# ADR-Q-036 — Credits held by rule: grants that can only be spent on what they're for

**Status:** proposed 5 October 2026, not yet built. It builds on committed credits
(ADR-Q-025), the bank and its coin (ADR-Q-035), treaties as derived actions
(ADR-Q-023 §4) and the rule engine (ADR-Q-009).

## Why

Darren, 5 October 2026, after committed credits went into the coin:

> "We now have within the feature of a coin committed coins that not only can
> apply to contracts we've got signed for storage space … but it may also be
> rule-based of the coin … a federation could be a grant-giving charity, grant
> body, foundation, and it will give out credits. It's got £100,000 to give out
> as credits to stimulate disadvantaged young people under the age of 25, and
> it's to be spent on training … If they break that rule, they get too old. The
> rule sends the credits back, releases them to the charity … those credits
> can't be cashed in or settled because they're committed, because the rules
> said they can only be spent on training … the receipts being all the proof."

Today a credit is committed because an **agreement** holds it: a storage
contract, an open offer. The realisation is that a credit can also be committed
because a **rule** holds it: the terms it was given under. The coin carries its
own conditions.

## The idea, as one story

1. **The foundation is a bank.** A grant-giving federation (a charity, a grant
   body, a foundation) mints its coin against the £100,000 it holds
   (ADR-Q-027). Every credit is backed.
2. **It publishes a grant.** The grant is a signed statement of the terms:
   *for training; for people under 25 who meet its criteria; up to so much each;
   unspent credits return after a date, or when the holder stops qualifying.*
   These terms are rules: derived actions that can only add cannots (ADR-Q-023
   §4).
3. **A young person applies and qualifies.** Qualifying is proved, not
   asserted: a signed attestation that they meet the criteria, such as
   "under 25 until 14 March 2027". It's made by someone the foundation trusts,
   or from a card or credential the person holds. The live photo at signing
   (ADR-Q-035) can show it was really them.
4. **They receive the grant credits.** The credits are theirs, and they show on
   their statement, but they are **held by rule**. The battery and the balance
   sheet show them as committed: the person holds them, but can't cash them out
   or spend them on anything else.
5. **A training provider accepts them.** A federation running a course lists
   what it offers and what it accepts in payment, for example "training". The
   student turns up with grant credits.
6. **A treaty opens the door.** The provider sends the foundation a treaty
   invitation. The invitation states, on its receipt, how the provider
   qualifies under the grant's terms: what it teaches, its accreditation, its
   price. When the foundation signs it, the treaty is in place.
7. **The student enrols.** The enrolment is an agreement under the treaty. The
   rule engine checks it at the moment it's made: the student still qualifies,
   the course is training, the provider is under the treaty, and the amount is
   within the grant. Only then do the credits move.
8. **The provider is paid.** Credits the provider receives under the treaty are
   ordinary to it: it can cash them out whenever it likes, at the foundation's
   bank, by standing order (ADR-Q-035 §8). At the end of the month, all its
   courses' credits become pounds in its account, and it can pay everybody.
9. **If the student stops qualifying**, for example they turn 25 or the grant
   ends, the rule releases what's unspent **back to the foundation**. That's
   a receipt too, so nothing is clawed back by hand and nothing is lost.

Every step is a signed receipt: the grant, the attestation, the award, the
treaty, the enrolment, the settlement, the return. The foundation can show its
funders where every pound went; the student can show what they were given; the
provider can show what it was paid for.

## Decided (proposed)

### 1. A credit can be committed by a rule, not only by an agreement

Committed has two sources:

- **By agreement:** the credits promised in an agreement not yet settled, as now
  (ADR-Q-025).
- **By rule:** the credits given under terms that limit what they're for, until
  they're spent within those terms or released.

Both count as committed in every view: the battery, the credits chart's amber
band, the balance sheet and cashing out. The difference is said in words:
"held by an agreement" or "held by the Foundation's grant: for training".

### 2. The grant is a receipt with rules

A **grant** (`inqbeta.grant/1`) is signed by the bank's treasurer and names:

- the coin and the total it sets aside;
- **what it may be spent on**, as a kind of offer (for example `training`);
- **who may receive it**, as criteria that must be proved by attestation, never
  as personal data held by the bank;
- how much each person can receive, and when unspent credits return.

Its rules are derived actions: they can only add cannots, never remove the
core ones (ADR-Q-023 §4).

### 3. Qualifying is attested, and holds no more than it must

The person's date of birth never needs to travel. What travels is a signed
statement that the criterion holds, with how long it holds for ("under 25 until
…"), from someone the grant names as able to say so. The rule checks the
statement's signer and its end date. When the end date passes, the person no
longer qualifies, and their unspent credits are released.

### 4. Providers qualify by treaty

A provider proves it qualifies by offering a treaty that states how. The
foundation decides once, by signing. Every enrolment under it is checked by the
engine, with no fresh paperwork. A provider without a treaty can't take the
grant's credits; the engine refuses them.

### 5. Settlement is ordinary

Once grant credits have moved to a provider under the treaty, they are the
provider's own: spendable and cashable like any other. Cashing out runs through
the foundation's bank, with its reserves, its books and its reconciliation
(ADR-Q-035 §7).

### 6. Release is a receipt

When a holder stops qualifying, or the grant ends, the rule releases what's
unspent back to the bank, signed by the mint and naming the grant and the rule
that released it. The holder sees it on their statement. Nothing disappears
without a record.

## What this does not claim

- **That it meets the law on grants or charities.** Grant law, charity
  regulation, gift aid, the tax treatment of grants and providers' accounting all
  need professional advice before real money moves.
- **That eligibility checking is solved.** Attestation shows who vouched; it
  doesn't make them right. The grant must name who can vouch, and the
  foundation stays responsible for that choice.
- **That any personal data about young people is collected.** The design
  avoids it. Holding only "meets the criterion until …" is deliberate, and any
  real deployment needs a data protection and safeguarding review.

## Build order

1. **Committed by rule** in q-core: a holding that names its grant, counted as
   committed everywhere committed is counted.
2. **The grant receipt** and its rules in q-actions (Cedar), with tests: a spend
   within the terms passes; outside them it's refused; after the end date the
   credits are released.
3. **Attestations**: a signed "meets the criterion until …" statement, checked
   by its signer and date.
4. **The treaty invitation** that states how a provider qualifies, and
   enrolment as an agreement under it.
5. **The statement**: grant credits shown as held by rule, and release shown as
   its own receipt.
6. **A test bed** (ADR-Q-031): a pretend foundation, a pretend provider and a
   student, end to end in test mode.

## Related

- ADR-Q-009: actions and the engine.
- ADR-Q-023: credits, rewards and the exchange; treaties as derived actions.
- ADR-Q-025: agreements; committed credits.
- ADR-Q-027: minting against reserves.
- ADR-Q-031: crowdfunding and test beds.
- ADR-Q-035: the federation's bank; the coin; cashing out by standing order.
