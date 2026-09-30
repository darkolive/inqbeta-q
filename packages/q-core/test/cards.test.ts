import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCard, cardFromAnswers, cardId, cardView, isCard, looksLikeCard, newestPerCard, readCard, unknownQuestions } from '../src/cards';
import { buildAnswerSet, QUESTION_SET_SCHEMA, type AnswerSet, type QuestionSet } from '../src/questions';

const did = 'did:key:z6MkOne';
const other = 'did:key:z6MkTwo';

const set: QuestionSet = {
	schema: QUESTION_SET_SCHEMA,
	id: 'q/about-you',
	title: { 'en-GB': 'About you' },
	questions: [
		{ id: 'q:person/called', answer: 'text', asks: { 'en-GB': 'What should Q call you?' } },
		{ id: 'q:person/here-for', answer: 'text', asks: { 'en-GB': 'What for?' } },
		{ id: 'q:person/secret', answer: 'text', asks: { 'en-GB': 'Something private?' } }
	]
};

async function answersFor(who: string, values: Record<string, unknown>, at?: string): Promise<AnswerSet> {
	const out = await buildAnswerSet({ did: who, set, values, at });
	assert.ok(out.ok);
	if (!out.ok) throw new Error('unreachable');
	return out.answers;
}

test('a card is named by what it is, not when it was made', async () => {
	const a = await buildCard({ did, name: 'Business', shows: ['q:person/called'], at: '2026-01-01T00:00:00.000Z' });
	const b = await buildCard({ did, name: 'Business', shows: ['q:person/called'], at: '2026-09-19T00:00:00.000Z' });
	assert.equal(a.id, b.id);

	/* Order is not part of what a card is. */
	const one = await cardId({ did, name: 'Business', shows: ['a:x', 'a:y'], channels: [] });
	const two = await cardId({ did, name: 'Business', shows: ['a:y', 'a:x', 'a:y'], channels: [] });
	assert.equal(one, two);

	/* Whose it is, is part of it. */
	assert.notEqual(a.id, (await buildCard({ did: other, name: 'Business', shows: ['q:person/called'] })).id);
});

test('a card that shows nothing is refused', async () => {
	await assert.rejects(() => buildCard({ did, name: 'Empty', shows: [] }));
	await assert.rejects(() => buildCard({ did, name: '  ', shows: ['q:person/called'] }));
});

test('a card names predicates, never values', async () => {
	const card = await buildCard({ did, name: 'Business', shows: ['q:person/called'] });
	assert.ok(isCard(card));
	const asText = JSON.stringify(card);
	assert.ok(!asText.includes('Darren'));
	assert.deepEqual(card.shows, ['q:person/called']);
});

test('the view shows what the card names and NOTHING else', async () => {
	const answers = await answersFor(did, {
		'q:person/called': 'Darren',
		'q:person/here-for': 'what is possible here',
		'q:person/secret': 'do not show this'
	});
	const card = await buildCard({ did, name: 'Business', shows: ['q:person/called'] });

	const view = cardView(card, [answers]);
	assert.deepEqual(view.shown, [{ question: 'q:person/called', value: 'Darren' }]);

	/* The guarantee, stated as a test: nothing withheld appears anywhere in the view. */
	const asText = JSON.stringify(view);
	assert.ok(!asText.includes('do not show this'));
	assert.ok(!asText.includes('what is possible here'));
	assert.ok(!asText.includes('q:person/secret'));

	/* The size of the gap is visible; its contents are not. */
	assert.equal(view.withheld, 2);
	assert.deepEqual(view.missing, []);
});

test('a card naming a question nobody answered says so, rather than showing a blank', async () => {
	const answers = await answersFor(did, {
		'q:person/called': 'Darren',
		'q:person/here-for': 'x',
		'q:person/secret': 'y'
	});
	const card = await buildCard({ did, name: 'Odd', shows: ['q:person/called', 'q:nowhere/at-all'] });
	const view = cardView(card, [answers]);
	assert.deepEqual(view.shown, [{ question: 'q:person/called', value: 'Darren' }]);
	assert.deepEqual(view.missing, ['q:nowhere/at-all']);
});

test('a card follows an answer as it changes', async () => {
	const older = await answersFor(did, { 'q:person/called': 'Daz', 'q:person/here-for': 'x', 'q:person/secret': 'y' }, '2026-01-01T00:00:00.000Z');
	const newer = await answersFor(did, { 'q:person/called': 'Darren', 'q:person/here-for': 'x', 'q:person/secret': 'y' }, '2026-09-19T00:00:00.000Z');
	const card = await buildCard({ did, name: 'Business', shows: ['q:person/called'] });

	assert.deepEqual(cardView(card, [older, newer]).shown, [{ question: 'q:person/called', value: 'Darren' }]);
	/* Order of arrival must not decide it. */
	assert.deepEqual(cardView(card, [newer, older]).shown, [{ question: 'q:person/called', value: 'Darren' }]);
});

test('a card never reaches into somebody else’s answers', async () => {
	const mine = await answersFor(did, { 'q:person/called': 'Darren', 'q:person/here-for': 'x', 'q:person/secret': 'y' });
	const theirs = await answersFor(other, { 'q:person/called': 'Someone Else', 'q:person/here-for': 'x', 'q:person/secret': 'y' });
	const card = await buildCard({ did, name: 'Business', shows: ['q:person/called'] });

	const view = cardView(card, [theirs, mine]);
	assert.deepEqual(view.shown, [{ question: 'q:person/called', value: 'Darren' }]);
	assert.ok(!JSON.stringify(view).includes('Someone Else'));

	/* With only the other person's answers to hand, it shows nothing at all. */
	const empty = cardView(card, [theirs]);
	assert.deepEqual(empty.shown, []);
	assert.equal(empty.withheld, 0);
});

test('channels are carried by id; the card cannot open one', async () => {
	const card = await buildCard({ did, name: 'Contact', shows: ['q:person/called'], channels: ['ab12cd34'] });
	const view = cardView(card, []);
	assert.deepEqual(view.channels, ['ab12cd34']);
	/* No address, no seal, no way to reach anyone from the card alone. */
	assert.ok(!JSON.stringify(view).includes('@'));
});

test('the newest card of a name wins; earlier ones remain what was shown before', async () => {
	const old = await buildCard({ did, name: 'Business', shows: ['q:person/called', 'q:person/here-for'], at: '2026-01-01T00:00:00.000Z' });
	const now = await buildCard({ did, name: 'Business', shows: ['q:person/called'], at: '2026-09-19T00:00:00.000Z' });
	const friends = await buildCard({ did, name: 'Friends', shows: ['q:person/here-for'], at: '2026-05-01T00:00:00.000Z' });

	const kept = newestPerCard([old, now, friends]);
	assert.equal(kept.length, 2);
	assert.deepEqual(kept.find((c) => c.name === 'Business')?.shows, ['q:person/called']);
});

test('a card naming a question no set asks is caught, not quietly shown short', async () => {
	assert.deepEqual(unknownQuestions(['q:person/called', 'q:person/secret'], [set]), []);
	assert.deepEqual(unknownQuestions(['q:person/called', 'q:typo/verson-name'], [set]), ['q:typo/verson-name']);
	/* No sets to check against means everything is unknown, not everything is fine. */
	assert.deepEqual(unknownQuestions(['q:person/called'], []), ['q:person/called']);
});

test('a card can be read out of an ordinary answer set', async () => {
	const cardSet: QuestionSet = {
		schema: QUESTION_SET_SCHEMA,
		id: 'q/a-card',
		title: { 'en-GB': 'A card' },
		questions: [
			{ id: 'q:card/name', answer: 'text', asks: { 'en-GB': 'What do you call this card?' } },
			{ id: 'q:card/shows', answer: 'questions', asks: { 'en-GB': 'What does it show?' } },
			{ id: 'q:card/channels', answer: 'channels', asks: { 'en-GB': 'Which ways to be reached?' }, optional: true }
		]
	};

	const out = await buildAnswerSet({
		did,
		set: cardSet,
		values: {
			'q:card/name': ' Business ',
			'q:card/shows': ['q:person/here-for', 'q:person/called', 'q:person/called'],
			'q:card/channels': ['ab12cd34']
		},
		at: '2026-09-19T20:00:00.000Z'
	});
	assert.ok(out.ok);
	if (!out.ok) return;

	const card = await cardFromAnswers(out.answers);
	assert.ok(card);
	if (!card) return;

	assert.equal(card.name, 'Business');
	/* Sorted and deduplicated, the same as a card built by hand. */
	assert.deepEqual(card.shows, ['q:person/called', 'q:person/here-for']);
	assert.deepEqual(card.channels, ['ab12cd34']);
	assert.equal(card.did, did);
	assert.equal(card.at, '2026-09-19T20:00:00.000Z');

	/* And it is the SAME card as one built directly — the id proves it. */
	const built = await buildCard({ did, name: 'Business', shows: ['q:person/called', 'q:person/here-for'], channels: ['ab12cd34'] });
	assert.equal(card.id, built.id);

	/* It resolves what it shows exactly as any other card does. */
	const answers = await answersFor(did, { 'q:person/called': 'Darren', 'q:person/here-for': 'x', 'q:person/secret': 'nope' });
	const view = cardView(card, [answers]);
	assert.equal(view.shown.length, 2);
	assert.ok(!JSON.stringify(view).includes('nope'));
});

test('an answer set that is not a card reads as no card, which is not a fault', async () => {
	const answers = await answersFor(did, { 'q:person/called': 'Darren', 'q:person/here-for': 'x', 'q:person/secret': 'y' });
	assert.equal(await cardFromAnswers(answers), null);
});

test('a card written the old way and the new way read as the same card', async () => {
	const built = await buildCard({
		did,
		name: 'Business',
		shows: ['q:person/called'],
		channels: ['ab12cd34'],
		at: '2026-09-19T21:00:00.000Z'
	});

	/* The old shape: a card receipt, as written before today. */
	const fromOld = await readCard(JSON.parse(JSON.stringify(built)));
	assert.ok(fromOld);
	assert.equal(fromOld?.id, built.id);
	assert.equal(fromOld?.name, 'Business');

	/* The new shape: an answer set answering q/a-card. */
	const cardSet: QuestionSet = {
		schema: QUESTION_SET_SCHEMA,
		id: 'q/a-card',
		title: { 'en-GB': 'A card' },
		questions: [
			{ id: 'q:card/name', answer: 'text', asks: { 'en-GB': 'Name?' } },
			{ id: 'q:card/shows', answer: 'questions', asks: { 'en-GB': 'Shows?' }, optional: true },
			{ id: 'q:card/channels', answer: 'channels', asks: { 'en-GB': 'Channels?' }, optional: true }
		]
	};
	const answered = await buildAnswerSet({
		did,
		set: cardSet,
		values: { 'q:card/name': 'Business', 'q:card/shows': ['q:person/called'], 'q:card/channels': ['ab12cd34'] },
		at: '2026-09-19T21:00:00.000Z'
	});
	assert.ok(answered.ok);
	if (!answered.ok) return;

	const fromNew = await readCard(answered.answers);
	assert.ok(fromNew);

	/* The whole point of keeping both readers: they agree. */
	assert.equal(fromNew?.id, fromOld?.id);
	assert.deepEqual(fromNew?.shows, fromOld?.shows);
	assert.deepEqual(fromNew?.channels, fromOld?.channels);

	/* And both are spotted without resolving them. */
	assert.ok(looksLikeCard(built));
	assert.ok(looksLikeCard(answered.answers));
});

test('a card that shows nothing but carries a way to be reached is a card', async () => {
	const anon = await buildCard({ did, name: 'Anonymous', shows: [], channels: ['ab12cd34'] });
	assert.deepEqual(anon.shows, []);
	assert.deepEqual(cardView(anon, []).shown, []);
	/* Nothing at all, though, is not. */
	await assert.rejects(() => buildCard({ did, name: 'Nothing', shows: [], channels: [] }));
});

test('an ordinary answer set is not mistaken for a card', async () => {
	const answers = await answersFor(did, { 'q:person/called': 'Darren', 'q:person/here-for': 'x', 'q:person/secret': 'y' });
	assert.ok(!looksLikeCard(answers));
	assert.equal(await readCard(answers), null);
	assert.equal(await readCard({ nothing: 'to see' }), null);
});
