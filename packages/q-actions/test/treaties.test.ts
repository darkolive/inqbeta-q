/* treaty.agree / .trade / .settle / .end: real records from q-core, decided by real Cedar (ADR-Q-042, E4). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { identityFromSeed, signerFor } from '@inqbeta/q-core/passkey';
import { b64url } from '@inqbeta/q-core/canonical';
import { foundFederation, newDraft } from '@inqbeta/q-core/federations';
import { takeUp } from '@inqbeta/q-core/inrole';
import { agreeSettlement, agreeTreaty, makeBankingCard, proposeSettlement, proposeTreaty, settlementParts, type Side } from '@inqbeta/q-core/treaties';
import { checkActionDefinition, type ActionDefinition } from '../src/actions';
import { createEngine, type CedarModule } from '../src/engine';
import { TREATY_ACTIONS, TREATY_AGREE, TREATY_SETTLE, TREATY_TRADE, treatyAgreeFacts, treatySettleFacts, treatyTradeFacts } from '../src/core/treaties';
import { CORE_ACTIONS } from '../src/index';

const engine = createEngine(cedar as unknown as CedarModule);
const NOW = new Date('2026-10-06T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 37 + n) % 251);
const NONE = { kind: 'none' } as const;

async function treaty() {
	const ana = await identityFromSeed(seed(1));
	const bo = await identityFromSeed(seed(2));
	const inc = await foundFederation(signerFor(ana), { ...newDraft(NOW), name: 'Incubator', purpose: 'Commons.' }, { now: NOW });
	const dos = await foundFederation(signerFor(bo), { ...newDraft(NOW), name: 'Dark Olive', purpose: 'Courses.' }, { now: NOW });
	const cardA = await makeBankingCard(inc.key, { name: 'Incubator', sortCode: '123456', account: '12345678' }, { currency: 'GBP' }, NOW);
	const cardB = await makeBankingCard(dos.key, { name: 'Dark Olive CIC', sortCode: '654321', account: '87654321' }, { currency: 'GBP' }, NOW);
	const side = (f: typeof inc, name: string, card: string): Side => ({ federation: f.founding.federation, name, mint: f.founding.federation, currency: 'GBP', mode: 'test', bankingCard: card });
	const terms = { a: side(inc, 'Incubator', cardA.contentHash), b: side(dos, 'Dark Olive', cardB.contentHash), purpose: { ethics: ['CICs with an asset lock'], offered: [], sought: [] }, rate: { kind: 'par' } as const, cap: { credits: 500 }, period: 7 as const, excludes: ['rooms'], until: null };
	const t = await agreeTreaty(await proposeTreaty(signerFor(inc.key), signerFor(ana), 'caretaker', terms, NOW), signerFor(dos.key), signerFor(bo), 'caretaker');
	const acting = async (who: typeof ana, fed: typeof inc) => ({ federation: fed.founding.federation, office: 'caretaker', mandates: [b64url(fed.grant.bytes)], takenUp: await takeUp(who, { federation: fed.founding.federation, name: fed.founding.name, office: 'caretaker', declaration: NONE }, NOW) });
	return { ana, bo, inc, dos, t, actingA: await acting(ana, inc), actingB: await acting(bo, dos) };
}
async function decide(action: ActionDefinition, did: string, fed: string, facts: Record<string, unknown>) {
	const h = await engine.load([action]);
	return engine.decide(h, { principal: { type: 'Person', id: did }, resource: { type: 'Federation', id: fed }, facts });
}

test('the treaty actions are well formed, and loaded with the core', () => {
	for (const a of TREATY_ACTIONS) assert.deepEqual(checkActionDefinition(a), { ok: true, problems: [] }, a.id);
	for (const a of TREATY_ACTIONS) assert.ok(CORE_ACTIONS.includes(a), a.id);
});

test('agreed by both keys with their caretakers in role: it holds; without a holder in role, it doesn’t', async () => {
	const { ana, t, actingA, actingB } = await treaty();
	const ok = await decide(TREATY_AGREE, ana.did, t.a.federation, await treatyAgreeFacts(t, { actingA, actingB, now: NOW }));
	assert.equal(ok.holds, true, ok.because.join(' '));
	assert.ok(ok.declared.some((x) => x.includes('AI')));
	const noRole = await decide(TREATY_AGREE, ana.did, t.a.federation, await treatyAgreeFacts(t, { actingA, now: NOW }));
	assert.equal(noRole.holds, false);
	assert.ok(noRole.rules.some((r) => r.includes('treaty.agree/must/holders')));
	const half = await decide(TREATY_AGREE, ana.did, t.a.federation, await treatyAgreeFacts({ ...t, signatures: t.signatures.filter((s) => s.side === 'a') }, { actingA, actingB, now: NOW }));
	assert.equal(half.holds, false, 'one side alone is only a proposal');
});

test('a trade: in force and within the cap holds; suspended, over the cap, a gift, excluded or at another rate, refused', async () => {
	const { ana, t } = await treaty();
	const go = (o: Parameters<typeof treatyTradeFacts>[1]) => decide(TREATY_TRADE, ana.did, t.b.federation, treatyTradeFacts(t, o));
	assert.equal((await go({ standing: { state: 'in-force' }, held: 1000, adding: 500 })).holds, true);
	const cases: [string, Parameters<typeof treatyTradeFacts>[1]][] = [
		['suspended', { standing: { state: 'suspended' }, held: 0, adding: 100 }],
		['cap', { standing: { state: 'in-force' }, held: 49_900, adding: 500 }],
		['gift', { standing: { state: 'in-force' }, adding: 100, isCapacityGift: true }],
		['excluded', { standing: { state: 'in-force' }, adding: 100, service: 'rooms' }],
		['rate', { standing: { state: 'in-force' }, adding: 100, rateUsed: 0.9 }],
		['test-live', { standing: { state: 'in-force' }, adding: 100, payerMode: 'live' }]
	];
	for (const [slug, o] of cases) {
		const d = await go(o);
		assert.equal(d.holds, false, slug);
		assert.ok(d.rules.some((r) => r.includes(`treaty.trade/cannot/${slug}`)), `${slug}: ${d.rules.join(' ')}`);
	}
	const none = await decide(TREATY_TRADE, ana.did, t.b.federation, treatyTradeFacts(null, {}));
	assert.ok(none.rules.some((r) => r.includes('treaty.trade/cannot/no-treaty')), 'no treaty, no trade across federations');
});

test('a settlement both sign holds; paying what could be swapped, or with the valve shut, is refused', async () => {
	const { ana, inc, dos, t } = await treaty();
	const s = await agreeSettlement(await proposeSettlement(t, signerFor(inc.key), { from: NOW.toISOString(), to: NOW.toISOString(), holdings: { aHoldsOfB: 10_000, bHoldsOfA: 7000 }, rate: { aPerB: 1, on: NOW.toISOString() } }), t, signerFor(dos.key));
	const p = await settlementParts(s, t);
	assert.equal((await decide(TREATY_SETTLE, ana.did, t.a.federation, treatySettleFacts(p, { paysMoney: true }))).holds, true);
	const shut = await decide(TREATY_SETTLE, ana.did, t.a.federation, treatySettleFacts(p, { paysMoney: true, payerValveShut: true }));
	assert.ok(shut.rules.some((r) => r.includes('treaty.settle/cannot/valve')));
	const gross = await settlementParts({ ...s, sums: { swap: { aReturnsToB: 0, bReturnsToA: 0 }, net: { payer: 'b', minor: 10_000, currency: 'GBP', toCard: t.a.bankingCard } } }, t);
	const g = await decide(TREATY_SETTLE, ana.did, t.a.federation, treatySettleFacts(gross, { paysMoney: true }));
	assert.equal(g.holds, false);
	assert.ok(g.rules.some((r) => r.includes('treaty.settle/cannot/pay-not-swap')));
});
