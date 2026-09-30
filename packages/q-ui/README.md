# @inqbeta/q-ui

The shared interface layer over Skeleton: **the language of headings**, the named
blocks, icons, and the handful of components every Q screen is made from.

## The language of headings

Darren, 2026-09-16: *"there needs a language of headings. This is going to help
both audio descriptors as well as CSS styling… all titles are heading five token."*

A **role** says what a piece of text **is**. The role decides how it looks — one
Skeleton token per role, set in `src/styles/roles.css` and nowhere else — and what a
speech layer says before it (`src/roles.ts`, `spokenText()`).

| Role | Class | Looks like | Spoken as | Use it for |
|---|---|---|---|---|
| `page-title` | `role-page-title` | Skeleton `h3` | "Page: …" | the one heading a page has |
| `section-title` | `role-section-title` | `h4` | "Section: …" | a part of a page |
| `title` | `role-title` | **`h5`** | "Title: …" | the name of a thing — a course, a file, a device |
| `subtitle` | `role-subtitle` | `h6` | — | a thing's second line of name |
| `description` | `role-description` | body | "Description: …" | what a thing is about |
| `lead` | `role-lead` | body, large | — | a page's opening sentence |
| `meta` | `role-meta` | small, muted | — | who, when, how many |
| `label` | `role-label` | small, medium | — | the name of a field |
| `value` | `role-value` | body, strong | — | the content of a field |
| `count` | `role-count` | 3xl number | — | the number a tile is about |
| `status` | `role-status` | xs capitals | "Status: …" | a state, in words |
| `token` | `role-token` | mono, xs | "A code, shown on screen." | DIDs, hashes, keys |

**Look and level are separate.** The role sets the look. The HTML heading level
(`h1`–`h6`) follows the page outline: `<Page>` is level 1, each `<Section>` makes
what is inside it one deeper, and `<Heading>` picks its level from where it sits.
So a `title` can be an `h2` on one page and an `h4` inside a card, while looking
the same everywhere — and a screen reader's list of headings is always a true outline.

Every role is also written to `data-role`, so speech, tests and styling can all
find "every title" the same way.

## Components

`Page`, `Section`, `Heading`, `Text`, `Tile`, `Item`, `Status`, `Empty`, `Field`,
`Icon` — all Skeleton classes and paired tokens, so any Skeleton theme and light or
dark mode just work.

## Using it in a Skeleton app

```css
@import 'tailwindcss';
@import '@skeletonlabs/skeleton';
@import '@skeletonlabs/skeleton-svelte';
@import '@skeletonlabs/skeleton/themes/legacy';   /* or your theme */
@import '@inqbeta/q-ui/styles.css';
@source '../../../packages/q-ui/src';             /* so Tailwind sees q-ui's classes */
```

```svelte
<script>
  import { Page, Section, Item, Status } from '@inqbeta/q-ui';
</script>

<Page title="Courses" lead="Everything DoStudy captured.">
  <Section title="Courses">
    <Item title="Stewarding a Village Carnival" description="Plan and run…" meta="Level 2 · by Darren">
      {#snippet status()}<Status tone="needs-you">Sent for review</Status>{/snippet}
    </Item>
  </Section>
</Page>
```

Icons are Lucide's, copied verbatim (`src/icons.ts`); keys name what the icon means
in Q. Regenerate rather than redraw.
