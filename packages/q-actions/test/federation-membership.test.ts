/* federation.join / leave / remove: real receipts from q-core, decided by real Cedar. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { identityFromSeed, signerFor } from '@inqbeta/q-core/passkey';
import { foundFederation, newDraft, type JoinPolicy } from '@inqbeta/q-core/federations';
import { acceptRequest, joinFrom, leave, makeInvitation, remove } from '@inqbeta/q-core/membership';
import { checkActionDefinition, type ActionDefinition } from '../src/actions';
import { createEngine, type CedarModule } from '../src/engine';
import { FEDERATION_JOIN, FEDERATION_LEAVE, FEDERATION_REMOVE, joinFacts, leaveFacts, removeFacts } from '../src/core/federation-membership';

const engine = createEngine(cedar as unknown as CedarModule);
const NOW = new Date('2026-09-28T12:00:00Z');
const LATER = new Date('2026-09-29T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 19 + n) % 251);

async function club(joinPolicy: JoinPolicy = 'open') {
	const darren = await identityFromSeed(seed(1));
	const theo = await identityFromSeed(seed(2));
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Wem Stamp Club', purpose: 'Stamps.', joinPolicy }, { now: NOW });
	const fed = signerFor(f.key);
	const inv = await makeInvitation(fed, f.founding, f.manifest, { now: NOW });
	return { darren, theo, f, fed, inv };
}

async function decide(action: ActionDefinition, did: string, fed: string, facts: Record<string, unknown>) {
	const h = await engine.load([action]);
	return engine.decide(h, { principal: { type: 'Person', id: did }, resource: { type: 'Federation', id: fed }, facts });
}

test('the three actions are well-formed', () => {
	for (const a of [FEDERATION_JOIN, FEDERATION_LEAVE, FEDERATION_REMOVE]) assert.deepEqual(checkActionDefinition(a), { ok: true, problems: [] }, a.id);
});

test('joining on an open offer holds', async () => {
	const { theo, inv, f } = await club();
	const j = await joinFrom(signerFor(theo), inv, LATER);
	const d = await decide(FEDERATION_JOIN, theo.did, f.founding.federation, await joinFacts(j, f.founding, f.manifest));
	assert.equal(d.holds, true, d.because.join(' '));
	assert.ok(d.declared.some((x) => x.includes('vouching')));
});

test('a request is outside what join may do until the caretaker countersigns', async () => {
	const { theo, inv, f, fed } = await club('request');
	const request = await joinFrom(signerFor(theo), inv, LATER);
	const waiting = await decide(FEDERATION_JOIN, theo.did, f.founding.federation, await joinFacts(request, f.founding, f.manifest));
	assert.equal(waiting.holds, false);
	assert.match(waiting.because[0], /outside what federation.join may do/);
	const accepted = await acceptRequest(fed, request, f.founding.manifest);
	assert.equal((await decide(FEDERATION_JOIN, theo.did, f.founding.federation, await joinFacts(accepted, f.founding, f.manifest))).holds, true);
});

test('joining under other rules, or a different agreement, is refused by name', async () => {
	const { theo, inv, f } = await club();
	const j = await joinFrom(signerFor(theo), inv, LATER);
	const facts = await joinFacts(j, f.founding, f.manifest);
	const other = await joinFacts({ ...j, agreement: 'agreement:sha256:other' }, f.founding, f.manifest);
	assert.equal(other.agreementMatches, false);
	const d = await decide(FEDERATION_JOIN, theo.did, f.founding.federation, { ...facts, rulesAreCurrent: false });
	assert.deepEqual(d.rules, ['federation.join/must/current-rules']);
});

test('leaving holds with only the member’s signature', async () => {
	const { theo, inv, f } = await club();
	const j = await joinFrom(signerFor(theo), inv, LATER);
	const l = await leave(signerFor(theo), j, LATER);
	const d = await decide(FEDERATION_LEAVE, theo.did, f.founding.federation, await leaveFacts(l, j));
	assert.equal(d.holds, true, d.because.join(' '));
});

test('a leaving someone else signed is locked out', async () => {
	const { theo, darren, inv, f } = await club();
	const j = await joinFrom(signerFor(theo), inv, LATER);
	const l = await leave(signerFor(theo), j, LATER);
	const forged = { ...l, signatures: [{ ...l.signatures[0], did: darren.did }] };
	const d = await decide(FEDERATION_LEAVE, darren.did, f.founding.federation, await leaveFacts(forged, j));
	assert.equal(d.holds, false);
	assert.deepEqual(d.rules, ['federation.leave/cannot/for-someone-else']);
});

test('removal holds when signed by the federation, citing a clause, of a real member', async () => {
	const { theo, darren, inv, f, fed } = await club();
	const j = await joinFrom(signerFor(theo), inv, LATER);
	const r = await remove(fed, { federation: f.founding.federation, member: theo.did, clause: 'The agreement', says: 'Repeatedly unkind.' }, LATER);
	assert.equal((await decide(FEDERATION_REMOVE, darren.did, f.founding.federation, await removeFacts(r, j))).holds, true);
	const stranger = await identityFromSeed(seed(7));
	const r2 = await remove(fed, { federation: f.founding.federation, member: stranger.did, clause: 'The agreement', says: 'x' }, LATER);
	const d = await decide(FEDERATION_REMOVE, darren.did, f.founding.federation, await removeFacts(r2, j));
	assert.deepEqual(d.rules, ['federation.remove/must/was-member']);
});

/* ---- Suspension ---- */
import { suspend } from '@inqbeta/q-core/membership';
import { FEDERATION_SUSPEND, suspendFacts } from '../src/core/federation-membership';

test('a month’s suspension of a member holds; a year and a half is refused by name', async () => {
	assert.deepEqual(checkActionDefinition(FEDERATION_SUSPEND), { ok: true, problems: [] });
	const { theo, darren, inv, f, fed } = await club();
	const j = await joinFrom(signerFor(theo), inv, LATER);
	const s = await suspend(fed, { federation: f.founding.federation, member: theo.did, clause: 'The agreement', says: 'Shouting at the AGM.', until: new Date(LATER.getTime() + 30 * 86_400_000) }, LATER);
	const facts = await suspendFacts(s, j);
	assert.equal(facts.days, 30);
	const ok = await decide(FEDERATION_SUSPEND, darren.did, f.founding.federation, facts);
	assert.equal(ok.holds, true, ok.because.join(' '));
	assert.ok(ok.declared.some((d) => d.includes('leaving')));
	const long = await decide(FEDERATION_SUSPEND, darren.did, f.founding.federation, { ...facts, days: 540 });
	assert.deepEqual(long.rules, ['federation.suspend/cannot/over-a-year']);
	const noEnd = await decide(FEDERATION_SUSPEND, darren.did, f.founding.federation, { ...facts, hasEnd: false });
	assert.deepEqual(noEnd.rules, ['federation.suspend/must/end']);
});

/* ---- Consent and how a member is known ---- */
import { CONSENT_SUGGESTIONS } from '@inqbeta/q-core/federations';
import { openMemberCard } from '@inqbeta/q-core/membership';

test('join refuses a skipped consent step, an unsaid choice, or a card beyond the choice — by name', async () => {
	const darren = await identityFromSeed(seed(1));
	const theo = await identityFromSeed(seed(2));
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Club', purpose: 'x', consent: [CONSENT_SUGGESTIONS[0]] }, { now: NOW });
	const inv = await makeInvitation(signerFor(f.key), f.founding, f.manifest, { now: NOW });
	const j = await joinFrom(signerFor(theo), inv, { now: LATER, knownAs: 'name', card: { name: 'Theo' } });
	const card = await openMemberCard(j, f.key);
	const facts = await joinFacts(j, f.founding, f.manifest, card);
	assert.equal((await decide(FEDERATION_JOIN, theo.did, f.founding.federation, facts)).holds, true);

	const skipped = await joinFacts({ ...j, consented: j.consented!.filter((c) => c.id !== 'photos') }, f.founding, f.manifest, card);
	assert.deepEqual((await decide(FEDERATION_JOIN, theo.did, f.founding.federation, { ...skipped, signedByMember: true })).rules, ['federation.join/must/consent-every-step']);

	const unsaid = await joinFacts({ ...j, knownAs: undefined }, f.founding, f.manifest);
	assert.equal(unsaid.saidHowKnown, false);

	const tooMuch = await joinFacts(j, f.founding, f.manifest, { ...card!, picture: 'data:image/webp;base64,AAAA' });
	assert.deepEqual((await decide(FEDERATION_JOIN, theo.did, f.founding.federation, tooMuch)).rules, ['federation.join/cannot/share-more-than-chosen']);
});
