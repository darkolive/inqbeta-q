import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	asking,
	buildAnswerSet,
	checkAnswer,
	checkSet,
	dgraphPredicates,
	isAnswerSet,
	answersMatch,
	newestPerSet,
	setAddress,
	triples,
	QUESTION_SET_SCHEMA,
	type QuestionSet
} from '../src/questions';

const set: QuestionSet = {
	schema: QUESTION_SET_SCHEMA,
	id: 'q/about-you',
	title: { 'en-GB': 'About you' },
	questions: [
		{ id: 'q:person/called', answer: 'text', asks: { 'en-GB': 'What should Q call you?' } },
		{ id: 'q:person/birth-date', answer: 'date', asks: { 'en-GB': 'What is your date of birth?' }, optional: true },
		{
			id: 'q:person/reach-by',
			answer: 'choice',
			asks: { 'en-GB': 'How would you rather be reached?' },
			choices: [
				{ id: 'email', label: { 'en-GB': 'Email' } },
				{ id: 'post', label: { 'en-GB': 'Post' } }
			]
		}
	]
};

const did = 'did:key:z6MkTest';

test('a set is checked before anyone is asked anything', () => {
	assert.deepEqual(checkSet(set), { ok: true });

	const bad = checkSet({
		...set,
		questions: [
			{ id: 'Not An Id', answer: 'text', asks: { 'en-GB': 'Eh?' } },
			{ id: 'q:person/called', answer: 'text', asks: {} },
			{ id: 'q:person/called', answer: 'choice', asks: { 'en-GB': 'Pick' } }
		]
	});
	assert.equal(bad.ok, false);
	assert.ok(!bad.ok && bad.says.some((s) => s.includes('Not a question id')));
	assert.ok(!bad.ok && bad.says.some((s) => s.includes('never actually asked')));
	assert.ok(!bad.ok && bad.says.some((s) => s.includes('Asked twice')));
	assert.ok(!bad.ok && bad.says.some((s) => s.includes('nothing to choose')));
});

test('rewording a question does not move the predicate, but it does move the address', async () => {
	const reworded: QuestionSet = {
		...set,
		questions: set.questions.map((q) =>
			q.id === 'q:person/birth-date' ? { ...q, asks: { 'en-GB': 'When were you born?' } } : q
		)
	};

	/* The predicate is the id, and the id did not move. */
	assert.deepEqual(
		reworded.questions.map((q) => q.id),
		set.questions.map((q) => q.id)
	);
	assert.equal(asking(reworded.questions[1]), 'When were you born?');

	/* The address is over the bytes, so different wording is a different set —
	 * which is the point: an answer cites the words it answered. */
	const a = await setAddress(set);
	const b = await setAddress(reworded);
	assert.notEqual(a.address, b.address);
	assert.match(a.address, /^content:\/\/sha256\/[0-9a-f]{64}$/);
	assert.match(a.cid, /^bafkrei/);
});

test('the same questions give the same address, whatever order the keys were written in', async () => {
	const same: QuestionSet = {
		questions: set.questions.map((q) => ({ ...q })),
		title: { ...set.title },
		id: set.id,
		schema: set.schema
	};
	assert.equal((await setAddress(same)).address, (await setAddress(set)).address);
});

test('answers are checked, and a blank is not an answer', () => {
	const [called, born, reach] = set.questions;
	assert.deepEqual(checkAnswer(called, '  Darren  '), { ok: true, value: 'Darren' });
	assert.equal(checkAnswer(called, '   ').ok, false);
	assert.deepEqual(checkAnswer(born, '1970-11-10'), { ok: true, value: '1970-11-10' });
	assert.equal(checkAnswer(born, '10/11/1970').ok, false);
	assert.equal(checkAnswer(born, '1970-13-40').ok, false);
	assert.deepEqual(checkAnswer(reach, 'post'), { ok: true, value: 'post' });
	assert.equal(checkAnswer(reach, 'carrier-pigeon').ok, false);
});

test('an answer set cites the questions it answered, and carries what each is for', async () => {
	const out = await buildAnswerSet({
		did,
		set,
		values: { 'q:person/called': 'Darren', 'q:person/reach-by': 'email' },
		uses: { 'q:person/called': ['shown-to-me'] },
		at: '2026-09-19T12:00:00.000Z'
	});
	assert.ok(out.ok);
	if (!out.ok) return;

	assert.equal(out.answers.asked, (await setAddress(set)).address);
	assert.ok(await answersMatch(set, out.answers));
	assert.ok(isAnswerSet(out.answers));

	/* `given` is always there; nothing else arrives without being asked for. */
	assert.deepEqual(out.answers.answers['q:person/called'].uses, ['given', 'shown-to-me']);
	assert.deepEqual(out.answers.answers['q:person/reach-by'].uses, ['given']);

	/* An unanswered optional question is absent, not blank. */
	assert.ok(!('q:person/birth-date' in out.answers.answers));
});

test('a required question left out is refused, in words a person could act on', async () => {
	const out = await buildAnswerSet({ did, set, values: { 'q:person/reach-by': 'email' } });
	assert.equal(out.ok, false);
	assert.ok(!out.ok && out.says.some((s) => s.includes('What should Q call you?')));
});

test('answers for one set of words do not match another', async () => {
	const out = await buildAnswerSet({ did, set, values: { 'q:person/called': 'Darren', 'q:person/reach-by': 'email' } });
	assert.ok(out.ok);
	if (!out.ok) return;
	const reworded: QuestionSet = { ...set, title: { 'en-GB': 'About you, again' } };
	assert.ok(!(await answersMatch(reworded, out.answers)));
});

test('an answer set is a set of triples — DID, question, answer', async () => {
	const out = await buildAnswerSet({
		did,
		set,
		values: { 'q:person/called': 'Darren', 'q:person/reach-by': 'email' },
		uses: { 'q:person/reach-by': ['pooled'] }
	});
	assert.ok(out.ok);
	if (!out.ok) return;

	const t = triples(out.answers).sort((a, b) => (a.predicate < b.predicate ? -1 : 1));
	assert.deepEqual(t, [
		{ subject: did, predicate: 'q:person/called', object: 'Darren', uses: ['given'] },
		{ subject: did, predicate: 'q:person/reach-by', object: 'email', uses: ['given', 'pooled'] }
	]);
});

test('the Dgraph schema comes out of the questions, not out of a source file', () => {
	assert.deepEqual(dgraphPredicates(set), {
		'q:person/called': 'string @index(trigram)',
		'q:person/birth-date': 'datetime @index(day)',
		'q:person/reach-by': 'string @index(exact)'
	});
});

test('the newest answering of a set wins; the earlier ones are still evidence', async () => {
	const first = await buildAnswerSet({ did, set, values: { 'q:person/called': 'Daz', 'q:person/reach-by': 'post' }, at: '2026-01-01T00:00:00.000Z' });
	const later = await buildAnswerSet({ did, set, values: { 'q:person/called': 'Darren', 'q:person/reach-by': 'email' }, at: '2026-09-19T00:00:00.000Z' });
	assert.ok(first.ok && later.ok);
	if (!first.ok || !later.ok) return;

	const kept = newestPerSet([first.answers, later.answers]);
	assert.equal(kept.length, 1);
	assert.equal(kept[0].answers['q:person/called'].value, 'Darren');
});

test('a newer version of the same set replaces the older one, so a cleared answer is gone', async () => {
	/* Your profile grows a question when someone adds a detail of their own:
	 * a new address, the same name. The old version must not leak through. */
	const grown = { ...set, questions: [...set.questions.map((q) => ({ ...q, optional: true })), { id: 'q:own/shoe-size', answer: 'number' as const, asks: { 'en-GB': 'Shoe size' }, optional: true }] };
	const first = await buildAnswerSet({ did, set, values: { 'q:person/called': 'Daz', 'q:person/reach-by': 'post' }, at: '2026-01-01T00:00:00.000Z' });
	const later = await buildAnswerSet({ did, set: grown, values: { 'q:person/called': 'Darren', 'q:own/shoe-size': 9 }, at: '2026-10-01T00:00:00.000Z' });
	assert.ok(first.ok && later.ok);
	if (!first.ok || !later.ok) return;
	assert.notEqual(first.answers.asked, later.answers.asked);

	const kept = newestPerSet([first.answers, later.answers]);
	assert.equal(kept.length, 1);
	assert.equal(kept[0].answers['q:person/reach-by'], undefined, 'reach-by was cleared in the newer version');
});
