/*
 * The one Cedar version Q decides with (ADR-Q-009 §2).
 *
 * Every action definition names it (`engine.cedar`); the engine refuses a
 * definition written for another; the service worker names the engine's own
 * cache after it, so a deploy never throws the engine away — only a
 * deliberate Cedar upgrade does. Change it here, with package.json, and
 * re-run the Rust and Spin cross-checks.
 */
export const CEDAR_VERSION = '4.13.0';
