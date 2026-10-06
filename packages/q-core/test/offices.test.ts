/* Offices (ADR-Q-007 §5, ADR-Q-038 step 5): appointed by the caretaker, held as UCAN mandates with a term, ended early by standing down or recall. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { b64url, unb64url } from '../src/canonical';
import { foundFederation, newDraft } from '../src/federations';
import { readDelegation } from '../src/ucan/token';
import { APPOINTABLE, appoint, checkAppointment, checkEnded, covers, officeMay, officesHeld, recall, standDown, type Appointed } from '../src/offices';

const NOW = new Date('2026-10-06T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 23 + n) % 251);
const DAY = 86_400_000;

async function club() {
	const darren = await identityFromSeed(seed(1));
	const sam = await identityFromSeed(seed(2));
	const mallory = await identityFromSeed(seed(3));
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Green Space', purpose: 'Gardening.', caretakerMonths: 12 }, { now: NOW });
	const fed = signerFor(f.key);
	const grant = b64url(f.grant.bytes);
	const id = f.founding.federation;
	return { darren, sam, mallory, f, fed, grant, id };
}

test('scopes: the caretaker covers everything; a treasurer only the money', () => {
	assert.ok(covers('/fed', '/fed/money') && covers('/fed/money', '/fed/money/pay') && covers('/fed/money', '/fed/money'));
	assert.ok(!covers('/fed/money', '/fed/moneybox') && !covers('/fed/money', '/fed/site'));
	assert.ok(officeMay('caretaker', '/fed/site') && officeMay('treasurer', '/fed/money') && !officeMay('treasurer', '/fed/admit'));
	assert.ok(officeMay('secretary', '/fed/admit') && !officeMay('steward', '/fed/money'));
	assert.ok(!APPOINTABLE.some((o) => o.id === 'caretaker'));
});

test('the founder is caretaker from the founding grant, and nothing else until appointed', async () => {
	const { darren, sam, grant, id } = await club();
	const held = await officesHeld(darren.did, id, { grant, now: NOW });
	assert.deepEqual(held.map((h) => h.office), ['caretaker']);
	assert.deepEqual(await officesHeld(sam.did, id, { grant, now: NOW }), []);
	const later = new Date(NOW.getTime() + 400 * DAY);
	assert.deepEqual(await officesHeld(darren.did, id, { grant, now: later }), [], 'the caretaker’s term runs out: it doesn’t renew itself');
});

test('the caretaker appoints Sam treasurer: two signatures, one mandate per command, ending with the term', async () => {
	const { darren, sam, fed, grant, id } = await club();
	const a = await appoint(fed, signerFor(darren), { federation: id, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen at the meeting on 4 October.', grant, name: 'Green Space' }, NOW);
	assert.deepEqual(await checkAppointment(a, NOW), { ok: true, says: 'Treasurer until 2027-10-06.' });
	assert.equal(a.tokens.length, 1);
	const m = await readDelegation(unb64url(a.tokens[0]));
	assert.deepEqual([m.payload.iss, m.payload.aud, m.payload.sub, m.payload.cmd, m.payload.exp], [id, sam.did, id, '/fed/money', a.until]);
	assert.equal(m.payload.meta?.['inqbeta/office'], 'treasurer');

	const held = await officesHeld(sam.did, id, { grant, appointments: [a], now: NOW });
	assert.deepEqual(held.map((h) => [h.office, h.until]), [['treasurer', a.until]]);
	assert.deepEqual(await officesHeld(sam.did, id, { appointments: [a], now: NOW }).then((h) => h.length), 1, 'checkable with no grant to hand: it carries its authority');
	const after = new Date(a.until * 1000 + 1000);
	assert.deepEqual(await officesHeld(sam.did, id, { appointments: [a], now: after }), [], 'not permanent');

	const sec = await appoint(fed, signerFor(darren), { federation: id, office: 'secretary', holder: sam.did, months: 6, says: 'Volunteered.', grant }, NOW);
	assert.equal(sec.tokens.length, 3, 'admit, announce, minutes');
	assert.deepEqual((await officesHeld(sam.did, id, { appointments: [sec, a], now: NOW })).map((h) => h.office), ['treasurer', 'secretary']);
});

test('what the rules forbid: yourself, the caretaker’s own office, no term, no reason, no authority', async () => {
	const { darren, sam, mallory, fed, grant, id } = await club();
	const base = { federation: id, holder: sam.did, months: 12, says: 'Chosen.', grant };
	await assert.rejects(appoint(fed, signerFor(darren), { ...base, office: 'treasurer', holder: darren.did }), /appoint themselves/);
	await assert.rejects(appoint(fed, signerFor(darren), { ...base, office: 'caretaker' }), /only the members can renew it/);
	await assert.rejects(appoint(fed, signerFor(darren), { ...base, office: 'treasurer', months: 0 }), /between 1 and 24/);
	await assert.rejects(appoint(fed, signerFor(darren), { ...base, office: 'treasurer', months: 36 }), /between 1 and 24/);
	await assert.rejects(appoint(fed, signerFor(darren), { ...base, office: 'treasurer', says: ' ' }), /Say why/);
	await assert.rejects(appoint(fed, signerFor(mallory), { ...base, office: 'treasurer' }), /Only the federation’s caretaker/, 'the key alone isn’t enough: the appointer must be the caretaker');
	await assert.rejects(appoint(fed, signerFor(darren), { ...base, office: 'treasurer' }, new Date(NOW.getTime() + 400 * DAY)), /while their mandate runs/);
});

test('tampering shows: a changed holder, a changed term, a swapped mandate', async () => {
	const { darren, sam, mallory, fed, grant, id } = await club();
	const a = await appoint(fed, signerFor(darren), { federation: id, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen.', grant }, NOW);
	assert.equal((await checkAppointment({ ...a, holder: mallory.did }, NOW)).ok, false);
	assert.equal((await checkAppointment({ ...a, until: a.until + 999_999 }, NOW)).ok, false);
	const other = await appoint(fed, signerFor(darren), { federation: id, office: 'treasurer', holder: mallory.did, months: 12, says: 'Chosen.', grant }, NOW);
	assert.equal((await checkAppointment({ ...a, tokens: other.tokens }, NOW)).ok, false);
	assert.deepEqual(await officesHeld(mallory.did, id, { appointments: [{ ...a, holder: mallory.did }], now: NOW }), []);
});

test('ending early: Sam stands down; or the federation recalls, saying why', async () => {
	const { darren, sam, mallory, fed, grant, id } = await club();
	const a = await appoint(fed, signerFor(darren), { federation: id, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen.', grant }, NOW);
	const t = new Date(NOW.getTime() + DAY);
	const down = await standDown(signerFor(sam), a, 'Moving away.', t);
	assert.equal((await checkEnded(down, a)).ok, true);
	assert.deepEqual(await officesHeld(sam.did, id, { appointments: [a], endings: [down], now: t }), []);
	await assert.rejects(standDown(signerFor(mallory), a, 'Not mine.'), /Only the holder/);

	const back = await recall(fed, a, 'Recalled by a members’ petition.', t);
	assert.equal((await checkEnded(back, a)).ok, true);
	await assert.rejects(recall(fed, a, ''), /must say why/);
	const forged = await standDown(signerFor(sam), a, 'x', t);
	assert.equal((await checkEnded({ ...forged, how: 'recalled' }, a)).ok, false, 'a holder can’t sign a recall');
});
