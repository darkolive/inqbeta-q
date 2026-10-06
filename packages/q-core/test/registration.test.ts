/* Registering a federation with Incubator (ADR-Q-021 addendum). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { foundFederation, newDraft } from '../src/federations';
import { checkCard, checkRegistration, hashCard, latestCard, makeCard, register } from '../src/registration';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 53 + n) % 251);
const NOW = new Date('2026-10-06T12:00:00Z');

test('a new host’s card, checked against its founding, registered, updated, run out', async () => {
	const ana = await identityFromSeed(seed(1));
	const mallory = await identityFromSeed(seed(2));
	const incubator = await identityFromSeed(seed(3));
	const f = await foundFederation(signerFor(ana), { ...newDraft(NOW), name: 'Hill Farm Co-op', purpose: 'Growing together.' }, { now: NOW });
	const fed = signerFor(f.key);
	const base = { name: 'Hill Farm Co-op', purpose: 'Growing together.', site: 'https://hillfarm.example', visibility: 'unlisted' as const, runs: { q: '0.1.0' }, previous: null };
	const card = await makeCard(fed, signerFor(ana), base, NOW);
	assert.deepEqual((await checkCard(card, f.founding)).ok, true);
	assert.equal((await checkCard(await makeCard(fed, signerFor(mallory), base), f.founding)).ok, false, 'someone else as founder');
	assert.equal((await checkCard({ ...card, site: 'https://evil.example' })).ok, false, 'tampered');
	await assert.rejects(makeCard(fed, signerFor(ana), { ...base, site: 'http://hillfarm.example' }), /https/);

	const reg = await register(incubator, card, ['Signed by the federation and its founder', 'Its site serves its founding'], NOW);
	assert.match((await checkRegistration(reg, card, incubator.did, NOW)).says, /Registered with Incubator until 2027-01-04/);
	assert.equal((await checkRegistration(reg, card, mallory.did, NOW)).ok, false, 'only Incubator’s registrar');
	assert.equal((await checkRegistration(reg, card, incubator.did, new Date('2027-02-01T00:00:00Z'))).ok, false, 'runs out');

	/* They decide to be found: a new card naming the old. */
	const next = await makeCard(fed, signerFor(ana), { ...base, visibility: 'public', previous: await hashCard(card) }, new Date('2026-11-01T12:00:00Z'));
	assert.equal((await latestCard([card, next]))?.visibility, 'public');
	const orphan = await makeCard(fed, signerFor(ana), { ...base, previous: 'receipt:sha256:nothing' }, new Date('2026-12-01T12:00:00Z'));
	assert.equal((await latestCard([card, next, orphan]))?.visibility, 'public', 'a card that names no known card before it isn’t the latest');
});

test('a host puts a club forward; Incubator countersigns; only that host, that club, that registrar', async () => {
	const { putForward, checkPutForward, acceptPutForward, clubOnHost } = await import('../src/registration');
	const ana = await identityFromSeed(seed(11));
	const bo = await identityFromSeed(seed(12));
	const incubator = await identityFromSeed(seed(13));
	const host = await foundFederation(signerFor(ana), { ...newDraft(NOW), name: 'Hill Farm', purpose: 'Growing.' }, { now: NOW });
	const club = await foundFederation(signerFor(bo), { ...newDraft(NOW), name: 'Seed Swap', purpose: 'Swapping seeds.' }, { now: NOW });
	const p = await putForward(signerFor(host.key), signerFor(ana), { club: club.founding.federation, name: 'Seed Swap' }, NOW);
	assert.ok((await checkPutForward(p, host.founding)).ok);
	assert.equal((await checkPutForward(p, club.founding)).ok, false, 'not from that host’s founder');
	assert.equal((await checkPutForward({ ...p, club: host.founding.federation })).ok, false, 'tampered');
	await assert.rejects(putForward(signerFor(host.key), signerFor(ana), { club: host.founding.federation, name: 'x' }), /registers/);

	const accepted = await acceptPutForward(incubator, p, NOW);
	assert.ok(await clubOnHost([accepted], host.founding.federation, club.founding.federation, incubator.did));
	assert.equal(await clubOnHost([accepted], host.founding.federation, club.founding.federation, bo.did), null, 'only Incubator’s registrar');
	assert.equal(await clubOnHost([accepted], club.founding.federation, host.founding.federation, incubator.did), null, 'that host, that club');

	/* The club's card names its host. */
	const card = await makeCard(signerFor(club.key), signerFor(bo), { name: 'Seed Swap', purpose: 'Swapping seeds.', site: 'https://hillfarm.example', visibility: 'public', runs: { q: '0.1.0' }, host: host.founding.federation, previous: null }, NOW);
	assert.ok((await checkCard(card, club.founding)).ok);
	assert.equal((await checkCard({ ...card, host: card.federation })).ok, false, 'a club isn’t its own host');
	const reg = await register(incubator, card, ['through its host'], NOW, undefined, host.founding.federation);
	assert.equal(reg.content.host, host.founding.federation);
});
