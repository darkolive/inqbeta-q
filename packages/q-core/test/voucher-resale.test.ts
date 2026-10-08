/* Selling a copy on (ADR-Q-044 §5): within the issuer's limit; credits held until the buyer signs for it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor, type Identity } from '../src/passkey';
import { sealWith } from '../src/seal';
import { AGREEMENT_SCHEMA, AGREEMENT_SOURCE, committedBy, standingOf, takingId, type AgreementReceipt, type AgreementStep } from '../src/agreements';
import { editionOf, issueCopy, makeVoucher, passOn, receive } from '../src/vouchers';
import { resaleOf, resaleReleaseProblem, resaleTerms } from '../src/voucher-sales';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 61 + n) % 251);
const NOW = new Date('2026-10-08T12:00:00Z');
const step = (who: Identity, c: Omit<AgreementStep, 'schema' | 'source'>) => sealWith(who, { schema: AGREEMENT_SCHEMA, source: AGREEMENT_SOURCE, ...c } as AgreementStep) as Promise<AgreementReceipt>;

test('a ticket sold on: over the limit refused; held, handed over, signed for, settled', async () => {
	const venue = await identityFromSeed(seed(1));
	const ana = await identityFromSeed(seed(2));
	const ben = await identityFromSeed(seed(3));
	const v = await makeVoucher(venue, { title: 'Gig, Friday', words: 'Standing.', pictures: [], medium: 'service', kind: 'edition', of: 100, price: { paid: true, credits: 10, mint: 'did:key:zM', currency: 'GBP' }, moves: 'sellable', resaleUpTo: 12, realm: { kinds: 'itself', accepted: [] } }, NOW);
	const mine = await receive(await issueCopy(signerFor(venue), v, { number: 7, holder: ana.did, via: 'shop.ana' }, NOW), signerFor(ana));
	assert.throws(() => resaleTerms(v, { holder: ana.did, number: 7, credits: 20, mode: 'test', mint: 'did:key:zM' }), /most it can be sold on for/);
	const bound = await makeVoucher(venue, { ...v.content, moves: 'bound', resaleUpTo: undefined }, NOW);
	assert.throws(() => resaleTerms(bound, { holder: ana.did, number: 1, credits: 5, mode: 'test', mint: 'did:key:zM' }), /bound/);

	const terms = resaleTerms(v, { holder: ana.did, number: 7, credits: 12, mode: 'test', mint: 'did:key:zM' });
	const listing = await step(ana, { agreement: 'resale', step: 'proposed', parent: null, terms, limit: 1, at: '2026-10-08T12:00:00Z' });
	const id = takingId('resale', 'ben');
	const taken = await step(ben, { agreement: id, step: 'taken', parent: listing.contentHash, terms: { ...terms, b: ben.did }, at: '2026-10-08T12:01:00Z' });
	const s = standingOf([listing, taken]);
	assert.equal(committedBy(s, ben.did, 'test'), 12, 'the buyer’s credits are held');
	let e = await editionOf(v, [mine]);
	assert.equal(resaleOf(v, s, [mine], e.holdings)!.state, 'taken');

	const handed = await passOn(mine, v, signerFor(ana), { to: ben.did, how: 'sold', price: 12, via: id }, NOW);
	assert.equal(resaleOf(v, s, [mine, handed], e.holdings)!.state, 'handed');
	assert.match(resaleReleaseProblem(resaleOf(v, s, [mine, handed], e.holdings), [])!, /signed for/);

	const got = await receive(handed, signerFor(ben));
	e = await editionOf(v, [mine, got]);
	assert.equal(e.holdings[0].holder, ben.did);
	const r = resaleOf(v, s, [mine, got], e.holdings)!;
	assert.equal(r.state, 'received');
	assert.equal(resaleReleaseProblem(r, r.release!), null);
	const one = await step(ben, { agreement: id, step: 'settled', parent: taken.contentHash, entries: r.release!, at: '2026-10-08T12:05:00Z' });
	const two = await step(ana, { agreement: id, step: 'settled', parent: one.contentHash, entries: r.release!, at: '2026-10-08T12:06:00Z' });
	const done = standingOf([listing, taken, one, two]);
	assert.equal(done.phase, 'complete', done.problems.join(' '));
	assert.equal(resaleOf(v, done, [mine, got], e.holdings)!.state, 'released');
});
