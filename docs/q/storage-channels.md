# Storage channels

**2026-09-25 — Phase 1 of the audit plan** (*Q audit — storage channels and the
incubator doctrine*). The incubator's rule, word for word: *"Google / Apple /
Dropbox / NAS / federation vault are storage channels only."* Bytes in, bytes
out, sealed. A channel is never an authority, and losing one is channel
failure, not identity loss.

## One shape

`q-core/storage-channels.ts`:

```ts
interface StorageChannel {
  id; kind; called;
  list(): Promise<string[]>;
  get(path): Promise<Uint8Array | null>;
  put(path, bytes): Promise<void>;
}
syncChannels(here, there, myDid)   // the rules below, for every kind of channel
```

| What | How it moves |
|---|---|
| Locked files (`.dsv`), permission tokens (`.ucan`) | named by their hash: copied where missing, both ways, never overwritten; a file that does not match its name is reported and never spread |
| `continuity.json` (ADR-Q-005) | the one signed later stands, both ways — a channel never brings back a way in that was taken out |
| `dostudy.json`, `READ ME.txt` | copied where missing; a channel owned by another DID is refused |

Tests: `test/storage-channels.test.ts` (4), with an in-memory channel.

## Built

- **Folder channel** (`folderChannel`) — the vault itself (disk or the
  browser's own storage) and every copy location. `replicas.syncReplica` now
  goes through `syncChannels`, so copy locations carry the continuity file too.
- **Auto-sync** (`apps/q/src/lib/autosync.ts`) — every allowed copy location,
  every five minutes while Q is open, visible and online, and when you come
  back to it. Nothing asked, nothing interrupting.
- **Today's route to the cloud, in Chrome or Edge on a Mac:** choose the
  Dropbox, Google Drive or OneDrive folder as a copy location. The provider's
  own app carries it; Q never signs in to them.

## Google Drive — built 25 September

- `q-core/google-drive.ts` — list, get, put against the Drive API; one folder
  per DID ("Q vault …<last 8>"), tagged `appProperties.qdid`; each file carries
  its vault path in `appProperties.qpath`. Two tests against a fake Drive.
- `apps/q/src/lib/google-channel.ts` — PKCE sign-in, scope `drive.file`. The
  refresh token is **locked into the vault** (`storage-channels/google-drive.json`),
  so it opens only with your passkey and travels with backups. Access tokens
  live in memory.
- Server (`routes/api/channels/google/*`, `lib/server/google.ts`) — the only
  place the client secret lives. It exchanges a code and refreshes a token,
  and keeps nothing. Google's "Web application" clients need the secret for
  both, even with PKCE.
- `/nodes` → **Cloud**: Connect, Sync now, Disconnect (revokes at Google and
  removes the locked token). Auto-sync includes it every five minutes.
- Env (`apps/q/.env`, gitignored; Vercel env for production):
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- In Google Cloud (project `dark-olive-216710`): Drive API enabled; the OAuth
  client's authorised redirect URIs include `http://localhost:3100/channels/google`
  and the production Q address; consent screen in Testing with Darren as a
  test user until it is published.

## Next: Dropbox and OneDrive

For Safari and the iPhone, which cannot pick folders, each provider becomes a
channel through its web API — small adapters implementing `list`, `get`
and `put`, sealed files only, the provider's token sealed in the vault. Signing
in to a provider opens a channel; it is never how you sign in to Q.

Each needs an app registered by Darren (only the owner of the account can):

| Provider | Where | Scope to ask for | Redirect |
|---|---|---|---|
| Google Drive | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web) | `drive.file` — only files Q made | `https://<Q domain>/channels/google` |
| Dropbox | dropbox.com/developers → Create app → Scoped, App folder | `files.content.read`, `files.content.write` | `https://<Q domain>/channels/dropbox` |
| OneDrive | Azure portal → App registrations → SPA | `Files.ReadWrite.AppFolder`, `offline_access` | `https://<Q domain>/channels/onedrive` |

All three allow PKCE from a browser, so no client secret is ever needed or
stored (Google is the exception: see above). The ids go in `apps/q/.env` as
`DROPBOX_APP_KEY` and `ONEDRIVE_CLIENT_ID`.
