/* Deciding, with the real Cedar (Node build). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { createEngine, ActionRefused, type CedarModule } from '../src/engine';
import { MONEY_SPEND } from '../src/core/money-spend';
import { CEDAR_VERSION } from '../src/version';
import { clubMoneySpend } from './camping-club';

const cases = JSON.parse(readFileSync(new URL('./money-spend.cases.json', import.meta.url), 'utf8'));
const engine = createEngine(cedar as unknown as CedarModule);
const ask = (change: Record<string, unknown> = {}) => ({ principal: cases.principal, resource: cases.resource, facts: { ...cases.base, ...change } });
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));

test('the engine is the Cedar version Q pins, and money.spend was written for it', () => {
	assert.equal(engine.version, CEDAR_VERSION);
	assert.equal(MONEY_SPEND.engine.cedar, CEDAR_VERSION);
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	assert.equal(pkg.dependencies['@cedar-policy/cedar-wasm'], CEDAR_VERSION, 'package.json and version.ts must agree');
});

test('every shared case decides as expected, core alone and core + club', async () => {
	const core = await engine.load([MONEY_SPEND]);
	const club = await engine.load([MONEY_SPEND, await clubMoneySpend()]);
	for (const c of cases.cases) {
		assert.equal(engine.decide(core, ask(c.change)).holds, c.core === 'allow', `core: ${c.name}`);
		assert.equal(engine.decide(club, ask(c.change)).holds, c.club === 'allow', `club: ${c.name}`);
	}
});

test('a refusal names every broken rule, as sentences', async () => {
	const club = await engine.load([MONEY_SPEND, await clubMoneySpend()]);
	const d = engine.decide(club, ask({ amountPence: 60000 }));
	assert.equal(d.holds, false);
	assert.deepEqual(d.rules, [
		'camping-club/money.spend/cannot/over-200-without-vote',
		'money.spend/cannot/exceed-budget-line',
		'money.spend/must/cite-decision-over-threshold'
	]);
	assert.ok(d.because.includes('Spend more than is left on the budget line (money.spend/cannot/exceed-budget-line)'));
});

test('outside the may, the refusal says so', async () => {
	const core = await engine.load([MONEY_SPEND]);
	const d = engine.decide(core, ask({ signers: [{ __entity: { type: 'Person', id: 'ann' } }, { __entity: { type: 'Person', id: 'dan' } }] }));
	assert.equal(d.holds, false);
	assert.deepEqual(d.rules, []);
	assert.match(d.because[0], /outside what money.spend may do/);
});

test('declared rules are listed on every decision, never passed off as checked', async () => {
	const core = await engine.load([MONEY_SPEND]);
	const d = engine.decide(core, ask());
	assert.equal(d.holds, true);
	assert.deepEqual(d.declared, ['Appear in accounts published to members within 30 days of the year end (money.spend/must/publish-accounts) — not yet checked']);
});

test('facts that do not fit the action are refused, not answered', async () => {
	const core = await engine.load([MONEY_SPEND]);
	assert.throws(() => engine.decide(core, ask({ amountPence: 'lots' })), ActionRefused);
	const { approvedByAI: _, ...missing } = cases.base;
	assert.throws(() => engine.decide(core, { ...ask(), facts: missing }), ActionRefused);
});

test('a chain whose parent hash does not match is refused', async () => {
	const club = await clubMoneySpend();
	const tampered = copy(MONEY_SPEND);
	tampered.rules['money.spend/must/two-signers'].policy = tampered.rules['money.spend/must/two-signers'].policy!.replace('< 2', '< 1');
	await assert.rejects(engine.load([tampered, club]), (e: ActionRefused) => e.problems.some((p) => p.includes('parent hash does not match')));
});

test('a definition written for another Cedar version is refused', async () => {
	const other = copy(MONEY_SPEND);
	other.engine.cedar = '4.0.0';
	await assert.rejects(engine.load([other]), (e: ActionRefused) => e.problems.some((p) => p.includes('written for Cedar 4.0.0')));
});

test('a rule that does not fit the facts is refused at load', async () => {
	const bad = copy(MONEY_SPEND);
	bad.rules['money.spend/cannot/backdate'].policy = '@id("money.spend/cannot/backdate")\nforbid (principal, action == Action::"money.spend", resource)\nwhen { context.noSuchFact };';
	await assert.rejects(engine.load([bad]), (e: ActionRefused) => e.problems.some((p) => p.includes('does not fit the facts')));
});

test('an unloaded action cannot be decided', () => {
	assert.throws(() => engine.decide('action:sha256:nothing', ask()), ActionRefused);
});

test('warm decisions are well under a millisecond', async () => {
	const club = await engine.load([MONEY_SPEND, await clubMoneySpend()]);
	const n = 1000;
	const run = () => {
		const t0 = performance.now();
		for (let i = 0; i < n; i++) engine.decide(club, ask({ amountPence: 1000 + (i % 30000) }));
		return (performance.now() - t0) / n;
	};
	run(); // warm up
	/* Best of three: other tests running alongside (turbo runs packages in
	 * parallel) slow one pass down without saying anything about the engine. */
	const per = Math.min(run(), run(), run());
	assert.ok(per < 1, `${per.toFixed(3)} ms per decision`);
});
