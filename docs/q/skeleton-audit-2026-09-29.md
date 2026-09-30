---
implementation: current
decision: none
updated: 2026-09-29
---

# Skeleton audit — 29 September 2026

Darren: "It would be good to have standard throughout." The rule (project
instructions): all styling from Skeleton's core API — its tokens, presets,
type and utilities — with layout as Skeleton's layout guide does it.

Scanned: every `.svelte` file in `apps/q/src` and `packages/q-ui/src`.

## Fixed

| What | Was | Now |
|---|---|---|
| Colour pairs that do not exist (so rendered nothing) | `bg-surface-100-200` ×13, `-100-100`, `-50-100`, `border-surface-300-600`, `text-primary-700-400`, `text-surface-500-400`, `text-surface-900-500` | real pairs, or `preset-tonal` / `card` |
| Plain white and black | `text-white`, `bg-white`, `bg-black`, `/60`, `/20` | `preset-filled-*`, `bg-surface-50`, `bg-surface-950`, `text-surface-50` |
| Tailwind radii | `rounded`, `-md`, `-lg`, `-xl`, `-2xl` (26) | `rounded-base` (controls), `rounded-container` (cards, panels) |
| Hand-set sizes | `text-[10px]` ×2 | `text-xs`; the unread count is a `badge-icon` |
| Search chips and buttons | hand-built pills | `chip preset-tonal`, `btn-icon` |
| Receipt preloader | a `<style>` block with Tailwind's grey, red and blue hex | tokens, Skeleton's `progress`, Tailwind `animate-spin` |
| Search drawer | a `<style>` keyframe | Svelte's `fly` transition |

## Left, on purpose

- **`q-ui` design language** (`packages/q-ui/src/styles/roles.css`,
  `blocks.css`, ~430 lines): Q's type roles and named blocks, decided
  16 September, built on Skeleton's type tokens and paired colours. A few
  sizes are raw `rem`/`px` values; converting them to tokens is the next
  step if wanted.
- **`BlockView.svelte`** — draws the published Dark Olive pages too; its
  radii are left so the live site does not change under it.
- **Layout values** Skeleton's own layout guide uses: `grid-cols-[auto_1fr]`
  and similar, `max-h-[60vh]`.
- **Three deliberate values**: the sign-in tile's 40% corner, the Q mark's
  `1em`, the front door's `100dvh` less one row.
- **Needs CSS by nature**: the editor's empty-line placeholder (`Words`),
  a printable recovery card (`WaysBackIn`), Font Awesome's animation speed,
  widths set from live numbers (progress, levels, indentation), a phone's
  safe-area padding.

## Still to look at

- `SearchDrawer`'s `top-[73px] md:top-[81px]`: the header's height typed
  by hand; breaks if the header changes. Better placed under the header.
- `z-[60]`, `z-[1]`, `w-[4.25rem]` (folded side menu width).
- The Dark Olive app (`apps/darkolive`) was not part of this pass.
