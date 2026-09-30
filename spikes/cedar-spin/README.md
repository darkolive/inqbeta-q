---
implementation: spike (run)
decision: none
updated: 2026-09-28
---

# Spike: the engine on a node, in Spin

ADR-Q-009 §2: one engine, two places, same answer. This wraps
`spikes/cedar-rust` in a Spin HTTP component.

## Result — 28 September 2026, Darren's Mac (Spin 4.1.0, spin-sdk 7, Cedar 4.13.0)

**Spin and WASM agree on every decision and rule** — all 10 cases, core and
club, with the same action hashes. The component is 6.4 MB (1.5 MB gzipped).
Written for spin-sdk 7 (async `#[http_service]`, WASI 0.3) after a first
build against the 3.x API failed on the handler only.

## Steps

```
# 1. Scaffold with your installed Spin, so the SDK version and manifest match it
cd spikes
spin new -t http-rust cedar-spin-app --accept-defaults
cd cedar-spin-app

# 2. Use this spike's handler and the shared crate
cp ../cedar-spin/src/lib.rs src/lib.rs
cargo add serde_json anyhow
cargo add cedar-rust --path ../cedar-rust

# 3. include_str! in lib.rs points at ../../cedar-rust/… — fix the path if
#    your folder name differs, then:
spin build && spin up

# 4. In another terminal
node ../cedar-spin/check.mjs
```

`spikes/cedar-spin-app/` is the scaffold made on Darren's Mac; its
`src/lib.rs` is a copy of this spike's.

## What to look at

- Every case: same decision, same rule ids, same action hash as WASM in Q.
- Size of the built `.wasm` (Cedar compiled for a server).
- Cold-start and per-request time from `spin up`.
