---
status: proposed
implementation: none
updated: 2026-09-30
---

# ADR-Q-013 — Your own AI keys, or Q credits

## Context

Darren, 30 September: people can enter their own API keys for their own AI
model and run their own Q from that, or buy credits from Q to run it. That
makes Q earn: the income belongs to Dark Olive CIC for now, and may pass to an
independent Q federation later by agreement.

Q makes no AI model calls today; this is new.

## Decision (proposed)

Two ways to run Q's AI features, chosen in the dashboard, switchable any time.

### 1. Your own key

- The key is kept **in your vault**, encrypted with your vault keys like
  everything else. It never reaches a Q server.
- Calls go **from your browser, or your own node, straight to the provider**
  you chose (Anthropic, OpenAI, others through one adapter). Q sees neither
  the key nor the words.
- You pay the provider directly; Q charges nothing.
- The key is included in backups (encrypted) and removed by Leave No Trace.

### 2. Q credits

- You buy credits from Q (Dark Olive CIC). Calls go **through Q's service**,
  which holds Q's own provider keys, meters use and deducts credits.
- **Honest line in the UI:** "With credits, your request passes through Q's
  service on its way to the model. Q does not keep it." — and the code must
  make that true (no logging of content, only counts).
- A receipt for each purchase and a running balance, like any other receipt
  in Q.

### Both

- A plain choice card: *Use my own key* / *Use Q credits*, with what each
  costs and what each sends where.
- Per-feature spend visible; a cap you set.
- The open licence does not stop anyone running their own credit service on
  a fork — under their own name (TRADEMARKS.md). The credit service from
  *Q* is Dark Olive CIC's.

## Still to decide

- Which providers first; which features use AI at all.
- Payment provider, pricing, VAT, refunds and terms for credits.
- Whether credits can be spent on nodes (compute, storage) as well as AI.
- The handover terms to a Q federation (asset lock — see
  docs/q/open-shop-audit-2026-09-30.md, section 0).
