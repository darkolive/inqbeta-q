/*
 * The engine (ADR-Q-009 §2, §4): decides, on the spot, whether a receipt keeps
 * its action's rules.
 *
 * Cedar is passed in rather than imported, so an app can load its 4 MB of WASM
 * only when something needs deciding, and tests can use the Node build.
 *
 *   kernel (signatures, chain, K1–K8)  →  facts from the chain  →  here
 *
 * This file sees only the facts. It never fetches anything: an action is
 * loaded by the definitions themselves, checked against their hashes.
 */
import { checkActionDefinition, hashAction, rulesOf, type ActionDefinition, type Rule } from './actions';

/** The part of `@cedar-policy/cedar-wasm` the engine uses. */
export interface CedarModule {
	getCedarVersion(): string;
	preparseSchema(name: string, schema: string): { type: string; errors?: unknown };
	preparsePolicySet(id: string, policies: { staticPolicies: Record<string, string> }): { type: string; errors?: unknown };
	validate(call: { schema: string; policies: { staticPolicies: Record<string, string> } }): {
		type: string;
		validationErrors?: { policyId: string; error: { message: string } }[];
		errors?: unknown;
	};
	statefulIsAuthorized(call: {
		principal: { type: string; id: string };
		action: { type: string; id: string };
		resource: { type: string; id: string };
		context: Record<string, unknown>;
		preparsedSchemaName: string;
		preparsedPolicySetId: string;
		validateRequest: boolean;
		entities: unknown[];
	}): { type: string; response?: { decision: 'allow' | 'deny'; diagnostics: { reason: string[]; errors: unknown[] } }; errors?: unknown };
}

export interface Ask {
	/** Who is acting, as the action's facts name them: `{ type: 'Person', id: 'did:key:…' }`. */
	principal: { type: string; id: string };
	/** What it acts on: `{ type: 'Ledger', id: '…' }`. */
	resource: { type: string; id: string };
	/** The facts, gathered from the receipt and its chain. */
	facts: Record<string, unknown>;
}

export interface Decision {
	/** Does the receipt keep its action's rules? */
	holds: boolean;
	/** Rule ids that decided it: the may that allowed it, or every rule broken. */
	rules: string[];
	/** The same, as sentences. */
	because: string[];
	/** Rules that apply but aren't checked yet, so nobody mistakes them for enforced. */
	declared: string[];
}

export class ActionRefused extends Error {
	problems: string[];
	constructor(problems: string[]) {
		super(problems.join(' '));
		this.problems = problems;
	}
}

interface Loaded {
	id: string;
	schemaName: string;
	rules: Map<string, Rule>;
}

export function createEngine(cedar: CedarModule) {
	const version = cedar.getCedarVersion();
	const loaded = new Map<string, Loaded>();

	/**
	 * Load an action and everything it derives from: [core, …derived]. Returns
	 * the hash the receipt will cite. Refuses — with every reason at once — if
	 * any link is malformed, a parent hash doesn't match, the Cedar version
	 * differs (another version might decide differently), or a policy doesn't
	 * fit the facts.
	 */
	async function load(chain: ActionDefinition[]): Promise<string> {
		const problems: string[] = [];
		if (!chain.length) throw new ActionRefused(['Nothing to load.']);
		const hashes: string[] = [];
		for (const [i, a] of chain.entries()) {
			const c = checkActionDefinition(a);
			problems.push(...c.problems.map((p) => `${a?.id ?? '?'} ${a?.version ?? ''} (${a?.by ?? '?'}): ${p}`));
			hashes.push(await hashAction(a));
			if (i === 0 && a.parent !== undefined) problems.push('The first action in the chain must be a core action.');
			if (i > 0 && a.parent !== hashes[i - 1]) problems.push(`${a.id} (${a.by}): its parent hash does not match the action before it.`);
			if (i > 0 && a.id !== chain[0].id) problems.push(`${a.by}: derives "${a.id}" from "${chain[0].id}" — an action can only derive from itself.`);
			if (a.engine?.cedar !== version) problems.push(`${a.id} (${a.by}): written for Cedar ${a.engine?.cedar}, but this engine is Cedar ${version}.`);
		}
		if (problems.length) throw new ActionRefused(problems);

		const top = hashes[hashes.length - 1];
		if (loaded.has(top)) return top;

		const facts = chain[0].facts as string;
		const all = rulesOf(chain);
		const policies: Record<string, string> = {};
		for (const [rid, r] of all) if (r.checked === 'enforced' && r.policy) policies[rid] = r.policy;

		const v = cedar.validate({ schema: facts, policies: { staticPolicies: policies } });
		if (v.type !== 'success') throw new ActionRefused([`The rules could not be checked against the facts: ${JSON.stringify(v.errors)}`]);
		if (v.validationErrors?.length) throw new ActionRefused(v.validationErrors.map((e) => `Rule "${e.policyId}" does not fit the facts: ${e.error.message}`));

		const schemaName = hashes[0];
		const s = cedar.preparseSchema(schemaName, facts);
		if (s.type !== 'success') throw new ActionRefused([`The facts could not be read: ${JSON.stringify(s.errors)}`]);
		const p = cedar.preparsePolicySet(top, { staticPolicies: policies });
		if (p.type !== 'success') throw new ActionRefused([`The rules could not be read: ${JSON.stringify(p.errors)}`]);

		loaded.set(top, { id: chain[0].id, schemaName, rules: new Map(all) });
		return top;
	}

	/** Decide one receipt. The action must have been loaded. */
	function decide(actionHash: string, ask: Ask): Decision {
		const a = loaded.get(actionHash);
		if (!a) throw new ActionRefused([`Action ${actionHash} is not loaded.`]);
		const r = cedar.statefulIsAuthorized({
			principal: ask.principal,
			action: { type: 'Action', id: a.id },
			resource: ask.resource,
			context: ask.facts,
			preparsedSchemaName: a.schemaName,
			preparsedPolicySetId: actionHash,
			validateRequest: true,
			entities: []
		});
		// Facts that don't fit the action's schema are a refusal, not an answer.
		if (r.type !== 'success' || !r.response) throw new ActionRefused([`The facts do not fit ${a.id}: ${JSON.stringify(r.errors)}`]);
		if (r.response.diagnostics.errors.length) throw new ActionRefused([`A rule of ${a.id} could not be evaluated: ${JSON.stringify(r.response.diagnostics.errors)}`]);

		const holds = r.response.decision === 'allow';
		const rules = [...r.response.diagnostics.reason].sort();
		const because = rules.map((rid) => `${a.rules.get(rid)?.says ?? rid} (${rid})`);
		if (!holds && rules.length === 0) because.push(`It is outside what ${a.id} may do: no may rule allows it.`);
		const declared = [...a.rules].filter(([, r]) => r.checked === 'declared').map(([rid, r]) => `${r.says} (${rid}) — not yet checked`);
		return { holds, rules, because, declared };
	}

	return { version, load, decide };
}

export type Engine = ReturnType<typeof createEngine>;
