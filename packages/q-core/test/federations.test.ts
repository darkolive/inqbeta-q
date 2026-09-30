/*
 * A federation is a key founded by a person (ADR-Q-007). Real keys, real UCAN.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import {
	CARETAKER_MONTHS,
	FEDERATION_COMMANDS,
	PRINCIPLES,
	SUGGESTED_AGREEMENT,
	checkFederationFounding,
	checkJoined,
	foundFederation,
	hashAgreement,
	hashManifest,
	isFederationDraft,
	isLegacyFederation,
	manifestOf,
	newDraft,
	stillNeeded,
	type FederationDraft
} from '../src/federations';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 17 + n) % 251);
const NOW = new Date('2026-09-28T12:00:00Z');

function stampClub(): FederationDraft {
	return { ...newDraft(NOW), name: 'Wem Stamp Club', purpose: 'Swapping and looking after stamps.' };
}

test('a new draft starts with the suggested agreement and a one-year caretaker', () => {
	const d = newDraft(NOW);
	assert.ok(isFederationDraft(d));
	assert.match(d.id, /^draft_/);
	assert.equal(d.agreement, SUGGESTED_AGREEMENT);
	assert.equal(d.caretakerMonths, CARETAKER_MONTHS.usual);
	assert.equal(d.strand, 'circle');
});

test('a draft says what it still needs, all at once', () => {
	const d = { ...newDraft(NOW), agreement: '', caretakerMonths: 60 };
	const missing = stillNeeded(d, NOW);
	assert.deepEqual(missing, [
		'It needs a name.',
		'Say in a sentence what it is for.',
		'Write the agreement members will sign when they join.',
		'The caretaker’s term is between 1 and 24 months.'
	]);
	assert.deepEqual(stillNeeded(stampClub(), NOW), []);
});

test('an event needs a last day that has not passed', () => {
	const e = { ...stampClub(), strand: 'event' as const };
	assert.deepEqual(stillNeeded(e, NOW), ['An event needs its last day.']);
	assert.deepEqual(stillNeeded({ ...e, endsOn: '2026-01-01' }, NOW), ['The event’s last day has already passed.']);
	assert.deepEqual(stillNeeded({ ...e, endsOn: '2026-10-04' }, NOW), []);
	assert.equal(manifestOf({ ...e, endsOn: '2026-10-04' }).constitution.endsOn, '2026-10-04');
	assert.equal(manifestOf({ ...stampClub(), endsOn: '2026-10-04' }).constitution.endsOn, undefined, 'only events keep an end');
});

test('an unready draft cannot be founded', async () => {
	const me = await identityFromSeed(seed(1));
	await assert.rejects(foundFederation(signerFor(me), newDraft(NOW), { now: NOW }), /It needs a name/);
});

test('founding is signed by the founder and the new federation key, naming the manifest', async () => {
	const me = await identityFromSeed(seed(1));
	const f = await foundFederation(signerFor(me), stampClub(), { now: NOW });
	assert.equal(f.founding.root, me.did);
	assert.equal(f.founding.federation, f.key.did);
	assert.notEqual(f.key.did, me.did, 'the federation is its own key');
	assert.equal(f.founding.manifest, await hashManifest(f.manifest));
	assert.deepEqual(f.manifest.principles, PRINCIPLES.map((p) => p.id));
	assert.equal((await checkFederationFounding(f.founding, f.manifest)).ok, true);
});

test('changing a founding, dropping a signature, or swapping the manifest is caught', async () => {
	const me = await identityFromSeed(seed(1));
	const f = await foundFederation(signerFor(me), stampClub(), { now: NOW });
	assert.equal((await checkFederationFounding({ ...f.founding, name: 'Somebody Else’s Club' })).ok, false);
	assert.equal((await checkFederationFounding({ ...f.founding, signatures: f.founding.signatures.filter((s) => s.by === 'root') })).ok, false);
	assert.equal((await checkFederationFounding({ ...f.founding, signatures: f.founding.signatures.filter((s) => s.by === 'federation') })).ok, false);
	const other = manifestOf({ ...stampClub(), agreement: 'Anything goes.' });
	const c = await checkFederationFounding(f.founding, other);
	assert.equal(c.ok, false);
	assert.match(c.says, /not the one it was founded under/);
});

test('the founder is member one, by a joining both sides signed', async () => {
	const me = await identityFromSeed(seed(1));
	const f = await foundFederation(signerFor(me), stampClub(), { now: NOW });
	assert.equal(f.joined.member, me.did);
	assert.equal(f.joined.federation, f.key.did);
	assert.equal(f.joined.manifest, f.founding.manifest);
	assert.equal(f.joined.agreement, await hashAgreement(SUGGESTED_AGREEMENT));
	assert.equal((await checkJoined(f.joined)).ok, true);
	assert.equal((await checkJoined({ ...f.joined, member: (await identityFromSeed(seed(9))).did })).ok, false);
	assert.equal((await checkJoined({ ...f.joined, signatures: f.joined.signatures.filter((s) => s.by === 'member') })).ok, false);
});

test('the caretaker mandate expires after its term, and covers every federation command', async () => {
	const me = await identityFromSeed(seed(1));
	const f = await foundFederation(signerFor(me), { ...stampClub(), caretakerMonths: 6 }, { now: NOW });
	const p = f.grant.payload;
	assert.equal(p.iss, f.key.did);
	assert.equal(p.aud, me.did);
	assert.equal(p.sub, f.key.did);
	assert.equal(p.cmd, FEDERATION_COMMANDS.all);
	assert.equal(p.exp, f.caretakerUntil);
	const months = (f.caretakerUntil - NOW.getTime() / 1000) / (30.4375 * 86400);
	assert.ok(Math.abs(months - 6) < 0.01, `${months} months`);
});

test('the federation key is random: two foundings, two keys', async () => {
	const me = await identityFromSeed(seed(1));
	const a = await foundFederation(signerFor(me), stampClub(), { now: NOW });
	const b = await foundFederation(signerFor(me), stampClub(), { now: NOW });
	assert.notEqual(a.key.did, b.key.did);
});

test('a record from before ADR-Q-007 is still recognised, never mistaken for a draft', () => {
	const old = { id: 'fed_abc123def456', name: 'Dart College Incubator', founder: 'did:key:z6Mk…', created: 1, members: [] };
	assert.ok(isLegacyFederation(old));
	assert.ok(!isFederationDraft(old));
	assert.ok(!isLegacyFederation(newDraft(NOW)));
});
