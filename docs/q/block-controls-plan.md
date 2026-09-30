# Blocks as components with their own controls — plan

*24 September 2026. Darren: "each individually works and is customizable …
I'd refer to Elementor, not in how they do it, but in the type of components
and the CSS control they come with."*

## What exists

- **Closed style tokens** (`q-core/style.ts`, decided 20 September): padding,
  spacing, alignment, tone, edges and frame, each from a closed scale, mapped
  to classes in q-ui. It's already Elementor's style panel with the dangerous
  half removed. **Arbitrary CSS is behaviour** (`url()` beacons, overlays,
  colours that break dark mode), so a block carries tokens, never CSS.
- **Every block kind declares its settings as questions** (`blocks.ts`
  `SETTINGS`), and the settings panel is generated from them.

## What the block editor needs next

1. **One control panel per block** in Write, opened from the block: the
   block's own fields, then a **Style** tab from `styleQuestions()`. That
   covers spacing, alignment, width, tone and frame, with light and dark still
   following on their own.
2. **Controls that site themes add.** Dark Olive's renderer draws what its
   brand allows, for example a full-bleed picture or a tinted band. A theme
   declares extra closed tokens; a block can't invent one.
3. **Per-screen visibility:** show on phone, tablet or desktop (a closed
   token).
4. **Drag and drop** as a second way to call `move()` and `reparent()`, which
   already exist and are tested. The notes are in `docs/q/dnd-kit-and-the-vocabulary.md`.
5. **Upload a file or picture** as a block. It goes into the vault, is made
   into the site's sizes, and is added to the site's picture list.
6. **More components,** Elementor's set filtered through "nothing that runs":
   - button or link card (to a page on the site, or an external link);
   - gallery (a grid of any number of figures);
   - accordion or disclosure (native `<details>`, no script);
   - divider or spacer;
   - two or three columns of mixed blocks (a section with widths);
   - pull quote;
   - credits list;
   - map as a static picture plus a link.

   Each is a kind in `blocks.ts` with its settings as questions, drawn by the
   site's renderer.

Suggested order: 1, then 4, then 5, then 6 one kind at a time, as using the
editor shows which are missed.

## Built — 24 September 2026

- **Library in Write (+ menu):** Text, Heading, Picture, Video, Quote, Gallery (add as many pictures as you like), Columns (two or three), Accordion (a title, folded until opened), Button (words + where it goes, checked like any link), Line, Space, Note to self.
- **Style panel:** every block except notes has a *Style* button. Choices come only from the closed scales in `q-core/style.ts` — Box, Colour, Room inside, Line up, Corners, and Space between for groups — each with *As usual* to clear. Saved as `q:style/<key>`; drawn by `q-ui/look.ts` in Q and on the site alike. A dot on the button means the block has a look set.
- **Text view:** anything the words can't say (styled blocks, buttons, lines, galleries, accordions, columns) travels whole as `<!--q:block {…}-->`, so switching views loses nothing.
- **Same article, same address:** Write numbers blocks with `canonicalIds` before publishing, so the Blocks and Text views give identical addresses.
- **Dark Olive** draws all the new kinds and looks; the 18 existing pages still come out byte-identical.

Next: drag and drop, uploading a picture straight into a block, per-screen visibility, credits and map components.

## Full-screen writing — 24 September 2026

Darren: "if we're in a write mode, we should get full screen … where the dashboard was in the navigation … all of the elements and the components … as blocks that we can draw on to drag over … a toggle at the top that says layout or preview."

- Opening an article covers the whole dashboard (opaque, `role=dialog`). The top bar has ← Articles, the title and its address, **Layout | Preview** (⌘/Ctrl + . flips), *As text*, Save a version, Publish.
- **Layout:** the palette (`lib/write/Palette.svelte`, from `library.ts`) sits where the menu was — Words, Pictures and film, Layout, Actions, Spacing and notes. Drag a block onto the page, or click to add it after the block you were last in. Every block has a ⠿ handle to drag it anywhere, including into and out of groups; a group cannot be dropped inside itself. ↑ ↓ still work for keyboards and screen readers; on phones the palette opens from a *+ Blocks* button.
- **Preview:** the site's own templates, full width. The frame stays loaded behind Layout, so flipping is instant.
- Shared drag state: `lib/write/drag.svelte.ts`.

## Direction still to build (Darren, 24 September 2026)

- **Theme builder** — per site, on Skeleton's own theme format (colours, type, corners, spacing), overriding the styling; the Style panel's choices then come from the site's theme.
- **Projects all the way through** — a website is a project holding its pages, theme, releases, a Kanban board and the tools it needs; a document is a project under Docs, typed as a proposal, legal document, article and so on, each with its own tools.
