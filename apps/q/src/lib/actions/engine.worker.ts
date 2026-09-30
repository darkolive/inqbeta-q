/// <reference lib="webworker" />
/*
 * The rule engine's own thread (ADR-Q-009 §2).
 *
 * Cedar lives here so starting it, and every decision, happens off the main
 * thread: the screen never waits on it. The page talks to it only through
 * lib/actions/engine.ts.
 */
import { browserEngine } from '@inqbeta/q-actions/browser';
import { ActionRefused, type Ask } from '@inqbeta/q-actions/engine';
import type { ActionDefinition } from '@inqbeta/q-actions/actions';

export type EngineRequest =
	| { id: number; type: 'start' }
	| { id: number; type: 'load'; chain: ActionDefinition[] }
	| { id: number; type: 'decide'; action: string; ask: Ask };

export type EngineReply = { id: number; ok: true; value: unknown } | { id: number; ok: false; problems: string[] };

const post = (m: EngineReply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (event: MessageEvent<EngineRequest>) => {
	const m = event.data;
	try {
		const engine = await browserEngine();
		if (m.type === 'start') post({ id: m.id, ok: true, value: engine.version });
		else if (m.type === 'load') post({ id: m.id, ok: true, value: await engine.load(m.chain) });
		else post({ id: m.id, ok: true, value: engine.decide(m.action, m.ask) });
	} catch (e) {
		post({
			id: m.id,
			ok: false,
			problems: e instanceof ActionRefused ? e.problems : [e instanceof Error ? e.message : String(e)]
		});
	}
};
