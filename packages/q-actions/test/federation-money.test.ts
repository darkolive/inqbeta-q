/* federation.spend: two holders in role, a recorded decision, paid rightly (ADR-Q-038 §8). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { identityFromSeed, signerFor } from '@inqbeta/q-core/passkey';
import { b64url } from '@inqbeta/q-core/canonical';
import { foundFederation, newDraft } from '@inqbeta/q-core/federations';
import { appoint } from '@inqbeta/q-core/offices';
import { takeUp, type Acting, type InRoleReceipt } from '@inqbeta/q-core/inrole';
import { askSecond, signSecond } from '@inqbeta/q-core/cosign';
import { minuteDecision } from '@inqbeta/q-core/decisions';
import { checkActionDefinition } from '../src/actions';
import { createEngine, type CedarModule } from '../src/engine';
import { FEDERATION_SPEND, spendFacts } from '../src/core/federation-money';

const engine = createEngine(cedar as unknown as CedarModule);
const NOW = new Date('2026-10-06T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 53 + n) % 251);
const ACCOUNT = 'banking-card:green-space';

async function setup() {
	const darren = await identityFromSeed(seed(1));
	const sam = await identityFromSeed(seed(2));
	const tess = await identityFromSeed(seed(3));
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Green Space', purpose: 'Gardening.' }, { now: NOW });
	const id = f.founding.federation;
	const grant = b64url(f.grant.bytes);
	const tre = await appoint(signerFor(f.key), signerFor(darren), { federation: id, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen.', grant }, NOW);
	const sec = await appoint(signerFor(f.key), signerFor(darren), { federation: id, office: 'secretary', holder: tess.did, months: 12, says: 'Chosen.', grant }, NOW);
	const acting = async (who: typeof darren, office: string, mandates: string[]): Promise<Acting> => ({ federation: id, office, mandates, takenUp: (await takeUp(who, { federation: id, name: 'Green Space', office, declaration: { kind: 'none' } }, NOW)) as InRoleReceipt });
	const decision = await minuteDecision(tess, await acting(tess, 'secretary', sec.tokens), { says: 'Cash out for the hall hire.', how: 'meeting', decidedOn: '2026-10-01', upTo: 300 }, NOW);
	const asked = await askSecond(signerFor(sam), await acting(sam, 'treasurer', tre.tokens), { cmd: '/fed/money/cash-out', action: { credits: 120, to: ACCOUNT }, says: 'Cash out 120 for the hall.' }, NOW);
	const both = await signSecond(asked, signerFor(darren), await acting(darren, 'caretaker', [grant]));
	return { id, sam, asked, both, decision };
}
const decide = async (did: string, fed: string, facts: Record<string, unknown>) => engine.decide(await engine.load([FEDERATION_SPEND]), { principal: { type: 'Person', id: did }, resource: { type: 'Federation', id: fed }, facts });

test('well formed', () => assert.deepEqual(checkActionDefinition(FEDERATION_SPEND), { ok: true, problems: [] }));

test('two holders, a decision, the federation’s account: it holds', async () => {
	const { id, sam, both, decision } = await setup();
	const d = await decide(sam.did, id, await spendFacts(both, decision, { federation: id, account: ACCOUNT, now: NOW }));
	assert.equal(d.holds, true, d.because.join(' '));
});

test('one signature, no decision, over the decision, another account, the valve shut: each refused', async () => {
	const { id, sam, asked, both, decision } = await setup();
	const cases: [string, Record<string, unknown>][] = [
		['one-purse', await spendFacts(asked, decision, { federation: id, account: ACCOUNT, now: NOW })],
		['decision', await spendFacts(both, null, { federation: id, account: ACCOUNT, now: NOW })],
		['decision', await spendFacts(both, decision, { federation: id, account: ACCOUNT, spentSoFar: 250, now: NOW })],
		['paid-rightly', await spendFacts(both, decision, { federation: id, account: 'somewhere-else', now: NOW })],
		['valve', await spendFacts(both, decision, { federation: id, account: ACCOUNT, valveShut: true, now: NOW })]
	];
	for (const [slug, facts] of cases) {
		const d = await decide(sam.did, id, facts);
		assert.equal(d.holds, false, slug);
		assert.ok(d.rules.some((r) => r.includes(`/${slug}`)), `${slug}: ${d.rules.join(' ')}`);
	}
});
