/*
 * Ways in.
 *
 * One rule, and it is the opposite of the rule for places: a copy is as strong
 * as its strongest, a way in is as strong as its weakest. Everything here
 * exists to stop a good instinct — I want more than one route back into my own
 * vault — from quietly installing a back door.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	costToBreak,
	effectOfAdding,
	howItStands,
	inOrder,
	rank,
	risksAccess,
	waysYouCanLose,
	weakest,
	type WayIn,
} from '../src/ways-in';

test('the weakest decides, however strong the others are', () => {
	const ways: WayIn[] = ['hardware', 'passkey', 'sms'];
	assert.equal(weakest(ways)?.way, 'sms');
	assert.equal(costToBreak(ways, 1), rank('sms').cost, 'a hardware key adds nothing while sms is enough on its own');
});

test('the list is ordered weakest first, because the comforting order is the wrong one', () => {
	const order = inOrder(['hardware', 'sms', 'passkey', 'email']).map((r) => r.way);
	assert.equal(order[0], 'sms');
	assert.equal(order[order.length - 1], 'hardware');
});

test('every way in names its actual attack, not a vague risk', () => {
	assert.match(rank('sms').because, /SIM|shop assistant/i);
	assert.match(rank('messenger').because, /phone number/i);
	assert.match(rank('email').because, /only as strong as the email account/i);
	assert.match(rank('person').because, /convinced it is you/i);
	for (const w of ['hardware', 'passkey', 'recovery-phrase', 'password'] as WayIn[]) {
		assert.ok(rank(w).because.trim().length > 20, `${w} needs a real sentence`);
	}
});

test('adding a weak way in is called what it is: a weakening', () => {
	const e = effectOfAdding(['hardware', 'passkey'], 'sms', 1);
	assert.equal(e.weakens, true);
	assert.match(e.says, /only needs sms/i);
	assert.match(e.fix, /two of your 3 ways/i, 'name the remedy with their own numbers');
});

test('the same addition is a gain once two are required', () => {
	const ways: WayIn[] = ['hardware', 'passkey', 'sms'];
	/* One-of-three is as cheap as the cheapest. Two-of-three costs the two cheapest. */
	assert.equal(costToBreak(ways, 1), rank('sms').cost);
	assert.equal(costToBreak(ways, 2), rank('sms').cost + rank('passkey').cost);
	assert.ok(costToBreak(ways, 2) > costToBreak(ways, 1), 'requiring two must cost an attacker more');
	/* And the hardware key finally counts for something once three are needed. */
	assert.equal(costToBreak(ways, 3), rank('sms').cost + rank('passkey').cost + rank('hardware').cost);
});

test('adding a strong way in when nothing gets cheaper is reported as pure gain', () => {
	const e = effectOfAdding(['passkey'], 'hardware', 1);
	assert.equal(e.weakens, false);
	assert.match(e.says, /nothing gets easier for anyone else/i);
});

test('the first way in is flagged for the real risk, which is losing it', () => {
	const e = effectOfAdding([], 'passkey', 1);
	assert.equal(e.weakens, false);
	assert.match(e.says, /losing it loses everything/i);
	assert.match(e.fix, /spare key under the mat/i);
});

test('resilience and security are two numbers moving opposite ways, and both are shown', () => {
	const ways: WayIn[] = ['hardware', 'passkey', 'email'];
	assert.equal(waysYouCanLose(ways, 1), 2);
	assert.equal(waysYouCanLose(ways, 2), 1);

	const any = howItStands(ways, 1);
	assert.match(any.says, /as strong as email/i);
	assert.match(any.fix, /require two at once/i);

	const two = howItStands(ways, 2);
	assert.equal(two.level, 'fine');
	assert.match(two.says, /nobody else gets in with one/i);
});

test('several strong ways, any one of which is enough, is still only a warning', () => {
	const s = howItStands(['hardware', 'passkey', 'recovery-phrase'], 1);
	assert.equal(s.level, 'warn', 'three good doors are still three doors');
	const bad = howItStands(['hardware', 'passkey', 'sms'], 1);
	assert.equal(bad.level, 'danger');
});

test('one way in warns about loss rather than about attackers', () => {
	const s = howItStands(['passkey'], 1);
	assert.equal(s.level, 'warn');
	assert.match(s.says, /no spare/i);
	assert.match(s.fix, /without gaining a back door/i);
});

test('only signing in is a way in — notifying is free, and should be encouraged', () => {
	assert.equal(risksAccess('sign-in'), true);
	for (const use of ['notify', 'messages', 'marketing'] as const) {
		assert.equal(risksAccess(use), false, `${use} adds no route to become someone`);
	}
});
