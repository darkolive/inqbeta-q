# Where this is going — captured 19 September 2026, end of day

**Status**: thinking, not decisions. Nothing here is agreed and nothing is built.

Darren's sign-off thoughts, kept as they were said, with an engineering note
under each where the ground is harder than it looks. The notes are not
objections — they are the things that would otherwise be discovered three weeks
in.

---

## 1. The iOS app carries the vault

> "iOS model app will then have folder creation, vaults, back end."

This is the honest answer to what was learned today. Safari has no folder picker
and deletes its own storage after seven days, so on Apple devices the browser
can only ever read. A native app has a real filesystem, no seven-day timer, and
no Google.

`apps/q/ios/QApp.swift` is a stub.

**Note.** This part is straightforward and is the piece everything else below
depends on. Worth doing first and on its own, before any of the rest.

---

## 2. The device spins up runtimes — Spin, and even Dgraph

> "It can also spin up spins and runtimes and even Dgraph in the back end."

The device as a full node: not just a vault, but the compute and the index
beside it.

**Note — and this is the one to know before planning around it.**

This is real on **macOS** and largely not on **iPhone**.

- iOS forbids JIT, and App Store rule 2.5.2 forbids downloading and executing
  code that changes what an app does. A Wasm **interpreter** is allowed — so a
  Spin-like runtime can run, interpreted and slow, and each submission is a
  review risk rather than a settled matter.
- Dgraph is a Go server wanting a long-lived process, real memory and real
  disk. iOS kills background processes, caps memory hard, and has no notion of
  a daemon. It is not an iPhone workload.
- iPadOS is better than iOS and still not a server.
- **macOS has none of these limits.** A Mac running the vault, a Wasm runtime
  and Dgraph is an ordinary thing to build.

So the shape is probably: **Macs and servers are nodes; phones are clients of
them.** That is not a lesser version — it is the same federation with honest
roles, and it matches how the storage question resolved today.

---

## 3. Everything inside a mesh — VPN'd, wire-meshed, offline

> "be in network completely VPN'd, wire meshed, offline."

A WireGuard mesh between a person's own devices and their federation's nodes.
No public exposure, no ports open to the internet, no server in the middle.

**Note.** This is the most promising item here, and it converges with work
already done:

- It **is** the relay network of ADR-Q-001 §7, with real identity per node.
- A WireGuard peer is a public key. A DID is a public key. **A signed receipt
  linking a node's mesh key to its DID** would make the mesh and the identity
  the same fact, checkable offline — which is exactly the shape `links.ts`
  already uses to join a site key to a root.
- It answers §10, the open IPFS question: a **private swarm over the mesh**
  gives content addressing without the public DHT, so existence, size and
  timing stop leaking to strangers. That question has been blocking relay work;
  this may be its answer.

The hard part on Apple devices is an entitlement, not code. A VPN tunnel from
an app needs `com.apple.developer.networking.networkextension`, which Apple
grants case by case on request. Tailscale is the proof it can be had; it is a
form to fill in and a wait, not a checkbox. Worth starting the request early,
because it gates the demo rather than the design.

---

## 4. The network page shows where it goes out to

> "the network should show where this is going out to."

**Note.** Straightforwardly good, and a differentiator rather than a feature:
an application that tells you every place it talks to, in plain words, without
being asked. It is the counterpart to the honesty already in the ADRs about
what leaks — existence, size, timing — and the same argument applies. A system
that says what it cannot hide is trustworthy in a way that one which says
nothing is not.

`/network` currently shows numbers that are literals in the source. Making it
show real outbound connections would make it the most honest page in the app
rather than the least.

---

## 5. Rotating ports on each restart

> "ports and port rotating on each restart, different things like that to
> consider to increase firewall protection."

**Note — the one to push back on.**

Against a network attacker this does not help. Scanning every port on a host
takes seconds, so a moving port is not a closed door; it is the same door in a
different place. Meanwhile it costs real things: the repo's fixed port map
exists precisely so two apps never quietly swap addresses, and `strictPort`
enforces it.

What actually keeps a service safe, in the order that matters:

1. **Do not listen where you are not wanted.** Bind to `127.0.0.1`, or to the
   mesh interface only. A service that cannot be reached needs no port secret.
2. **Authenticate every request**, so reaching it is not the same as using it.
   Q already signs with passkeys and delegates with UCAN — the machinery is
   there.
3. **Let the mesh do the perimeter** (item 3). WireGuard refuses anything
   without a peer key before a packet is looked at.

There **is** a sound version of the instinct: **ephemeral ports bound to
localhost**, so nothing is predictable *and* nothing is reachable off-box. That
gets what rotation was reaching for without giving up the fixed map for the
things that need one.

---

## What this adds up to

The five items are one system, and they order themselves:

```
1. iOS app with a real vault        ← everything needs it, nothing depends on the rest
2. Mac as a node (runtimes, Dgraph) ← the real compute story; phones are clients
3. The mesh                          ← perimeter, relays, and possibly the answer to
                                       ADR-Q-001 §10 (private swarm, no public DHT)
4. The network page tells the truth  ← cheap, and the most honest page in the app
5. Binding, not rotation             ← a correction to fold into 2 and 3
```

The mesh is the interesting one, because it is not only infrastructure: it
turns the relay lifecycle of ADR-Q-002 from a design into something with real
peers, real keys, and a real reason those keys are the same keys as the
identities.

---

## Before any of it

Two questions are still open and still upstream (`what-is-real.md`):

1. **ADR-Q-001 §10** — public DHT or private swarm. Item 3 above may answer it.
2. **ADR-Q-002 open question 1** — what sandbox a federation's method gets when
   it runs against a person's own data. Item 2 makes this urgent rather than
   theoretical: a node that spins up runtimes is a node running other people's
   code.
