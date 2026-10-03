/* The gate's shop (ADR-Q-026): only the seller lists, anyone else buys, stock is counted, one at a time. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sealWith } from '../src/seal';
import { AGREEMENT_SCHEMA, AGREEMENT_SOURCE, type AgreementStep, type Terms } from '../src/agreements';

const seed = (n: number) => new Uint8Array(32).fill(n);
let clock = Date.parse('2026-10-03T12:00:00Z');
const tick = () => new Date((clock += 60_000)).toISOString();

test('a shop at the gate: list, buy to the limit, sold out, cancel puts one back, withdraw closes it', async () => {
	const { applyToShop, shopWindow } = await import('../../../node/gate/server.mjs');
	const ana = await identityFromSeed(seed(61));
	const ben = await identityFromSeed(seed(62));
	const cat = await identityFromSeed(seed(63));
	const sign = (who: typeof ana, s: Partial<AgreementStep> & Pick<AgreementStep, 'step' | 'parent' | 'agreement'>) => sealWith(who, { schema: AGREEMENT_SCHEMA, source: AGREEMENT_SOURCE, at: tick(), ...s });
	const jam: Terms = { kind: 'swap', a: ana.did, b: '', aGives: { thing: 'A jar of jam' }, bGives: { credits: 4, mode: 'test' } };
	const listing = await sign(ana, { agreement: 'jam', step: 'proposed', parent: null, terms: jam, limit: 1 });

	assert.match((await applyToShop(null, listing, ben.did)).says, /Only the shop’s owner/);
	let shop = (await applyToShop(null, listing, ana.did)).shop;
	assert.equal(shopWindow(shop)[0].left, 1);

	const take = (who: typeof ana, part: string, terms: Terms = { ...jam, b: who.did }) => sign(who, { agreement: `jam.${part}`, step: 'taken', parent: listing.contentHash, terms });
	assert.match((await applyToShop(shop, await take(ana, 'a'), ana.did)).says, /own shop/);
	assert.match((await applyToShop(shop, await take(ben, 'x', { ...jam, b: ben.did, bGives: { credits: 1, mode: 'test' } }), ana.did)).says, /own terms/);
	const bens = await take(ben, 'b');
	shop = (await applyToShop(shop, bens, ana.did)).shop;
	assert.equal(shopWindow(shop)[0].left, 0);
	assert.equal((await applyToShop(shop, await take(cat, 'c'), ana.did)).says, 'Sold out.');

	assert.match((await applyToShop(shop, await sign(ben, { agreement: 'jam.b', step: 'declined', parent: bens.contentHash }), ana.did)).says, /owner cancels/);
	shop = (await applyToShop(shop, await sign(ana, { agreement: 'jam.b', step: 'declined', parent: bens.contentHash }), ana.did)).shop;
	assert.equal(shopWindow(shop)[0].left, 1, 'cancelled as sold out, back in stock');
	shop = (await applyToShop(shop, await take(cat, 'c'), ana.did)).shop;
	assert.equal(shopWindow(shop)[0].left, 0);

	shop = (await applyToShop(shop, await sign(ana, { agreement: 'jam', step: 'withdrawn', parent: listing.contentHash }), ana.did)).shop;
	assert.deepEqual(shopWindow(shop), []);
});
