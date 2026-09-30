/*
 * Actions (ADR-Q-008, ADR-Q-009).
 *
 * An action is something that can happen — `money.spend`, `member.join`. Its
 * definition says what a receipt of it must carry, what it may do, and what it
 * cannot do. The enforced rules are Cedar policies: one permit per *may*, a
 * forbid for every *must* and *cannot*. A receipt is an action that happened.
 *
 * This file has no dependency on Cedar. It checks the shape of a definition,
 * hashes it, derives a federation's version, and describes it for a person or
 * a model. `engine.ts` does the deciding.
 */
import { canonical, sha256 } from '@inqbeta/q-core/canonical';

export const ACTION_SCHEMA = 'inqbeta.action/1';

export type RuleKind = 'may' | 'must' | 'cannot';
export const RULE_KINDS: { id: RuleKind; means: string }[] = [
	{ id: 'may', means: 'What the action can do. A permit. Anything not listed is impossible.' },
	{ id: 'must', means: 'What every receipt of this action has to carry or satisfy. A forbid that fires when it is missing.' },
	{ id: 'cannot', means: 'A lock: something the action can never do. A forbid; it beats every may.' }
];

export type Checked = 'enforced' | 'declared';
export const CHECKED: { id: Checked; means: string }[] = [
	{ id: 'enforced', means: 'Decided by the engine on every receipt.' },
	{ id: 'declared', means: 'Stated, but not yet checked mechanically. Shown as such; never presented as enforced.' }
];

export interface Rule {
	kind: RuleKind;
	/** One plain sentence. */
	says: string;
	checked: Checked;
	/** Cedar policy text, with `@id("<rule id>")`. Required when enforced; absent when declared. */
	policy?: string;
}

export interface ActionDefinition {
	schema: typeof ACTION_SCHEMA;
	/** What happens: `money.spend`. Lower case, dot-separated. */
	id: string;
	version: string;
	/** `q:core` for a core action; the federation's DID for a derived one. */
	by: string;
	/** One sentence: what this action is. */
	says: string;
	/** Hash of the action this one derives from. Core actions have none. */
	parent?: string;
	/** The exact Cedar version the rules were written and tested against. */
	engine: { cedar: string };
	/**
	 * Core only: the Cedar schema — the facts a receipt of this action is judged
	 * on. Derived actions use their parent's facts (ADR-Q-009 open question).
	 */
	facts?: string;
	rules: Record<string, Rule>;
}

export interface ActionCheck {
	ok: boolean;
	/** Every problem at once, each a sentence. */
	problems: string[];
}

const ACTION_ID = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const VERSION = /^\d+\.\d+\.\d+$/;

/** `permit` or `forbid`: the first word after annotations and comments. */
export function effectOf(policy: string): 'permit' | 'forbid' | null {
	const body = policy
		.replace(/\/\/[^\n]*/g, '')
		.replace(/@[a-zA-Z_]+\s*\(\s*"(?:[^"\\]|\\.)*"\s*\)/g, '')
		.trim();
	const m = body.match(/^(permit|forbid)\b/);
	return m ? (m[1] as 'permit' | 'forbid') : null;
}

function annotatedId(policy: string): string | null {
	const m = policy.match(/@id\s*\(\s*"([^"]+)"\s*\)/);
	return m ? m[1] : null;
}

function countPolicies(policy: string): number {
	return (policy.replace(/\/\/[^\n]*/g, '').match(/\b(permit|forbid)\s*\(/g) ?? []).length;
}

/**
 * Rule ids say whose rule it is, which action, which kind, and a slug:
 *   core:     money.spend/cannot/payee-signs
 *   derived:  camping-club/money.spend/cannot/over-200-without-vote
 */
export function ruleIdParts(ruleId: string): { owner: string | null; action: string; kind: string; slug: string } | null {
	const parts = ruleId.split('/');
	if (parts.length === 3) return { owner: null, action: parts[0], kind: parts[1], slug: parts[2] };
	if (parts.length === 4) return { owner: parts[0], action: parts[1], kind: parts[2], slug: parts[3] };
	return null;
}

export function checkActionDefinition(input: unknown): ActionCheck {
	const problems: string[] = [];
	const say = (s: string) => problems.push(s);
	if (!input || typeof input !== 'object') return { ok: false, problems: ['An action definition must be an object.'] };
	const a = input as Partial<ActionDefinition>;

	if (a.schema !== ACTION_SCHEMA) say(`The schema must be "${ACTION_SCHEMA}".`);
	if (typeof a.id !== 'string' || !ACTION_ID.test(a.id)) say('The id must be lower-case words joined by dots, like "money.spend".');
	if (typeof a.version !== 'string' || !VERSION.test(a.version)) say('The version must look like 1.0.0.');
	if (typeof a.by !== 'string' || !a.by) say('It must say who it is by: "q:core" or the federation\'s DID.');
	if (typeof a.says !== 'string' || !a.says.trim()) say('It must say, in one sentence, what the action is.');
	if (!a.engine || typeof a.engine.cedar !== 'string' || !VERSION.test(a.engine.cedar)) say('It must name the exact Cedar version its rules were written for.');

	const derived = a.parent !== undefined;
	if (derived) {
		if (typeof a.parent !== 'string' || !a.parent.startsWith('action:sha256:')) say('The parent must be an action hash ("action:sha256:…").');
		if (a.by === 'q:core') say('A derived action is by a federation, not by "q:core".');
		if (a.facts !== undefined) say('A derived action uses its parent\'s facts; it cannot bring its own.');
	} else {
		if (a.by !== 'q:core') say('Only Q core publishes actions with no parent. A federation derives from one.');
		if (typeof a.facts !== 'string' || !a.facts.trim()) say('A core action must give its facts (a Cedar schema).');
	}

	const rules = a.rules;
	if (!rules || typeof rules !== 'object' || !Object.keys(rules).length) {
		say('It must have at least one rule.');
		return { ok: false, problems };
	}

	let mays = 0;
	for (const [rid, rule] of Object.entries(rules)) {
		const parts = ruleIdParts(rid);
		if (!parts) {
			say(`Rule "${rid}": its id must be "<action>/<kind>/<slug>" (core) or "<owner>/<action>/<kind>/<slug>" (derived).`);
			continue;
		}
		if (parts.action !== a.id) say(`Rule "${rid}": its id names "${parts.action}", but this action is "${a.id}".`);
		if (derived && parts.owner === null) say(`Rule "${rid}": a derived action's rules start with the owner, so they can never be mistaken for core rules.`);
		if (!derived && parts.owner !== null) say(`Rule "${rid}": a core rule id has no owner prefix.`);
		if (!SLUG.test(parts.slug)) say(`Rule "${rid}": the last part must be lower-case words joined by hyphens.`);
		if (!rule || typeof rule !== 'object') {
			say(`Rule "${rid}" must be an object.`);
			continue;
		}
		if (!RULE_KINDS.some((k) => k.id === rule.kind)) say(`Rule "${rid}": kind must be may, must or cannot.`);
		else if (parts.kind !== rule.kind) say(`Rule "${rid}": its id says "${parts.kind}" but its kind is "${rule.kind}".`);
		if (typeof rule.says !== 'string' || !rule.says.trim()) say(`Rule "${rid}" must say what it means in one sentence.`);
		if (!CHECKED.some((c) => c.id === rule.checked)) say(`Rule "${rid}": checked must be "enforced" or "declared".`);
		if (rule.kind === 'may') mays++;
		if (derived && rule.kind === 'may') say(`Rule "${rid}": a federation adds forbids only — it cannot add a may (ADR-Q-009 rule 3).`);

		if (rule.checked === 'declared') {
			if (rule.policy !== undefined) say(`Rule "${rid}" is declared, so it has no policy yet; mark it enforced when it has one.`);
			if (rule.kind === 'may') say(`Rule "${rid}": a may must be enforced — something the engine cannot see permitted is not permitted.`);
			continue;
		}
		if (typeof rule.policy !== 'string' || !rule.policy.trim()) {
			say(`Rule "${rid}" is enforced, so it needs its Cedar policy.`);
			continue;
		}
		if (countPolicies(rule.policy) !== 1) say(`Rule "${rid}": its policy text must hold exactly one policy.`);
		if (annotatedId(rule.policy) !== rid) say(`Rule "${rid}": its policy must carry @id("${rid}").`);
		const effect = effectOf(rule.policy);
		const want = rule.kind === 'may' ? 'permit' : 'forbid';
		if (effect !== want) say(`Rule "${rid}": a ${rule.kind} rule is a ${want}, but its policy is ${effect ?? 'neither'}.`);
		const scoped = new RegExp(`action\\s*==\\s*Action::"${String(a.id).replace(/\./g, '\\.')}"`);
		if (!scoped.test(rule.policy)) say(`Rule "${rid}": its policy must be limited to this action (action == Action::"${a.id}").`);
	}
	if (!derived && mays === 0) say('A core action needs at least one may; with none, nothing it describes could ever happen.');

	return { ok: problems.length === 0, problems };
}

/** The action's identity: the hash of its canonical form. */
export async function hashAction(a: ActionDefinition): Promise<string> {
	return `action:sha256:${await sha256(canonical(a))}`;
}

/**
 * A federation's version of an action: the parent's hash, plus forbids only.
 * The result still has to pass checkActionDefinition.
 */
export async function deriveAction(
	parent: ActionDefinition,
	own: { by: string; version: string; says: string; rules: Record<string, Omit<Rule, 'kind'> & { kind: 'must' | 'cannot' }> }
): Promise<ActionDefinition> {
	return {
		schema: ACTION_SCHEMA,
		id: parent.id,
		version: own.version,
		by: own.by,
		says: own.says,
		parent: await hashAction(parent),
		engine: { cedar: parent.engine.cedar },
		rules: own.rules
	};
}

/** Every rule of a chain [core, …derived], in order. */
export function rulesOf(chain: ActionDefinition[]): [string, Rule][] {
	return chain.flatMap((a) => Object.entries(a.rules));
}

/**
 * A Markdown brief of an action, for a person or a model. A model changing an
 * action reads this first and must leave every line of it true.
 */
export function describeAction(chain: ActionDefinition[]): string {
	const top = chain[chain.length - 1];
	const lines = [`# ${top.id} ${top.version}`, '', top.says, '', `By ${top.by}${top.parent ? `, derived from ${top.parent}` : ''}. Cedar ${top.engine.cedar}.`];
	for (const kind of RULE_KINDS) {
		const rs = rulesOf(chain).filter(([, r]) => r.kind === kind.id);
		if (!rs.length) continue;
		lines.push('', `## ${kind.id === 'may' ? 'May' : kind.id === 'must' ? 'Must' : 'Cannot'}`, '', `_${kind.means}_`, '');
		for (const [rid, r] of rs) lines.push(`- **${r.says}** \`${rid}\`${r.checked === 'declared' ? ' — declared, not yet checked' : ''}`);
	}
	return lines.join('\n');
}
