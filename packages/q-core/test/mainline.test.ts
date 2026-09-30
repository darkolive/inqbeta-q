/*
 * What may go on a public DHT.
 *
 * Mainline can be crawled cheaply and archived forever — Vanish relied on DHT
 * expiry to destroy keys and about 600 hopping nodes harvested them first. So
 * these tests are not about byte budgets. They are about the one rule that
 * matters: routing goes out, people do not.
 *
 * The sentences are tested too, because they are what a person reads before
 * deciding, and a refusal nobody understands is a refusal nobody heeds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	MAINLINE_EXPIRY_MS,
	MAINLINE_REPUBLISH_MS,
	MAINLINE_VALUE_LIMIT,
	checkPublication,
	isAboutAPerson,
	looksPersonal,
	roughSize,
	standingOf,
	type Publication,
	type Routing,
} from '../src/mainline';

const DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

const route = (over: Partial<Publication> = {}): Publication => ({
	did: DID,
	entries: [
		{ kind: 'key', id: '0', publicKey: 'z6Mkha…' },
		{ kind: 'service', id: 'n', type: 'iroh', at: 'node:7e4f…' },
	],
	...over,
});

test('a record of a key and a way to reach it is fine, and says so without hedging', () => {
	const v = checkPublication(route());
	assert.equal(v.ok, true);
	assert.deepEqual(v.refused, []);
	/* The promise being made, stated as a promise. */
	assert.match(v.says, /nothing about you/i);
});

test('a card refused: the thing someone will try, for the reason they will try it', () => {
	const v = checkPublication(
		route({
			entries: [
				{ kind: 'key', id: '0', publicKey: 'z6Mkha…' },
				/* "so it's discoverable" */
				{ kind: 'service', id: 'card:business', type: 'card', at: 'content://sha256/ab12' },
			],
		}),
	);
	assert.equal(v.ok, false);
	assert.deepEqual(v.refused, ['card:business']);
	/* Why, in terms of what the network is, not in terms of a policy. */
	assert.match(v.says, /cannot be made to forget/i);
	assert.ok(v.fix.trim(), 'a refusal with nowhere else to put it will be worked around');
	assert.match(v.fix, /card/i);
});

test('an answer about a person is refused however it is dressed up', () => {
	for (const id of ['q:person/called', 'answer:1', 'channel:email', 'contact:mum', 'set:about-you']) {
		assert.equal(isAboutAPerson(id), true, `${id} should never be published`);
	}
	/* Routing ids are not caught by it. */
	for (const id of ['0', 'n', 'iroh', 'relay-1']) {
		assert.equal(isAboutAPerson(id), false, `${id} is routing and must still be publishable`);
	}
});

test('a channel wearing a routing coat is caught by its address, not its name', () => {
	/* The id is innocent. The endpoint is a person's email. */
	const v = checkPublication(
		route({ entries: [{ kind: 'service', id: 'inbox', type: 'relay', at: 'mailto:darren@example.com' }] }),
	);
	assert.equal(v.ok, false);
	assert.deepEqual(v.refused, ['inbox']);
});

test('what counts as a personal address', () => {
	for (const at of ['mailto:a@b.com', 'a@b.com', 'tel:+447700900000', '+44 7700 900000', 'sms:07700900000']) {
		assert.equal(looksPersonal(at), true, `${at} should be refused`);
	}
	for (const at of ['node:7e4f2a', 'https://relay.example/q', 'content://sha256/ab12', 'iroh://k/abc']) {
		assert.equal(looksPersonal(at), false, `${at} is a route and must be allowed`);
	}
});

test('too big is refused with the two numbers a person needs to act on', () => {
	const many: Routing[] = Array.from({ length: 40 }, (_, i) => ({
		kind: 'service' as const,
		id: `s${i}`,
		type: 'relay',
		at: `https://relay-${i}.example.org/some/fairly/long/endpoint/path`,
	}));
	const v = checkPublication(route({ entries: many }));
	assert.equal(v.ok, false);
	assert.ok(v.roughBytes > MAINLINE_VALUE_LIMIT);
	assert.match(v.says, new RegExp(String(MAINLINE_VALUE_LIMIT)));
	assert.match(v.says, new RegExp(String(v.roughBytes)));
});

test('content is refused before size, because they are different problems', () => {
	const many: Routing[] = Array.from({ length: 40 }, (_, i) => ({
		kind: 'service' as const,
		id: `s${i}`,
		type: 'relay',
		at: `https://relay-${i}.example.org/some/fairly/long/endpoint/path`,
	}));
	const v = checkPublication(route({ entries: [...many, { kind: 'service', id: 'q:person/called', type: 'x', at: 'node:1' }] }));
	assert.equal(v.ok, false);
	assert.deepEqual(v.refused, ['q:person/called'], 'the person is the problem, not the length');
	assert.doesNotMatch(v.says, /bytes/i);
});

test('an empty record is refused rather than published as a silent nothing', () => {
	const v = checkPublication(route({ entries: [] }));
	assert.equal(v.ok, false);
	assert.match(v.says, /nothing to publish/i);
});

test('the size budget overestimates, so what passes here passes the real encoder', () => {
	/* A realistic did:dht record: identity key plus two services. */
	const p = route({
		entries: [
			{ kind: 'key', id: '0', publicKey: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' },
			{ kind: 'service', id: 'n', type: 'iroh', at: 'node:7e4f2ab91c' },
			{ kind: 'service', id: 'r', type: 'relay', at: 'https://relay.example.org/q' },
		],
	});
	const n = roughSize(p);
	assert.ok(n < MAINLINE_VALUE_LIMIT, 'an ordinary record must fit with room to spare');
	assert.ok(n > 100, 'a budget that reports almost nothing is not a budget');
});

test('nothing published stays published, and the person is told in those terms', () => {
	const now = Date.now();
	assert.equal(standingOf({ lastAt: now }, now).state, 'live');
	assert.equal(standingOf({ lastAt: now - MAINLINE_REPUBLISH_MS }, now).state, 'due');
	assert.equal(standingOf({ lastAt: now - MAINLINE_EXPIRY_MS }, now).state, 'gone');

	const gone = standingOf({ lastAt: now - MAINLINE_EXPIRY_MS }, now);
	assert.match(gone.says, /look you up/i, 'say what stopped working, not that a record expired');

	const never = standingOf({ lastAt: null }, now);
	assert.equal(never.state, 'gone');
	assert.match(never.says, /not been published/i);
});

test('a due record reports how overdue it is, so a screen can count down rather than guess', () => {
	const now = Date.now();
	const soon = standingOf({ lastAt: now - MAINLINE_REPUBLISH_MS / 2 }, now);
	assert.equal(soon.state, 'live');
	assert.ok(soon.dueIn > 0 && soon.dueIn <= MAINLINE_REPUBLISH_MS / 2);
	assert.ok(standingOf({ lastAt: now - MAINLINE_REPUBLISH_MS * 1.5 }, now).dueIn < 0);
});
