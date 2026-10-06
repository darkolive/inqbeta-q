/* office.appoint / office.end: real receipts from q-core, decided by real Cedar. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { identityFromSeed, signerFor } from '@inqbeta/q-core/passkey';
import { b64url } from '@inqbeta/q-core/canonical';
import { foundFederation, newDraft } from '@inqbeta/q-core/federations';
import { joinFrom, makeInvitation } from '@inqbeta/q-core/membership';
import { appoint, recall, standDown } from '@inqbeta/q-core/offices';
import { checkActionDefinition, type ActionDefinition } from '../src/actions';
import { createEngine, type CedarModule } from '../src/engine';
import { OFFICE_APPOINT, OFFICE_END, appointFacts, endFacts } from '../src/core/federation-offices';

const engine = createEngine(cedar as unknown as CedarModule);
const NOW = new Date('2026-10-06T12:00:00Z');
const LATER = new Date('2026-10-07T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 29 + n) % 251);

async function club() {
	const darren = await identityFromSeed(seed(1));
	const sam = await identityFromSeed(seed(2));
	const tess = await identityFromSeed(seed(3));
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Green Space', purpose: 'Gardening.', joinPolicy: 'open' }, { now: NOW });
	const fed = signerFor(f.key);
	const inv = await makeInvitation(fed, f.founding, f.manifest, { now: NOW });
	const samJoined = await joinFrom(signerFor(sam), inv, NOW);
	return { darren, sam, tess, f, fed, samJoined, grant: b64url(f.grant.bytes), id: f.founding.federation };
}
async function decide(action: ActionDefinition, did: string, fed: string, facts: Record<string, unknown>) {
	const h = await engine.load([action]);
	return engine.decide(h, { principal: { type: 'Person', id: did }, resource: { type: 'Federation', id: fed }, facts });
}

test('the two actions are well-formed', () => {
	for (const a of [OFFICE_APPOINT, OFFICE_END]) assert.deepEqual(checkActionDefinition(a), { ok: true, problems: [] }, a.id);
});

test('the caretaker appoints a member treasurer: it holds', async () => {
	const { darren, sam, fed, samJoined, grant, id } = await club();
	const a = await appoint(fed, signerFor(darren), { federation: id, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen at the meeting.', grant }, NOW);
	const d = await decide(OFFICE_APPOINT, darren.did, id, await appointFacts(a, samJoined, NOW));
	assert.equal(d.holds, true, d.because.join(' '));
	assert.ok(d.declared.some((x) => x.includes('AI')));
});

test('not to someone who isn’t a member', async () => {
	const { darren, tess, fed, grant, id } = await club();
	const a = await appoint(fed, signerFor(darren), { federation: id, office: 'treasurer', holder: tess.did, months: 12, says: 'Chosen.', grant }, NOW);
	const d = await decide(OFFICE_APPOINT, darren.did, id, await appointFacts(a, null, NOW));
	assert.equal(d.holds, false);
	assert.ok(d.rules.some((r) => r.includes('office.appoint/must/member')), d.rules.join(' '));
});

test('a widened or self-given appointment is refused, even if someone signs it by hand', async () => {
	const { darren, sam, fed, samJoined, grant, id } = await club();
	const a = await appoint(fed, signerFor(darren), { federation: id, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen.', grant }, NOW);
	const widened = { ...a, scope: ['/fed'] };
	const d = await decide(OFFICE_APPOINT, darren.did, id, await appointFacts(widened, samJoined, NOW));
	assert.equal(d.holds, false, 'a changed scope breaks both signatures and the mandates');
	const self = await decide(OFFICE_APPOINT, darren.did, id, { ...(await appointFacts(a, samJoined, NOW)), selfAppointed: true });
	assert.equal(self.holds, false);
	assert.ok(self.rules.some((r) => r.includes('/cannot/self')));
	const care = await decide(OFFICE_APPOINT, darren.did, id, { ...(await appointFacts(a, samJoined, NOW)), isCaretaker: true });
	assert.ok(care.rules.some((r) => r.includes('/cannot/caretaker')));
});

test('standing down and recall hold; a recall with no reason doesn’t', async () => {
	const { darren, sam, fed, grant, id } = await club();
	const a = await appoint(fed, signerFor(darren), { federation: id, office: 'secretary', holder: sam.did, months: 6, says: 'Volunteered.', grant }, NOW);
	const down = await standDown(signerFor(sam), a, 'Too busy.', LATER);
	assert.equal((await decide(OFFICE_END, sam.did, id, await endFacts(down, a))).holds, true);
	const back = await recall(fed, a, 'Members’ petition.', LATER);
	assert.equal((await decide(OFFICE_END, darren.did, id, await endFacts(back, a))).holds, true);
	const silent = { ...back, says: '' };
	assert.equal((await decide(OFFICE_END, darren.did, id, await endFacts(silent, a))).holds, false);
});
