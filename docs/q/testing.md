---
updated: 2026-10-06
about: Testing Q page by page — the checklists, how testers take and report on them, and the AI runner. Read before handing out testing jobs or changing a checklist.
---

# Testing Q, page by page

Darren, 6 October 2026: every dashboard, menu item and tab has a checklist
that an AI can run where it can, and a person runs through and confirms; the
translations and proofreading are checks too; each checklist is a job someone
takes, tests, and reports back on.

## What there is

- **73 checklists** (`apps/q/src/lib/checklists.json`): one per page, or per
  tab of a page, plus one for the frame around every page. 688 checks written
  from what each page actually does.
- **Every page also gets** 15 checks (loads cleanly, heading and tab title,
  signed out, phone width, wide screen, dark mode, looks like Q, keyboard,
  tap size, alt text, no placeholders, contrast, screen reader, proofread,
  plain words) and **one per language** (no missing words in any; then Welsh,
  French, German, Spanish and Chinese each read by a speaker). 2,221 checks in
  all. Defined in `packages/q-core/src/checks.ts`.
- **The Testing page** (`/testing`, in the menu): every checklist with how it
  stands — Not started, Being tested, Partly done, Passed, Problems found,
  List changed since tested. Filter by free to take, problems, AI checks.
- **One checklist** (`/testing/<id>`): what you need first, Open the page,
  **I'll test this** (a signed claim for two days, so others see you have it),
  then each check: Works / Problem / Didn't check, with what went wrong for a
  problem. **Sign and send my report.** Problems from the latest reports, by
  people and by the AI, show at the top.

## Who can test

Anyone the host's door lets in: while inqbeta.com is in test, that's you and
whoever you give a **tester pass** (Federations → your host → Settings, in role,
on localhost → Tester passes). The node keeps claims and reports only from
them; everyone can read them. Once the host is live, anyone signed in.

## The AI runner

`apps/q/scripts/run-checks.mts` opens every page that needs no value, signed
out, at 1280 and 390 pixels wide, and checks: loads without console errors,
a heading and tab title, works signed out, no sideways scroll on a phone,
buttons at least 44 pixels tall, alt text, no placeholders, and (for every
page) that every language has every word. What it can't confirm it reports as
"not checked", with why; it never passes what it didn't look at.

```sh
cd ~/github/q/apps/q
npm i -D playwright && npx playwright install chromium   # once
node --experimental-strip-types --no-warnings --import ../../packages/q-core/test/register.mjs \
  scripts/run-checks.mts --site https://inqbeta.com            # look only
Q_CHECKS_SEED=… node --experimental-strip-types --no-warnings --import ../../packages/q-core/test/register.mjs \
  scripts/run-checks.mts --site https://inqbeta.com --send     # sign and send
```

`Q_CHECKS_SEED` is the runner's own key (32 bytes, base64url; keep it like
any secret). It prints its DID when sending: give that DID a tester pass.

First run, on a local copy: 73 lists, 8 problems found — the legal pages' and
footer's links under 44 pixels, empty tab titles on Setup, Attest and Google
channels, the story Play button, and the Files page's sign-in button.

## Changing a checklist

Edit `checklists.json`. The list's version changes with any check, so reports
on the old version show **List changed since tested** instead of passing.
Each page's "AI can check" items still need their own written test before the
runner can tick them; until then a person checks them.
