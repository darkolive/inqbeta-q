# Contributing

Thank you. Q is built to be shared, and so is the work on it.

## Sign off your commits (DCO)

Every commit must be signed off, which certifies the
[Developer Certificate of Origin](https://developercertificate.org/) — in
short, that you wrote it or have the right to give it, under this
repository's licences.

```
git commit -s -m "What changed"
```

adds the line `Signed-off-by: Your Name <you@example.org>`. There is no
separate agreement to sign, and nobody — Dark Olive CIC included — gains the
right to relicense your work: it stays under the licence it was given with
(see [LICENSING.md](LICENSING.md)).

## How we work

- **Decisions are written down.** Anything that changes what Q does or promises
  starts as an ADR in `docs/decisions`.
- **Say what is true.** Words in the interface describe what really happens.
  Security claims must be true of the code.
- **Styling is Skeleton's.** Use Skeleton's core API, presets and pairs; flag
  any arbitrary Tailwind value that has no Skeleton equivalent.
- **Every language.** A new string goes into every book in
  `apps/q/src/lib/i18n` — English first; the others must say every key.
- **Tests pass.** `pnpm check` and `pnpm test` before you open a pull request.

## Security problems

Not here — see [SECURITY.md](SECURITY.md).
