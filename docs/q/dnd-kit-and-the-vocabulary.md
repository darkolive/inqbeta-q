# On adopting a drag-and-drop library

**2026-09-20 — a decision, and what it is waiting on.**

> [dndkit.com/svelte/quickstart](https://dndkit.com/svelte/quickstart/) — worth
> looking at now, or part of templating?

**Right library, wrong moment, and the blocker is ours rather than theirs.**

---

## What it is

`@dnd-kit/svelte` is a Svelte binding over the framework-agnostic dnd-kit core.
`createDraggable`, `createDroppable`, `createSortable`, a `DragDropProvider`,
and the vanilla plugins, modifiers and sensors underneath.

Checked today:

| | |
|---|---|
| version | **0.5.0** — pre-1.0, with dated beta builds |
| licence | MIT |
| needs | Svelte ≥ 5.29 · we run **5.57**, so no obstacle |
| accessibility | dnd-kit's React line has a real keyboard-sensor and screen-reader-announcement story. **Whether the Svelte package carries it is not stated** and would need checking before adoption |

The quickstart reads as production-ready; the version number says otherwise.
Not a reason to avoid it — a reason not to build a design system on it this
month.

## Why not now

**A receipt is not dragged. A receipt is rendered.** Dragging belongs in the
*builder* where somebody composes a template. So this is a templating
question, as suspected — and the templating question has a hole in it.

**Today a builder would be dragging strings.** `ui-receipts.ts` declares block
names — `header`, `federation-list`, `recent-activity`, `custom` — with
`props?: Record<string, any>`, and `renderPage()` returns `JSON.stringify`.
Nothing renders anything. `/my-pages` prints the block's name as text.

**Adopting it first would invert the order.** Whatever shape the draggable
items needed would quietly become the shape of a template — the editor
defining the design system rather than the other way round. And a builder
makes the dangerous thing *easier to do by accident*: drag-and-drop produces a
tree, and the moment that tree can hold arbitrary nodes, `custom` is where
somebody puts a script.

## So the vocabulary went in first

`q-core/src/blocks.ts`, twelve tests. Two decisions made rather than
discovered later.

**The vocabulary is closed.** Ten kinds, each with a declared shape:
`heading`, `text`, `answers`, `card`, `places`, `receipts`, `contacts`,
`federations`, `image`, `space`. `checkBlock` refuses anything else, and the
message says *why* a silent failure is the worst kind — a page naming a block
nothing draws shows less than the author meant, on somebody else's screen,
saying nothing about it.

**`custom` is gone.** It was an escape hatch nobody had walked through, and
the thing that eventually wants to go in it is a script.

**A template carries no behaviour.** This is the one that matters, and it is
the rule that makes a template library safe to want. A template is a receipt,
and receipts **travel** — a federation's template lands in a person's folder
and renders against their own answers. A template carrying triggers, handlers
or a URL that fetches is third-party code running against a person's data,
which is ADR-Q-002's open question arriving dressed as a design system.
Twenty-three field names refused, one test each — including `style`, `class`
and `html`, which look harmless and are how arbitrary rendering gets in.

**A picture is a content address, never a URL.** A remote URL in a template is
a beacon: it tells whoever hosts it the moment a person opened the page, from
which address, how often. A template must not be able to watch somebody read
it.

**And a block names predicates, never values** — the same rule as `cards.ts`.
A block says *show `q:person/called`*; it never carries what the answer was.
So a template can be handed to anyone without carrying anything about anyone.

**`move(blocks, id, to)` is in q-core**, not in a component. Reordering is the
one thing a builder does, and a page whose order depends on which library is
installed is a page that changes when the library does. Whatever does the
dragging — a mouse, a keyboard, dnd-kit — ends up calling this. Out-of-range
clamps; nothing is ever lost; there are tests for both.

## Two freedoms, and only one of them is a risk

> "100% control, freedom to customize and design and make whatever their
> imagination lets them… everything has a setting so everything can be
> customized from a UI point."

That is the product, and the closed vocabulary does not stand in the way of
any of it — because **arrangement** and **execution** are different freedoms:

| | |
|---|---|
| **arrangement** | what blocks, in what order, how wide, with what settings, repeated as often as you like. **Unlimited.** This is what people mean by designing their own dashboard. |
| **execution** | what a block *does* when somebody opens the page. **Zero, for everyone, always** — because a template travels and lands in a stranger's folder. |

A closed set is not a small set. The web has about a hundred elements and
nobody says HTML limits imagination. What was actually missing was not more
kinds — it was **settings**.

### Every block declares its settings, as questions

`SETTINGS` in `blocks.ts` gives each of the ten kinds its own `QuestionSet`,
and every one of them inherits *how wide?* and *a heading above it?*. So the
settings panel is **generated by the same renderer that draws every other
question set in Q**, rather than hand-written per block.

Which means: every block ever made is customisable the moment it exists,
rather than when somebody remembers to build its form. And a customised page
is **answers** — so it is a receipt, signed and content-addressed like
everything else.

### Width is four values, not a number

`full`, `half`, `third`, `quarter`. A free width is a layout engine, a layout
engine is a rendering engine, and a rendering engine is the thing a template
must not carry. Four is enough for any dashboard anyone has wanted, and it
reflows on a phone without anybody thinking about it.

### A plugin is data describing what to show

`checkPlugin` takes a declared block kind: an id, a name, one line saying what
it does, **which of the ten renderers draws it**, who declared it, and its own
settings as a question set. Q's renderers do the drawing.

That is not a loophole in the closed vocabulary. What stays shut is what a
block can *do* — a plugin picks one of the ten and cannot introduce an
eleventh. What opens is naming, settings and arrangement, which is where the
imagination actually lives. A federation can ship *"Evidence for this course"*
without shipping a line of anything that runs.

Behaviour is refused in a plugin exactly as in a block — and also **inside its
settings**, which is the obvious place to try smuggling a link. Tested.

A plugin must also say **who made it**, so a person can decline an author
rather than only a feature.

## When to adopt it

When the ten kinds have renderers in `q-ui` and `/my-pages` builds a real
template. At that point dnd-kit is a couple of days' work, and `createSortable`
over a list of block ids is exactly the shape of the problem.

**And consider not needing it.** If the only interaction is reordering ten
blocks, move-up/move-down buttons are keyboard-operable by default and cost
nothing. dnd-kit earns its place with dragging between containers, nested
structures, or a canvas — and this project has committed to strict
accessibility, where keyboard-operable drag-and-drop is the hard part rather
than an extra.

## Next

1. Renderers in `q-ui` for the ten kinds. Until they exist, "the UI is a
   receipt" is still a list of names.
2. `/my-pages` onto `checkTemplate`, with `ui-receipts.ts`'s open `props`
   retired.
3. Then, and only then, the question of what does the dragging.

## Sources

- [dnd-kit for Svelte — quickstart](https://dndkit.com/svelte/quickstart/)
- [dnd-kit accessibility guide](https://docs.dndkit.com/guides/accessibility)
- [`@dnd-kit/svelte` on npm](https://registry.npmjs.org/@dnd-kit/svelte)
- Internal: `blocks.ts`, `ui-receipts.ts`, `cards.ts`, `what-is-real.md`
