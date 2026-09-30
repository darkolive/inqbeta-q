# Static pages: a published page that carries its own receipt

*23 September 2026. Built and proved the same day.*

> Darren: "when you look at that as a completed bundle becomes its own receipt.
> That one receipt is the static."

## The idea in one line

**Draft** is blocks. **Live** is one HTML file, drawn once from those blocks, with
its signed receipt inside it. Search engines, browsers with no Q and static hosts
get that file and nothing else.

## Draft and live are different things, on purpose

| | Draft (`inqbeta.page/1`) | Live (`inqbeta.static/1`) |
|---|---|---|
| What it is | A design: blocks, settings, widths | Finished HTML, drawn once |
| Where it lives | Your vault, locked | Anywhere — a host, an email, a USB stick |
| Answers and vault data | Named, filled in live when opened | **Refused.** A public page may only hold what its author wrote |
| Runs anything | No | No — the only scripts are JSON data |
| Address | Hash of the design | Hash of the file (with a marker where the receipt goes) |
| Made by | `pages.ts` `publish()` | `static-page.ts` + the app's renderer |

A static page is public and frozen, so blocks that read a person's vault at
opening time (answers, cards, places, receipts, people, federations, tables,
posts, and Q's own header, menu and drawer) stop it being made. They are
listed by name, not quietly left out.

## How one file carries its own receipt

1. The page is drawn by the **same** `BlockView`/`PageView` that draws the
   preview, into a hidden frame in the browser. Nothing is sent to a server.
2. Only the CSS those elements use is kept. Dark mode is kept too. Q normally
   switches it with a class, which needs a script, so the dark rules are
   rewritten to follow the device's own setting (`prefers-color-scheme`).
3. The head is written from the page: title, description (the first words,
   clipped for search), Open Graph, JSON-LD, `lang`, `color-scheme`, and the
   design's address as `inqbeta:page`.
4. The file is written with `<!--q:receipt-->` where its receipt will go. Its
   address is taken **with that marker in place**, and signed.
5. The marker is replaced with the receipt as
   `<script type="application/json" id="q-receipt">`. That is data, not code.

**To check a file**, put the marker back, hash it again, and check the signature.
`checkStatic(file)` does that with nothing beside the file. It reports:

- *This page is exactly what was signed, and the signature holds.*
- *The receipt holds, but the page has been changed since it was signed.* (a
  single character is enough)
- *This page carries no receipt.*

## The receipt

```json
{
  "schema": "inqbeta.receipt/1",
  "did": "did:key:z6Mk…",
  "signedAt": "2026-09-23T…",
  "contentHash": "…",
  "signature": "…",
  "content": {
    "source": "inqbeta:q/static",
    "kind": "static-page",
    "schema": "inqbeta.static/1",
    "called": "Green Space, Dark Skies",
    "page": "content://sha256/… (the design it was drawn from)",
    "html": "content://sha256/… (this file, marker in place)",
    "renderer": "q@<build version>",
    "bytes": 53052
  }
}
```

`page` → `html` is the provenance chain: this file came from that design,
drawn by that renderer. Rebuild the design with the same renderer and you get
the same `html` address, so anyone can check that the page was built from
exactly what it says it was built from.

## Proved on 23 September

Run in the real app (dev server, Q's real Skeleton and Tailwind CSS), signed
with a throwaway demo key:

- **Drawn and signed in ~15–30 ms** in the browser.
- **The same page compiles to the same bytes.** Compiled twice, same `html` address.
- **One file, about 53 KB**, including every style it uses. It opens on its own with no Q.
- **One h1.** When a page opens with a hero, the hero's line is the h1 and
  everything else is h2 or lower.
- **Light and dark follow the device**, with no script.
- **The only scripts are data:** JSON-LD and the receipt.
- **Tampering is caught.** Changing "small" to "large" gives *changed since it
  was signed*. Stripping the receipt gives *carries no receipt*.
- **Refusals work.** Adding an `answers` block gives *One block stops this
  becoming a public page. answers*.

## Using it

**My pages → Pages you have published → Make it public.** This compiles the
page, keeps a copy in the vault under `public/`, and offers *Open it on its own*
and *Save the file*. **Check a public page** takes any `.html` file and says
whether it holds up.

## Code

| Where | What |
|---|---|
| `packages/q-core/src/static-page.ts` | The rules: what may go public, `describe()`, `htmlDocument()`, `sealStatic()`, `checkStatic()`, `runsSomething()` |
| `packages/q-core/test/static-page.test.ts` | 11 tests with real crypto: refusal, SEO escaping, same bytes, self-check, tamper, nothing runs |
| `apps/q/src/lib/static-page.ts` | `compileStatic()`: draws in a hidden frame, puts url() fonts and pictures inside the file |
| `apps/q/src/lib/static-css.ts` | Keeps only the CSS in use; rewrites dark rules. Plain DOM, no imports |
| `apps/q/src/lib/components/StaticPage.svelte` | The frame: one `<main>`, one h1 |

## Pictures (added the same day)

An image block names a picture by the address of its **locked file in the
vault**. That address is also the file's name on disk, so a page can never point
somewhere else. In the builder, **Settings → Picture** shows the vault's
pictures as thumbnails, and **Add a picture** locks a new one in first.

When the page is made public, each picture it uses is put **inside the file** as
a `data:` URL, so the file still depends on nothing. Proved: a page with a hero,
a picture and text came to 97 KB. Compiled twice, it gave the same address. The
alt text is the block's title, and nothing loads from outside the file. Without
the picture in the vault, the page is refused and the reason is named.

Code: `apps/q/src/lib/pictures.ts`, `components/PicturePicker.svelte`.

## A website is one pointer

Darren: "you just need the home page, main DNS pointing".

Every static page is a file named by its own hash, so it **never changes**.
Hosts and CDNs can cache it for ever (`Cache-Control: immutable`), and a
visitor who has seen it once never fetches it again. The one thing that changes
is a small **site map** that says "home is #abc, /projects/green-space is #def".
That map is itself a signed receipt. The domain points at the latest map;
publishing a new page means signing a new map; rolling back means pointing at
the old one.

So a site is one mutable pointer, one small signed map, and any number of
immutable pages. That is the cheapest thing on the web to cache, and every
layer of it can be checked.

## Next

1. **The site map receipt**: names → page addresses, signed, with the
   home page first. Compile a folder of static pages plus a map into a
   directory a static host can serve.
2. **The blocks the Dark Olive articles need**: galleries, click-to-load
   SoundCloud and Dailymotion embeds, audio narration. See the gap check.
3. **The `blog` block goes public** by listing pages from the site map rather
   than reading the vault.
4. **`og:image`** needs an absolute URL. That comes once pages have a site to
   live in.
5. **CSS weight.** About 49 KB, mostly theme variables. It can be trimmed to
   the variables actually referenced.
