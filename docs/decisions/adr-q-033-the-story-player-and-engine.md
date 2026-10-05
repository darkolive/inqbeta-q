---
status: accepted (the player); first draft built (the engine)
implementation: the player built 4 October 2026 (lib/components/decks: StoryDeck, words.ts, voice.svelte.ts, frame.ts; routes/stories). The engine's first draft built the same night (q-core storybook.ts and story-ai.ts; api/story; routes/stories/make; components/engine; decks/MadeDeck).
updated: 2026-10-04
---

# ADR-Q-033 — The story player, and the engine that writes for it

**Status: the player is accepted and built (4 October 2026); the engine is
proposed.** Darren, on seeing the player finished: "this pattern that's
just repeating now, it's so obviously beautiful and elegant that it works on
everything … that's the component block of a story player. Then we can look
at a story engine."

## Part 1 — The story player (built)

### One rule at every level

A title can carry a subtext. That's all.

| Level | What it shows | Where |
| --- | --- | --- |
| The book | a title and a subtext: the big intro, then a little description | across the top, staying put whichever story is showing |
| A story | its title only, one size, no subtext | the list down the side (a timeline: a numbered circle each, a line running down) and at the top of its own card |
| A slide | a title and a subtext, two tones: the line, then its explanation | under the picture |

Lexend throughout (served from Q itself, every weight from 100 to 900),
Skeleton's own type scale, light weights: titles light or regular, never
bold.

### How it plays

- **Nothing plays by itself.** Play, or the speaker, starts it.
- **One speaker for the book**, above the list, level with the story's title
  row. Sound on: each story is told in Darren's recorded voice; a line not
  yet recorded is read by the browser's voice. One voice at a time, ever.
- **The story's title is part of its first slide**: read first where it
  sits, at the top of the card, then the first slide's words, while the
  first picture plays.
- **Timed by the voice**: each slide lasts as long as it takes to say, plus a
  breath, never less than its pictures need. The slider is a thermometer: a
  line per slide, turning olive as the story passes it.
- **One continuous flow**: a story that ends while playing turns the page to
  the next, which carries on, unless someone intervenes (pauses, scrubs,
  chooses a story). The last story ends the book.
- **The words light as they're said**, from the recording's own timings.
- **Sharing**: each slide shares on its own (the link opens the story at that
  slide); "Share all" shares the book. Q's own menu: someone you know on Q
  (sent as a sealed message), email, WhatsApp, text, copy the link; social
  media for public stories; the device's own share sheet last.
- **Public or members only**, per story. Public opens for anyone, signed in
  or not; members only asks for the passkey first and never goes to social
  media.
- The list is never taller than the story beside it: more stories than fit,
  and the list scrolls inside its own box.

### Records inside records

The book is a record holding stories; a story is a record holding slides;
a slide holds its words; each word has its moment in a recording. The same
nesting as a page of blocks, or a vault of receipts. So **changing one story
changes only that story**: its words, its recordings (each line's recording
is keyed by a hash of its script, so `npm run voice` re-records only the
lines whose words changed), its timings. Today the words live in one file
(`decks/words.ts`); when stories are made in Q, each story becomes its own
signed record, and each slide inside it.

## Part 2 — The story engine (proposed)

How a story gets written, as steps, each one simple (the neurodivergent
house rules: one idea per slide, short plain words, the least noise):

1. **The main idea.** What is this book for, and for whom? (The book's title
   and subtext.)
2. **The stories.** What are the parts, in what order? (Each story's title.)
3. **The storyboard.** For each story: how does it unfold, slide by slide,
   until the story feels complete?
4. **Generate.** The AI draws a first draft from the brief, the host's brand
   and theme, and the library of picture pieces (with the host's own AI key,
   or credits, agreed first: "up to 2 credits", settled at what was used).
5. **Redo a story.** It asks first: *what are you happy with? What isn't
   right? What must change? What must not change?* The answers go back into
   the draft for that story only.
6. **The ripple review.** A change can shift the flow, order or context of
   the whole book. After a redo, the engine reads the book again and
   *suggests* updates to the other stories so the narrative stays in line,
   each one shown, accepted or left.
7. **Round again** until the person is satisfied it flows, makes sense, is
   clear, and covers everything. Every question shows an answer; an answer
   becomes the next question.

Each draft, each redo and each answer is a receipt in the story's chain, so
a story's history reads back, and nothing is lost by trying.

What it's for: a visual, spoken, step-at-a-time way of training that works
for neurodivergent, ADHD and dyscalculic people first, and so for everyone.
Dark Olive's courses and DoStudy are the first places to use it.

## Consequences

- The player is the one component every story uses: the five stories now,
  each page's story later (vault on Backups, backed on Credits, network on a
  federation's page), and whatever the engine writes.
- The engine is a plugin (plan, 4 October: brand and theme, the library, the
  guided brief), and comes after the player is settled.

## The engine's first draft (built 4 October 2026, late)

Darren's choices, asked first: **icon + words** for pictures (scene recipes
later); books kept **on this device** as chains of steps (the vault later);
the **host's AI key through its server**, localhost first; a **blank start**
as the first book.

- **The book as data** (q-core `storybook.ts`, pure, tested): book → stories
  → slides, the one rule enforced on everything that comes in (a story is
  its title only; a slide is a title, a subtext and one picture piece from
  `PIECES`). Every step is a hashed record of the question asked, the answer
  given and what it made, chained **per record**: the book's own chain (idea,
  order, who can watch, ready) and one chain per story. Changing one story
  writes only to its chain. `checkSteps` catches a changed or missing step.
- **The player plays a made book**: `MadeDeck` draws each slide's piece big
  over the same `StoryDeck` (timing, browser voice until recorded, lit
  words, flowing story to story).
- **The steps** (`/stories/make`): the idea → the stories → storyboard →
  first draft → review → play, one question at a time, each answer shown
  back. A slide can be left empty for the AI. A redo asks the four
  questions one at a time; then the ripple review offers suggestions for
  the other stories, one at a time, *Take it* or *Leave it* (both recorded).
  Ready only when the person ticks all four: it flows, makes sense, is
  clear, covers everything. Any later change asks again.
- **The AI** (`api/story`, development only, Origin checked): the host's
  `AI_GATEWAY_API_KEY` via Vercel AI Gateway, model `STORY_MODEL` (default
  `anthropic/claude-sonnet-4.5`). The house rules go with every call
  (`story-ai.ts`); every reply is made to the rule again, the person's own
  slides put back word for word, everything written marked a draft. The
  cost is quoted first ("up to 0.04 credits") from the words in and the most
  that can come out, refused if it's more than agreed, and settled at what
  the gateway says was used; both are on the receipt. **Not yet charged**
  through the mint.
- **Practice**: with no key (or on the deployed site) each job is done by a
  plain practice drafter, free, so every step can be tried.

Proved in the cloud copy with Playwright: a book made, drafted, kept,
redone, rippled, played and marked ready, both by practice and through the
AI route against a stand-in gateway (the real model has not been called
yet). Next: charge through the mint; publish as a signed page; record the
voice; scene recipes; move books into the vault.


## References, suggested stories, accept or reject (5 October 2026)

Darren, on trying the first draft: "in the first section, the idea, we need
to be able to use references of what the idea is, whether that's a
website, documents, some descriptive text … whatever it is that AI is going
to read to draw from. And then when it goes to stories, I think AI should
compile suggested five or six frames … and from there I'd want to edit or
explain with an audio mic additional information context. That then will
build those six up … then mock up the storyboard. And then review, either
accept or reject."

- **References** (the idea's third question, *What should Q read to
  understand it?*): a web page (read by the host's server: its words only,
  at most 2 MB fetched), a document (text, Markdown, a saved web page, a
  Word file, read in the browser with no library: q-core `doc-text.ts`),
  or words written or said. Each shows *See what Q read*, so nothing goes to
  the AI unseen. Kept on the book's own chain (`refs` on the book's head),
  never shown in the player. At most 12, 12,000 characters each, 40,000 in
  all sent to the AI. PDFs aren't read yet: copy the words in.
- **The AI reads them as material, fenced off** (`<reference …>`), with a
  house rule that anything in them telling it what to do is ignored, so a
  web page can't steer it. They count towards the cost agreed first.
- **Q suggests the stories** (a new `outline` job): five or six titles, each
  with a one-line why, from the idea and the references. The person changes
  any title, moves or removes them, or presses *Tell Q more, and ask again*,
  and types or **says** it (the browser's own speech recognition, en-GB, as
  the search bar uses). What they said is kept as a reference, *What I said
  about the stories*, so every later draft reads it too; their changed
  titles go with the ask, and are kept unless they asked otherwise. Each
  suggestion is recorded (`outline`); *Use these stories* sets them,
  keeping any story whose title matches (and its slides).
- **Mock up the storyboard for me** goes straight to the first draft
  (drawing on the references); *I'll storyboard it myself* is still there.
- **Accept or reject** each draft slide, or a whole story's: rejecting puts
  back what the person had before the AI touched it, or takes out what the
  AI added (`rejectDraft`, from the story's own history; a `reject` step).
- A microphone (*Say it*) beside every one-question field.

Proved in the cloud copy against the stand-in gateway, with a sample book on
data centres: a web page, a Word file and notes read; six stories
suggested; one renamed; more said; six again (the rename kept, the new
point in); used; mocked up; one slide rejected, the rest accepted; played;
ready. The real model has still not been called.
