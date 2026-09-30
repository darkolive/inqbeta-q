---
implementation: none
decision: made
updated: 2026-09-30
---

# Going public — the steps, in order

Decided 30 September 2026: Q goes public as **github.com/darkolive/inqbeta-q**,
fresh history, under Dark Olive's GitHub account. (An `inqbeta` organisation
was the first choice, so Q could be handed to a federation by transferring
it; that name is taken on GitHub. A single repo can be transferred just as
well when the time comes.) The same address the home page has always linked to. The Dark Olive site becomes **darkolive/darkolive-site**, private.
The old combined repo stays private and is archived at the end.

Why not "inqbeta-browser": the repo holds more than the browser app — the
libraries, the node, the rules engine, and later native apps.

## On the Mac (Terminal)

```bash
cd ~/inqbeta-q
git status                                   # must be clean

# 1. The licence texts, word for word
node scripts/fetch-licences.mjs
git add LICENSE docs/LICENSE
git commit -s -m "Licence texts from SPDX"

# 2. Make the two new repos (changes nothing here, pushes nothing)
scripts/split-repos.sh ~/github              # → ~/github/q and ~/github/darkolive-site

# 3. Check Q builds on its own
cd ~/github/q
pnpm install
git add pnpm-lock.yaml && git commit -s -m "Lockfile for Q alone"
pnpm check && pnpm test && pnpm build

# 4. Check the site builds on its own
cd ~/github/darkolive-site
pnpm install
git add pnpm-lock.yaml && git commit -m "Lockfile"
pnpm build
```

If anything fails here, stop and bring the output back.

## On GitHub

5. **Move the old repo out of the way**: `darkolive/inqbeta-q` → Settings →
   rename to **inqbeta-q-archive**. (It stays private with its full history.
   Vercel follows the rename, so nothing goes down.)
6. **Create a new `darkolive/inqbeta-q`**: **Public**, *empty* (no README,
   licence or .gitignore).
7. **Create `darkolive/darkolive-site`**: **Private**, empty.
8. **Push**:
   ```bash
   cd ~/github/q
   git remote add origin git@github.com:darkolive/inqbeta-q.git
   git push -u origin main test

   cd ~/github/darkolive-site
   git remote add origin git@github.com:darkolive/darkolive-site.git
   git push -u origin main
   ```
9. **On darkolive/inqbeta-q → Settings**:
   - *Code security*: turn on **Private vulnerability reporting**, **Secret
     scanning** and **Push protection**.
   - *Branches*: protect `main` (require a pull request) — optional while it's
     only you.
   - Install the **DCO** app (github.com/apps/dco) on the repo.
   - *General*: description "Q — your passkey, your keys, your records.",
     website https://inqbeta.com.

## On Vercel

10. **The Q project** → Settings → Git → *Disconnect*, then *Connect* →
    the new `darkolive/inqbeta-q`.
    Root directory stays `apps/q`; production branch `main`; inqbeta.dev stays
    on branch `test`. Environment variables and domains stay as they are.
11. **The Dark Olive project** → connect `darkolive/darkolive-site`; root
    directory **blank** (the top folder); leave install and build commands on
    their defaults.
12. Deploy both; open inqbeta.com, inqbeta.dev and the Dark Olive preview.
    The home page's GitHub link should open the public repo.

## Afterwards

13. **Archive the old repo**: `darkolive/inqbeta-q-archive` → Settings →
    *Archive this repository*. It stays private, read-only, with the full history.
14. **Work from the new folders**: `~/github/q` for Q, `~/github/darkolive-site`
    for the site. Connect `~/github/q` to Claude sessions instead of
    `~/inqbeta-q`. For Write to reach the site locally, copy
    `apps/q/local-sites.example.json` to `apps/q/local-sites.json`.
15. **Optional**: re-record the changed open-source line — `npm run voice`
    in `apps/q` (uses ElevenLabs credits).
