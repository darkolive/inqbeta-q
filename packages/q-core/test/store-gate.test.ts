/* Kept storage at the gate (ADR-Q-030): space only against a purchase the gate can check itself. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sealWith } from '../src/seal';
import { AGREEMENT_SCHEMA, AGREEMENT_SOURCE, type AgreementStep, type Terms } from '../src/agreements';

const seed = (n: number) => new Uint8Array(32).fill(n);
let clock = Date.parse('2026-10-04T12:00:00Z');
const tick = () => new Date((clock += 60_000)).toISOString();

test('kept storage: bound by the buyer, from an operator’s listing naming this node, never otherwise', async () => {
	const { applyToShop, checkStoreHire, storeQuota, storePathOk, nodeIdentity, relayWhere } = await import('../../../node/gate/server.mjs');
	const node = (await nodeIdentity('ab'.repeat(32)))!;
	const ana = await identityFromSeed(seed(71));
	const ben = await identityFromSeed(seed(72));
	const cat = await identityFromSeed(seed(73));
	const sign = (who: typeof ana, s: Record<string, unknown>) => sealWith(who, s);
	const step = (s: Partial<AgreementStep> & Pick<AgreementStep, 'step' | 'parent' | 'agreement'>) => ({ schema: AGREEMENT_SCHEMA, source: AGREEMENT_SOURCE, at: tick(), ...s });
	const svc = { kind: 'store' as const, store: 'https://storage.example.org', where: relayWhere(node), gb: 2, months: 1 };
	const t: Terms = { kind: 'job', a: ana.did, b: '', aGives: { thing: '2 GB kept' }, bGives: { credits: 3, mode: 'test' }, service: svc };
	const listing = await sign(ana, step({ agreement: 'keep', step: 'proposed', parent: null, terms: t, limit: 5 }));
	let shop = (await applyToShop(null, listing, ana.did)).shop;
	const taken = await sign(ben, step({ agreement: 'keep.b', step: 'taken', parent: listing.contentHash, terms: { ...t, b: ben.did } }));
	shop = (await applyToShop(shop, taken, ana.did)).shop;
	const shopOf = async (did: string) => (did === ana.did ? shop : null);
	const id = 'A'.repeat(22);
	const bind = await sign(ben, { schema: 'inqbeta.store-bind/1', source: 'inqbeta:q/store', agreement: 'keep.b', id, at: tick() });
	const ops = new Set([ana.did]);
	const now = Date.parse(clock + '') || clock;

	const ok = await checkStoreHire({ taken, bind }, id, node, shopOf, ops, now);
	assert.equal(ok.hire?.bytes, 2 * 1024 ** 3);
	assert.equal(ok.hire?.did, ben.did);
	assert.equal(storeQuota({ hires: [ok.hire] }, now), 2 * 1024 ** 3);
	assert.equal(storeQuota({ hires: [ok.hire] }, now + 31 * 86400000), 0, 'the term ends');

	assert.match((await checkStoreHire({ taken, bind }, 'B'.repeat(22), node, shopOf, ops, now)).says, /bound to this space/, 'another space');
	const catBind = await sign(cat, { schema: 'inqbeta.store-bind/1', source: 'inqbeta:q/store', agreement: 'keep.b', id, at: tick() });
	assert.match((await checkStoreHire({ taken, bind: catBind }, id, node, shopOf, ops, now)).says, /bound to this space/, 'someone else binding it');
	assert.match((await checkStoreHire({ taken, bind }, id, node, shopOf, new Set([cat.did]), now)).says, /doesn’t run this node/);
	/* Cat lists 1000 GB naming this node in her own shop: she isn't an operator. */
	const big = { ...t, a: cat.did, service: { ...svc, gb: 1000 } };
	const catListing = await sign(cat, step({ agreement: 'big', step: 'proposed', parent: null, terms: big, limit: 1 }));
	const catShop = (await applyToShop(null, catListing, cat.did)).shop;
	const catTaken = await sign(ben, step({ agreement: 'big.b', step: 'taken', parent: catListing.contentHash, terms: { ...big, b: ben.did } }));
	const catBound = await sign(ben, { schema: 'inqbeta.store-bind/1', source: 'inqbeta:q/store', agreement: 'big.b', id, at: tick() });
	assert.match((await checkStoreHire({ taken: catTaken, bind: catBound }, id, node, async () => catShop, ops, now)).says, /doesn’t run this node/);
	/* A taking the shop never counted. */
	const sneaky = await sign(ben, step({ agreement: 'keep.z', step: 'taken', parent: listing.contentHash, terms: { ...t, b: ben.did } }));
	const sneakyBind = await sign(ben, { schema: 'inqbeta.store-bind/1', source: 'inqbeta:q/store', agreement: 'keep.z', id, at: tick() });
	assert.match((await checkStoreHire({ taken: sneaky, bind: sneakyBind }, id, node, shopOf, ops, now)).says, /isn’t in the seller’s shop/);

	assert.equal(storePathOk('abc.dsv'), true);
	assert.equal(storePathOk('READ ME.txt'), true);
	assert.equal(storePathOk('../x'), false);
	assert.equal(storePathOk('/etc/passwd'), false);
});
