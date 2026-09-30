// Spike runner. First run 28 Sep 2026 on Darren's Mac: 11/11 as expected.
//
//   cd spikes/cedar-actions
//   npm init -y && npm install @cedar-policy/cedar-wasm
//   node run.mjs
//
// Kept outside packages/q-core on purpose: q-core has no dependencies, and
// whether Cedar joins it is ADR-Q-009's decision, not this spike's.

import { readFileSync } from 'node:fs';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const schema = read('./money-spend.cedarschema');
const core = read('./core-money-spend.cedar');
const club = read('./camping-club-money-spend.cedar');

const P = (id) => ({ __entity: { type: 'Person', id } });

const base = {
	signers: [P('ann'), P('bob')],
	distinctSignerCount: 2,
	spendMandateHolders: [P('ann'), P('bob'), P('cat')],
	payee: P('tent-hire-ltd'),
	amountPence: 15000,
	budgetLineRemainingPence: 50000,
	thresholdPence: 25000,
	citesBudgetDecision: false,
	citesMembersVote: false,
	approvedByAI: false,
	datedBeforePrevious: false,
};

const cases = [
	['two mandate-holders, £150', {}, 'allow', 'allow'],
	['only one signer', { signers: [P('ann')], distinctSignerCount: 1 }, 'deny', 'deny'],
	['one person via two worlds', { signers: [P('ann')], distinctSignerCount: 1 }, 'deny', 'deny'],
	['signer without mandate', { signers: [P('ann'), P('dan')] }, 'deny', 'deny'],
	['payee signs', { signers: [P('ann'), P('tent-hire-ltd')], spendMandateHolders: [P('ann'), P('tent-hire-ltd')] }, 'deny', 'deny'],
	['over budget line', { amountPence: 60000 }, 'deny', 'deny'],
	['£300, no decision cited', { amountPence: 30000 }, 'deny', 'deny'],
	['£300, decision cited', { amountPence: 30000, citesBudgetDecision: true }, 'allow', 'deny'],
	['£300, decision + members vote', { amountPence: 30000, citesBudgetDecision: true, citesMembersVote: true }, 'allow', 'allow'],
	['AI approved', { approvedByAI: true }, 'deny', 'deny'],
	['backdated', { datedBeforePrevious: true }, 'deny', 'deny'],
];

// Split a policy file into { "<@id>": "<policy text>" } so decisions name rules.
function byId(text, label) {
	const parts = cedar.policySetTextToParts(text);
	if (parts.type !== 'success') throw new Error(label + ': ' + JSON.stringify(parts.errors));
	const out = {};
	for (const p of parts.policies) {
		const m = p.match(/@id\("([^"]+)"\)/);
		if (!m) throw new Error(`${label}: a policy has no @id`);
		out[m[1]] = p;
	}
	return out;
}

const coreSet = byId(core, 'core');
const clubSet = byId(club, 'camping club');

// ADR-Q-009 rule 3: a federation adds forbids only.
for (const [id, text] of Object.entries(clubSet)) {
	if (/^\s*(@[^\n]*\n\s*)*permit\b/m.test(text)) throw new Error(`camping club may not add a permit: ${id}`);
}

// Every policy must type-check against the action's schema.
for (const [label, set] of [['core', coreSet], ['core + club', { ...coreSet, ...clubSet }]]) {
	const v = cedar.validate({ schema, policies: { staticPolicies: set } });
	if (v.type !== 'success' || v.validationErrors.length) throw new Error(`${label} does not validate: ${JSON.stringify(v)}`);
}

cedar.preparseSchema('money.spend', schema);
cedar.preparsePolicySet('core', { staticPolicies: coreSet });
cedar.preparsePolicySet('club', { staticPolicies: { ...coreSet, ...clubSet } });

function decide(set, context) {
	const r = cedar.statefulIsAuthorized({
		principal: { type: 'Person', id: 'ann' },
		action: { type: 'Action', id: 'money.spend' },
		resource: { type: 'Ledger', id: 'club-ledger' },
		context,
		preparsedSchemaName: 'money.spend',
		validateRequest: true,
		preparsedPolicySetId: set,
		entities: [],
	});
	if (r.type !== 'success') throw new Error(JSON.stringify(r.errors));
	const why = r.response.diagnostics.reason;
	// Default deny names no rule; say what it means.
	if (r.response.decision === 'deny' && why.length === 0) why.push('outside money.spend/may/record (no permit matched)');
	return { decision: r.response.decision, why };
}

let failed = 0;
for (const [name, change, wantCore, wantClub] of cases) {
	const ctx = { ...base, ...change };
	const a = decide('core', ctx);
	const b = decide('club', ctx);
	const ok = a.decision === wantCore && b.decision === wantClub;
	if (!ok) failed++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: core=${a.decision} club=${b.decision}  ${JSON.stringify(b.why)}`);
}

// Warm timing: parsing is done once above; this is the per-receipt cost.
const N = 2000;
const t0 = performance.now();
for (let i = 0; i < N; i++) decide('club', { ...base, amountPence: 1000 + (i % 30000) });
const per = (performance.now() - t0) / N;
console.log(`\nCedar ${cedar.getCedarVersion()}: ${per.toFixed(3)} ms per decision (warm, ${N} runs)`);

console.log(failed ? `${failed} failed` : 'all as expected');
process.exit(failed ? 1 : 0);
