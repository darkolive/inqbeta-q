---
implementation: spike (run)
decision: none
updated: 2026-09-28
---

# Spike: the same actions, decided in Rust

ADR-Q-009 §2: the browser (WASM) and a node (Rust, in Spin) must give the
same answer on the same receipt. This checks that without Spin first.

`money-spend.actions.json` is exported from `packages/q-actions`: the
`money.spend` chains (core, and core + the camping club) and what the WASM
engine decided for every shared case, rule ids included.

## Run

```
cd spikes/cedar-rust
cargo run --release
```

(To refresh the JSON after changing an action:
`pnpm --filter @inqbeta/q-actions export-actions`.)

## It passes when

1. Rust computes the **same action hashes** as q-actions (canonical JSON +
   SHA-256, written out by hand in `src/lib.rs`).
2. Every case gets the **same decision** and **exactly the same rule ids**.
3. It prints the time per decision, native.

## Result — 28 September 2026, Darren's Mac (Rust 1.98.1, Cedar 4.13.0)

Compiled first time. **Rust and WASM agree on every hash, decision and rule
id** — both action hashes identical (including the `£` and `’` in the club's
text, so canonical JSON + SHA-256 match byte for byte across languages), all
ten cases the same for core and club. **0.13 ms per decision**, native, warm.
