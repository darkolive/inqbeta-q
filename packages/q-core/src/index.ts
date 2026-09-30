export * from './canonical';
export * from './did';
export * from './seal';
export * from './vault';
export * from './storage';
export * from './passkey';
export * from './links';
export * from './permissions';
/* UCAN, as a namespace: ucan.delegate, ucan.checkInvocation, ucan.CID … */
export * as ucan from './ucan/index';
/* folder.ts and replicas.ts touch IndexedDB and the File System Access API only
 * when called, so importing them is safe anywhere. */
export * from './fsx';
export * from './zip';
export * from './browser';
export * from './keeping';
export * from './lifecycle';
export * from './places';
export * from './ways-in';
export * from './revocation';
export * from './chain';
export * from './archive';
export * from './bands';
export * from './touches';
export * from './assurance';
export * from './corroboration';
export * from './blocks';
export * from './pages';
export * from './style';
export * from './mainline';
export * from './folder';
export * from './replicas';
/* receipts.ts connects to the receipt kernel (kernel-spin) */
export * from './receipts';
/* offline-queue.ts for offline receipt sync */
export * from './offline-queue';
/* evidence-bundle.ts for ADR-006 bundle format */
export * from './evidence-bundle';
/* offline-exchange.ts for ADR-008 offline receipts */
export * from './offline-exchange';
/* dgraph.ts for indexed queries */
export * from './dgraph';
/* seaweedfs.ts for file replication */
export * from './seaweedfs';
/* session.ts for session management */
export * from './session';
/* access.ts for hybrid access control */
export * from './access';
/* taxonomy.ts for evidence taxonomy */
export * from './taxonomy';
/* keys.ts for key types and conditions */
export * from './keys';
/* second-factor.ts for 2FA */
export * from './second-factor';
/* zk-2fa.ts for zero-knowledge 2FA */
export * from './zk-2fa';
/* questions.ts — schema as questions; answers as triples */
export * from './questions';
/* triggers.ts — receipt lifecycle triggers */
export * from './triggers';
/* cards.ts — what you show, to whom, for what */
export * from './cards';
/* channels.ts — the ways you can be reached, sealed and proved */
export * from './channels';
/* contacts.ts for ZK contact exchange */
export * from './contacts';
/* exchange.ts for events & exchanges */
export * from './exchange';
/* federation.ts for federation management */
export * from './federation';
/*
 * ui-receipts.ts is gone (2026-09-20).
 *
 * It declared block NAMES with `props?: Record<string, any>` and a
 * renderPage() that returned JSON.stringify — a vocabulary nothing drew and a
 * shape that could carry anything. blocks.ts and pages.ts replace it with a
 * closed vocabulary, settings as questions, and a compiled page.
 *
 * Receipts written in the old shape are still READ, for ever: the pages
 * recogniser in apps/q knows both spellings of it. What is deleted is the way
 * to write more, not the ability to read what was written.
 */
