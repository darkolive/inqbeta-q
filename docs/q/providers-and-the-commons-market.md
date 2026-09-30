---
implementation: none
decision: none
updated: 2026-09-30
---

# Every service is a card — and Q as a market for members' nodes

**30 September 2026. Thinking, not decided.** Darren: every feature is a card,
a block of data that provides or receives. AI keys (ADR-Q-013) are one case;
mail is another — a federation that emails its members puts in its own mail
server. Each one makes Q-the-website less and less a dependency. Then:
members sign up and **offer compute to Q over Nebula, as if Q were a
federation**; Q pays them, adds a handling fee, and that is how Q earns — by
supporting a whole decentralised ecosystem.

---

## 1. Provider cards

Every service Q uses gets a **slot**, and each slot is filled by a **provider
card**. A card is a block like any other: it says what it provides, its musts
and cannots (ADR-Q-008), what it costs, and where your data goes.

| Slot | Today (hard-wired) | Card options |
|---|---|---|
| AI model | — | own key · federation's · Q credits (ADR-Q-013) |
| Mail out | Dark Olive's Resend | own SMTP or API key · federation's · Q's |
| Storage / backup | Google Drive (own) | own cloud · federation's nodes · Q commons |
| Post office | commons (ADR-Q-010) | own node · federation's · commons |
| Call relay | Dark Olive's Cloudflare TURN | own · federation's · commons |
| Compute | — | own node · federation's · commons |

Three sources for every slot, always in this order of preference:
**mine → my federation's → Q's**. Q's own is the fallback that means nobody is
stranded, never the default that means everyone depends on it.

Where the secret lives:
- **A person's** key sits in their vault, sealed to them.
- **A federation's** key (its mail server's password, say) is sealed to the
  federation's caretakers and to the node that uses it — never to Q.
- **Mail needs a server to send from**: a browser cannot speak SMTP. So a
  federation's mail goes out from its own node, or through Q's service — and if
  Q's service sends it, Q's server has to open the credential at that moment.
  The card says so.
- A federation's **member list** is the federation's personal data, not Q's.

## 2. Q's commons as a buyer of members' capacity

ADR-Q-010 already has **the commons**: the federation Q runs so nobody is
stranded, with no special powers. The idea extends it:

1. **A member offers their node** to the commons — a provider card: what it
   serves (storage, relay, post office, compute), how much, where, what it
   promises (uptime, notice before leaving).
2. **The commons admits it to its Nebula mesh.** The commons' certificate
   authority signs the node's certificate; Nebula *groups* say what it may
   serve, and the firewall rules follow the groups. Removing a provider is a
   block-list entry. Lighthouses run on Q's own small servers.
3. **Work is placed** on providers, spread across different fates
   (`howSafe()` — two copies in one house are one copy).
4. **Every delivered unit is a receipt signed by both sides** — "held these
   blobs, passed today's check", "relayed 40 minutes of calls", "ran this job,
   output hash X".
5. **Settlement from receipts**: monthly, the receipts are summed, priced, the
   fee taken, the provider paid — and the payout is a receipt too.
6. **The fee is on every receipt**: *you paid 100 · provider 85 · Q 15.*

This is not one mesh for everyone (ADR-Q-010 §12 still holds). The commons is
one federation among many; any federation can do the same with its own
members, and Q's code lets them.

### What fits, and what doesn't

| Service | Fit | Why |
|---|---|---|
| **Storage** | **Best** | Vault data is encrypted before it leaves the device; a provider holds ciphertext only. Checked by random challenges (hash a random slice). |
| **Post office, call relay** | **Good** | They carry sealed messages and relayed media; already designed as carry-only. |
| **Compute on public or non-personal work** | **Good** | Building and signing sites, indexing public receipts, rendering. Results checked by running some jobs twice on different providers and comparing hashes. |
| **Compute on private data, including AI on your own content** | **Poor** | Whoever computes on it can see it. Home PCs have no confidential-computing hardware. Only for data the owner chooses to expose, and the card must say so. |
| **Open AI models on members' GPUs** | Possible | Same limit as above: the host sees the prompt. |
| **Sending mail from home** | **No** | Home connections are blocked on port 25 and sit on spam blocklists. Mail goes through a proper relay. |

## 3. Money — the inQbeta exchange model

Darren (30 September): use the model already in the main inQbeta repo. People
**load money in**; inside, everything runs as an **exchange of credits**;
only when someone **takes cash out** (or is paid for a service) does it reach
their books, and reporting it to HMRC is their responsibility.

What the inQbeta repo already says (`~/inQbeta`):

- `docs/guide/credits-and-rewards.md` — credits track contribution inside a
  federation and are **not money**; storage and compute are named ways to earn
  them, **paid for delivered, verified capacity, not promises**. Money enters
  only when a federation deliberately opens an exchange: buy credits with
  money, redeem under set conditions — which brings **reserves, a treasury,
  reserve ratios, cost-of-service pricing, redemption and fair-extraction
  rules**.
- `reviews/04-checkpoint-2026-08-14.md` summarises Darren's white paper
  *A Community Credit Exchange System* (v1.0, 1 Dec 2025): credits are argued
  to be **"eligibility tokens"** — a right to attempt a booking within a
  capacity window — deliberately **not money, not e-money, not a security**;
  issuance is **reserve-backed**
  (`ReserveBalance ≥ ReserveRatio × CostOfService × CreditsIssued`); wallets
  mark each transaction **personal or business**.
- `docs/architecture/plugin-accounting-manifest.md` — every event is classed
  for the balance sheet, with an optional hint: *taxable, barter, personal*.
- `docs/wiki/Credit-Attestation-Model.md` — credits are signed attestations
  per federation, no global currency.

**The white paper** (Darren shared it on 30 September, with the rural
narrative *The Network Was Already Here*, July 2026, and the Community Shared
Workspace service sheet). What it says that decides the market:

- **Credits are eligibility tokens**: a right to attempt a booking within
  capacity, never guaranteed delivery at a set time — argued to keep them
  outside financial services, payment services, e-money and investment rules.
  "Non-redeemable participation units."
- **Issuance is capacity-limited and reserve-backed**: a Service Plugin per
  capacity type — `TIME_BASED`, `STORAGE_BASED` (`storage_unit_size_gb` per
  credit, mintable = issuance ratio × free storage), `ITEM_BASED` — with a
  cost-of-service reserve ratio.
- **Storage is triple-replicated** to separate nodes, no two on the same
  operator — the same rule as `howSafe()` fates.
- **§12 Personal or Business mode, on every transaction.** Personal:
  neighbourly, non-commercial — "typically non-taxable (similar to LETS and
  informal non-business barter)". Business: credits are **non-cash
  consideration (barter)**; the exchange **must record a £ value at the time**,
  posted to the accounts (Xero, QuickBooks, Sage; VAT code; Making Tax Digital).
- **§14 Trading vs selling.** *Trade*: member ↔ member or member ↔ plugin, no
  pounds move. *Sell*: member ↔ CIC, pounds move, reserves checked (no sale if
  the reserve rule fails), taxable in business mode.

**Two readings to reconcile:**

1. **When it becomes taxable.** The white paper is stricter than "only at
   cash-out": in business mode each trade is barter and is valued in pounds
   when it happens. Cash-out is when *pounds* move, not when tax starts. Node
   operators earning from Q are most likely business mode. The white paper's
   version is the safer one; keep it.
2. **Redeemable or not.** §18 calls credits "not stored GBP value" and
   "non-redeemable", but §13–14 let a member *sell* credits back for pounds.
   Selling back at a set rate is the step that most looks like e-money. For
   providers, the cleaner route is §12's business mode as it stands: the CIC
   **pays a provider for a service** it received (an ordinary supplier
   payment, valued in pounds), rather than buying credits back.

**How the commons market fits it:**

- Buyers load pounds → receive commons credits (reserve held by Dark Olive CIC).
- Providers earn credits from receipts of delivered capacity; spend them on
  other members' services inside the exchange.
- **Edges are where money moves**: loading in, and a provider cashing out.
  Each edge is a receipt; the handling fee is taken at the edge and shown.
- Wallets mark personal / business per transaction, so a provider can see
  what they may need to declare.

**Two things to confirm with an accountant and a solicitor before cash-out
exists** (not legal or tax advice):

1. **Tax timing.** HMRC's usual rule for someone *trading* is that income in
   kind — credits, barter — counts when it is earned, at its value, not only
   when turned into cash; casual, non-business exchange between members
   usually falls outside tax. HMRC has specific manual guidance on LETS
   schemes. So "reportable at cash-out" may hold for casual members and not
   for people running nodes as a business. The personal/business mark is the
   right tool either way.
2. **E-money.** Credits bought with pounds **and redeemable for pounds** look
   like electronic money, which needs FCA authorisation or an exemption (such
   as a limited network). The white paper's "eligibility token" argument is
   about exactly this; cash-out is the part that tests it. A route that keeps
   clear: providers are **paid for services** in pounds by the CIC (an
   ordinary supplier payment), rather than **redeeming** credits.

## 4. Order

1. **Provider cards** for what exists: storage (Google Drive), mail, TURN, AI.
   Replace Dark Olive's env settings with cards. (Makes Q independent.)
2. **Federation offers** — ADR-Q-010's directory, with cards.
3. **Commons pilot, no money**: the mini PC plus one other member hold
   encrypted blobs for each other over the commons' Nebula; receipts both
   ways; a dry-run settlement statement.
4. **Money**: the exchange (§3) — reserve, payments provider, provider terms, the two checks.
5. Compute, after storage works.

## Questions for Darren

- Fee: a fixed percentage, published, the same for everyone?
- Who sets prices — Q per unit, or providers name their own?
- Pilot with storage first, before compute?
- Should a federation be able to run its own market the same way (yes, by the
  licence — but with Q's credits, or only its own)?

## Related

ADR-Q-013 (AI keys and credits), ADR-Q-010 (post offices, offers, the
commons), ADR-Q-008 (musts and cannots), ADR-Q-007 (federations, blocks),
`home-node.md` (Nebula, one mesh per federation), `pooled-storage-as-a-service.md`,
`open-shop-audit-2026-09-30.md`.
