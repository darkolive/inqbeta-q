/* Treaties and settlement (ADR-Q-042): banking cards, two-sided treaties, swap first, pay the difference, standing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { foundFederation, newDraft } from '../src/federations';
import { openWith } from '../src/seal';
import {
	agreeSettlement,
	agreeTreaty,
	checkBankingCard,
	currentBankingCard,
	detailsMatch,
	giveNotice,
	makeBankingCard,
	proposeSettlement,
	proposeTreaty,
	sealDetailsFor,
	settleSums,
	settlementParts,
	treatyParts,
	treatyStanding,
	withinCap,
	type Side
} from '../src/treaties';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 71 + n) % 251);
const NOW = new Date('2026-10-06T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

async function two(currencyB = 'GBP') {
	const ana = await identityFromSeed(seed(1));
	const bo = await identityFromSeed(seed(2));
	const inc = await foundFederation(signerFor(ana), { ...newDraft(NOW), name: 'Incubator', purpose: 'Commons.' }, { now: NOW });
	const dos = await foundFederation(signerFor(bo), { ...newDraft(NOW), name: 'DoStudy', purpose: 'Courses.' }, { now: NOW });
	const cardA = await makeBankingCard(inc.key, { name: 'Incubator CIC', sortCode: '12-34-56', account: '12345678' }, { currency: 'GBP' }, NOW);
	const cardB = await makeBankingCard(dos.key, { name: 'DoStudy Ltd', sortCode: '65-43-21', account: '87654321' }, { currency: currencyB }, NOW);
	const side = (f: typeof inc, name: string, currency: string, card: string): Side => ({ federation: f.founding.federation, name, mint: f.founding.federation, currency, mode: 'test', bankingCard: card });
	const terms = {
		a: side(inc, 'Incubator', 'GBP', cardA.contentHash),
		b: side(dos, 'DoStudy', currencyB, cardB.contentHash),
		purpose: { ethics: ['Both CICs with an asset lock'], offered: ['Storage'], sought: ['Training'] },
		rate: currencyB === 'GBP' ? ({ kind: 'par' } as const) : ({ kind: 'source', source: 'ecb' } as const),
		cap: { credits: 500 },
		period: 7 as const,
		excludes: [],
		until: null
	};
	return { ana, bo, inc, dos, cardA, cardB, terms };
}

test('a banking card shows only the last four; the details reach the partner sealed, and must match', async () => {
	const { inc, dos, cardA } = await two();
	assert.equal(cardA.content.ends, '5678');
	assert.ok(!JSON.stringify(cardA).includes('12345678'), 'the full number is never in the card');
	assert.ok((await checkBankingCard(cardA, inc.founding.federation)).ok);
	assert.equal((await checkBankingCard({ ...cardA, content: { ...cardA.content, ends: '0000' } })).ok, false, 'tampered');
	await assert.rejects(makeBankingCard(inc.key, { name: 'X', sortCode: '1', account: '2' }, { currency: 'GBP' }), /sort code/);

	const sealed = await sealDetailsFor(cardA, { name: 'Incubator CIC', sortCode: '123456', account: '12345678' }, dos.founding.federation);
	const opened = await openWith(sealed, dos.key);
	assert.ok(opened.ok);
	if (opened.ok) assert.ok((await detailsMatch(opened.body, cardA)).ok, 'the partner can open them, and they match');
	await assert.rejects(sealDetailsFor(cardA, { name: 'Mallory', sortCode: '111111', account: '99999999' }, dos.founding.federation), /aren’t the ones/);

	const next = await makeBankingCard(inc.key, { name: 'Incubator CIC', sortCode: '123456', account: '22223333' }, { currency: 'GBP', replaces: cardA.contentHash }, days(1));
	assert.equal((await currentBankingCard([cardA, next], inc.founding.federation))?.content.ends, '3333', 'a changed card is a new receipt naming the old');
});

test('a treaty counts only with both federations and their mandate holders', async () => {
	const { ana, bo, inc, dos, terms } = await two();
	const proposed = await proposeTreaty(signerFor(inc.key), signerFor(ana), 'treasurer', terms, NOW);
	let p = await treatyParts(proposed);
	assert.ok(p.termsOk && p.signedByA && !p.signedByB && p.hasPurpose);
	assert.equal(treatyStanding(proposed, p, { inForceSince: NOW.toISOString(), settlements: [] }, NOW).state, 'proposed');

	const agreed = await agreeTreaty(proposed, signerFor(dos.key), signerFor(bo), 'treasurer');
	p = await treatyParts(agreed);
	assert.ok(p.signedByA && p.signedByB);
	assert.equal(p.holderB, bo.did);
	assert.equal(treatyStanding(agreed, p, { inForceSince: NOW.toISOString(), settlements: [] }, days(1)).state, 'in-force');

	const widened = await treatyParts({ ...agreed, cap: { credits: 50_000 } });
	assert.ok(!widened.signedByA && !widened.signedByB, 'a changed cap breaks every signature');

	await assert.rejects(proposeTreaty(signerFor(inc.key), signerFor(ana), 'treasurer', { ...terms, b: { ...terms.b, mode: 'live' } }), /Test and live/);
	await assert.rejects(proposeTreaty(signerFor(inc.key), signerFor(ana), 'treasurer', { ...terms, rate: { kind: 'source', source: 'ecb' } }), /par/);
	await assert.rejects(proposeTreaty(signerFor(inc.key), signerFor(ana), 'treasurer', { ...terms, period: 5 as never }), /Settle daily/);
	await assert.rejects(proposeTreaty(signerFor(dos.key), signerFor(bo), 'treasurer', terms), /Side A/);
});

test('settled by swap only; then with a net payment; the ADR’s worked example', async () => {
	const { terms } = await two();
	/* Each holds 70 of the other's: all swapped, nothing paid. */
	assert.deepEqual(settleSums(terms, { aHoldsOfB: 7000, bHoldsOfA: 7000 }), { swap: { aReturnsToB: 7000, bReturnsToA: 7000 }, net: null });
	/* Incubator holds 100 DoStudy credits, DoStudy 70 Incubator: swap 70 each way; DoStudy pays £30 to Incubator's card. */
	const s = settleSums(terms, { aHoldsOfB: 10_000, bHoldsOfA: 7000 });
	assert.deepEqual(s.swap, { aReturnsToB: 7000, bReturnsToA: 7000 });
	assert.deepEqual(s.net, { payer: 'b', minor: 3000, currency: 'GBP', toCard: terms.a.bankingCard });
});

test('across currencies: at the named source’s rate on the day', async () => {
	const { terms } = await two('EUR');
	/* €1 = £0.87. Incubator holds €100 of DoStudy's; DoStudy holds £50 of Incubator's. */
	const s = settleSums(terms, { aHoldsOfB: 10_000, bHoldsOfA: 5000 }, 0.87);
	assert.equal(s.swap.bReturnsToA, 5000, 'all £50 swapped');
	assert.equal(s.swap.aReturnsToB, 5747, '£50 is €57.47 of DoStudy’s');
	assert.deepEqual(s.net, { payer: 'b', minor: 4253, currency: 'EUR', toCard: terms.a.bankingCard }, 'DoStudy redeems the rest in euros');
});

test('the settlement both sign holds; one that pays what could have been swapped, or to another account, doesn’t', async () => {
	const { ana, bo, inc, dos, terms } = await two();
	const t = await agreeTreaty(await proposeTreaty(signerFor(inc.key), signerFor(ana), 'treasurer', terms, NOW), signerFor(dos.key), signerFor(bo), 'treasurer');
	const s = await agreeSettlement(await proposeSettlement(t, signerFor(inc.key), { from: NOW.toISOString(), to: days(7).toISOString(), holdings: { aHoldsOfB: 10_000, bHoldsOfA: 7000 }, rate: { aPerB: 1, on: days(7).toISOString() } }, days(7)), t, signerFor(dos.key));
	const p = await settlementParts(s, t);
	assert.deepEqual(p, { forThisTreaty: true, signedByBoth: true, balances: true, swappedFirst: true, toNamedCard: true, rateIsTheTreatys: true });

	const grossPaid = { ...s, sums: { swap: { aReturnsToB: 0, bReturnsToA: 0 }, net: { payer: 'b' as const, minor: 10_000, currency: 'GBP', toCard: terms.a.bankingCard } } };
	const g = await settlementParts(grossPaid, t);
	assert.equal(g.swappedFirst, false, 'pounds paid for credits that could have been swapped');
	assert.equal(g.balances, false);
	const elsewhere = await settlementParts({ ...s, sums: { ...s.sums, net: { ...s.sums.net!, toCard: 'somewhere-else' } } }, t);
	assert.equal(elsewhere.toNamedCard, false);

	/* Standing: a period closes unsettled and it suspends; settled, it's back in force. */
	const parts = await treatyParts(t);
	assert.match(treatyStanding(t, parts, { inForceSince: NOW.toISOString(), settlements: [] }, days(8)).says, /overdue/);
	assert.equal(treatyStanding(t, parts, { inForceSince: NOW.toISOString(), settlements: [s] }, days(8)).state, 'in-force');
	/* A partner's drift over 20% suspends it; over 10% warns. */
	const fresh = days(1).toISOString();
	assert.equal(treatyStanding(t, parts, { inForceSince: NOW.toISOString(), settlements: [], health: { b: { drift: 0.25, reconciled: fresh } } }, days(1)).state, 'suspended');
	assert.equal(treatyStanding(t, parts, { inForceSince: NOW.toISOString(), settlements: [], health: { b: { drift: 0.12, reconciled: fresh } } }, days(1)).warnings.length, 1);
	assert.equal(treatyStanding(t, parts, { inForceSince: NOW.toISOString(), settlements: [], health: { a: { drift: 0, reconciled: null } } }, days(1)).state, 'suspended', 'books never reconciled');

	/* Notice: ending in 30 days, then ended. */
	const n = await giveNotice(t, 'b', signerFor(dos.key), 'We’re closing the courses.', days(1));
	assert.equal(treatyStanding(t, parts, { inForceSince: NOW.toISOString(), settlements: [s], ending: n }, days(2)).state, 'ending');
	assert.equal(treatyStanding(t, parts, { inForceSince: NOW.toISOString(), settlements: [s], ending: n }, days(32)).state, 'ended');

	/* The cap. */
	assert.ok(withinCap(t, 'a', 40_000, 10_000).ok);
	assert.equal(withinCap(t, 'a', 45_000, 10_000).ok, false);
	assert.equal(withinCap({ ...t, cap: { credits: 500, shareOfReserve: 0.1 } }, 'a', 0, 20_000, { ownReserveMinor: 100_000 }).ok, false, 'more than 10% of the reserve');
});
