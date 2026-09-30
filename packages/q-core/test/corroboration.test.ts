/*
 * What stands behind a claim.
 *
 * One rule carries this file: counting signatures measures redundancy,
 * counting ORIGINS measures trust. Everything else follows — ten signatures
 * from one party must not out-weigh two from two, a copy of a claim is not a
 * second source, and an old corroboration is not the same as a fresh one.
 *
 * And nothing here returns a verdict. A number gets acted on without its
 * reasons, so the number is for sorting and the sentence names who.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	MOST_SURE,
	corroborationOf,
	independent,
	support,
	supportFor,
	weightOf,
	type Source,
} from '../src/corroboration';

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;
const NOW = Date.UTC(2026, 8, 20);
const ago = (d: number) => NOW - d * DAY;

const src = (over: Partial<Source> = {}): Source => ({
	by: 'did:key:z1',
	origin: 'me',
	at: ago(1),
	held: 'signed',
	called: 'you',
	...over,
});

test('three signatures from one party are one witness wearing three coats', () => {
	const firm = [
		src({ by: 'did:key:zA', origin: 'audit-co', called: 'the auditor' }),
		src({ by: 'did:key:zB', origin: 'audit-co', called: 'their colleague' }),
		src({ by: 'did:key:zC', origin: 'audit-co', called: 'their partner' }),
	];
	assert.equal(independent(firm).length, 1);
	assert.equal(corroborationOf(firm), 'one voice');

	const out = supportFor(firm, YEAR, NOW);
	assert.equal(out.origins, 1);
	assert.equal(out.signatures, 3);
	assert.match(out.says, /2 other signatures came from sources already counted/i);
});

test('two genuinely independent beat ten copies of one, by a distance', () => {
	const many = Array.from({ length: 10 }, (_, i) => src({ origin: 'one-party', by: `did:key:z${i}` }));
	const two = [src({ origin: 'a', called: 'you' }), src({ origin: 'b', called: 'the bank' })];
	assert.ok(support(two, YEAR, NOW) > support(many, YEAR, NOW), 'redundancy is not corroboration');
});

test('the strongest and freshest of each origin is the one that counts', () => {
	const mixed = [
		src({ origin: 'a', held: 'signed', at: ago(1), called: 'a note' }),
		src({ origin: 'a', held: 'witnessed', at: ago(300), called: 'the witnessed one' }),
	];
	assert.equal(independent(mixed)[0].called, 'the witnessed one', 'standing before freshness');

	const sameStanding = [
		src({ origin: 'b', held: 'signed', at: ago(300), called: 'old' }),
		src({ origin: 'b', held: 'signed', at: ago(2), called: 'new' }),
	];
	assert.equal(independent(sameStanding)[0].called, 'new');
});

test('a source is worth less as it ages, and a stronger saying is worth more', () => {
	const fresh = weightOf(src({ held: 'signed', at: NOW }), YEAR, NOW);
	const old = weightOf(src({ held: 'signed', at: ago(365) }), YEAR, NOW);
	assert.ok(Math.abs(old - fresh / 2) < 1e-9, 'a year halves it');

	assert.ok(weightOf(src({ held: 'witnessed' }), YEAR, NOW) > weightOf(src({ held: 'signed' }), YEAR, NOW));
	assert.equal(weightOf(src({ held: 'none' }), YEAR, NOW), 0, 'a note to yourself supports nothing');
});

test('support never reaches certainty, however many agree', () => {
	const crowd = Array.from({ length: 50 }, (_, i) =>
		src({ origin: `o${i}`, held: 'witnessed', at: NOW, called: `witness ${i}` }),
	);
	const s = support(crowd, YEAR, NOW);
	assert.ok(s > 0.99);
	assert.ok(s < 1, '"very sure" and "certain" are different sentences');
	assert.equal(s, MOST_SURE, 'and it is capped on purpose, not left to arithmetic');
	/* Why the cap has to be explicit: the product underflows long before fifty. */
	assert.equal(1 - Math.pow(0.01, 50), 1, 'a double cannot hold 1 - 1e-100');
});

test('nothing said is nothing, and is not the same as said and doubted', () => {
	const none = supportFor([], YEAR, NOW);
	assert.equal(none.standing, 'unsupported');
	assert.equal(none.score, 0);
	assert.match(none.says, /nothing stands behind this yet/i);
});

test('the sentence names who, because a score without its reasons gets acted on', () => {
	const three = [
		src({ origin: 'a', called: 'you' }),
		src({ origin: 'b', called: 'your accountant' }),
		src({ origin: 'c', called: 'the bank' }),
	];
	const out = supportFor(three, YEAR, NOW);
	assert.equal(out.standing, 'well attested');
	assert.match(out.says, /3 independent: /);
	for (const who of ['you', 'your accountant', 'the bank']) assert.ok(out.says.includes(who), who);
	/* No verdict, and never the word trust — this records, it does not judge. */
	assert.doesNotMatch(out.says, /trust|proven|verified|true|reliable/i);
	assert.doesNotMatch(out.says, /\d\.\d/, 'the number is for sorting, not for showing');
});

test('one voice says so plainly rather than sounding like a failure', () => {
	const out = supportFor([src({ called: 'you' })], YEAR, NOW);
	assert.equal(out.standing, 'one voice');
	assert.match(out.says, /only you says so/i);
	assert.doesNotMatch(out.says, /fail|invalid|insufficient|error/i);
});

test('a long list is trimmed, and says how many were left out', () => {
	const five = ['a', 'b', 'c', 'd', 'e'].map((o) => src({ origin: o, called: `source ${o}` }));
	assert.match(supportFor(five, YEAR, NOW).says, /and 2 more/);
});

test('the thresholds are two and three, not a number somebody tuned', () => {
	const at = (n: number) => corroborationOf(Array.from({ length: n }, (_, i) => src({ origin: `o${i}` })));
	assert.equal(at(0), 'unsupported');
	assert.equal(at(1), 'one voice');
	assert.equal(at(2), 'corroborated');
	assert.equal(at(3), 'well attested');
	assert.equal(at(9), 'well attested', 'more than three is still three');
});
