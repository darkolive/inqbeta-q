/* Credits as receipts (ADR-Q-023): a balance is added up, never held. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sealWith, checkReceipt } from '../src/seal';
import { CREDIT_SCHEMA, TEST_PACKS, balanceOf, buyFacts, lastMoveOf, movesOf, type CreditMove } from '../src/credits';

const seed = (n: number) => new Uint8Array(32).fill(n);
const move = (m: Partial<CreditMove> & Pick<CreditMove, 'kind' | 'credits' | 'to'>): CreditMove => ({
	schema: CREDIT_SCHEMA,
	source: 'inqbeta:q/credits',
	mode: 'test',
	at: new Date().toISOString(),
	follows: null,
	...m
});

test('a balance is added up from signed moves, and test credits never mix with real ones', async () => {
	const ann = await identityFromSeed(seed(21));
	const bob = await identityFromSeed(seed(22));
	const bought = await sealWith(ann, move({ kind: 'buy', credits: 10, to: ann.did, pack: TEST_PACKS[0], at: '2026-10-02T10:00:00Z' }));
	const spent = await sealWith(ann, move({ kind: 'spend', credits: 3, to: ann.did, for: ['usage-1'], at: '2026-10-02T11:00:00Z', follows: bought.contentHash }));
	const traded = await sealWith(ann, move({ kind: 'trade', credits: 2, from: ann.did, to: bob.did, mode: 'live', at: '2026-10-02T12:00:00Z' }));
	assert.equal((await checkReceipt(bought)).ok, true);
	const vault = [{ json: bought }, { json: spent }, { json: spent }, { json: traded }, { json: { not: 'a credit' } }];
	assert.equal(balanceOf(vault, ann.did, 'test'), 7, 'bought 10, spent 3; the copy counts once');
	assert.equal(balanceOf(vault, ann.did, 'live'), -2);
	assert.equal(balanceOf(vault, bob.did, 'live'), 2);
	assert.equal(movesOf(vault, ann.did).length, 3);
	assert.equal(lastMoveOf(vault, ann.did)?.contentHash, traded.contentHash);
	assert.equal(balanceOf([{ json: bought, holds: 'no' }], ann.did, 'test'), 0, 'a move that doesn’t hold doesn’t count');
});

test('buy facts: a published pack in test mode, nothing charged', async () => {
	const m = move({ kind: 'buy', credits: 10, to: 'did:key:zAnn', pack: TEST_PACKS[0] });
	const f = buyFacts(m, ['did:key:zAnn'], TEST_PACKS);
	assert.equal(f.packPublished, true);
	assert.equal(f.priceMatchesPack, true);
	assert.equal(f.live, false);
	assert.equal(buyFacts({ ...m, credits: 1000 }, ['did:key:zAnn'], TEST_PACKS).packPublished, false, 'a pack is what the host publishes');
	assert.equal(buyFacts(m, ['did:key:zAnn'], TEST_PACKS, '2027-01-01T00:00:00Z').datedBeforePrevious, true);
});
