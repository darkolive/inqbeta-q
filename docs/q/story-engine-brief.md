---
updated: 2026-10-04
about: The brief for building the story engine — focus, outcome, expectations, what already exists, the questions to settle first, and a build order. Read first in the thread that builds it.
---

# The story engine — brief for a new thread

## Focus

Build the **story engine**: the guided way a person makes a story book for
the story player, from a first idea to a book that flows, with AI drafting
and the person steering. The player is done (ADR-Q-033 Part 1); this is
Part 2.

Darren, 4 October: "Working on what is the main title idea, what are the
chapters, building up the storyboard … then press generate and see what the
AI builds in its first draft. And then each chapter you can redo. And when
you redo, the first thing it's asking is what is it that you're not happy
with or what is it that you are happy with? What must change? What must not
change? … a review suggests update that deck to be in line with the new
updated version narrative across … every question shows an answer, answer
becomes another question until the user becomes satisfied that the whole
deck story flows, makes sense, is clear, has covered everything … a really,
really amazing neurodivergent, ADHD, dyscalculia, visual way of training."

## Outcome

A person (a host's admin first; course makers in Dark Olive and DoStudy
next) can, inside Q:

1. Say the **main idea**: the book's title and its subtext.
2. Lay out the **stories** in order (titles only).
3. **Storyboard** each story, slide by slide (a title and a subtext each),
   until it feels complete.
4. **Generate**: the AI drafts what's missing, for a cost agreed first.
5. **Redo one story**, answering: what are you happy with, what isn't
   right, what must change, what must not change.
6. Get a **ripple review**: after a redo, suggested updates to the other
   stories so the whole book still flows; each one accepted or left.
7. **Round again** until satisfied, then **publish**: the book plays in the
   story player, public or members-only, with recordings made for it.

Every step is a **receipt** (each draft, each answer, each accepted
suggestion), chained per story, so the history reads back and nothing is
lost by trying.

## Expectations (how we'll know it's right)

- **Neurodivergent first**: one question at a time, big clear steps, plain
  short words, no walls of text, nothing moving that doesn't explain.
- **The player's one rule holds**: book = title + subtext; story = title
  only; slide = title + subtext. The engine never makes anything else.
- **Changing one story changes only that story** (and its recordings),
  unless the person accepts a ripple suggestion.
- **Nothing generated is final until the person says so.** Generated text
  is a draft, shown as a draft.
- **Cost is agreed before any AI call** ("up to 2 credits"), settled at what
  was used (plan, "What a story costs"), or runs on the host's own key
  (ADR-Q-013).
- **Proved in the cloud test rig** before Darren is asked to try it, the
  way messages and Join were: a book made, redone, rippled, published and
  played, end to end.
- Styling: Skeleton only, Lexend at light weights, olive and orange,
  thick-bordered fields with no placeholders.

## What already exists

- **The player**: `apps/q/src/lib/components/decks/`
  - `StoryDeck.svelte`: plays one story (timing, voice, lit words, share).
  - `words.ts`: the words of every story (`BOOK`, `DECK_WORDS`), plus
    `open` (public or members-only).
  - `frame.ts`: frames, scene lengths from the voice (`sceneTimes`).
  - `voice.svelte.ts`: the book's one sound switch.
  - `index.ts`: the list of decks (`DECKS`).
  - One `<Name>Deck.svelte` per story: **its pictures are hand-written SVG**
    built from the shared pieces in `lib/components/story/` (Key, Tick,
    Folder, Cloud, Phone, Person, Card, Padlock, Envelope, Coin, …).
- **The book page**: `apps/q/src/routes/stories/+page.svelte` (the list, the
  flow from story to story); `/stories/<id>` plays one story on its own.
- **The voice**: `apps/q/scripts/build-voice.mjs` records every line as
  `story.<deck>.<n>` (0 = the story's title) with ElevenLabs, timed word by
  word, keyed by a hash of the words, so only changed lines are re-recorded.
  Darren runs it on his Mac (`npm run voice -- --only en --yes`); the key
  never leaves `apps/q/.env`.
- **AI**: a host can set `AI_GATEWAY_API_KEY` (Vercel AI Gateway) in
  Services; **Q makes no AI calls yet**. ADR-Q-013 (your own key, or
  credits) is proposed, not built.
- **Receipts and agreements**: signed, hash-chained steps (q-core
  `agreements.ts` is a good model of a chain of steps).
- Decisions to read: ADR-Q-033 (player and engine), ADR-Q-013 (AI keys and
  credits), the plan's "A story engine" entries (`docs/plan.md`: as a
  plugin; what a story costs).

## Questions to settle first (with Darren)

1. **Pictures.** Today each story's pictures are code. A made story needs
   pictures without code: a **scene recipe** (which pieces, where, what
   moves, in JSON) drawn by one general deck, with the hand-drawn decks kept
   as they are? Or text-and-icon slides first, pictures later?
2. **Where a book lives.** As receipts in the maker's vault, published as a
   signed site page (like the Write mode's pages), or in the host's own
   files? Who can edit: the maker, invited editors, the host's admins?
3. **Which AI, run where.** The host's key through its server (localhost
   first, as Services does), or the person's own key from the browser
   (ADR-Q-013)? Which model?
4. **Recording a made book.** Recordings are made on Darren's Mac today.
   For anyone's book: the host's ElevenLabs key on its server, paid in
   credits? Browser voice until recorded?
5. **First user and first book.** A Dark Olive course? A DoStudy unit? The
   five Q stories rebuilt in the engine as the test?

## A build order (to agree in the new thread)

1. **The book as data**: book → stories → slides as signed records (q-core,
   pure, tested), with the one rule enforced; the five current stories
   expressible in it.
2. **The player reads the data**: StoryDeck plays a book record (text and
   icon slides, or recipes), so a made book plays exactly like the five.
3. **The steps without AI**: the guided screens for idea → stories →
   storyboard, saving receipts as you go; edit one story, only it changes.
4. **Generate and redo**: the AI drafts, with the four redo questions;
   cost agreed first.
5. **The ripple review**: suggestions for the other stories, accepted one by
   one.
6. **Publish and record**: public or members-only; voice lines recorded.
7. **As a plugin** (plan): brand and theme, the library, the guided brief.

## Before starting

- Read `docs/q/handover-2026-10-04.md` (the freeze frame at the end, and
  "For the next Claude" for the test rig and how files reach the Mac).
- Last commit at the time of writing: `f21309b`.

## Status — first draft built (4 October 2026, late)

Darren settled questions 1, 3 and 5 (and 2 for now): **icon + words**; books
**on this device** as chains of steps; the **host's key via its server**,
localhost first; a **blank start** as the first book. Build order steps 1–5
are done as a first draft; step 6 is partly done (members-only or public,
and ready); recording and the plugin are not started. See ADR-Q-033,
"The engine's first draft", for what was built and where.

To try it: `pnpm dev`, open **/stories/make**. With `AI_GATEWAY_API_KEY`
set (Services → AI), drafts come from the AI after the cost is agreed;
without it, every step runs as a free practice. The real model has not been
called yet: the first real call is Darren's.

Still open: charging through the mint (the receipt records agreed and used,
nothing is taken); publishing as a signed page; recording the voice for a
made book; scene recipes; moving books into the vault (and who may edit).
