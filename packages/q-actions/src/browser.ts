/*
 * Cedar in a browser or a Web Worker (ADR-Q-009 §2).
 *
 * The WASM (4.3 MB, 1.4 MB gzipped) is fetched the first time this runs and
 * from then on comes from the service worker's engine cache, offline. Nothing
 * imports this at first paint: Q calls it after sign-in, in a worker, while
 * nothing else is happening, so the engine is ready before it's needed.
 *
 * For Vite apps: exclude '@cedar-policy/cedar-wasm' from optimizeDeps so the
 * `new URL('cedar_wasm_bg.wasm', import.meta.url)` inside it survives.
 */
import init, * as cedar from '@cedar-policy/cedar-wasm/web';
import { createEngine, type CedarModule, type Engine } from './engine';

let starting: Promise<Engine> | null = null;

/** The engine, started once per worker or page. */
export function browserEngine(): Promise<Engine> {
	starting ??= init().then(() => createEngine(cedar as unknown as CedarModule));
	return starting;
}
