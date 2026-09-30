# ADR-Q-004: Calls — direct, signed, and receipted

**Status: accepted, 24 September 2026; amended 25 September (§5, the call as a
chain of receipts).** Decisions 1–3 and §5 were Darren's; the rest follow from
them. Open decisions are at the end.

> "Under communication, video call, because we've got receipts … We must have
> a perfect setup for having video channel and audio."

Asked, 24 September:

- **How is it carried?** Direct, peer to peer.
- **What does the receipt hold?** Facts only.
- **How far now?** This record and a first build.

---

## 1. Direct, device to device (WebRTC)

The media goes from one browser to the other. Q's server never carries it:

- Vercel could not hold a call open anyway.
- It is the only design in which Q *cannot* listen — which is the one worth
  having.

**The limit, stated plainly:** direct calls are for two people, stretching to
three or four. More than that needs a forwarding server (an SFU), which is a
different decision (§8a).

## 2. The handshake is signed — this is what makes direct safe

WebRTC encrypts media (DTLS-SRTP) to whatever key the SDP names in its
`a=fingerprint` line. Whoever can change the SDP in transit can put their own
key there and sit in the middle. Every other system trusts its signalling
server not to do that.

Q does not have to trust anyone. The first two receipts of the call (§5),
`call.placed` and `call.accepted`, each carry:

- the DTLS fingerprint of the sender's SDP;
- the SDP's hash.

Both are signed. The SDP travels beside the receipt in the link, and
`checkPlaced` / `checkAccepted` refuse it unless:

- its hash matches the signed one, and
- its fingerprint is the one signed.

So **the key on the far end of the wire is the key of the person who signed**,
checked rather than hoped. This works whatever carries the link: a message,
a relay, a pigeon.

The receipt keeps the SDP's hash, never the SDP, because the SDP carries
network addresses. When you know who you are calling, the link is also
sealed to their DID.

## 3. The first carrier is a link

The signed offer is compressed into a link's `#fragment`. Browsers never send
the fragment to a server. The reply comes back the same way.

- ICE is gathered in full before signing (no trickle), because the link goes
  once each way.
- Measured in Chromium: an invitation link sealed to one person is about
  **3,800 characters**, and connection takes under 200 ms once the reply is
  pasted.
- Compress **before** sealing. The other way round (ciphertext does not
  compress) made it 7,600.

This works today with no infrastructure. But it is not ringing: the other
person has to open a link, and you have to paste theirs back.

**Getting through.** Some networks will not let two devices reach each other
(mobile carriers, offices, hotels). Then the media bounces off a TURN relay:

- The relay carries packets it cannot decrypt (§2).
- `api/calls/ice` mints short-lived Cloudflare TURN credentials when
  `CF_TURN_KEY_ID` and `CF_TURN_KEY_TOKEN` are set.
- It drops the port-53 URLs browsers block.
- Without those variables it returns STUN only, and the page says so.

## 4. The setup — "perfect" means right before the call, not rescued during it

The page opens on a check, not a button.

**Before the call:**

- **Chosen and remembered.** You pick the camera, microphone and speaker (per
  device, in localStorage).
- **Live microphone meter.** You see your voice before anyone hears it.
- **Test sound through the chosen speaker.** Uses `setSinkId`: Chrome,
  Firefox, and Safari 18.4+. The picker is hidden where it cannot work.
- **Headphones advised.** They are the only thing that fully removes echo.
- **Voice clean-up on by default:** echo cancellation, noise suppression and
  automatic gain control. It can be turned off for music.
- **Mono 48 kHz capture.**
- **Content hints.** `speech` for the microphone, `motion` for the camera, so
  each encoder spends its bits on what matters.

**Quality settings:**

| Setting    | Video                       | Bitrate cap |
|------------|-----------------------------|-------------|
| Best       | 720p, 30 fps                | 1.5 Mbps    |
| Data saver | 360p, 20 fps                | 0.4 Mbps    |
| Voice only | none (they can still show you theirs) | —  |

**During the call:**

- **The voice outranks the picture.** Audio is sent at `priority: high`
  (48 kbps Opus cap). Video degrades `balanced`. When the line is poor, the
  picture softens first and the voice holds.
- **Always offer both audio and video.** A camera turned on, or any device
  swapped, is a `replaceTrack`, not a new handshake. That matters when the
  handshake travels by link. Unplugging a headset mid-call falls back to the
  default device.
- **Health, always visible.** Good / fair / poor from round-trip time and
  packet loss, plus whether the call is direct or relayed and the resolution
  arriving.
- **Holding on.** A wobble (`disconnected`) is held; after 4 s ICE is
  restarted; after 20 s the call is ended and recorded.
- **Full screen.** The call takes the whole screen (as Write does), and the
  screen is kept awake (Wake Lock).
- **Autoplay.** Where a browser blocks sound from starting, a "Tap to hear
  them" button appears rather than silence.
- **Mute state.** Mute and camera state cross on a data channel, so each
  side sees "They are muted" rather than wondering.

**iOS app:** `apps/q/ios/Setup.md` now covers:

- the microphone usage string;
- the WKWebView media-capture delegate (grant for Q's own page only), without
  which iOS asks twice;
- `allowsInlineMediaPlayback`.

## 5. The call is a chain of receipts

> "It starts when someone makes a call and presses that call button. That's
> creating that first receipt, which is sent, and then that chain lifecycle
> can hash itself. The receiver then accepts to receive the call. That's their
> receipt. … And then both click end, leave call, from their end, which
> generates their final closing receipt." — Darren, 25 September

Each press is a receipt, and each names the one before it by its hash
(`parent`, the same shape as `chain.ts`):

```
call.placed     the caller presses Call        parent: none
     │
call.accepted   the person called presses Join parent: placed
     │
   ┌─┴─────────────┐
call.ended      call.ended                     parent: accepted
(caller's end)  (their end)
```

**Each ending is that person's own account**, from their own end:

- when media began, how long, audio/video, direct/relayed;
- how they left: `hung-up`, `they-left`, `dropped`, `cancelled`,
  `no-answer`.

Neither person signs for the other.

**Two endings from one parent is a branch.** `chain.ts` says when a branch is
harmless: two *different* keys, each telling its own side. The same person
closing twice is refused.

**Swapping endings.** The endings cross on the data channel. Whoever presses
End first sends theirs. The other side closes its own end ("they left") and
sends it back. Both then hold the same four receipts, in the same order,
signature for signature. If the line has already gone, each keeps its own
ending, and the record says only one side has closed.

**A call nobody answered is still a chain:** placed, then the caller's own
`no-answer` ending, from placed. Only the caller may close a call that was
never accepted.

**Kept as it grows.** The chain is written to the vault at `calls/` after
every step, one file per call. A crash half-way still leaves the receipts it
got to. It shows under **Receipts**:

- *yes* once complete;
- *partly* while a side is still open.

**Checked offline** (`checkCallChain`):

- every signature holds;
- `placed` comes first;
- `accepted` follows it, is signed by someone else, and by the person it was
  addressed to;
- every ending follows where the call got to (accepted, or placed if
  unanswered);
- only people on the call close it, once each.

If the two accounts of the length differ by more than 15 s, it says so rather
than choosing one.

**What is never kept:** sound, pictures, transcripts, SDP, IP addresses.

## 6. What was built, 24 September

- `q-core/calls.ts`, with 8 tests:
  - fingerprint extraction;
  - placed → accepted, linked by hash, with no addresses kept;
  - a man-in-the-middle SDP swap caught (new key, or same key with a new
    address);
  - expiry, wrong recipient and wrong call refused;
  - links sealed and round-tripped;
  - both endings making a complete chain;
  - the unanswered chain;
  - broken chains refused: edits, strangers, closing twice, out of order,
    following another call, an impostor accepting.
- `apps/q/src/lib/call/media.ts`: devices, constraints, meter, test sound,
  errors in words that say what to do.
- `apps/q/src/lib/call/connection.ts`: the call, sender settings, health,
  data channel, the receipt exchange.
- `apps/q/src/routes/call`: **Communication → Video call**.
- `apps/q/src/routes/api/calls/ice`: TURN credentials, signed request.
- `lib/receipts.ts`: call records show under Receipts.
- Icons: message, video, video-off, mic, mic-off, phone-off.
- **End-to-end in Chromium** (fake camera and microphone, two identities, one
  page). Three runs:
  - the caller ends;
  - the person called ends;
  - nobody answers.

  Each answered run produced `placed → accepted → ended (hung-up) + ended
  (they-left)`, identical on both sides, signature for signature. The
  unanswered run produced `placed → ended (no-answer)`. The chain was kept
  after every step. Invitation links sealed to one person are about 3,900
  characters.

**Not yet tested:** real devices, Safari/iOS, two real networks, a TURN
relay. That is the next thing to do, with Theo on the other end.

## 7. Security notes

- `api/calls/ice` requires a request signed by a DID, as every request that
  spends something does. But anyone can make a DID, so it is **not** yet
  limited to people you know (§8d).
- The invitation link is a bearer of *an* offer, not of access. Opening it
  lets someone answer; it gives them nothing in your vault.
- An unsealed invitation shows your network addresses to whoever sees the
  link. Seal it when you know who you are calling.

## 8. Open decisions — Darren's

a. **Group calls.** More than three or four people needs an SFU: LiveKit
   (self-hosted on the mini PC, or their cloud) or Cloudflare Realtime. The
   signed-fingerprint trick does not carry over as-is. An SFU terminates
   DTLS, so end-to-end needs insertable streams (SFrame) keyed from the DIDs.

b. **Ringing — direction chosen 28 September (ADR-Q-009 §6).** Three layers:
   1. **MQTT, when the device is awake.** The `call.placed` receipt and its
      sealed offer (~3.8 KB) go to the callee's topic on a broker on the home
      node; `call.accepted` comes back the same way; then media goes direct.
      Presence (MQTT's "last will") says who can answer, so Q only rings
      someone who is there. The broker can't read or alter anything.
   2. **Push, to wake a sleeping device.** A locked iPhone closes background
      connections, so ringing it needs Apple push (PushKit + CallKit); the web
      uses Web Push via the service worker. The push carries only "wake up";
      the ring itself is fetched over MQTT.
   3. **The link**, which still works when everything else fails.

   Not built. The options first weighed were:
   - Nostr ephemeral events on public relays: no infrastructure, and "a relay
     that forgets" (ADR-Q-001 §7);
   - a Cloudflare Durable Object;
   - a small relay on the mini PC.

   The signals are already signed and sealed, so the carrier does not need to
   be trusted, only reachable.

c. **TURN provider.** Cloudflare (pay per GB, nothing to run) or coturn on the
   mini PC over the 900 Mbit line (free, but the house carries every relayed
   call and must stay up).

d. **Who may use the relay.** Any DID now. Could be limited to your address
   book, or to a federation's members.

e. **Screen sharing**, and whether a call can attach evidence (a photo, a
   document) that becomes its own receipt linked to the call.
