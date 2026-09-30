---
implementation: spike (run)
decision: none
updated: 2026-09-28
---

# Spike: actions as Cedar policies

For ADR-Q-009. **Run 28 September 2026 on Darren's Mac — all as expected.**
To run again:

```
cd spikes/cedar-actions
npm install
node run.mjs
```

## What it shows

- `core-money-spend.cedar` — Q's `money.spend` action: one **permit** (the
  *may*) and a **forbid** for every must and cannot, each with an `@id` that
  a refusal can cite.
- `camping-club-money-spend.cedar` — a federation's version: **forbids only**.
  Adding a forbid can only refuse more, so "only tightens" holds by
  construction.
- `money-spend.cedarschema` — the facts the engine is given. Cedar cannot
  count or look things up, so the verifier supplies `distinctSignerCount`,
  `budgetLineRemainingPence` and so on from the chain.
- `run.mjs` — eleven cases, each run against core alone and core + club,
  printing the decision, the policy ids that decided it, and the time taken.

## Results (Cedar 4.13.0)

- **11 of 11 cases** gave the expected decision, core alone and core + club.
- **Refusals name their rules** by `@id` — every broken rule at once (the
  over-budget case names three). A refusal with no permit matched is reported
  as "outside money.spend/may/record".
- **0.23–0.25 ms per decision**, warm (schema and policies parsed once with
  `preparseSchema` / `preparsePolicySet`, then `statefulIsAuthorized`). The
  first, unparsed run was ~2 ms per call.
- **Every policy type-checks** against the schema (`validate`) before use.
- **A federation permit is refused:** adding a `permit` to the club's file
  stops the run with "camping club may not add a permit".

## Still to try

- The Rust `cedar-policy` crate inside a Spin component, giving identical
  answers to the browser build on the same cases.
- A browser build in Q itself (bundle size, first-load time).

Kept outside `packages/q-core`, which has no dependencies. Run with
`npm install && node run.mjs` now that `package.json` exists.
