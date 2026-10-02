---
status: proposed
implementation: started — local mode and set-up cards; your host first in Federations, with Website and Services; keys set in the Services cards (written to .env on this computer, a signed public record for each, Q’s own secrets made for you); renewing the invitation straight into the copy (build steps 1, 2, 4 and 5), 2 October 2026
updated: 2026-10-02
---

# ADR-Q-018 — Install on your own computer first

**Status: proposed, 2 October 2026.** It finishes ADR-Q-016 (Incubator is a
federation) and ADR-Q-017 (Incubator runs the commons) by answering three
questions they left open: **who is the founder of a copy, where the service
keys are typed, and how a copy goes live.**

## Context

Darren, 2 October:

> "Incubator itself … is a receipt created website on Vercel of a federation
> called Incubator … in joining the incubator … when you sign in first time …
> you are signing in agreeing to the membership rules … you can revoke your
> membership by leaving incubator but by doing so you won't be able to use the
> incubator ecosystem."

> "Who is the founder? … They get the very first user DID, who is the super
> admin and the only person who then gets to create incubator, the host, and
> then set permissions of inviting others … I, because I have super admin, can
> put in the Resend API, can put in the ElevenLabs API, can put in the Vercel
> AI API. And control all of that from front end."

> "Installing localhost version first … you're required to do that … nice card
> panels that take you through questions that set up your configuration. And
> then creates the template receipt pages, which is Incubator … a copy taken
> from the master source … the first federation will always show, which is the
> install. What's the name of your host? In our case, it's Incubator. Here is
> our logo … view website and there is the template pre-installed … when you're
> happy … a click that links it to Vercel … your localhost from then on is
> syncing with your live site … your local version is where you can create
> those secure keys that don't end up in Vercel until they're created."

Today a copy of Q is set up by hand-editing `.env` (`RESEND_API_KEY`,
`Q_SERVICE_SEED`, `GOOGLE_CLIENT_SECRET`, `CF_TURN_KEY_*`, and more) and pasting
the same values into Vercel. Nothing says who the founder is. Nothing records
who set a key, or when.

## Decision (proposed)

### 1. Every copy starts on your own computer

- Installing Q means **taking a copy of the master source and running it on
  your own computer first** (`localhost`). This step is required. There is no
  way to set up a host on a live website.
- **Why:** only you can reach your own computer, so nobody can get to a fresh
  copy before you do. The race that a "first person to sign in" rule would
  have on a public address never happens.
- **The first person to make a passkey on a fresh local copy is its founder.**
  The founding (ADR-Q-007 §1) is signed there: your DID and the new
  federation key, together.

### 2. Set-up is a few cards, one question each

A fresh copy opens on Skeleton Steps, one card at a time, each with one plain
question and a "why we ask":

1. **You.** Make your passkey. "You'll be the founder of this host."
2. **Your host.** "What's the name of your host?" (ours: *Incubator*) and
   "Add your logo." Colours come from the logo, then you can change them.
3. **Your agreement.** The short "we agree to be nice", and what joining asks
   for. It starts from the master's wording. The principles no vote can change
   are shown, but they can't be edited.
4. **Your services.** One card per service, each one optional (§4).
5. **Look at it.** The template site opens, already filled in with your name
   and logo, so you can see what you've made.
6. **Keep a way back in.** A recovery kit for your founder identity (§6),
   before anything goes live.

At the end, Q writes the **template receipt pages**: the site (ADR-Q-003),
signed by the new host and copied from the master's template. Every page is a
receipt, so the copy can always show where it came from.

### 3. Your host is always the first federation

- In **Federations**, the host is always at the top, marked **Your host**.
  For us that's Incubator. It can't be hidden.
- Opening it shows the federation portal with these sections:
  - **Website**: the template, a **View website** button, and **Go live**
    (§5).
  - **Services**: the cards from set-up, to change later (§4).
  - **Members**: who has joined, and invitations.
  - **Agreement**: its versions, each one a receipt.
- **The founder's power is a caretaker role with a term** (ADR-Q-007 §3),
  renewed by the members. It covers the site, the services and invitations.
  It never covers members' keys, vaults or receipts. "Super admin" is the
  everyday name for this role, not an exception to the rules every federation
  carries.
- The founder can give others roles by invitation, such as **Site editor**
  (ADR-Q-017 §1). A role is scoped, has an end date, and the founder can take
  it back.

### 4. Secret keys are only ever typed on your own computer

| Card | What it sets | Today's setting |
|---|---|---|
| Email | Resend key, the From address | `RESEND_API_KEY`, `Q_MAIL_FROM` |
| Voice | ElevenLabs key | (new) |
| AI | Vercel AI Gateway key | (new, ADR-Q-013) |
| Calls | TURN relay | `CF_TURN_KEY_ID`, `CF_TURN_KEY_TOKEN` |
| Backups | Google, Dropbox, Microsoft app keys | `GOOGLE_*`, `DROPBOX_*`, `MICROSOFT_*` |
| Bellboy | Its address and key | `PUBLIC_BELLBOY_*` |
| Q's own | Sending seed, sign-in secret | `Q_SERVICE_SEED`, `Q_OTP_SECRET` (made for you) |

- **The keys stay on your computer** in the local copy's settings file, which
  is never committed (`.env` is already ignored by git). They never go into a
  vault, a receipt, a backup or a web page.
- **Each key set makes a public service record**, signed by the founder:
  "Email: Resend · ending 4f2a · set 2 Oct by the founder". It holds no
  secret. The live site reads these records to know which services are on.
- Q's own secrets (`Q_SERVICE_SEED`, `Q_OTP_SECRET`) are **made for you**.
  Nobody should have to run a command to invent a random string.
- **On the live site, the Services cards are read-only.** They show what's on,
  the last four characters and when it was set, plus "Change this on your own
  computer". A stolen session or a site editor can never read a key or set one.

### 5. Going live is one button and a few clear steps

**Go live** takes you through it on cards:

1. **Put your copy online**: your own copy of the source on GitHub, so updates
   from the master can reach it.
2. **Connect Vercel**: make a Vercel token and paste it. It's kept on your
   computer only, like the other keys.
3. **Your address**: the domain, which is also the passkey domain
   (`PUBLIC_Q_PASSKEY_DOMAIN`).
4. **Send it**: Q creates the Vercel project, **sends your keys straight from
   your computer to Vercel** as sensitive settings (Vercel can't show them
   back), and publishes the signed site and founding at `/host.json`.

From then on:

- **Keys go one way**: from your computer to Vercel, only when you change one.
  Nothing on the live site can change them.
- **Site pages go both ways**: pages, layout and words edited on either side
  are signed receipts, so the two copies can always be merged safely and
  checked. Your computer pulls what site editors published live, and publishes
  what you made locally.
- The live site **never runs set-up**. It reads its founding from `/host.json`
  and checks the signatures.

### 6. The founder's identity carries to the live site

A passkey made on `localhost` only works on `localhost`, because browsers
lock passkeys to the domain they were made on. The founder's identity is not
the passkey, though: one identity can have several ways back in, one per
domain (`continuity.ts`, ADR-Q-005).

- Set-up's last card makes a **recovery kit** before anything goes live.
- After **Go live**, you open the live site with the kit, or by linking from
  your computer (a QR code on the Keys page), and add a passkey for the live
  domain. It's the same DID, so you're still the founder.
- This replaces the old note that localhost passkeys are "test identities". On
  a copy's own computer, the first passkey is the founder's.

### 7. Joining and leaving the host

These are unchanged from ADR-Q-016 §2, and written here so it's all in one
place:

- Signing in for the first time on a live host means **agreeing to its rules
  and becoming a member**. The passkey always comes first, then the consent
  steps one at a time, then the signed join.
- **Leaving is always allowed.** It ends the host's services for you: the
  bell, messages, calls, the storage unit and credits. It never takes
  anything you have. Someone who has left still sees a simple **"You've
  left"** view, where they can open their vault, download everything and sign
  out. Their own backups (Google Drive, Dropbox and others) stay theirs.

## Consequences

- **No founding code and no race.** Founding happens where only the founder
  can reach.
- **Vercel holds keys but never decides anything.** Who the founder is, and
  which services are on, are signed records anyone can check.
- **A key change needs the founder's computer.** That's deliberate. If the
  computer is lost, the recovery kit plus a fresh install of the copy brings
  the founder back.
- **Every host works the same way.** A club setting up its own host follows
  the same cards as Incubator did.

## Build order

1. **Local mode**: a fresh copy with no founding opens set-up. The first
   passkey founds the host.
2. **Set-up cards** (Steps): You, Your host (name and logo), Agreement,
   Services, Look at it, Recovery kit.
3. **Template site**: copy the master's template pages, signed by the new
   host.
4. **Your host at the top of Federations**, with the portal sections.
5. **Services cards**: keys written to the local settings file, a signed
   service record for each. The live site reads the records, Email first.
6. **Go live**: GitHub copy, Vercel token, project, sensitive settings,
   `/host.json`.
7. **Two-way site sync** between your computer and the live site.
8. **"You've left"**: the view for people who have left the host.

## Non-claims

This does **not**:

- set the master template's design or wording;
- fix the exact Vercel and GitHub steps (they're checked against their
  current documentation when **Go live** is built);
- decide how updates from the master reach copies beyond "a GitHub copy that
  can pull them";
- move any secret into a browser, a vault or a receipt.

## Related

ADR-Q-003 (sites), ADR-Q-005 (identity, ways back in), ADR-Q-007
(federations, founding, caretaker, roles), ADR-Q-013 (AI keys), ADR-Q-016
(Incubator is a federation; joining), ADR-Q-017 (the commons; site editors),
`.env.example`.
