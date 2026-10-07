/* Treaties on the federation's books (E5): proposed, then in force, then ending; who's accepted by treaty. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { foundFederation, newDraft } from '../src/federations';
import { sealWith } from '../src/seal';
import { FED_MONEY_SCHEMA, MINT_SOURCE, type FedMoneyEntry } from '../src/mint';
import { agreeTreaty, giveNotice, makeBankingCard, proposeTreaty, type Side } from '../src/treaties';
import { federationTreaties, inTreatyWith } from '../src/federation-money';

const NOW = new Date('2026-10-07T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 59 + n) % 251);

test('a treaty on file: proposed, in force, ending; its partner accepted while it runs', async () => {
	const ana = await identityFromSeed(seed(1));
	const bo = await identityFromSeed(seed(2));
	const mint = await identityFromSeed(seed(3));
	const inc = await foundFederation(signerFor(ana), { ...newDraft(NOW), name: 'Incubator', purpose: 'Commons.' }, { now: NOW });
	const dos = await foundFederation(signerFor(bo), { ...newDraft(NOW), name: 'Dark Olive CIC', purpose: 'Courses.' }, { now: NOW });
	const cardA = await makeBankingCard(inc.key, { name: 'Incubator', sortCode: '123456', account: '12345678' }, { currency: 'GBP' }, NOW);
	const cardB = await makeBankingCard(dos.key, { name: 'Dark Olive CIC', sortCode: '654321', account: '87654321' }, { currency: 'GBP' }, NOW);
	const side = (f: typeof inc, name: string, card: string): Side => ({ federation: f.founding.federation, name, mint: mint.did, currency: 'GBP', mode: 'test', bankingCard: card });
	const terms = { a: side(inc, 'Incubator', cardA.contentHash), b: side(dos, 'Dark Olive CIC', cardB.contentHash), purpose: { ethics: ['Community interest companies'], offered: ['hosting'], sought: ['courses'] }, rate: { kind: 'par' } as const, cap: { credits: 500 }, period: 30 as const, excludes: [], until: null };
	const proposed = await proposeTreaty(signerFor(inc.key), signerFor(ana), 'caretaker', terms, NOW);
	const agreed = await agreeTreaty(proposed, signerFor(dos.key), signerFor(bo), 'caretaker');
	const file = async (kind: FedMoneyEntry['kind'], record: unknown, at: string) => sealWith(mint, { schema: FED_MONEY_SCHEMA, source: MINT_SOURCE, mint: mint.did, mode: 'test', kind, federation: inc.founding.federation, record, at } satisfies FedMoneyEntry);
	const o = { mint: mint.did, mode: 'test' as const, federation: inc.founding.federation, now: NOW };

	const one = [await file('treaty', { treaty: proposed, actingA: 'a-proof' }, '2026-10-07T10:00:00Z')];
	let ts = await federationTreaties(one, o);
	assert.equal(ts.length, 1);
	assert.equal(ts[0].standing.state, 'proposed');
	assert.match(ts[0].standing.says, /Waiting for Dark Olive CIC/);
	assert.equal(ts[0].partner.name, 'Dark Olive CIC');
	assert.deepEqual(inTreatyWith(ts), []);

	const two = [...one, await file('treaty', { treaty: agreed, actingB: 'b-proof' }, '2026-10-07T11:00:00Z')];
	ts = await federationTreaties(two, o);
	assert.equal(ts.length, 1, 'one treaty, however many times it’s filed');
	assert.equal(ts[0].standing.state, 'in-force', ts[0].standing.says);
	assert.equal(ts[0].inForceSince, '2026-10-07T11:00:00Z');
	assert.equal(ts[0].actingA, 'a-proof', 'the office proofs carried from each filing');
	assert.equal(ts[0].actingB, 'b-proof');
	assert.deepEqual(inTreatyWith(ts), [dos.founding.federation]);

	/* Books unreconciled: suspended, and nobody's accepted by it. */
	ts = await federationTreaties(two, { ...o, health: { [dos.founding.federation]: { drift: 0, reconciled: null } } });
	assert.equal(ts[0].standing.state, 'suspended');
	assert.deepEqual(inTreatyWith(ts), []);

	const notice = await giveNotice(agreed, 'b', signerFor(dos.key), 'We’re winding down.', NOW);
	const forged = { ...notice, says: 'Something else.' };
	ts = await federationTreaties([...two, await file('treaty-notice', forged, '2026-10-07T12:00:00Z')], o);
	assert.equal(ts[0].standing.state, 'in-force', 'an unsigned notice counts for nothing');
	ts = await federationTreaties([...two, await file('treaty-notice', notice, '2026-10-07T12:00:00Z')], o);
	assert.equal(ts[0].standing.state, 'ending');
	assert.deepEqual(inTreatyWith(ts), [dos.founding.federation], 'still accepted until it ends');
	ts = await federationTreaties([...two, await file('treaty-notice', notice, '2026-10-07T12:00:00Z')], { ...o, now: new Date('2026-11-07T12:00:00Z') });
	assert.equal(ts[0].standing.state, 'ended');
});
