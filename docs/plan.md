---
updated: 2026-10-04
about: The working plan — every idea captured so far, in the order it gets built, and how each piece is done. Claude follows this; Darren adds to it.
---

# The plan — from 3 October 2026

Darren: "I'm going ideas all over the place … please compile into a way that
you can follow through and execute in the most efficient way."

This is that. **Ideas go in the inbox at the bottom as they come**; each one
is placed into a phase at the next pause. The order below is chosen so that
each piece makes the next one smaller: shared parts first, then what's built
on them.

## Where we are (3 October, evening)

Live on inqbeta.com and the node, all committed:

- **Agreements** (ADR-Q-025): offer, counter, accept, done, settle; both sign;
  balances only from settlements.
- **Offers by link and shops** (ADR-Q-026): open offers; standing offers with
  stock; each sale its own agreement; sold-out cancel; shops held at the gate.
- **Minting** (ADR-Q-027): credits made when value comes in, destroyed on cash
  out; test mode; publish once, signed.
- **Copies in order** (ADR-Q-028, steps 1–2): the relay (a pass-through, held
  and arrived receipts signed, daily totals for pricing).
- Share by **AirDrop**; phones fit; the bell counts only what's unread;
  Credits says plainly when it isn't on.

## Phase 0 — finish switching on (Darren, on the node and phone)

- [ ] `GATE_MINTS=<the mint's did:key>` (copy the line from localhost: Federations → your host → Services → Publish money) in `/srv/node/.env`, then
      `docker compose up -d --force-recreate gate`. Credits then shows Test
      mode and **Buy** works.
- [ ] Buy test credits as the test person; buy from your shop; settle it.
      The first real end-to-end sale.
- [ ] The phone: closing inqbeta.com tabs, or clearing its website data once
      its vault is backed up, so it runs the current Q.

## Phase 1 — component sets (ADR-Q-029)

Why first: everything after this (backups settings, hiring pass-through, the
balance sheet) would otherwise add more copies of things that already exist
three or four times. One set, written once, each use saying only its
exceptions.

1. ✅ **The exchange set** (built 3 October) — offer → answer → settle, read from the head.
   - q-core: one chain reader for any exchange, given its step rules (agreements'
     `standingOf` becomes the first set of rules).
   - Screens: `ExchangeCard`, `ExchangeNow` (only the buttons open to you),
     `ExchangeTimeline`.
   - Agreements and the shop move onto it; the rules engine unchanged.
2. ✅ **The writer set** — `StepWriter`: steps as data, one Next/Back, one
   read-back. The four writers move onto it (host set-up, backups, your card,
   the agreement writer).
3. ✅ **The share set** — one `Share` (AirDrop and more, email, WhatsApp, text,
   code to scan, copy), replacing `ShareLink`, `ShareLinks`, `ShareCard`.
4. ✅ **The sign-in set** (as one rule) — one `SignIn` that stays where you are by default,
   replacing the four.
5. Calls, link requests and federation invitations: **left as they are for now** — they
   run on different chains (live calls; UCAN delegations), so moving them
   would add work without removing copies. Revisit when they next change.

## Phase 2 — copies in order (ADR-Q-028, steps 3–7)

1. ✅ The five-minute sync hands the relay what the cloud couldn't take, and
   drains it into the cloud when it's back (custody receipts; nothing let go
   until it's held elsewhere).
2. ✅ **Your own bucket** (S3-compatible), as a full copy or a pass-through;
   keys sealed in the vault and the vault pointer.
3. ✅ **Settings → Backups**: schedules within what
   the host offers.
4. ✅ **The download**, offered when due.
5. ✅ **Opening from the newest copy** on a new device.

## Phase 3 — the price, from the flow

1. ✅ **Pass-through by the hour**: a node's open hours (GATE_RELAY_HOURS);
   the host offers it in their shop (Services → From the flow to a price →
   Offer it in your shop); people Hire it; their Q uses it alongside their
   host's; they settle for the GB-hours from the custody receipts, the
   operator confirms.
2. ✅ **Measure → cost → credit price → minting price** (ADR-Q-028 §5a): the
   relay's daily totals and node running costs give a cost per GB-hour; that
   sets credits' worth, and the host's pence per credit.

**Phase 3 done (4 October).** Waiting on Darren's testing.

## Phase 4 — the network market (ADR-Q-030)

Darren: "We are a crew sat on a ship in space … free to give, never free to
take." Members choose federations as places; providers offer nodes from a
plugin; federations ask for space when they get full; price is a band the
crew chooses.

1. **"Use us as a storage source"**: one click on a federation's page takes
   its offer; the sync keeps a copy there; it shows on the Network page with
   its standing (`howSafe()` by fate). The gate gets a **store** beside the
   relay.
2. **The record** from custody receipts per place (arrived, lost, corruption,
   uptime), then signed summaries sent to provider cards.
3. **The provider card and the Network provider plugin**: Run, Offer,
   Accept, Earnings.
4. **Reserved contracts**: space counted at the gate; monthly terms;
   renewals.
5. **Heat and wanted offers**: thresholds, the grid, acceptance by rules.
6. **The mesh**: Nebula certificates per contract, SeaweedFS volumes,
   draining before a contract ends (mini PC and Hetzner first).
7. **The price band, its governance, the orchid line.**

## Phase 5 — later, in rough order

- The node checking hires: only people who've hired it (or the host's own
  members) may hand it files.

- The balance sheet page, statement and club summary (ADR-Q-024).
- A lock on cash-outs before real money (two at once could both pass).
- Real payments and payouts after Publish; an accountant and a solicitor first.
- Federation mints and capital backing; treaties in agreements.
- Photo evidence on "done".
- Earlier themes not yet done: voice messages as MP3 and text; Directory
  Enquiries (ADR-Q-021); "Powered by Q" and Report a host (ADR-Q-019); the
  Marketplace listing real plugins; load-testing the node.

## How each piece is done

1. Rules and data first (q-core, q-actions), with tests.
2. Screens, using the component sets.
3. **Checked before it reaches Darren**: all tests; `svelte-check`; the real
   production build (as Vercel builds it); and **clicked through in a real
   browser at desktop and iPhone size**, signed in, with no page errors and
   nothing wider than the screen.
4. The ADR updated (and the project copy); a commit command for Darren.
5. Anything the node needs, written out as numbered steps.

Standing rules: neurodivergent simplicity first; Skeleton for all styling
(olive `#556B2F`, orange `#D16900`, thick-bordered fields, no placeholders);
Darren commits and pushes; secrets never in chat or git; payout details stay
on localhost; new localStorage keys go in `q-core/src/storage.ts`.

## Inbox — new ideas, not yet placed

- **The host's commission** (Darren, 4 October): a setting on localhost, 10%
  as standard, published with the mint's terms; it goes back into the project
  (Dark Olive decides how). Donations stay, as thanks, through GitHub
  Sponsors (for the code). Open: where it's taken — on every settlement, or
  only where credits meet pounds (buying in, cashing out), so trades inside
  the community (carriers at a festival) still cancel out.
- **The statement at cash-out**: when credits become pounds, Q writes a
  declaration receipt, like an import duty document: pounds in, pounds out,
  the difference, and losses carried forward. A record for the person's own
  accounts, and the user's own choice to attach a company number or UTR;
  never a declaration by the federation. For the accountant (HMRC's own
  manuals, 4 October): a members' club isn't taxed on its surplus from
  dealings with full members (mutual trading, BIM24205); but non-cash
  receipts of a *trade* are taxable when they're money's worth, meaning
  convertible or transferable (BIM40051), so a member running storage as a
  business may owe tax on credits before cashing out.
- **Your accounts software** (Darren, 4 October): a business setting, "who
  does your accounts?" (Xero, Sage, QuickBooks…). Cash-out statements and
  sales receipts export ready to import: first a file in the software's own
  bank-statement format, later a direct link with the person's own key, like
  the other services. A business that cashes out through its business
  account claims its costs back; a sole trader testing an idea keeps a clean
  record from day one. Made for ADHD people running a business.
- **Sponsorship credits for young enterprise**: a sponsor's grant backs
  credits minted for a starting business (ADR-Q-027: capital and grants as
  reserves), so youngsters have credits to work with from the start. For the
  accountant: whether such a grant is income of the business.
- **The federation's home page as its snapshot** (Darren, 4 October): the
  cover, "about the club", then **the health of the network it runs**, and
  one button, **Join** (or **Add**): taking its storage offer adds it to your
  copies, pass-through or kept, with the cost shown and agreed in one step.
  Then its campaigns. Below: graphs of growth, credits minted and in
  circulation, and **what backs them** (the mint's reserves against the
  credits out). A safety valve set on localhost: the mint refuses new
  cash-outs, or minting beyond its reserves, when reserves fall below a
  ratio the host sets (the white paper's reserve ratio, 20% as an example).
- **Your home page**: updates from the people and projects you follow;
  unfollow as easily. Rewards can include staying in touch (a card shared).
- **Reviews** (Darren, 4 October): anything public that needs no
  permission to use (a shop, an open offer, a campaign, a provider) has
  public reviews, because its reputation affects everyone; every federation
  has internal reviews for its members. A review can only come from someone
  holding a receipt with them (a settled sale, a delivered reward, a hire),
  signed by the reviewer, so it can't be faked or bought, and the reply sits
  beside it. Reviews feed the trust levels (like a blue badge earned, not
  bought), and inside a federation they lead naturally into its proposals,
  votes and minutes (ADR-Q-007's Plans block).
- **Who sees what, on a federation's page** (Darren, 4 October): a settings
  tab laid out as three columns, **public · members · admin**, one row per
  thing (its card and did:key, network health, the mint's books and trust
  level, campaigns, reviews, members' list, minutes). The caretaker ticks
  where each row shows, signed with their passkey on the live site; keys,
  money and services stay on the founder's own computer (localhost), as
  now. A preview button: "see it as the public", "as a member".
- **Shared knowledge** (Darren, 4 October): research projects, surveys for
  academics, what each enterprise learned, all in the directory; an
  incubator studying, say, neurodiversity kite-mark standards, and anyone
  in any federation able to ask an AI over that knowledge: "understand
  everybody without knowing anybody". Built on consent: answers come only
  from what people chose to make findable (ADR-Q-021), never from their
  vaults, and survey responses carry the participant's consent receipt.
- **Relays that find each other** (Darren, 4 October): anything can be a
  relay (a Raspberry Pi, a phone), announcing itself with a signed "I am
  here" card (its did:key, what it carries, roughly where), the mycelium
  idea from the incubator docs. The directory (Dgraph has geo indexes and a
  "near" query) picks the relay closest to the sender and the one closest
  to the receiver. In a festival field, with no internet, phones find each
  other directly (Bluetooth, local Wi-Fi) and everyone nearby is a relay,
  earning credits for what they carry (ADR-Q-030 §10). Location is coarse
  (an area, not a spot) and only shared by choice, because a phone's
  position is a person's position.
- **The festival site** (Darren, 4 October): a mini PC in the van with a
  Wi-Fi router covering the site is a node for everyone there: storage,
  bellboy, switchboard (site-wide calls on a dedicated channel), all local
  and fast; anything bound for the wider world waits in a queue and goes
  over 4G when there's signal. Your settings say what you lend: **use my
  Bluetooth**, **let me be found**, **relay for others**. Note: browsers
  can join the van's Wi-Fi and use Q today, but phone-to-phone Bluetooth
  from a web page is limited (iPhones don't allow it), so that part needs
  Q wrapped as an app.
- **Story decks** (built 4 October): a self-contained `StoryDeck` (the
  animation; the slides as stills underneath; a Skeleton slider over the
  whole timeline, a tenth of a second at a time, a marker per scene; "Got
  it" folds it away, remembered). Five decks, each a short advert at
  `/stories/<id>` (open to anyone, with sharing): the festival field of
  relays, your vault in many places, backing an idea with pledges held,
  credits always backed, and when a club gets full. Next: put each on the
  page it explains (vault on Backups, backed on Credits, network on the
  federation page), and words into the language books.
- **A story engine** (Darren, 4 October): the decks become a way to teach.
  A *story manual* (the index down the side, each story and its scenes,
  built at /stories); and in the learning side (DoStudy), designing a course
  includes making its story: say what it is and how it unfolds, scene by
  scene, and the engine draws it from the shared picture pieces, so a
  learner sees what they'll learn, and how, before they start. Decks are
  already data (scenes + one picture snippet per deck), which is what an
  editor, or an AI drafting one, would fill in.
- **Crowdfunding, following, and the test bed**: now ADR-Q-031 (gift
  campaigns, backing with rewards in kind, following on the home page,
  enterprises that start in credits and go live when ready, sponsorship).
- **Credits by default** on pricing (done 4 October): a "show in pounds"
  toggle at the host's rate.
- **The plugin builder**: components, functions and code pass through a
  builder that checks them against the manifest structure (ADR-Q-006); then
  verified, tested, in the library, open to inspection, and credited to
  whoever made them.
- **An e-commerce component set** (ADR-Q-029): product, cart, order summary,
  checkout steps and order status cards, our own in Skeleton (patterns like
  Tailwind Plus's, not its code); words kept as data so they translate and
  read aloud.
- **Carriers cancel out**: at a festival, what you earn carrying for others
  covers what you spend having yours carried.
