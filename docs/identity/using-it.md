# Using it in DoStudy

## The header fingerprint

Every page. Outlined: signed out — press and touch the sensor. Filled olive:
signed in — press for your DID, fingerprint code, folder, and *Sign out*. A small
dot: you were signed in before this reload — one touch to carry on.

## The tabs — `/dostudy`

**Build · Read · Verify · Data · Passkey.** Old addresses (`/dostudy/verify` …)
open the matching tab. Switching never reloads, so nothing is lost.

- **Read** — a course to go through; anything else laid out by shape. Sealed to
  you: opens when you sign in, from the header or the button.
- **Verify** — the four questions, what was sealed inside once opened, and — for a
  receipt made under someone else's power — *Were they allowed*.
- **Data** — everything in your folder, visible only when signed in. Add files,
  open, save a readable copy, lock files put there by hand, delete.
- **Passkey** — make a passkey, check it comes back the same, choose your folder,
  seal a note to yourself or others, and link this site's key to your root: *Make
  the request* gives one line of text (a UCAN container, starting `C`); approve it
  in Q → Keys; paste the answer back. Older JSON links still work.

A file dropped on Read or Verify appears in both. A course being read is never
swapped out without asking.

## Testing

```bash
npm run ceqf:smoke                      # includes Passkey identity (links, UCAN, the fifth question)
pnpm --filter @inqbeta/q-core test      # q-core, with the UCAN spec's test vectors
npm run dev                             # http://localhost:5173/dostudy
npm run build && npm run preview        # http://localhost:4173/dostudy — needed for offline
```

Use `localhost` exactly — passkeys refuse `127.0.0.1` and network addresses. The
locked folder needs Chrome or Edge.

1. Header fingerprint → make a passkey. Passkey tab → *Sign in again to check* → "Same identity".
2. Passkey tab → *Choose a folder* → make `DoStudy` in Downloads.
3. Seal a note. Finder shows a `.dsv` file and `READ ME.txt`; the Data tab shows the note.
4. Reload → the header shows the dot; Data says *Locked*; one touch → everything back.
5. Offline: DevTools → Application → Service workers shows it running; Network → Offline → reload.
