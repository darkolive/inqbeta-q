---
implementation: none
decision: made
updated: 2026-09-30
---

# Going public — the steps, in order

Decided 30 September 2026: Q goes public as **github.com/inqbeta/q**, under a
GitHub organisation called **inqbeta** owned by Dark Olive CIC, so it can one
day be handed to a Q federation by transferring the organisation. Fresh
history. The Dark Olive site becomes **darkolive/darkolive-site**, private.
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

5. **Create the organisation**: github.com → your avatar → *Your organizations*
   → *New organization* → Free → name **inqbeta**, owned by a business: Dark
   Olive CIC. (If the name is taken, stop — the link in the app needs changing.)
6. **Create `inqbeta/q`**: New repository, **Public**, *empty* (no README,
   licence or .gitignore).
7. **Create `darkolive/darkolive-site`**: **Private**, empty.
8. **Push**:
   ```bash
   cd ~/github/q
   git remote add origin git@github.com:inqbeta/q.git
   git push -u origin main test

   cd ~/github/darkolive-site
   git remote add origin git@github.com:darkolive/darkolive-site.git
   git push -u origin main
   ```
9. **On inqbeta/q → Settings**:
   - *Code security*: turn on **Private vulnerability reporting**, **Secret
     scanning** and **Push protection**.
   - *Branches*: protect `main` (require a pull request) — optional while it's
     only you.
   - Install the **DCO** app (github.com/apps/dco) on the repo.
   - *General*: description "Q — your passkey, your keys, your records.",
     website https://inqbeta.com.

## On Vercel

10. **The Q project** → Settings → Git → *Disconnect*, then *Connect* →
    `inqbeta/q` (let the Vercel GitHub app into the inqbeta organisation).
    Root directory stays `apps/q`; production branch `main`; inqbeta.dev stays
    on branch `test`. Environment variables and domains stay as they are.
11. **The Dark Olive project** → connect `darkolive/darkolive-site`; root
    directory **blank** (the top folder); leave install and build commands on
    their defaults.
12. Deploy both; open inqbeta.com, inqbeta.dev and the Dark Olive preview.
    The home page's GitHub link should open the public repo.

## Afterwards

13. **Archive the old repo**: `darkolive/inqbeta-q` → Settings → *Archive
    this repository*. It stays private, read-only, with the full history.
14. **Work from the new folders**: `~/github/q` for Q, `~/github/darkolive-site`
    for the site. Connect `~/github/q` to Claude sessions instead of
    `~/inqbeta-q`. For Write to reach the site locally, copy
    `apps/q/local-sites.example.json` to `apps/q/local-sites.json`.
15. **Optional**: re-record the changed open-source line — `npm run voice`
    in `apps/q` (uses ElevenLabs credits).
