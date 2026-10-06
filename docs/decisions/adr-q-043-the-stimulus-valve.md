---
status: proposed (Darren, 5 October 2026; written 6 October 2026)
implementation: the valve, the queues and the capacity gift in q-core `stimulus.ts`, tested; nothing on a page yet
updated: 2026-10-06
---

# ADR-Q-043 — The stimulus valve: idle capacity, given

**Status: proposed.** It comes from `docs/q/economy-controls.md`, where the
thinking is set out in full with its three sources: the white paper, the
inQbeta wiki's pressure valve, and the Workhouse demonstrator.

## Why

Since ADR-Q-042, one credit is one unit of the mint's currency, and credits
are minted only against value in (ADR-Q-027). The money supply moves only
with pounds. Darren, 5 October 2026:

> "What happens if the pound banking system goes crazy and you can't get
> pounds in to mint? … the only way wealth increases is by exchange. So we
> have to have lots of exchange. There is no incentive in hoarding coin. It's
> there to work."

If pounds can't come in or go out, the coin's anchor moves from **the pound**
to **capacity**: you can still buy bread and rooms with it. What keeps exchange
moving then is putting **idle capacity** to use. Spare capacity perishes: an
empty desk-hour today, or a gigabyte idle all week, is gone for good.

> "If we've got a 30 gig hard drive and we're only taking sales for one gig,
> then we've got 29 gigs sat there doing nothing … let's offer it out for free
> … to get the velocity to increase … that's exactly where Euler was used in
> that valve … it being a smooth release."

## Decided (proposed)

### 1. No lending; stimulus is a gift

Advance credits (an overdraft against pledged capacity) are **dropped**. Once
spent, they are either a second-class coin the receiver never agreed to take,
or coins with no pounds behind them. The honest form would be a secured loan,
which is credit creation and regulated lending. Darren: "releasing unused
capacity is a charitable act, stimulates, it's non-inflationary." Lending can
come back only as its own ADR.

### 2. The valve

```
I        = capacity − used                 idle in the booking window
gap      = max(0, U* − U)                  how far use is below target
v        = 1 − e^(−k · gap)                the valve: shut at the target, opening smoothly as use falls
release  = v × max(0, I − slack)           what's safe to give this window
```

- It is **smooth**: the exponential never snaps open or shut (the white
  paper's §17.6 warned against policy thrashing).
- It **closes itself** as people take the space up.
- **Proposed defaults**, signed by each federation like the safety valve and
  changed only from the next window: U\* = 0.8, k = 3, slack = 20% of
  capacity.

The 30 GB drive, worked by the code (`valveRelease`):

| Used | Use | Valve | Safe to give |
|---|---|---|---|
| 1 GB | 3% | 0.90 | ≈ 20.7 GB |
| 10 GB | 33% | 0.75 | ≈ 10.5 GB |
| 15 GB | 50% | 0.59 | ≈ 5.3 GB |
| 24 GB | 80% | 0 | none |

### 3. What's given is a capacity gift, never a credit

It is its own receipt (`inqbeta.capacity-gift/1`), signed by the federation
(ADR-Q-042 §10). It names:

- the recipient;
- the capacity (storage, the studio, evening-class seats);
- the amount and unit;
- the programme;
- the window;
- the valve's figures, so anyone can check it opened no further than the rule
  allowed.

A gift:

- is **never cashed out**, so the pound reserve is never touched;
- is **never handed on** and **never crosses a treaty**;
- **never appears** in a coin balance, the battery or drift;
- **lapses with its window**: an unused gift goes back to idle capacity.

Bought credits never expire; gifts do, because the capacity behind them
perishes. This keeps the white paper's promise that credits never expire
for everything people paid for.

### 4. Three kinds of capacity

What's given is always **capacity × time in the window** (GB-days,
desk-hours, seat-hours):

| Kind | Examples | The gift |
|---|---|---|
| **Used and gone** | a room-hour, a class seat, call minutes | so many uses in the window |
| **Passing through** | transit storage, the holding bay, a parcel shelf | so many GB-days; ends by itself |
| **Held** | long-term storage, a desk by the month | an amount for a **term**, with **notice** before it ends; paying members first; renewed only if the valve still allows |

Passing through fits stimulus best: the gift ends on its own, so the valve can
open and close every week without anyone being asked to leave.

### 5. Who gets it: programmes, filters, a standing queue

- **A programme** is one funder's stimulus. It has the funder, a **filter**
  (conditions that must all hold; none means everyone), a **budget** for the
  cost of service, and a **gift per person**.
- **The funder can be the federation itself**: the valve says how much is
  safe to give, and the members decide who to give it to as that year's good
  causes, by their own rules (an AGM vote, ADR-Q-007). A recipient can be an
  organisation (the scouts, a toddler group) or a person, with a cap each and
  a number of places.
- **A standing queue.** Anyone eligible joins once. Nobody applies for each
  release, and nobody has to be online at the right moment.
- **Each window** (`allocate`):
  - funded programmes share the release in proportion to their remaining
    budgets, each limited by what its budget pays for (`gift × cost per
    unit`) and by its queue;
  - the federation's open programme takes the rest;
  - anyone served goes to the back (`nextQueue`), so one each before anyone
    gets two.

Worked by the code: 100 GB released, 1 GB gifts at 5p of running cost each.
A grant with £2.00 left serves 40 people (£2.00); the open programme serves
the next 60. At a host with 10.5 GB safe and 5 GB gifts, the scouts and the
toddler group get theirs and the job centre waits: two places, never twenty.

### 6. The grant principle: running costs are covered

Free capacity still costs power, wear and a tutor's time. That **variable cost
of service** is met from a grant, or from an allowance the members set aside
for good causes, never from the reserve that backs bought credits. Release
is limited to what that allowance covers.

### 7. Proof without exposure

Filters may touch protected characteristics (disability, sex).

- **Eligibility is an attestation** (ADR-Q-036): someone the funder trusts
  signs "meets this programme's criterion, until …". The person holds it.
- **What the valve checks:** the attestation's signature and date.
- **What the gift records:** only "eligible under programme P", never the
  characteristic behind it.
- **Who sees who qualified:** nobody. Not the federation, not the members, not
  the mint's books.

Targeting by a protected characteristic must be lawful where it runs (in the
UK, the Equality Act's positive-action and charitable-purpose rules). That is
the funder's condition to answer for, and worth taking advice on.

### 8. Keeping it home, shown not ranked

The local multiplier is `k = 1 ÷ (1 − c × r)`, where `c` is the share spent
rather than held, and `r` the share kept in credits rather than cashed out.
The valve works on `c`; keeping it in credits works on `r`.

The federation's page shows, as facts about the mint and never as a ranking
of anyone:

- **velocity** and the **average age of credits** (job F2);
- the **cash-out rate** and the multiplier it implies.

Bring suppliers in first, hosts above all: mutual hosting settles itself by
swap (ADR-Q-042 §6).

## The rules (Cedar, to write): `capacity.give`, `capacity.use`

Cannots, in plain words:

- Give more than the valve releases this window, or open it from settings not
  signed by the federation.
- Treat a gift as a coin: cash it out, hand it on, send it across a treaty,
  count it in a balance or in drift.
- Use a gift outside its window, for any other capacity, or by anyone but its
  recipient.
- Pay for a gift's running cost from the reserve behind bought credits.
- Record why someone was eligible beyond "eligible under programme P".
- Give held capacity without a term and notice.
- Mint any credit against a promise of future work (no advance credits).
- Any of it approved by an AI.

## Open questions, for Darren

1. **The settings**: U\* = 0.8, k = 3 and 20% slack as defaults?
2. **Capacity ceiling on selling**: should a mint refuse to sell credits for a
   service beyond what it can deliver in the booking window? That would be a
   second reason to pause buying, which ADR-Q-027 says never pauses.
3. **The first programme**: the federation's own good causes at Incubator,
   with transit storage as the first gift?

## Build order

1. **The arithmetic and the gift** (q-core `stimulus.ts`): `valveRelease`,
   `allocate`, `nextQueue`, `giveCapacity`, `giftUsable`, with the worked
   examples as tests. **Done.**
2. The valve's settings, signed by the federation, read like the safety
   valve.
3. Programmes and their standing queues, as receipts; eligibility
   attestations (ADR-Q-036).
4. The rules in q-actions (`capacity.give`, `capacity.use`), with tests.
5. On the federation's page, in role: idle capacity, what's safe to give, the
   programmes and queues; the person's gifts on theirs.
6. Velocity, the average age of credits, the cash-out rate and the multiplier
   (F2); stress-test beds (F3).

## Related

ADR-Q-007 (federations, votes), ADR-Q-017 (the holding bay), ADR-Q-023
(rewards from delivered capacity), ADR-Q-024 (the balance sheet), ADR-Q-027
(minting and the safety valve), ADR-Q-031 (test beds), ADR-Q-035 (the
battery), ADR-Q-036 (credits held by rule; attestations), ADR-Q-042
(treaties; capacity gifts never cross); `docs/q/economy-controls.md`;
`origins/white-paper-2025-12.md`.

Not legal, financial or tax advice.
