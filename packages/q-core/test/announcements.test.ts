import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { makeAnnouncement, checkAnnouncement } from '../src/announcements';

const seed = (n: number) => new Uint8Array(32).fill(n);
const NOW = new Date('2026-10-01T12:00:00Z');

test('a federation announces; members can check it', async () => {
	const fed = await identityFromSeed(seed(7));
	const a = await makeAnnouncement(signerFor(fed), { federationDid: fed.did, title: 'We’ve just updated', says: 'Cards and the bell are live.', action: { href: '/cards', label: 'Try it' }, days: 14, now: NOW });
	assert.deepEqual(await checkAnnouncement(a, fed.did, NOW), { ok: true });
	assert.equal(a.until, '2026-10-15T12:00:00.000Z');
	assert.deepEqual(a.action, { href: '/cards', label: 'Try it' });
});

test('only the federation’s key can announce, and nobody can change one', async () => {
	const fed = await identityFromSeed(seed(7));
	const someone = await identityFromSeed(seed(8));
	await assert.rejects(makeAnnouncement(signerFor(someone), { federationDid: fed.did, title: 'x', says: 'y', days: 1, now: NOW }));
	const a = await makeAnnouncement(signerFor(fed), { federationDid: fed.did, title: 'Hello', says: 'Real words', days: 7, now: NOW });
	assert.equal((await checkAnnouncement({ ...a, says: 'Other words' }, fed.did, NOW)).ok, false);
	assert.equal((await checkAnnouncement(a, someone.did, NOW)).ok, false, 'from a different federation');
});

test('an announcement goes when its time is over', async () => {
	const fed = await identityFromSeed(seed(7));
	const a = await makeAnnouncement(signerFor(fed), { federationDid: fed.did, title: 'Soon', says: 'Gone', days: 1, now: NOW });
	assert.equal((await checkAnnouncement(a, fed.did, new Date('2026-10-03T00:00:00Z'))).ok, false);
});

test('the node’s gate accepts a federation’s publication, and refuses forgeries, roll-backs and replays', async () => {
	// @ts-expect-error — plain JS, no types
	const { checkSubmission } = await import('../../../node/gate/server.mjs');
	const { makePublication } = await import('../src/announcements');
	const fed = await identityFromSeed(seed(7));
	const now = new Date();
	const a = await makeAnnouncement(signerFor(fed), { federationDid: fed.did, title: 'News', says: 'Words', days: 7, now });
	const file = { schema: 'inqbeta.announcements/1', federation: fed.did, announcements: [a] };
	const pub = await makePublication(signerFor(fed), fed.did, [a], now);
	assert.equal(await checkSubmission(fed.did, { file, publication: pub }, null, now.getTime()), null, 'a genuine one is stored');

	const forged = { ...file, announcements: [{ ...a, says: 'Other words' }] };
	assert.match(String(await checkSubmission(fed.did, { file: forged, publication: pub }, null, now.getTime())), /isn’t signed/);

	const someone = await identityFromSeed(seed(9));
	await assert.rejects(makePublication(signerFor(someone), fed.did, [a], now));

	assert.match(String(await checkSubmission(fed.did, { file, publication: pub }, { publication: pub }, now.getTime())), /newer/, 'no roll-back or repeat');
	assert.match(String(await checkSubmission(fed.did, { file, publication: pub }, null, now.getTime() + 20 * 60_000)), /too old/, 'no replay later');
});
