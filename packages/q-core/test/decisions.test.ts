/* Recorded decisions as evidence for the federation's money (ADR-Q-038 §8). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { b64url } from '../src/canonical';
import { foundFederation, newDraft } from '../src/federations';
import { appoint } from '../src/offices';
import { takeUp, type Acting, type InRoleReceipt } from '../src/inrole';
import { decisionCovers, minuteDecision } from '../src/decisions';

const NOW = new Date('2026-10-06T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 47 + n) % 251);

test('the secretary minutes a decision; it covers spending up to its amount, counting what’s spent', async () => {
	const darren = await identityFromSeed(seed(1));
	const sam = await identityFromSeed(seed(2));
	const tess = await identityFromSeed(seed(3));
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Green Space', purpose: 'Gardening.' }, { now: NOW });
	const id = f.founding.federation;
	const grant = b64url(f.grant.bytes);
	const sec = await appoint(signerFor(f.key), signerFor(darren), { federation: id, office: 'secretary', holder: tess.did, months: 12, says: 'Chosen.', grant }, NOW);
	const tre = await appoint(signerFor(f.key), signerFor(darren), { federation: id, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen.', grant }, NOW);
	const acting = async (who: typeof darren, office: string, mandates: string[]): Promise<Acting> => ({ federation: id, office, mandates, takenUp: (await takeUp(who, { federation: id, name: 'Green Space', office, declaration: { kind: 'none' } }, NOW)) as InRoleReceipt });

	const d = await minuteDecision(tess, await acting(tess, 'secretary', sec.tokens), { says: 'Pay the hall hire for the autumn.', how: 'meeting', decidedOn: '2026-10-01', upTo: 300 }, NOW);
	assert.ok((await decisionCovers(d, { federation: id, credits: 120, now: NOW })).ok);
	assert.match((await decisionCovers(d, { federation: id, credits: 200, spentSoFar: 120, now: NOW })).says, /already spent/);
	assert.equal((await decisionCovers(d, { federation: 'did:key:zOther', credits: 1, now: NOW })).ok, false);
	assert.equal((await decisionCovers({ ...d, content: { ...d.content, upTo: 3000 } }, { federation: id, credits: 1000, now: NOW })).ok, false, 'tampered');

	/* The treasurer can't minute: that's the secretary's or chair's. */
	const byTreasurer = await minuteDecision(sam, await acting(sam, 'treasurer', tre.tokens), { says: 'Pay myself.', how: 'meeting', decidedOn: '2026-10-01', upTo: 300 }, NOW);
	assert.match((await decisionCovers(byTreasurer, { federation: id, credits: 10, now: NOW })).says, /minuted in role/);
	/* Money decisions say how much; a standing rule needn't. */
	const open = await minuteDecision(tess, await acting(tess, 'secretary', sec.tokens), { says: 'Pay the hall.', how: 'meeting', decidedOn: '2026-10-01' }, NOW);
	assert.match((await decisionCovers(open, { federation: id, credits: 10, now: NOW })).says, /how much/);
});
