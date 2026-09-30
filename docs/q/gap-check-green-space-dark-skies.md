# Gap check: Green Space Dark Skies as receipted blocks

*23 September 2026. The target is `apps/darkolive` → `/our-work/greenspacedarkskies`.
The block-built page must be indistinguishable from it.*

## What the live page is made of, and which block would carry it

| On the page | Today (darkolive) | Block needed | Have it? |
|---|---|---|---|
| Site header, logo, Menu | `SiteHeader.svelte` (menu toggles) | furniture: `header` | kind exists; needs Dark Olive's own header, not Q's |
| "Ten years" banner | `TenYears.svelte` | furniture: `banner` | **no** |
| Cover photo + orange title card (title, subtitle) | frontmatter `cover`, `title`, `subtitle`; art-directed 2:1 / 3:2 crops | `cover` | **no** (`hero` is a faint background, not this) |
| Credits band: Role · Location · With · Date | frontmatter | `credits` (labelled facts) | **no** |
| Partner logo on a light plate + standfirst | `logo`, `logoAlt`, `standfirst` | `standfirst` | **no** |
| Prose with **bold** and links (external open in a new tab) | markdown | `text` with inline marks | **partly**: `text` is plain words only |
| Section headings (h2) | `## …` | `heading` | yes |
| Single photo with alt, optional caption/credit | `![alt](src "caption")` → figure + srcset, lazy | `figure` | **partly**: `image` has no caption and one size |
| Two photos side by side | consecutive image lines → `figure-pair` | `section` of two half-width figures | **partly**: grid exists, the pair styling doesn't |
| Three photos in a row | `figure-trio` | `section` of thirds | **partly** |
| Photo beside prose | `<!-- aside -->` / `<!-- profile -->` | `aside` | **no** |
| SoundCloud track, click to load (sets cookies) | facade button → iframe on click | `embed` (audio) | **no** |
| YouTube film (youtube-nocookie, lazy) | inline iframe | `embed` (video) | **no** |
| Dailymotion film at the foot, click to load | `video:` frontmatter | `embed` (video) | **no** |
| Share: Facebook, LinkedIn, WhatsApp, Email, Copy link | `ShareLinks.svelte` (copy + native share use JS) | furniture: `share` | **no** |
| Other work: three project cards | `DocCard` × 3 | `related` (from the site map) | **no**: needs the site map receipt |
| Footer | `SiteFooter.svelte` | furniture: `footer` | **no** |
| Read-aloud (narration mp3 per paragraph), theme toggle | `SpeechLayer`, `ThemeToggle` | furniture behaviour | **no** |
| SEO: title, description, OG image, article dates, JSON-LD | `Seo`, `projectLd` | page head | **partly**: no `og:image`, no article type or date |

**Score:** 1 of 19 is fully there, 5 partly, 13 missing. The block vocabulary
was built for Q's dashboard pages, not for a publication.

## The two things that change the design

1. **A bundle, not one file.** This article carries 16 photographs at four sizes
   (4.7 MB of WebP) and 12 narration clips. Put inside one HTML file as data URLs,
   that is several megabytes before the first paint, with nothing cacheable on
   its own. So the static receipt becomes a **bundle**: `index.html` plus assets
   named by their own hash, and one signed manifest listing every file's hash.
   The receipt covers the bundle, and every file in it can be checked.
   Hash-named assets can also be cached for ever, which is the pointer model.
2. **"Nothing runs" meets a page that needs scripts.** The click-to-load embeds,
   the menu, copy-link, the theme toggle and read-aloud all need JavaScript.
   The proposed line: **blocks never carry script; the site's own furniture
   may**, as a fixed, hashed file listed in the receipt. A template still
   cannot describe behaviour into existence. The behaviour belongs to Dark
   Olive, is signed and checkable, and is the same on every page.

## Order of work

1. Bundle receipt (manifest of hashes) replacing the single file.
2. Dark Olive as a **site theme** for the compiler: its CSS, header, footer and
   furniture script, so blocks draw in Dark Olive's look rather than Q's.
3. Blocks: `cover`, `credits`, `standfirst`, rich `text`, `figure` (caption +
   srcset), pair/trio, `aside`, `embed`.
4. Import: the existing markdown and frontmatter → blocks, so the 15 articles
   are converted rather than retyped.
5. Compile Green Space Dark Skies from blocks and diff it against the live page.

---

## Result, same day: all 15 articles rebuilt from blocks, identical

Decided by Darren: **scripts only in the site's own furniture**, and **import
the markdown** rather than retyping.

**New block kinds** (q-core `blocks.ts`): `cover`, `facts`, `standfirst`,
`figure` (alt required), `embed` (a provider from a closed list and an id, never
a URL), `quote`. A group can be laid out as `grid`, `aside` or `profile`, and a
heading can carry an outline level from 2 to 6. A page can also carry a `head`:
description, date, tags and mentions, none of it drawn. A page without a head
keeps its old address.

**Words inside a block** (q-core `inline.ts`): bold, italic and links. Nothing
else, and everything else is escaped. `<script>` typed into a sentence shows as
text, and `javascript:` and `data:` links show as words. The output matches
`marked` on all **181 paragraphs** on the site.

**The proof** (`apps/darkolive/scripts/blocks-check.mjs`): each article goes
markdown → blocks → `publish()` (the same checks every page gets) → Doc, and is
compared field by field with the markdown pipeline's Doc. **15 of 15 are
identical.** The article HTML matches byte for byte.

**In the running site** (`/built/our-work/<slug>`, kept out of search): the same
`ProjectArticle` template draws the block pages. The `<main>` HTML of all 15
matches the markdown pages exactly. The only difference is the share links
naming their own URL. The `<head>` (SEO, Open Graph, JSON-LD) matches too, apart
from relative paths one folder deeper and `noindex`. The SoundCloud
click-to-load still loads only on a click.

**Pictures** are content addresses: SHA-256 of the file each path stands for.
`src/content/pages/media.json` maps each address back to the site's paths.
Eight pictures are the same bytes under two articles' folders. Each article is
drawn with its own path.

**Q draws them too**: `BlockView` has a Q-look drawing of every new kind, so the
builder's preview works. The embed shows a placeholder there, because nothing is
fetched from a provider inside Q.

### Still to do

- **Switch the live routes** to the block pages and retire the markdown. They
  are interchangeable now, so this is one line per route.
- **Posts**: the eight blog posts, the same way.
- **Sign the deploy**: the build's files, hashed and listed in one manifest
  (the site map) and signed once in Q. That is the bundle receipt, and the
  pointer model: the domain points at the latest signed map.
- **Edit in Q**: open an imported page in My pages, change it, publish, rebuild.
- Existing inconsistency, carried over as it is: the **feature film** at the
  foot (`video:` frontmatter) loads as a lazy iframe even for Dailymotion, which
  sets cookies. The inline Dailymotion embeds ask first. Worth making the same.
