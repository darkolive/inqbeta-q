# The site is the blocks, and the release is one signature

*23 September 2026.*

## What changed

- **darkolive.co.uk draws from block pages.** `/our-work/*` and `/blog/*`, the
  home page, the sitemap and the share kit read `src/content/pages/`: 15
  projects and 3 posts. The markdown they came from is no longer read by the
  site. `pnpm blocks:check` still proves they agree, **18 of 18**, and
  `--write` will not overwrite a page that has been edited since it was imported.
- **Notes to yourself** (`note` block): the `<!-- TODO … -->` comments in the
  draft posts were being published in the page source. They are now notes, kept
  with the page and never drawn.
- **The film at the foot now asks first** for Dailymotion and SoundCloud,
  using the same click-to-load as the embeds in the text.
- **A whole release is one signed map** (`q-core/site.ts`): every built file →
  its SHA-256, and every route → the block page it was drawn from. Each map
  names the one it replaces.

## Releasing

```
pnpm build                                   # .vercel/output/static
pnpm site:map                                # site-map.json
Q → My pages → Sign a site                   # one touch; saves site.receipt.json
node scripts/site-map.mjs attach site.receipt.json
                                             # refuses if one byte differs;
                                             # puts it at /.well-known/inqbeta-site.json
vercel deploy --prebuilt
```

Anyone can fetch `/.well-known/inqbeta-site.json`, then any page, hash it, and
see it is exactly what was signed. There is no server to ask. Tested with a
demo key on a stand-in build: signed, attached, and one changed file refused
by name.

## Sizes and speed (measured 23 Sept on Green Space Dark Skies)

| What | Size | Who downloads it |
|---|---|---|
| The page as blocks (JSON) | 17.5 KB, **5.5 KB gzipped** | Nobody visiting. It is the source, used at build time |
| All 18 pages as blocks | 146 KB, 50 KB gzipped | Nobody visiting |
| Finished article HTML (body) | 39 KB, **~11 KB gzipped** | Every visitor, first |
| Cover photo | **33 KB** phone, 71 KB desktop | Every visitor, first |
| Lexend font | 40 KB | Once per visitor, then cached |
| Partner logo | a few KB | Every visitor |
| The 15 photos in the text | 550 KB (phone) to 910 KB (desktop) | Only as you scroll to each one |

**Not measured here:** the production CSS and JavaScript bundles, because the
build cannot run in the sandbox. The dev server inlines 223 KB of unminified
CSS, which is not what ships. Run `pnpm build` to get the real figure.

**What that means.** Blocks add nothing to what a visitor downloads. They are
drawn to plain HTML before anyone arrives, so the page weighs what it weighed
as markdown. First view above the fold is the HTML, the CSS, the font and one
cover: roughly 150–250 KB (an estimate until the build is measured). From a UK
edge server that is well under a second on 4G. Local dev answered the first
byte in 34 ms.

**Repeat visits and the pointer model.** Every file named by its own hash
(`_app/immutable/*`, and every image) can be cached for ever, so a return
visitor re-fetches only the small HTML page. A new release changes the map,
not the files that stayed the same.

## Measured on the real build (23 Sept, Darren's `pnpm build`)

`/our-work/greenspacedarkskies`, everything a first visit fetches before
scrolling, gzipped:

| | Before the fix | After |
|---|---|---|
| HTML | 13.0 KB | 15.7 KB (it now carries its own article's data for the browser) |
| CSS (one file, whole site) | 24.8 KB | 24.8 KB |
| JavaScript | 164 KB | **76.9 KB** (measured) |
| Font, cover (desktop), logo | ~115 KB | ~115 KB |

**The fix.** Every article's `load` ran in the browser as well as at build
time. So every page shipped all 18 articles, the markdown parser and the block
renderer: one 64 KB gzipped chunk that no page used. Loads are now
server-only (`+page.server.ts`). The site is prerendered, so they run at build
time and each page carries only its own article. Lists carry cards without
article bodies, and dates and figures moved into their own small modules so a
component that needs one does not pull in the rest.

Confirmed on the second build. First view is about **232 KB**, down from about
317 KB. The home page carries 75 KB of JS and a post 73 KB. The signed map lists
909 files: 108 KB, or 42 KB gzipped, and it is only fetched by someone who
checks.
