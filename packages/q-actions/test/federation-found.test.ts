/* federation.found: real foundings from q-core, decided by real Cedar. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { identityFromSeed, signerFor } from '@inqbeta/q-core/passkey';
import { foundFederation, newDraft } from '@inqbeta/q-core/federations';
import { checkActionDefinition } from '../src/actions';
import { createEngine, type CedarModule } from '../src/engine';
import { FEDERATION_FOUND, foundingFacts } from '../src/core/federation-found';

const engine = createEngine(cedar as unknown as CedarModule);
const NOW = new Date('2026-09-28T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 7 + n) % 251);

async function founded(change: Record<string, unknown> = {}) {
	const me = await identityFromSeed(seed(1));
	const draft = { ...newDraft(NOW), name: 'Wem Stamp Club', purpose: 'Swapping stamps.', ...change };
	return { me, f: await foundFederation(signerFor(me), draft, { now: NOW }) };
}

async function decide(facts: Record<string, unknown>, f: Awaited<ReturnType<typeof founded>>['f'], did: string) {
	const action = await engine.load([FEDERATION_FOUND]);
	return engine.decide(action, { principal: { type: 'Person', id: did }, resource: { type: 'Federation', id: f.founding.federation }, facts });
}

test('federation.found is a well-formed core action', () => {
	assert.deepEqual(checkActionDefinition(FEDERATION_FOUND), { ok: true, problems: [] });
});

test('a real founding holds', async () => {
	const { me, f } = await founded();
	const d = await decide(await foundingFacts(f), f, me.did);
	assert.equal(d.holds, true, d.because.join(' '));
	assert.deepEqual(d.rules, ['federation.found/may/found']);
	assert.ok(d.declared[0].includes('renew'));
});

test('a founding missing the federation key’s signature is refused', async () => {
	const { me, f } = await founded();
	const broken = { ...f, founding: { ...f.founding, signatures: f.founding.signatures.filter((s) => s.by === 'root') } };
	const d = await decide(await foundingFacts(broken), f, me.did);
	assert.equal(d.holds, false);
	assert.match(d.because[0], /outside what federation.found may do/);
});

test('each rule refuses by name', async () => {
	const { me, f } = await founded();
	const facts = await foundingFacts(f);
	const cases: [Record<string, unknown>, string][] = [
		[{ caretakerExpires: false }, 'federation.found/cannot/permanent-caretaker'],
		[{ caretakerMonths: 36 }, 'federation.found/cannot/caretaker-over-two-years'],
		[{ foundedByAI: true }, 'federation.found/cannot/ai-founder'],
		[{ hasAgreement: false }, 'federation.found/must/agreement'],
		[{ hasPurpose: false }, 'federation.found/must/purpose'],
		[{ allPrinciples: false }, 'federation.found/must/principles'],
		[{ founderJoined: false }, 'federation.found/must/founder-joins'],
		[{ manifestMatches: false }, 'federation.found/must/manifest'],
		[{ isEvent: true, eventHasEnd: false }, 'federation.found/must/event-ends']
	];
	for (const [change, rule] of cases) {
		const d = await decide({ ...facts, ...change }, f, me.did);
		assert.equal(d.holds, false, rule);
		assert.deepEqual(d.rules, [rule]);
	}
});

test('a principle dropped from the manifest is caught from the founding itself', async () => {
	const { me, f } = await founded();
	const thinned = { ...f, manifest: { ...f.manifest, principles: f.manifest.principles.filter((p) => p !== 'leave') } };
	const d = await decide(await foundingFacts(thinned), f, me.did);
	assert.equal(d.holds, false);
	assert.deepEqual(d.rules, ['federation.found/must/manifest', 'federation.found/must/principles']);
});

test('an event founded with its last day holds', async () => {
	const { me, f } = await founded({ strand: 'event', endsOn: '2026-10-04' });
	assert.equal((await decide(await foundingFacts(f), f, me.did)).holds, true);
});
