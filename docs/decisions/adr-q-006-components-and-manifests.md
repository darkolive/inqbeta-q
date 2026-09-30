# ADR-Q-006: Components, manifests and blocks

**Status: accepted, 25 September 2026.** Darren: "if there's code involved, it
becomes a component that lives in the library. But a block can contain a
component." And: "always keep it AI readable — this is where the models can
help build these more beautifully."

**Built (steps 1–2):** `q-core/components.ts` (manifest, checker, the brief a
model reads, core library), `q-core/behaviour.ts`, the `component` block kind
in `q-core/blocks.ts`, refusal in `static-page.ts`, the `component` snippet in
`q-ui/BlockView.svelte`, and in Q `component-library.ts` + `ComponentBlock.svelte`.
The sign-in on Q's home page is now drawn from the block `q:sign-in@1.0.0`.
Tests: `packages/q-core/test/components.test.ts`.

---

## The three layers

| Layer | What it is | Rule |
|---|---|---|
| **Component** | Code, in a library. Written and checked once; each version is its own receipt. | Only runs what its manifest declares. |
| **Manifest** | Plain-language description of the code: what it may touch, what it promises, how it must behave for people, its design brief, and its settings as questions. | Closed vocabularies only; checked by `checkComponentManifest`. |
| **Block** | Data on a page: a pin (`q:sign-in@1.0.0`) and answers to the component's questions. | Never carries code. `checkBlock`'s no-behaviour rule is unchanged. |

A block can therefore be interactive because an approved component is — never
because the block says so. Furniture (header, menu, drawer) was the first case
of this idea and keeps its own kinds.

## Where it comes from

The incubator (inQbeta repo, `docs/plugins/`, `docs/wiki/*Manifest*`): the
manifest trilogy; plugins described through guided questions, not code;
required declarations accepted explicitly; proposed → approved → activated →
revoked, every step an audit event; manifests binding to trusted runtime
templates, with derivation allowed only as a subset of the parent's powers.

What the incubator never reached: code that draws on somebody's screen next to
their passkey, and anyone other than a core developer writing a new template.
This ADR covers both.

## Trust tiers

| Tier | Written by | May touch identity, vault, keys | Status |
|---|---|---|---|
| `core` | Q itself (`by: "q:core"`) | Yes | Built — sign-in is the first |
| `approved` | Anyone, approved by a federation's governance | Never | Needs the sandbox (step 4) |
| `draft` | Anyone | Never | Preview only; refused on any page |

Anything that touches identity, the vault or keys runs in Q, never on a site
page.

## What a component may touch

Closed list in `TOUCHES`, each with one sentence of meaning:
`identity.passkey`*, `identity.who`, `vault.open`*, `vault.restore`*,
`keys.manage`*, `receipts.read`, `receipts.write`, `answers.read`,
`pictures.show`, `navigate`. (* core only.) There is deliberately no network
touch; one gets added here, argued for, when something needs it.

## Required of every manifest

- Keyboard for everything; every icon with a word; still for reduced motion;
  things to press at least 44px (WCAG 2.5.5).
- At least one promise, each with an id a later approval can cite.
- A design brief, one rule per line — what a model changing the code must keep true.
- Settings as a question set whose ids start with the component's id
  (`q:sign-in/title`), so they can't collide with anybody else's.
- Where the code is (not for drafts). `code.hash` is filled at release.

## AI readability

Everything is plain words or a closed list whose entries say what they mean.
The checker answers in sentences and reports everything wrong at once.
`describeComponent(manifest)` returns a Markdown brief (touches, promises,
access, design, settings). **A model working on a component reads that brief
first and must leave every line of it true.** A change to the design goes in
the manifest first, then in the code.

## Pinning

A block names an exact version. `findComponent` matches exactly, so an update
never changes a page quietly; moving a page to a new version is a choice
somebody makes. Once code hashes are filled (step 4), a published page's
receipt pins the hash as well.

## Build order

1. ✅ Component manifest, used first on Q's own components — sign-in.
2. ✅ Blocks that name a component and a pinned version (`component` kind,
   `settingsFor`, the Q renderer, refused on static pages for now).
3. Assemble first: a Builder-style set of questions that puts existing
   components together (a booking form is mostly a date picker, a form, a
   receipt and a payment step) before anyone writes new code.
4. The sandbox: approved components run in a sandboxed frame that can only ask
   Q for what its manifest declares; code hashes pinned in page receipts.
5. Components from other authors: federation approval as receipts signed with
   the approver's DID (proposed → approved → revoked), a shared catalogue, and
   each federation approving for itself.

## Non-claims

This does **not**:

- sandbox anything yet — until step 4, only Q's own (core) components exist,
  and the tiers are enforced by the checker, not by isolation;
- pin code by hash — `code.hash` is optional until releases fill it; a pin is
  an exact version string;
- let a component run on a published site page — `staticCheck` refuses every
  component block for now;
- implement approval — tiers are declared in the manifest; approval as a
  signed receipt is step 5;
- make the old `SignIn.svelte` a component — Keys, Settings and the Q window
  still use it.

## Open questions

- **Where a federation's shared state lives** (a camping club's booking
  calendar). The incubator used nodes; device-first Q hasn't decided. Needed
  before step 5 is useful.
- Who may approve in a federation is the federation manifest's job (its
  decision modes). That manifest isn't in Q yet.
