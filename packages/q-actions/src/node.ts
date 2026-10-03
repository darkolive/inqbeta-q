/*
 * Cedar on a server (Node): the same engine, for the host's own decisions —
 * the mint signs nothing the rules haven't allowed (ADR-Q-027).
 */
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { createEngine, type CedarModule, type Engine } from './engine';

let engine: Engine | null = null;

/** The engine, started once per server instance. */
export function nodeEngine(): Engine {
	engine ??= createEngine(cedar as unknown as CedarModule);
	return engine;
}
