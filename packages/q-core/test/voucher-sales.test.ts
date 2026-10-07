/* Buying a voucher (ADR-Q-044 step 3): taken from the shop, credits held, issued, redeemed, released. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor, type Identity } from '../src/passkey';
import { sealWith } from '../src/seal';
import { AGREEMENT_SCHEMA, AGREEMENT_SOURCE, committedBy, standingOf, takingId, type AgreementReceipt, type AgreementStep } from '../src/agreements';
import { acceptRedeem, askRedeem, editionOf, issueCopy, makeVoucher, receive } from '../src/vouchers';
import { isSaleOf, listingLimit, listingTerms, paidFor, releaseProblem, saleOf, voucherThing } from '../src/voucher-sales';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 83 + n) % 251);
const NOW = new Date('2026-10-07T12:00:00Z');
const step = (who: Identity, c: Omit<AgreementStep, 'schema' | 'source'>) => sealWith(who, { schema: AGREEMENT_SCHEMA, source: AGREEMENT_SOURCE, ...c } as AgreementStep) as Promise<AgreementReceipt>;

test('a t-shirt bought from the shop: held, issued, received, redeemed, released', async () => {
	const shop = await identityFromSeed(seed(1));
	const ana = await identityFromSeed(seed(2));
	const mint = 'did:key:zShopMint';
	const v = await makeVoucher(shop, { title: 'Olive t-shirt, medium', words: 'Organic cotton.', pictures: [{ hash: 'c'.repeat(64), type: 'image/webp', alt: 'An olive t-shirt.' }], medium: 'physical', kind: 'edition', of: 50, price: { paid: true, credits: 10, mint, currency: 'GBP' }, moves: 'sellable', realm: { kinds: 'itself', accepted: [] } }, NOW);
	assert.equal(listingLimit(v.content), 50);
	const terms = listingTerms(v, 'test');
	assert.equal(terms.aGives && 'thing' in terms.aGives && terms.aGives.thing, voucherThing(v));

	const listing = await step(shop, { agreement: 'shop-1', step: 'proposed', parent: null, terms, limit: 50, at: '2026-10-07T12:00:00Z' });
	const id = takingId('shop-1', 'ana');
	const taken = await step(ana, { agreement: id, step: 'taken', parent: listing.contentHash, terms: { ...terms, b: ana.did }, at: '2026-10-07T12:01:00Z' });
	let s = standingOf([listing, taken]);
	assert.equal(s.phase, 'agreed', s.problems.join(' '));
	assert.ok(isSaleOf(v, s));
	assert.equal(committedBy(s, ana.did, 'test'), 10, 'the buyer’s credits are held, not paid');
	assert.equal(saleOf(v, s, [])!.state, 'taken');

	/* Issued naming the sale: paid for. Another copy naming the same sale, or none: not. */
	const copy = await issueCopy(signerFor(shop), v, { number: 7, holder: ana.did, via: id }, NOW);
	assert.ok(paidFor(v, copy, [s]));
	assert.equal(paidFor(v, { ...copy, via: undefined }, [s]), false, 'no sale named');
	assert.equal(paidFor(v, { ...copy, holder: shop.did }, [s]), false, 'not to the buyer');
	assert.equal(paidFor(v, copy, [s], [{ ...copy, number: 8 }]), false, 'one sale, one copy');
	assert.equal(saleOf(v, s, [], { issuedTo: true })!.state, 'issued');

	const held = [await receive(copy, signerFor(ana))];
	let e = await editionOf(v, held);
	assert.equal(saleOf(v, s, e.holdings)!.state, 'received');
	assert.match(releaseProblem(saleOf(v, s, e.holdings), [])!, /until the voucher is redeemed/);

	const r = await acceptRedeem(await askRedeem(e.holdings[0], signerFor(ana), { redeemer: shop.did, forKind: 'itself' }, NOW), signerFor(shop));
	e = await editionOf(v, held, [r]);
	const sale = saleOf(v, s, e.holdings)!;
	assert.equal(sale.state, 'redeemed');
	assert.equal(releaseProblem(sale, sale.release!), null);
	assert.match(releaseProblem(sale, sale.release!.slice(1))!, /exactly what was agreed/);

	const one = await step(ana, { agreement: id, step: 'settled', parent: taken.contentHash, entries: sale.release!, at: '2026-10-07T13:00:00Z' });
	const two = await step(shop, { agreement: id, step: 'settled', parent: one.contentHash, entries: sale.release!, at: '2026-10-07T13:01:00Z' });
	s = standingOf([listing, taken, one, two]);
	assert.equal(s.phase, 'complete', s.problems.join(' '));
	assert.equal(committedBy(s, ana.did, 'test'), 0);
	assert.equal(saleOf(v, s, e.holdings)!.state, 'released');
});

test('cancelled by the issuer before settling: nothing moves; unredeemed at its end: a refund is due', async () => {
	const shop = await identityFromSeed(seed(3));
	const ben = await identityFromSeed(seed(4));
	const v = await makeVoucher(shop, { title: 'Pottery class', words: 'One evening.', pictures: [], medium: 'service', kind: 'consumable', of: null, price: { paid: true, credits: 20, mint: 'did:key:zM', currency: 'GBP' }, moves: 'giftable', realm: { kinds: 'itself', accepted: [] }, ends: { at: '2026-12-31T00:00:00Z', then: 'refund' } }, NOW);
	assert.throws(() => listingLimit(v.content), /how many/);
	const terms = listingTerms(v, 'test');
	const listing = await step(shop, { agreement: 'shop-2', step: 'proposed', parent: null, terms, limit: listingLimit(v.content, 12), at: '2026-10-07T12:00:00Z' });
	const id = takingId('shop-2', 'ben');
	const taken = await step(ben, { agreement: id, step: 'taken', parent: listing.contentHash, terms: { ...terms, b: ben.did }, at: '2026-10-07T12:01:00Z' });
	const s = standingOf([listing, taken]);
	assert.equal(saleOf(v, s, [], { now: new Date('2027-01-02T00:00:00Z') })!.state, 'refund-due');
	const cancel = await step(shop, { agreement: id, step: 'declined', parent: taken.contentHash, at: '2026-10-08T00:00:00Z' });
	const c = standingOf([listing, taken, cancel]);
	assert.equal(saleOf(v, c, [])!.state, 'cancelled');
	assert.equal(committedBy(c, ben.did, 'test'), 0, 'the held credits are the buyer’s again');
	/* A given voucher isn't sold. */
	const grant = await makeVoucher(shop, { ...v.content, price: { paid: false, from: 'credits', worth: 20, mint: 'did:key:zM', currency: 'GBP' }, moves: 'bound', ends: { at: '2026-12-31T00:00:00Z', then: 'return' }, eligibleUnder: 'open' }, NOW);
	assert.throws(() => listingTerms(grant, 'test'), /isn’t sold/);
});
