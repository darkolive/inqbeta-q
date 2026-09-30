---
implementation: none
decision: partly made (see section 0)
updated: 2026-09-30
---

# The shop is open — repository and licence audit, 30 September 2026

Darren: "a member of public walking in … what they now have access to and what
they're going to be able to do with that … is the repo got too much in it? …
what's proprietary and should not be shown … a full audit on the licensing …
what protects Dark Olive and what enables the project to expand and take
adoption without needing Dark Olive."

Not legal advice. Where it matters (breach duty, trade marks, the licence
itself) a solicitor or the ICO's own guidance has the last word.


## 0. Decisions — Darren, 30 September

- **Owner:** **Dark Olive CIC** (community interest company, shares, asset
  locked, dividend cap). Every licence reads `Copyright © 2026 Dark Olive CIC`;
  the CIC is the owner and the source of any permission beyond the licences.
- **Two independent repos.** Dark Olive's site becomes its own standalone
  repo, built with Q's site builder like any other adopter. It does not sit
  with inQbeta at all. What happens inside Dark Olive — Darren, Theo, anyone —
  is outside this project.
- **Darren's voice is his**, not Q's and not under Q's licences.
- **Income:** Q's dashboard lets people **enter their own AI keys** and run
  their own Q on them, **or buy credits from Q**. Income goes to Dark Olive CIC
  for now. Later, Dark Olive may hand Q over to an **independent Q federation**
  by agreement, and may hold a seat on it. See ADR-Q-013.

**What the CIC form means here** (check with the CIC Regulator's guidance or
a solicitor):
- The **asset lock** limits how the CIC's assets — Q's copyright, trade marks
  and the credit business among them — can leave it: for full value, to
  another asset-locked body (one named in the articles, or another with the
  Regulator's consent), or for the community's benefit. So the future
  handover works most simply if **the Q federation is itself asset-locked**
  (a CIC, a charity, or a charitable incorporated organisation). Worth
  checking whether Dark Olive's articles name a specified asset-locked body.
- **Open-licensing the code** fits the community-interest purpose, and the
  CIC keeps the copyright, so nothing is given away in the asset-lock sense;
  worth confirming once, in writing, with whoever advises the CIC.
- The AGPL keeps the "never free to take" promise even after a handover:
  whoever holds Q next cannot close the published code either.

Still open: is the GitHub repo public now (section 1); the licence split
(section 4 — AGPL app / Apache libraries / CC BY docs); DCO or CLA.

---

## 1. Urgent — before anything else

**The repository's history holds things that must never be public.** They
arrived in the very first commit (`d3e3b7c`, 8 September, "Initial commit:
SvelteKit rebuild of darkolive.co.uk") with the old site's database dumps:

| What | Where | Why it matters |
|---|---|---|
| A **DKIM private key** (the old site's email-signing key) | `apps/darkolive/_demo_full.sql` | Anyone holding it can sign mail that passes as darkolive.co.uk *if that key's selector is still published in DNS* |
| **~40 other people's email addresses** | `_site_full.sql` (18), `_demo_full.sql` (36) | Personal data under UK GDPR |
| **Password hashes** (4) | the same dumps | Crackable offline; people reuse passwords |

Deleting the files now does not remove them: they stay in every clone and
every commit since 8 September.

**If the repository is public, in this order:**

1. **Make it private now** (GitHub → Settings → Danger Zone → Change visibility).
2. **Retire the DKIM key**: check darkolive.co.uk's DNS for its selector
   (`<selector>._domainkey`); remove it, and issue a new key from whoever sends
   the mail now.
3. **The people in the dumps**: the old site is gone, so there is nothing to
   reset — but decide, with the ICO's breach guidance, whether exposure of
   emails and hashes needs reporting (72 hours from becoming aware, where it
   is likely to risk people's rights) or telling the people. Keep a note of
   the decision either way.
4. **Do not rewrite this history and republish it.** Start the public
   repository fresh (section 3) — cleaner and certain.

## 2. What a visitor can do today

- **Read** everything, if the repo is public — including the above, the Dark
  Olive site's photographs, masters, archive, plans, launch emails, and
  recordings of Darren's cloned voice.
- **Use nothing, legally.** There is **no licence file anywhere** and every
  `package.json` is `private` with no `license`. With no licence, copyright
  law's default applies: all rights reserved. So the home page's line "This
  is an open source project, and you are free to inspect it here" is half
  true — they may look, but not copy, run, change or share. Until a licence
  is added, either add one or change that line to "…the code is public to
  inspect".

## 3. Split the repository

One monorepo holds two different things: a **product** meant to be adopted
(Q) and a **business's website and archive** (Dark Olive). They want
different licences, different audiences and different histories.

| Repo | Public? | Holds |
|---|---|---|
| **`inqbeta/q`** (new, fresh history) | Public | `packages/q-core`, `packages/q-ui`, `packages/q-actions`, `apps/q`, `node/`, `spikes/`, Q's docs (`docs/q`, `docs/decisions`, `docs/identity`) |
| **`darkolive/darkolive-site`** (this repo, renamed) | **Private** | `apps/darkolive`: content, photographs, `_masters`, `archive`, `rescued`, `_plans`, the SQL dumps (or delete those), its audio |

The site then uses Q's packages as a dependency, like any other adopter —
which is itself the proof that Q stands without Dark Olive.

**In the public Q repo, still to decide or move:**

- **Darren's cloned voice** (`apps/q/static/voice`, the ElevenLabs voice id in
  the manifests). A person's voice is not code: keep the recordings out of
  the open licence ("not covered — all rights reserved; not for reuse"), or
  serve them from a separate asset store. Scripts and the recording tool can
  be open; the voice cannot.
- **Dark Olive defaults in code**: the email sender `q@darkolive.co.uk`, the
  passkey domain, "Darren's voice", the interest inbox. Most are already
  settings; make every one a setting with a neutral default, so a fork runs as
  itself.
- **Brand assets**: the Q mark, inQbeta name, Dark Olive name and logo — see
  trade marks below.
- **Credit logos** (`src/lib/credits`): Simple Icons files are CC0, the marks
  stay their owners' — keep, with a line saying so.

## 4. Licences — the choice, plainly

Darren's rule: *free to give — never free to take.* Open for anyone to inspect
and use; nobody able to take it private, buy it out or close it off.

| Part | Recommended | Why |
|---|---|---|
| **The app and node services** (`apps/q`, `node/`) | **AGPL-3.0** | Anyone may use, change and run it — but whoever runs a changed Q *as a service* must publish their changes under the same licence. That is "never free to take" written in law: no closed hosted fork. |
| **The libraries and the format** (`q-core`, `q-actions`, `q-ui`) | **Apache-2.0** | So other apps — including ones Dark Olive never hears of — can read and write Q receipts, DIDs and actions without adopting the app's licence. Adoption of the *format* is what lets Q spread without Dark Olive. Apache adds a patent grant and says plainly it grants no trade-mark rights. |
| **Docs, ADRs, specs, schemas** | **CC BY 4.0** | Reuse with credit. |
| **The voice, photographs, brand** | Not licensed | Listed as excluded in `NOTICE`. |

The alternatives, honestly:
- **Everything Apache-2.0 or MIT**: the most adoption, the least protection —
  a large company could run a closed, improved Q. Against the stated aim.
- **Everything AGPL**: the most protection — but libraries under AGPL put
  organisations off using the format, which slows adoption.
- **MPL-2.0 for the libraries** instead of Apache: changes to Q's own files
  must be shared, while others' code around them need not be. A middle path
  if Apache feels too open.

All Q's dependencies fit these (Svelte, Skeleton, Tailwind, Zag, marked:
MIT; Cedar, Vercel AI SDK: Apache-2.0; Font Awesome brands: CC BY 4.0 +
MIT — credit given; Lexend font: SIL OFL; Simple Icons: CC0). Apache-2.0
code may be combined into AGPL-3.0 work.

## 5. What protects Dark Olive

- **Copyright** stays with Dark Olive: `Copyright © 2026 Dark Olive` in each
  licence. *Needs:* Dark Olive's exact legal form — a limited company can own
  copyright; if it is a trading name of a sole trader, the owner is Darren.
- **Trade marks**, which a licence never covers: a short `TRADEMARKS.md` —
  the code is free, the names *inQbeta*, *Q* in its orange mark and *Dark
  Olive* are not; a fork must use its own name. Consider registering
  **inQbeta** (and the mark) with the UK IPO. "Q" alone is weak as a mark.
- **Contributions**: choose one —
  - **DCO** (each commit signed off "I have the right to give this"): light,
    welcoming; but Dark Olive could never relicense others' work.
  - **CLA** (contributors license to Dark Olive): keeps the option to
    relicense or dual-license later; heavier, and some people won't sign.
  Given "no takeover", DCO plus AGPL is the cleaner promise: nobody,
  including Dark Olive, can close it later.
- **Income** without owning the code: hosted Q for those who don't want to
  run it, support, federation set-up, the donation portal, sponsorship,
  referral links (disclosed).

## 6. What lets it grow without Dark Olive

- The open licences above, and the format under Apache-2.0.
- Nothing hard-wired to Dark Olive (section 3).
- A `CONTRIBUTING.md`, a `SECURITY.md` (how to report a flaw privately), and
  a `GOVERNANCE.md` that says how decisions are made — in time, the same
  federation rules Q gives everyone (ADR-Q-007).
- Specs (receipts, vault format, actions) written so another implementation
  could be built from them alone.

## 7. Before the fresh public repo — checklist

Repo confirmed **private** (Darren, 30 September): the history was never
public, so no breach and no key rotation are forced. Retire the old DKIM
selector anyway if it is still in DNS.

- [x] Owner: Dark Olive CIC
- [x] Licences: AGPL-3.0-or-later app and node / Apache-2.0 libraries / CC BY 4.0 docs
- [x] DCO (CONTRIBUTING.md)
- [x] `LICENSING.md`, `NOTICE` (voice, brand, credit logos excluded),
      `TRADEMARKS.md`, `SECURITY.md`, `CONTRIBUTING.md`; `license` in every package.json
- [x] Apache text in `packages/*/LICENSE`
- [ ] AGPL and CC BY texts: `node scripts/fetch-licences.mjs`, then commit (word for word from SPDX)
- [x] Dark Olive defaults made settings: `Q_MAIL_FROM`; Write's folders from `apps/q/local-sites.json`
- [x] Live front end checked: no source maps, no server secrets or home paths in
      the client build, `.env` never committed
- [x] Home page line names the licence and holder (5 languages)
- [ ] Re-record that line: `npm run voice`
- [x] `scripts/split-repos.sh <folder>`: fresh-history Q (public) and
      darkolive-site (private, own copy of q-core/q-ui, SQL dumps left behind),
      with a secret scan — tested on a clone
- [ ] Run it; rename the old repo to an archive; create and push the two new ones
- [ ] GitHub: turn on private vulnerability reporting; add the DCO app
- [ ] Vercel: point each project at its new repo (Q: root `apps/q`; site: root `.`)
- [ ] Going to inqbeta.com: passkeys belong to their domain — ones made on
      inqbeta.dev will not sign in on inqbeta.com (see PUBLIC_Q_PASSKEY_DOMAIN)
