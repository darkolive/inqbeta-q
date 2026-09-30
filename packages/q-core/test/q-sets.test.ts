/*
 * Q's own question sets and card presets, held to the same standard as the
 * code. They are data, and data written by hand goes wrong quietly: a mistyped
 * predicate in a preset produces a card that shows less than intended and says
 * nothing about it.
 *
 * These reach across into apps/q deliberately. The sets belong to the app —
 * q-core defines the shape, whoever is asking declares the questions — but the
 * test harness lives here, and an untested declaration is how the quiet kind
 * of wrong gets in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSet, setAddress } from '../src/questions';
import { unknownQuestions } from '../src/cards';
import { ABOUT_YOU } from '../../../apps/q/src/lib/questions/about-you';
import { YOUR_PROFILE } from '../../../apps/q/src/lib/questions/your-profile';
import { CARD_PRESETS } from '../../../apps/q/src/lib/questions/presets';
import { A_CARD } from '../../../apps/q/src/lib/questions/a-card';
import { A_PLACE } from '../../../apps/q/src/lib/questions/a-place';
import { CARD_QUESTIONS } from '../src/cards';
import { PLACE_Q, PLACE_QUESTIONS, canHoldTheOnlyCopy, warningFor, type PlaceKind } from '../src/places';

const SETS = [ABOUT_YOU, YOUR_PROFILE, A_CARD, A_PLACE];

test('every set Q declares is well formed', () => {
	for (const set of SETS) {
		const out = checkSet(set);
		assert.deepEqual(out, { ok: true }, `${set.id}: ${!out.ok ? out.says.join('; ') : ''}`);
	}
});

test('every set has its own address, and no two sets are the same bytes', async () => {
	const seen = new Set<string>();
	for (const set of SETS) {
		const { address, cid } = await setAddress(set);
		assert.match(address, /^content:\/\/sha256\/[0-9a-f]{64}$/);
		assert.match(cid, /^bafkrei/);
		assert.ok(!seen.has(address), `${set.id} has the same address as another set`);
		seen.add(address);
	}
});

test('two sets asking the same thing use the same predicate', () => {
	/* Your profile deliberately reuses About You's name question rather than
	 * minting a second id for it. Reuse is how a question becomes a standard. */
	assert.ok(ABOUT_YOU.questions.some((q) => q.id === 'q:person/called'));
	assert.ok(YOUR_PROFILE.questions.some((q) => q.id === 'q:person/called'));
});

test('no preset names a question nobody asks', () => {
	for (const preset of CARD_PRESETS) {
		assert.deepEqual(
			unknownQuestions(preset.shows, SETS),
			[],
			`preset "${preset.name}" names a question no set asks`
		);
	}
});

test('every preset is a card somebody could actually hold', () => {
	for (const preset of CARD_PRESETS) {
		assert.ok(preset.name.trim(), 'a preset needs a name');
		assert.ok(preset.says.trim(), `${preset.name} does not say what it is for`);
		/* A preset showing nothing is only sensible if it carries a channel. */
		assert.ok(preset.shows.length || preset.channels, `${preset.name} would make an empty card`);
	}
});

test('the card set asks exactly what a card is read from', () => {
	/* The set and the reader must not drift apart: cardFromAnswers looks for
	 * these three ids, so the set that asks them names the same three. */
	for (const id of Object.values(CARD_QUESTIONS)) {
		assert.ok(
			A_CARD.questions.some((q) => q.id === id),
			`q/a-card does not ask ${id}, which cardFromAnswers reads`
		);
	}
	/* And the list answers must be lists, or a card would hold one thing. */
	assert.equal(A_CARD.questions.find((q) => q.id === CARD_QUESTIONS.shows)?.answer, 'questions');
	assert.equal(A_CARD.questions.find((q) => q.id === CARD_QUESTIONS.channels)?.answer, 'channels');
});

test('a place asks the four questions q-core expects, and offers every kind it knows', async () => {
	const asked = A_PLACE.questions.map((q) => q.id);
	assert.deepEqual(asked, PLACE_QUESTIONS.map((q) => q.id), 'the set and the code must ask the same four');

	const kind = A_PLACE.questions.find((q) => q.id === PLACE_Q.kind)!;
	assert.equal(kind.answer, 'choice');
	const offered = (kind.choices ?? []).map((c) => c.id).sort();
	assert.deepEqual(offered, ['bucket', 'cache', 'drive', 'folder', 'synced'],
		'a kind the code handles but the set never offers is a branch nobody can reach');

	/* Every kind offered has a warning decided for it, including the empty one. */
	for (const id of offered) assert.equal(typeof warningFor(id as PlaceKind), 'string');
});

test('the browser is offered as a kind so a person can be told what it is', () => {
	const kind = A_PLACE.questions.find((q) => q.id === PLACE_Q.kind)!;
	assert.ok((kind.choices ?? []).some((c) => c.id === 'cache'));
	/* And refused as a home, so offering it is honest rather than a trap. */
	assert.equal(canHoldTheOnlyCopy('cache'), false);
});
