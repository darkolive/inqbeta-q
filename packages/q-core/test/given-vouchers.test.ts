/* Given vouchers in the mint's books (ADR-Q-044 step 6): held behind a copy, paid to a provider, or returned. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sealWith } from '../src/seal';
import { MINT_SCHEMA, MINT_SOURCE, VOUCHER_MONEY_SCHEMA, booksOf, givenCopies, spendable, type VoucherMoneyEntry } from '../src/mint';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 29 + n) % 251);

test('a grant: 400 held behind each copy; one paid to the trainer, one returned; nobody can cash out what’s held', async () => {
	const mint = await identityFromSeed(seed(1));
	const fdn = 'did:key:zFoundation';
	const trainer = 'did:key:zTrainer';
	const at = (m: number) => `2026-10-08T10:${String(m).padStart(2, '0')}:00Z`;
	const minted = await sealWith(mint, { schema: MINT_SCHEMA, source: MINT_SOURCE, mint: mint.did, kind: 'mint', credits: 1000, mode: 'test', to: fdn, pence: 100000, cites: ['test-payment'], at: at(0) });
	const v = (kind: VoucherMoneyEntry['kind'], number: number, m: number, extra: Partial<VoucherMoneyEntry> = {}) =>
		sealWith(mint, { schema: VOUCHER_MONEY_SCHEMA, source: MINT_SOURCE, mint: mint.did, mode: 'test', kind, voucher: 'grant-1', number, giver: fdn, credits: 400, record: null, at: at(m), ...extra } satisfies VoucherMoneyEntry);
	const ledger = [minted, await v('held', 1, 1), await v('held', 2, 2)];
	const books = (l: unknown[]) => booksOf(l.map((json) => ({ json })), mint.did, 'test', 'GBP');
	let b = books(ledger);
	assert.equal(b.holders.get(fdn), 1000, 'still the foundation’s credits');
	assert.equal(spendable(b, fdn), 200, '800 are held behind two copies');

	const paid = [...ledger, await v('paid', 1, 3, { to: trainer }), await v('returned', 2, 4)];
	b = books(paid);
	assert.deepEqual(b.problems, []);
	assert.equal(b.holders.get(trainer), 400, 'the trainer is paid: ordinary credits now');
	assert.equal(b.holders.get(fdn), 600);
	assert.equal(spendable(b, fdn), 600, 'what’s returned is the foundation’s to spend again');
	assert.ok(b.reconciled);

	/* Paid twice, or paid with nothing held: refused in the reading. */
	b = books([...paid, await v('paid', 1, 5, { to: trainer }), await v('paid', 3, 6, { to: trainer })]);
	assert.equal(b.holders.get(trainer), 400);
	assert.equal(b.problems.length, 2);

	const g = givenCopies(paid, mint.did, 'test', 'grant-1');
	assert.equal(g.get(1)?.state, 'paid');
	assert.equal(g.get(1)?.to, trainer);
	assert.equal(g.get(2)?.state, 'returned');
});
