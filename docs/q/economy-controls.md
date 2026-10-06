---
implementation: none
decision: proposed — the smooth valve on idle capacity, as a gift; no advance credits (Darren, 5 October 2026); ready for an ADR
updated: 2026-10-05
---

# Keeping the economy moving: stimulus, hoarding and the pressure valve

A brief gathering what inQbeta has already worked out about **flow**: what
happens when credits stop moving, or when pounds stop coming in, and how a
mint can ease the pressure without printing value it doesn't have. It sets the
three sources side by side, names where they pull against each other, and
sketches how they might fit Q. One answer is now proposed: a smooth valve that releases credits against idle capacity.

## Why now

Darren, 5 October 2026, after ADR-Q-042 fixed one credit to one unit of the
mint's currency:

> "What happens if the pound banking system goes crazy and you can't get
> pounds in to mint? What happens to the mint? What happens to prices?
> Because we're fixed now in money supply by the mint. So the only way wealth
> increases is by exchange. So we have to have lots of exchange. There is no
> incentive in hoarding coin. It's there to work."

What follows already in Q:

- **Minting stops** when no value comes in (ADR-Q-027 §2).
- **Cash-out stops** when the reserve can't pay, or the safety valve shuts
  (ADR-Q-027 addendum).
- **Credits already out keep working.** A trade between members is a signed
  receipt; no bank is involved.

So in a crisis the coin's anchor moves from **the pound** (you can cash out)
to **capacity** (you can still buy bread and rooms with it). Its weak point
is hoarding: a scarce, steady coin is worth sitting on, and sitting on it
starves the exchange that has to carry everyone.

## Source 1: the white paper (December 2025)

`origins/white-paper-2025-12.md` §7–9, and the long version in
`origins/building-a-future-2025-12.md`.

**Issuance follows use, within capacity and reserves:**

```
K_window      = H × C_c × U_t × W          capacity in the booking window (W = 7 days)
IR            = min(α × U_t, 1)            issuance ratio, from utilisation U_t
α             = 1 / U*                     U* = target utilisation (0.8 → α = 1.25)
C_mintable    = min(IR × K_window,  MaxCreditFraction × K_window,  R / COS)
Unbooked      ≤ MaxCreditFraction × K_window      (e.g. 80%, leaving 20% slack)
```

**Stimulus** (long version §14.3): in low demand, the grant multiplier,
member reward credits, or a temporary issuance-ratio change, "never bypass
reserve requirements". Controls: `stimulus_multiplier`,
`stimulus_campaign_active`, `stimulus_max_credits_per_period`,
`average_credit_age_days`, `velocity_last_30_days`, `hoarding_state` (OK /
WATCH at 0.6 of the limit / OVER at 1.0).

**Dampening** (long version §18.8): when utilisation collapses, cut the
issuance ratio.

**No expiry.** "Credits never expire", on purpose: no use-it-or-lose-it
pressure, for neurodivergent time planning.

## Source 2: the pressure valve (inQbeta wiki)

`~/inQbeta/docs/wiki/Rules-and-Governance.md`, "Plugin Conservation Laws".

- **Advance credits**: an overdraft against **capacity a node has pledged**,
  not against pounds.
  `advanceLimit = EffectiveCapacity × advancePercentage` (10% by default).
  A node pledging 100 GB has a ceiling of 100 credits and may draw 10 in
  advance.
- **Not withdrawable.** Advance credits "exist solely to stimulate
  circulation within the federation."
- **When flow is sluggish** (low utilisation or velocity) the federation may
  raise the advance percentage, under a **federation throttle** on the total
  advance across all plugins.
- **Earnings retire the advance first**, then become spendable.
- **Debt-settling bias**: paid work (such as where files are stored) is routed
  to reliable nodes that are overdrawn, so they repay sooner. "Routing =
  repayment."
- **Stimulus must retract**: tracked as explicit debt, circulation measured,
  the throttle pulled back automatically as demand returns. **Stimulate →
  Circulate → Settle → Retract**, "so that temporary debt does not become
  structural inflation."
- **No hidden federation debt.**

## Source 3: velocity in the Workhouse demonstrator

`~/inQbeta/apps/portal/app/workhouse/lib/federation-data.ts`:

```
velocity = 1 + credits exchanged ÷ credit supply
wealth   = credit supply × velocity
```

Velocity starts at 1 "because held credits already represent value."

## The answer: a smooth valve on idle capacity

Darren, 5 October 2026, recalling where Euler came in:

> "How do we open the valve and release credits into the system to
> stimulate … taking up unused capacity. So in the hard drive example … if
> we've got a 30 gig hard drive and we're only taking sales for one gig, then
> we've got 29 gigs sat there doing nothing. So this formula would say, okay,
> well then let's get that used. Let's offer it out for free … to get the
> velocity to increase to take the pressure off the money supply … If cashing
> in, cashing out stops, for whatever reason, we are relying on velocity …
> This is where having an alternative suddenly switches into there is no
> alternative. Now it just has to work."

And, on confirming it: "that's exactly where Euler was used in that valve …
it being a smooth release."

### Why it isn't inflation

Prices rise when spending (credits × velocity) grows faster than what there is
to buy. **Spare capacity is perishable**: an empty desk-hour today, or a
gigabyte idle all week, is gone for good. Credits released against it bring
their goods with them, so supply and output grow together. That is the
difference between this valve and printing money.

### The formula

```
I        = K − used                    idle capacity in the booking window
gap      = max(0, U* − U)              how far utilisation is below target
v        = 1 − e^(−k · gap)            the valve: shut at target, opening smoothly as use falls
release  = v × (I − slack)             stimulus credits released this window
```

`k` sets how quickly the valve opens. The exponential is what makes it
smooth: it never snaps open or shut, which is the "policy thrashing" the long
white paper's sensitivity tests (§17.6) were written to catch.

### Worked example: the 30 GB drive

U\* = 0.8, k = 3, slack kept back = 6 GB.

| | Used | Idle | Gap | Valve v | Released this week |
|---|---|---|---|---|---|
| Start | 1 GB (U ≈ 0.03) | 29 | 0.77 | 0.90 | ≈ 21 GB |
| Uptake | 15 GB (U = 0.5) | 15 | 0.30 | 0.59 | ≈ 5 GB |
| At target | 24 GB (U = 0.8) | 6 | 0 | 0 | none |

As people take up the space, the valve closes itself.

### What keeps stimulus credits honest

- **Never cashed out.** They aren't credits at all but capacity gifts
  (ADR-Q-042 §10); the pound reserve is never touched.
- **Earmarked.** They buy only the capacity they were released against.
- **They expire with their window.** Bought credits never expire; stimulus
  credits do, because the capacity behind them perishes. This keeps the white
  paper's "no expiry" promise for everything people paid for.
- **Bounded by real cost.** Free storage still costs power and wear, so the
  release is capped by the variable cost the federation can carry (COS,
  white paper §11).
- **Not undercutting paying customers.** A cap per person, off-peak capacity
  only, or release to contributors and newcomers (the white paper's grant
  targeting: NEET young people, start-ups, low-income members).
- **Every release is a receipt**: the figures it was worked from (K, used, U,
  the gap, v) and the rule, so anyone can check the valve opened as far as the
  rule allowed and no further.

### Why it's the resilience

In normal times the valve is a gentle extra; the pound does most of the work.
If cash-in and cash-out stop, the valve is the only way the money supply can
grow, and it's safe because it grows only with capacity that really exists,
now. That's the moment the white paper's capacity backing takes over from the
pound as the coin's anchor.

### Underneath it all: exchange

Darren, on what the Workhouse demonstrator proved:

> "Cash was just a third medium of exchange, but what it all comes down to is
> an exchange and how two people can exchange two things, and one of them can
> be goods and services or credits or money or assets or anything. What do
> you value, and what else do you value that you would swap for? That's it,
> isn't it? That's the basic human existence."

Q already has that shape: an agreement gives one thing for another, credits,
pounds or something done (ADR-Q-025). Credits and pounds are two of the
things that can be swapped, not the point of it. The valve exists to keep
swaps happening when one of those mediums runs short.

## Keeping it home: the multiplier, leakage, and suppliers first

Darren, 5 October 2026:

> "If you run your business in the Incubator … and you take payments in
> credits as well as pounds, then all of your exchanging … is going on in this
> credit economy … You present the paperwork to HMRC. They say this is how much
> tax you owe. So that is the only amount that you then end up having to cash
> out if you can buy everything you need from inside … You've got more
> stimulus control of the velocity by reducing the cash-outs and the reasons
> to cash out, which each time takes money … out of the system … everyone's
> benefit is by keeping as much as they can in credits on their day-to-day
> running life."

### The local multiplier

```
k = 1 ÷ (1 − c × r)
c = share of what people receive that they spend, not sit on (the MPC)
r = share that stays in credits, not cashed out
```

With c = 0.9:

| r (kept in credits) | k | £100 of credits becomes |
|---|---|---|
| 0.4 (most cashed out) | 1.56 | ≈ £156 of exchange |
| 0.8 (cashed out mainly for tax) | 3.57 | ≈ £357 of exchange |

Hoarding lowers c; cash-outs lower r. The capacity valve works on the first,
"keep it in credits" on the second: two levers on one figure.

### Leaks are what you can't buy inside

Tax will always leak (it's paid in pounds; VAT-registered businesses owe VAT on
business swaps in credits too). So do food, fuel, energy and rent to outside
landlords. The multiplier grows as the suppliers of those things join.

The lesson from earlier local currencies: Bristol's and Brixton's pounds were
taken by shops that couldn't spend them with their own suppliers, so they were
cashed back. Switzerland's WIR has run since 1934 because it's business to
business. **Recruit suppliers to other members first**, not only shops.

### Hosts are the first suppliers

Darren: "Supplier first. So that's your data storage providers. They then
enable the Incubator ecosystem to flourish by getting them on first and being
able to trade amongst each other. So this is why the treaties are so important,
because federation hosts can support each other, not needing any data centres
or any external e-commerce costs, because they can all be managed within the
resource bank of the local economy."

- Every member needs storage, relay and a host, so hosts supply everyone.
- **Hosts back each other up.** Copies on separate fates (ADR-Q-019) can sit on
  other hosts in treaty instead of a rented data centre.
- **Mutual hosting settles itself.** If Host A keeps B's copies and B keeps A's,
  each holds the other's credits at the end of the period, and the treaty's
  swap-first settlement (ADR-Q-042 §6) cancels them: **no pounds move at all**.
  Only an imbalance is paid.
- **What still leaks** is the hosts' own costs: electricity, the internet line,
  hardware. Those are the next suppliers to bring inside (a community energy
  co-op, a local ISP, a repair shop).

### The reserve's own bank

The reserve pounds sit in a bank that lends them where it likes. Where a mint
keeps its reserve decides whether those pounds work locally too (the white
paper named Triodos and the Co-operative Bank).

### Shown on the federation's summary

Beside velocity (ADR-Q-024 §6): the **cash-out rate**, the share of credits that
left as pounds this period, and the **multiplier** it implies. A "how much stays
home" figure, never a ranking of anyone's wealth.

## Where they pull against each other

1. **Low demand: stimulate or dampen?** The white paper's issuance ratio
   mints *less* when utilisation is low, and its risk register cuts the ratio
   further. Its stimulus policy and the wiki's valve do the opposite.
   They're two different controls:
   - a **ceiling**: never promise more service than you can deliver (white
     paper);
   - a **stimulus**: lend against capacity so exchange keeps moving (wiki).
   Both can stand, as long as stimulus is a separate, retiring liability and
   never counts as issuance against the reserve.
2. **What backs a credit.** The white paper and wiki mint against capacity;
   Q mints only against value in (ADR-Q-027). An advance credit backed by
   pledged capacity is a second kind of credit and must say so.
3. **Expiry.** The white paper refuses it; demurrage appears only as "future
   work" in `credit-ledger.md`. A decay rate is the classic cure for
   hoarding (Wörgl, 1932–33) and breaks "credits never expire".

## How it might fit Q (a sketch, for an ADR)

- **A capacity ceiling on selling.** A mint shouldn't sell credits for a
  service it can't deliver within the booking window. The white paper's
  `C_mintable` becomes a cap on *buying* credits earmarked for that service,
  not on minting generally. (Note ADR-Q-027: "buying is never paused" —
  this would be a second, capacity reason to pause, and needs deciding.)
- **Stimulus is a capacity gift, not a credit** (ADR-Q-042 §10): no pound
  stands behind it, so it's its own receipt, naming the recipient, the
  capacity, the amount and the window; used up by the service's usage receipt;
  never cashable, never handed on, never across a treaty, never in drift. The
  valve's k, U\* and the gift per person are signed settings, like the safety
  valve. Stimulus paid in pounds by a funder is grant credits instead
  (ADR-Q-036).
- **Flow shown, not wealth.** The federation's home page shows velocity and
  the average age of credits beside the reserve ratio, and the battery stays
  "enough, not more" (ADR-Q-035 §4). A hoarding state (OK / WATCH / OVER) is
  a fact about the mint, never a judgement of a person.
- **Rules in Cedar, not agents.** Every adjustment follows a published rule
  from published figures, takes effect from the next period, and is signed;
  nothing is approved by an AI.
- **Stress tests as test beds** (ADR-Q-031): bull, neutral, bear, zero demand,
  inflation shock and bank-settlement failure, each a scripted run in test
  mode that must come out PASS.

## Decisions for Darren

1. **Stimulus**: proposed answer, the smooth valve on idle capacity (above).
   Who gets it: programmes with funder-set filters and a standing queue
   (below). Still to set: k, the target U\*, and the gift per person. Demurrage on bought credits isn't needed.
2. **Capacity**: should a mint refuse to sell credits for a service beyond
   what it can deliver in the booking window?
3. **Advance credits: dropped** (Darren, 5 October 2026). See below.

## Who stimulus credits go to: filters and a standing queue

Darren, 5 October 2026:

> "First come, first serve: we've got 100 spare credits capacity … the first
> 100 get one free … Another method would be the first 100 to come forward,
> but they have to be [in a group the funder names] … So each filter is
> narrowing down who qualifies and the first 100 that qualify receive … Don't
> wait for applications, queue it out … bosh, bosh, bosh. That's a way that is
> fair. And then obviously the filters can be decided by who is stimulating.
> So that may be a condition of the grant body."

### The pieces

- **A programme** is one funder's stimulus: who funds it, its **filter**, its
  **budget** (which covers the cost of service, the grant principle), and the
  gift per person.
- **The filter** is a list of conditions, all of which must hold:
  `eligible(p) = F₁(p) ∧ F₂(p) ∧ …`. No conditions means everyone. The funder
  sets it; it's signed into the programme, so everyone can see the rule.
- **The standing queue**: anyone eligible joins once. Nobody applies per
  release and nobody has to be online at the right moment; each release
  serves the queue in order.

### The formula, each window

```
R          = release from the valve (capacity units this window)
g          = gift per person (e.g. 1 GB, one class)
c_var      = variable cost of service per unit
B_p        = programme p's remaining budget

slots_p    = min( ⌊ R_p ÷ g ⌋ ,  ⌊ B_p ÷ (g × c_var) ⌋ )
serve      = the first slots_p people in p's queue
B_p       := B_p − served × g × c_var
```

- **Splitting a release between programmes**: in proportion to their
  remaining budgets; the federation's own open programme (no filter, first
  come) takes any remainder.
- **One each before anyone gets two**: someone served goes to the back of the
  queue, so the gift spreads before it repeats.
- **Unused gifts lapse**: a gift not booked within its window goes back to idle
  capacity; nothing carries over.

### Worked example

The valve releases 100 GB this week; g = 1 GB, c_var = £0.05.

| Programme | Filter | Budget left | Share | Slots |
|---|---|---|---|---|
| Disability arts grant | holds the funder's eligibility attestation | £2.00 | 40 GB | min(40, 40) = **40** |
| Federation open | none | — | 60 GB | **60** |

The grant pays £2.00 for the 40 it served; the first 40 eligible people in
its queue get 1 GB; the next 60 in the open queue get theirs. Next week's
release continues down both queues where this one stopped.

### The federation's own good causes

Darren, 5 October 2026:

> "A federation host knows what its capacity is … a 30 gig hard drive … we've
> only got 10 gig we're using. Do we decide by the Euler formula that any safe
> capacity may be used and offered to the local scout group, or offered to
> mothers and toddlers group, offered to anyone down the job centre who wants
> some free space, up to five gig, 20 places left … That could be something
> that is decided within the AGM of good causes that year. It could be any way
> that the federation chooses to support capacity."

So the funder can be **the federation itself**:

- **The valve says how much is safe to give.** The members decide **who to
  give it to**, as that year's good causes, by the federation's own rules
  (an AGM vote, one member one vote: ADR-Q-007).
- **A recipient can be an organisation** (the scout group, a toddler group) or
  a person (anyone the job centre refers), each with a **cap per recipient**
  ("up to 5 GB") and a **number of places**.
- **The running cost** comes from the federation's own allocation for good
  causes, voted with the programmes: the grant principle, self-funded.

Worked example: 30 GB, 10 GB used, U\* = 0.8, k = 3, 20% slack (6 GB).

```
U = 10 ÷ 30 = 0.33      gap = 0.47      v = 1 − e^(−1.4) = 0.75
release = 0.75 × (20 − 6) ≈ 10.5 GB
```

So **10.5 GB is safe to give**: the scouts 5 GB and the toddler group 5 GB, or
the job centre two places of 5 GB. "Twenty places of 5 GB" (100 GB) wouldn't
fit, and the valve says so before anyone is promised anything. The members
choose the causes; the formula keeps the gift inside what's really spare.

### Storage gifts have a term

A gift of room-hours is used and gone. A gift of storage is held, so it needs
an end the recipient knows from the start:

- **A term**, such as three months, **renewed only if the valve still allows
  it** at renewal.
- **Notice before it ends** (say 30 days), so the recipient can move their
  files; Q helps them take a copy.
- **Paying members come first.** When paid use rises towards the target, the
  valve closes and gifts aren't renewed. That's the "retract" in Stimulate →
  Circulate → Settle → Retract, done kindly.

### Three kinds of capacity, one unit

Darren: "It works for passing through, wouldn't it? Because it's transient and
you can see how much capacity is passing through … it only holds for seven
days … it's not just computer capacity."

What's given is always **capacity × time in the window** (GB-days, desk-hours,
seat-hours): the white paper's K_window. How it's held decides the shape of the
gift:

| Kind | Examples | The gift | Commitment |
|---|---|---|---|
| **Used and gone** | a room-hour, a class seat, relayed call minutes | so many uses in the window | none after use |
| **Passing through** | transit storage, the holding bay (ADR-Q-017), a parcel shelf | so many GB-days; e.g. 1 GB held up to 7 days, or several smaller passes | ends by itself when the hold expires |
| **Held** | long-term storage, a desk by the month, a tool on loan | an amount for a term | a term, notice, paying members first (above) |

**Passing through is the natural fit for stimulus**: the throughput is visible,
the slack stays large, and every gift ends on its own within the window, so the
valve can open and close each week without anyone being asked to leave. Held
capacity can still be given, but only with a term.

### Proof without exposure

Filters will often touch protected or health characteristics (sex,
disability). The valve never needs to know them:

- Eligibility is an **attestation** (ADR-Q-036): someone the funder trusts
  signs "meets this programme's criterion, until …". The person holds it.
- The valve checks the signature and the date, and **the receipt records only
  "eligible under programme P"**, never the characteristic behind it.
- Nothing about who qualified is visible to the federation, the other
  members, or the mint's books (ADR-Q-035 §4: fully accountable, fully
  anonymous).

Targeting by a protected characteristic must also be lawful where it runs (in
the UK, the Equality Act's rules on positive action and charitable purposes);
that's the funder's condition to answer for, and worth advice.

## Decided: no advance credits; stimulus is a gift of idle capacity

The wiki's advance credits (an overdraft against pledged capacity) have a
hole. "Not withdrawable" only stopped the provider cashing out. Once he spends
them, say ten credits for a haircut, the barber holds them: either a
second-class coin he never agreed to take, or ordinary coins with no pounds
behind them. The only honest form is a secured loan from the mint, which is
credit creation, lowers the reserve ratio, and is regulated lending.

Darren:

> "Incentivising investment with an advance … isn't healthy, is it? Because
> people will discover loopholes, whereas releasing unused capacity is a
> charitable act, stimulates, it's non-inflationary, it doesn't waste much
> resource, as long as the cost of sale is covered, and that's the grant
> principle, and it means things are used. Magic is being made, unknown
> creative ideas spawning … it's going to people for free, so it's not going
> into the pockets of billionaires, it's going into the community benefit.
> Free evening classes, whatever."

So:

- **No lending.** Nobody owes the mint; no credit is minted against a promise
  of future work. Lending can come back only as its own ADR.
- **Stimulus is the capacity valve**, and it's a **gift**: idle capacity
  released free, to community benefit (free evening classes, an empty studio,
  spare storage).
- **Its cost of service is covered by the grant principle**: the variable cost
  of what's released (power, wear, a tutor's time) is met from a grant or a
  reserve set aside for it, never from the reserve that backs bought credits.
  Released capacity is limited to what that allocation covers.
- **A new node still earns from day one**, because the valve sends people to
  its idle space.

## Related

ADR-Q-023 (rewards from delivered capacity), ADR-Q-024 (balance sheet),
ADR-Q-027 (minting, the safety valve), ADR-Q-031 (test beds), ADR-Q-035 (the
battery), ADR-Q-036 (credits held by rule), ADR-Q-042 (treaties; one credit
is one unit of currency); `origins/white-paper-2025-12.md`,
`origins/building-a-future-2025-12.md`.

Not legal, financial or tax advice.
