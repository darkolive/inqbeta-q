# ADR-Q-011: Read aloud — a recorded voice, with the expression built into the block

**Status: built and recorded, 29 September 2026.** Darren: "adopt the
same exact what we did with ElevenLabs in the Dark Olive repo … those accents
and expressions are built into the block … the change from rhythm to
explanation … labels should be expressive … when you do toggle, it talks in,
it's downloaded those files … a folder … on your local cache storage."

## What it is

Dark Olive's spoken web, brought to Q (see `apps/darkolive/_plans/spoken-web-spec.md`):
pre-recorded in Darren's cloned voice at build time, never at request time,
one file per line, keyed by hash.

The difference: **each line carries its own performance.** The words on
screen live in `apps/q/src/lib/i18n/<lang>.ts`. How they are *said* lives in
`apps/q/src/lib/voice/scripts/<lang>.ts` — the same key, the same words, with
ElevenLabs audio tags as stage directions:

```
'signin.title': '[calm] [confident] Your data. [short pause] Your device. [short pause] [warmly] Your rules.'
'place.key':    '[curious] A key.'
```

One small vocabulary, used the same way everywhere, so Q always sounds like
the same person — rhythm lines calm and confident, promises reassuring, hints
explaining, labels bright, questions inviting. The list is at the top of
`scripts/en.ts`. Tags are English in every language.

## How it works

- **Marking.** A readable element carries `data-read="<i18n key>"`. Order on
  the page is reading order. An element with an empty key is read from its
  text by the browser's voice (used when a block's words were customised and
  so no longer match the recording).
- **Recording.** `npm run voice` (apps/q) plans and prices; `--dry` writes
  empty manifests; `--yes` records. Model `eleven_v3` (follows the tags,
  speaks Welsh); `--model eleven_v4` to try the newer one. Output:
  `static/voice/<lang>/<hash>.mp3` + `manifest.json`. Hash = model + voice +
  script, so an edit re-records one line, and stale files are pruned. Key and
  voice from `apps/q/.env`, falling back to Dark Olive's.
- **Playing.** Switching read aloud on reads the manifest, **downloads every
  recording the page needs into Cache Storage (`q-voice`)**, then plays in
  order. The cache survives deploys (the service worker leaves it alone) and
  works offline; Leave No Trace clears it. A line plays from its recording
  only if the hash proves it was made from the current script in the named
  voice; otherwise the browser's voice reads the words. Never the wrong words.
- **Disclosure.** While a recording plays, the front door says whose voice it
  is: "Read in a synthesised version of Darren's voice."

## Smooth and quick (29 September, after the first listen)

Darren: "a little slow … after each section, an audio cutoff sound, like a dip."

- **One track, not many files.** Each line was its own `<audio>`; every join
  was an element stopping and another starting, on files with ragged silence
  (0–0.4 s) at each end. Now every recording is decoded with the Web Audio API,
  trimmed to the voice, faded in 8 ms and out 90 ms, and scheduled on one clock
  with the same 0.35 s breath between lines. Checked offline in Chromium on
  real takes: silent joins, no step at any edge.
- **Clipped takes.** eleven_v3 often stops a line while the voice is still
  sounding. The first check (ffmpeg's `-sseof` seek) was wrong — it lands
  imprecisely in an MP3 — and flagged the wrong 12. Decoding each file and
  measuring 10 ms steps from the end found 18 real cuts, plus a harmless
  second kind: a blip of noise after the voice has finished, which the player
  now steps over when trimming. Every take now ends with `[short pause]` in
  the request (not in the hash), so the model has room to finish.
  `npm run voice -- --clipped` lists cuts (needs ffmpeg); `--redo lang:key,…
  --yes` re-takes named lines without it. Re-takes get new file names, so
  browsers fetch them; a failed re-take keeps the old one.
- **Quicker start.** The kept manifest is used at once (fresh one behind it),
  all recordings are fetched together, and the first line plays as soon as it
  alone is ready.

## Open

1. Whether the clone should speak Welsh, French, German and Spanish, or those
   languages use a native voice with its own disclosure. The manifest records
   the voice per language, so either works.
2. The Welsh script needs a first-language read.
3. Word-by-word highlighting (Dark Olive's karaoke) is not used here: the
   front door's lines are short. `with-timestamps` on v3/v4 is unconfirmed.
