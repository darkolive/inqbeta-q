---
updated: 2026-10-06
about: A focused brief for a separate thread that perfects the story engine's storyboard for writing courses — a unit mapped as what you'll learn, told the way an ADHD artist would deliver it. Hand this file, and only this, to that thread.
---

# The storyboard, for writing courses — a branch brief

## Focus

Perfect the **storyboard** in the story engine (`/stories/make`) so that it
is how a **course unit is written**: mapping out what someone will learn
when they study this unit, and explaining it the way an ADHD artist who
delivers the course would.

Darren, 6 October 2026: "thinking about the storyboard and just perfecting
that, because … from a learning management system and writing courses …
this is all part of how the course is written, is mapping out what you're
going to learn when you're studying this unit. And being able to explain
that from an ADHD artist who's delivering a course."

Work on this alone. The main thread carries on with roles, registration and
testing; keep to the files listed under "Where to work".

## Where it stands (read these first)

- **ADR-Q-033**, the story player and engine: Part 1 (the player, built);
  Part 2 (the engine); the first draft (4 October); references, suggested
  stories, accept or reject (5 October); the questions perfect the prompt,
  the look not the pictures (5 October, later).
- **story-engine-brief.md**: the original brief, its questions, the build
  order and its status.
- The engine today, in order: **the idea** (title, subtext, references) ·
  **Q's questions** (the AI asks the one question that most improves the
  book, up to six; tap, type, say, or "You decide") · **the stories** (Q
  suggests five or six, you change them) · **the look** (presets drawn by
  sight, or your own words) · **storyboard** (Q's mock-up, scene by scene,
  or your own slides) · **review** (accept or reject each draft; redo with
  the four questions; ripple suggestions, take or leave) · **play** (ready
  when it flows, makes sense, is clear, covers everything).
- **The one rule**: book = title + subtext; story = title only; slide =
  title + subtext (+ a scene). Every step is a hashed record, chained per
  story.
- **The real AI model has not been called yet.** Everything was proved
  against a stand-in gateway and the free practice drafter.
- DoStudy already has **units** with a title, an aim and a level
  (`apps/q/src/lib/features/dostudy.ts`), shown on **/f/dostudy** as course
  evidence.

## The idea to work out

A book is a **course unit**. Its stories are **what you'll learn**, in the
order you'll learn it. Each storyboard is how that one thing is explained:
picture by picture, a line and its explanation, in the voice of the person
who teaches it.

Things to settle with Darren, one at a time:

1. **The unit's shape.** Is a book one unit (title = the unit, subtext = its
   aim), and each story one learning outcome? Does a unit need a level, a
   time to study, what you need first, how it's assessed?
2. **Learning outcomes as questions.** Should Q's questions for a course ask
   what a course writer would: who is it for, what can they do already, what
   will they be able to do afterwards, how will they show it, what usually
   trips people up?
3. **The teacher's voice.** "An ADHD artist delivering a course": is that
   Darren's own voice (recorded), a described persona the AI writes in, or
   both? How does the maker describe their own way of teaching?
4. **ADHD-first explaining.** One idea per slide is already the rule. What
   else: a "why this matters" first, a picture that carries the idea, short
   bursts with a pause, a recap story at the end, nothing that needs
   remembering across slides?
5. **From story to evidence.** In DoStudy, a learner keeps evidence for a
   unit. Should each story (outcome) end with "show it": a prompt for the
   evidence the learner keeps, receipted in their vault?
6. **The first real unit.** Which Dark Olive or DoStudy unit is written first,
   start to finish, with the real model?

## Expectations

- Neurodivergent first: one question at a time, plain short words, nothing
  moving that doesn't explain, no placeholders in fields.
- The one rule holds; changing one story changes only that story unless a
  ripple suggestion is taken.
- Nothing generated is final until the person says so; cost agreed before any
  AI call.
- Skeleton only; Lexend at light weights; one meaning per colour.
- Proved in the cloud test rig first (Playwright), then Darren tries it.
- **The Testing page** has checklists for these pages already: `open-stories`,
  `open-story`, `open-stories-make` (`apps/q/src/lib/checklists.json`). Update
  them when the steps change, so the next tester checks what's really there.

## Where to work

- q-core: `storybook.ts` (the book as data), `story-ai.ts` (the prompt, the
  jobs, the cost), their tests.
- App: `routes/stories/make`, `lib/components/engine/*`, `routes/api/story`,
  `lib/components/decks/MadeDeck.svelte`; DoStudy's `lib/features/dostudy.ts`
  and `routes/f/dostudy` if units join up.
- A new ADR addendum on ADR-Q-033 for what's decided ("The storyboard for
  courses").
- Use a branch, so this doesn't collide with the main thread:
  `git switch -c story/courses`. Merge when Darren is happy.

## House rules for the thread

- Darren commits and pushes himself: give a commit command each time, ending
  with the Claude attribution lines.
- Secrets never in chat or git. New localStorage keys declared in
  `packages/q-core/src/storage.ts`.
- Check a file name is free before creating it. In a Claude session, run git
  with `GIT_OPTIONAL_LOCKS=0`.
- The Mac repo is the source of truth; a cloud copy is for builds, the rig and
  screenshots.
