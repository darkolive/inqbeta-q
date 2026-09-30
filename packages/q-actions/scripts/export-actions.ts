/*
 * Writes the money.spend chains as JSON, so the Rust cross-check
 * (spikes/cedar-rust) decides from exactly the same definitions.
 *
 *   pnpm --filter @inqbeta/q-actions export-actions
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { hashAction } from '../src/actions';
import { createEngine, type CedarModule } from '../src/engine';
import { MONEY_SPEND } from '../src/core/money-spend';
import { clubMoneySpend } from '../test/camping-club';

const club = await clubMoneySpend();
const cases = JSON.parse(readFileSync(new URL('../test/money-spend.cases.json', import.meta.url), 'utf8'));

// What the WASM engine decides, rule ids included — the Rust side must match exactly.
const engine = createEngine(cedar as unknown as CedarModule);
const loaded = { core: await engine.load([MONEY_SPEND]), club: await engine.load([MONEY_SPEND, club]) };
const expected = cases.cases.map((c: { name: string; change: Record<string, unknown> }) => {
	const ask = { principal: cases.principal, resource: cases.resource, facts: { ...cases.base, ...c.change } };
	const d = (k: 'core' | 'club') => {
		const r = engine.decide(loaded[k], ask);
		return { holds: r.holds, rules: r.rules };
	};
	return { name: c.name, facts: ask.facts, core: d('core'), club: d('club') };
});

const out = {
	about: 'Exported by packages/q-actions/scripts/export-actions.ts. Do not edit; re-export.',
	cedar: engine.version,
	principal: cases.principal,
	resource: cases.resource,
	chains: {
		core: { hash: loaded.core, chain: [MONEY_SPEND] },
		club: { hash: loaded.club, chain: [MONEY_SPEND, club] }
	},
	expected
};
if (loaded.core !== (await hashAction(MONEY_SPEND)) || loaded.club !== (await hashAction(club))) throw new Error('hash mismatch');
const path = new URL('../../../spikes/cedar-rust/money-spend.actions.json', import.meta.url);
writeFileSync(path, JSON.stringify(out, null, '\t') + '\n');
console.log(`wrote ${path.pathname}`);
