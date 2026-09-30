/*
 * Q's rule engine, as the page sees it (ADR-Q-009 §2).
 *
 * Signing in wakes it: once the passkey has answered and the browser is idle,
 * Q starts Cedar in its own worker and loads the core actions, so by the time
 * anyone acts, the engine is already there. Signing out puts it to sleep.
 *
 * The first time on a device, Cedar is downloaded (1.4 MB gzipped) and kept
 * in the service worker's engine cache; after that it comes from the device,
 * offline. Each decision then takes about a quarter of a millisecond.
 *
 *   warmEngine()          start, once; safe to call on every sign-in
 *   decide(action, ask)   the answer, with the rules that decided it
 *   loadAction(chain)     another action (a federation's), returns its hash
 *   watchEngine(fn)       what the engine is doing, for the page to say
 *   sleepEngine()         stop, forget everything loaded
 */
import { CORE_ACTIONS, type Ask, type Decision } from '@inqbeta/q-actions';
import type { ActionDefinition } from '@inqbeta/q-actions/actions';
import type { EngineReply, EngineRequest } from './engine.worker';

export interface EngineState {
	state: 'asleep' | 'waking' | 'ready' | 'failed';
	/** Cedar version, once started. */
	version?: string;
	/** Milliseconds from waking to ready — download (first time) or cache, plus loading the core actions. */
	tookMs?: number;
	/** Loaded actions: id → hash. */
	actions: Record<string, string>;
	/** What went wrong, in a sentence. */
	problem?: string;
}

/* Omit spread over each kind of request, not the union as a whole. */
type Request = EngineRequest extends infer R ? (R extends EngineRequest ? Omit<R, 'id'> : never) : never;

type Waiting = { resolve: (v: unknown) => void; reject: (e: EngineRefused) => void };

export class EngineRefused extends Error {
	problems: string[];
	constructor(problems: string[]) {
		super(problems.join(' '));
		this.problems = problems;
	}
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, Waiting>();
let waking: Promise<void> | null = null;
let now: EngineState = { state: 'asleep', actions: {} };
const listeners = new Set<(s: EngineState) => void>();

function set(s: EngineState) {
	now = s;
	for (const fn of listeners) fn(now);
}

function call<T>(request: Request): Promise<T> {
	if (!worker) {
		worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (e: MessageEvent<EngineReply>) => {
			const w = waiting.get(e.data.id);
			if (!w) return;
			waiting.delete(e.data.id);
			if (e.data.ok) w.resolve(e.data.value);
			else w.reject(new EngineRefused(e.data.problems));
		};
		worker.onerror = (e) => {
			const problem = `The engine stopped: ${e.message || 'no reason given'}.`;
			for (const w of waiting.values()) w.reject(new EngineRefused([problem]));
			waiting.clear();
			set({ ...now, state: 'failed', problem });
		};
	}
	const id = nextId++;
	return new Promise<T>((resolve, reject) => {
		waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
		worker!.postMessage({ ...request, id } as EngineRequest);
	});
}

/** Start the engine and load the core actions. Once; later calls share it. */
export function warmEngine(): Promise<void> {
	if (typeof Worker === 'undefined') return Promise.resolve();
	waking ??= (async () => {
		const t0 = performance.now();
		set({ state: 'waking', actions: {} });
		try {
			const version = await call<string>({ type: 'start' });
			const actions: Record<string, string> = {};
			for (const a of CORE_ACTIONS) actions[a.id] = await call<string>({ type: 'load', chain: [a] });
			set({ state: 'ready', version, actions, tookMs: Math.round(performance.now() - t0) });
		} catch (e) {
			waking = null;
			set({ state: 'failed', actions: {}, problem: e instanceof EngineRefused ? e.problems.join(' ') : String(e) });
		}
	})();
	return waking;
}

/** Wake the engine when the browser has a moment — never in the way of the first screen. */
export function warmWhenIdle(): void {
	if (typeof window === 'undefined' || now.state !== 'asleep') return;
	const go = () => void warmEngine();
	if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 2000 });
	else setTimeout(go, 300);
}

/** Load another action chain [core, …derived]; returns the hash receipts will cite. */
export async function loadAction(chain: ActionDefinition[]): Promise<string> {
	await warmEngine();
	const hash = await call<string>({ type: 'load', chain });
	set({ ...now, actions: { ...now.actions, [`${chain[0].id}@${chain[chain.length - 1].by}`]: hash } });
	return hash;
}

/** The hash of a loaded core action, by id — what a receipt cites. */
export async function actionHash(id: string): Promise<string> {
	await warmEngine();
	const hash = now.actions[id];
	if (!hash) throw new EngineRefused([now.problem ?? `The engine has no ${id} loaded.`]);
	return hash;
}

/** Decide one receipt from its facts. Refuses (EngineRefused) when the facts don't fit. */
export async function decide(action: string, ask: Ask): Promise<Decision> {
	await warmEngine();
	return call<Decision>({ type: 'decide', action, ask });
}

export function watchEngine(fn: (s: EngineState) => void): () => void {
	listeners.add(fn);
	fn(now);
	return () => listeners.delete(fn);
}

/** On sign-out: stop the worker and forget everything loaded. */
export function sleepEngine(): void {
	worker?.terminate();
	worker = null;
	waking = null;
	for (const w of waiting.values()) w.reject(new EngineRefused(['The engine was put to sleep.']));
	waiting.clear();
	set({ state: 'asleep', actions: {} });
}
