/* Test mode and publishing (ADR-Q-027 §7): every host starts in test; one signed publication makes it live, for good. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sealWith } from '../src/seal';
import { MONEY_PUBLISHED_SCHEMA, RESPONSIBILITY, moneyStateOf, problemsWithPublication, publishedCurrency, type MoneyPublication } from '../src/money';

const seed = (n: number) => new Uint8Array(32).fill(n);
const pub = (host: string, mint: string, at: string, over: Partial<MoneyPublication> = {}): MoneyPublication => ({
	schema: MONEY_PUBLISHED_SCHEMA,
	source: 'inqbeta:q/host',
	host,
	mint,
	currency: 'GBP',
	bank: { ends: '4321' },
	responsibility: RESPONSIBILITY,
	accepted: true,
	at,
	...over
});

test('a host is in test mode until its founder publishes; the first publication is the published ID, and it never changes', async () => {
	const founder = await identityFromSeed(seed(71));
	const stranger = await identityFromSeed(seed(72));
	const host = 'did:key:zHost';
	const mint = 'did:key:zMint';
	assert.deepEqual(await moneyStateOf([], host, founder.did), { mode: 'test' });

	const forged = await sealWith(stranger, pub(host, mint, '2026-10-03T10:00:00Z'));
	assert.equal((await moneyStateOf([forged], host, founder.did)).mode, 'test', 'only the founder can publish');

	const first = await sealWith(founder, pub(host, mint, '2026-10-03T11:00:00Z'));
	const second = await sealWith(founder, pub(host, mint, '2026-10-03T12:00:00Z', { currency: 'EUR' }));
	const s = await moneyStateOf([second, forged, first], host, founder.did);
	assert.equal(s.mode, 'live');
	assert.equal(s.publishedId, first.contentHash, 'the first one stands');
	assert.equal(s.publication?.currency, 'GBP', 'the currency never changes');

	const unticked = await sealWith(founder, { ...pub(host, mint, '2026-10-03T09:00:00Z'), accepted: false } as unknown as MoneyPublication);
	assert.equal((await moneyStateOf([unticked], host, founder.did)).mode, 'test');
});

test('what a publication needs before it’s signed', () => {
	const ok = { host: 'h', mint: 'm', currency: 'GBP', bank: { ends: '4321' }, responsibility: RESPONSIBILITY, accepted: true };
	assert.deepEqual(problemsWithPublication(ok), []);
	assert.equal(problemsWithPublication({ ...ok, accepted: false }).length, 1);
	assert.equal(problemsWithPublication({ ...ok, bank: { ends: '' } }).length, 1);
	assert.equal(problemsWithPublication({ ...ok, currency: '' }).length, 1);
	assert.equal(problemsWithPublication({ ...ok, currency: 'pounds' }).length, 1);
	assert.equal(problemsWithPublication({ ...ok, responsibility: 'something else' }).length, 1);
});

test('a publication from before currencies (a rate in pence) reads as pounds', () => {
	assert.equal(publishedCurrency({ pencePerCredit: 100 } as unknown as MoneyPublication), 'GBP');
	assert.equal(publishedCurrency({ currency: 'EUR' }), 'EUR');
	assert.equal(publishedCurrency(undefined), 'GBP');
});
