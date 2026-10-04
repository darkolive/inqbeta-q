---
status: accepted (the player); proposed (the engine)
implementation: the player built 4 October 2026 (lib/components/decks: StoryDeck, words.ts, voice.svelte.ts, frame.ts; routes/stories). The engine not started.
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
