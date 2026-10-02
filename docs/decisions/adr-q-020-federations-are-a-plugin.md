---
status: proposed
implementation: started — the host's Federations switch (build step 1), 2 October 2026
updated: 2026-10-02
---

# ADR-Q-020 — Federations are a plugin a host chooses to offer

**Status: proposed, 2 October 2026.**

## Context

Darren, 2 October, testing as an ordinary member who had founded a club:

> "Having federations function is a plugin, the realization. And so I may
> not wish to have other clubs involved and just have a website for doing my
> own thing. I still have to authenticate it using a receipt from Incubator.
> But federations and that aspect is not something I may want to offer. I may
> have just myself and have a membership system … If I'm offering services
> where other federations can exist under me, then they either have the
> option of using my services … and that should be a purchase credit usage …
> or add your own … a Federation card that's needed to ask the questions and
> to take you through the steps … name of the club, the photo cover, the
> photo profile, the settings, the rules … and then a nice swanky
> communication point."

On a club's Nodes section Q said "Optional: most never need one" and "You
don't need a machine of your own." That hid the real choice and its cost.

## Decision (proposed)

### 1. A host is a federation; offering clubs is a plugin

- **Every host is a federation** (ADR-Q-016, ADR-Q-018): its founder, its
  members, its agreement, its own node and services. That never changes.
- **Hosting other federations inside it is a plugin the host switches on.**
  Off, the host is a single site with its own membership: no **New
  federation**, no clubs. On, its members can found clubs inside it.
- The switch is one of the host's **Services** (ADR-Q-018 §4), set on the
  founder's own computer like every other, with a signed record, and sent to
  the live site. Unset means **off**: a fresh copy starts as a single site.
- A host that switches it off still shows memberships its members hold in
  federations elsewhere (ADR-Q-019 §2). It just doesn't found new ones.

### 2. A club chooses who carries its members' messages and calls

When clubs are on, each club chooses, in plain words, on its own page:

1. **The host's services**: the host's bellboy, storage and switchboard.
   The bellboy is free. Each club gets a **free monthly allowance** of the
   rest; beyond it, the club spends **credits** (ADR-Q-017 §3, §7).
2. **Its own node**: its own machine, set up the same way as the host's.

Q never says "most never need one". It says what each choice costs.

### 3. Credits

- Bought in packs (first: **10 credits, Standard**). Payment is a third party's
  (Stripe, or another the host adds); Q keeps the **signed receipt** of the
  purchase and the balance is drawn from receipts, never a server's say-so
  (ADR-Q-017 §5).
- **Test mode first:** buying completes as if paid, clearly marked "Test —
  no money taken", so the whole flow can be tried end to end.
- Spent on what's beyond the allowance: relayed call minutes, storage held,
  emails. Each spend is a receipt.

### 4. The Federation card

Founding a club becomes steps, like the Personal card (ADR-Q-015):

1. **Name and purpose**
2. **Cover photo and profile photo**
3. **How people join** (open, ask, invite) and the caretaker's term
4. **The rules**: the agreement and the club's own consent blocks; the
   principles no vote can change, shown and fixed
5. **Look at it**, then **Found it**

The result is the club's **card**, and a club page with a proper
**communication point**: announcements, messages to members, and calls.

## Build order

1. **The host's Federations switch** in Services; **New federation** and
   drafts only when it's on; the club's Nodes section as the honest choice
   in §2.
2. **Credits in test mode**: buy 10 (Standard), signed purchase receipt,
   balance on the dashboard.
3. **The allowance and spending** on the host's services.
4. **The Federation card** steps and the club page.
5. **Real payments** (Stripe), behind the same receipts.

## Non-claims

This does **not** set prices, the size of the allowance, or the payment
provider; or give financial or legal advice. Credits that can't be cashed
out, and their accounting, need an accountant's view before real money moves
(ADR-Q-017).

## Related

ADR-Q-007 (federations), ADR-Q-015 (cards), ADR-Q-016 (Incubator is a
federation), ADR-Q-017 (the commons, credits), ADR-Q-018 (install local
first; Services), ADR-Q-019 (copies).
