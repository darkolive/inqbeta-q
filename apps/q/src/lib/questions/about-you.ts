/*
 * Q's own first question set.
 *
 * Declared here rather than in q-core on purpose: q-core defines the SHAPE of a
 * question set, and whoever is asking declares the questions. Q is just the
 * first federation to ask any. A club or a research group declares its own the
 * same way, and nothing here is privileged.
 *
 * NOTHING SENSITIVE. A first-run set is answered by someone who has had the
 * software for ninety seconds and has no reason to trust it yet. Health, birth
 * dates, anything protected — none of it belongs in the first thing a person
 * is shown. The model handles those perfectly well; the judgement about when to
 * ask is separate from whether it can.
 *
 * The ids are forever (ADR-Q-001 §2). Wording can be changed freely — it moves
 * the set's address, so answers keep citing the words they actually answered.
 */
import { QUESTION_SET_SCHEMA, type QuestionSet } from '@inqbeta/q-core/questions';

export const ABOUT_YOU: QuestionSet = {
	schema: QUESTION_SET_SCHEMA,
	id: 'q/about-you',
	title: { 'en-GB': 'About you' },
	questions: [
		{
			id: 'q:person/called',
			answer: 'text',
			asks: { 'en-GB': 'What should Q call you?' },
			help: { 'en-GB': 'Only ever shown to you, unless you put it on a card.' }
		},
		{
			id: 'q:person/reach-by',
			answer: 'choice',
			asks: { 'en-GB': 'How would you rather be reached?' },
			choices: [
				{ id: 'email', label: { 'en-GB': 'Email' } },
				{ id: 'message', label: { 'en-GB': 'A message' } },
				{ id: 'not-at-all', label: { 'en-GB': 'Not at all' } }
			]
		},
		{
			id: 'q:person/keeps-own-copies',
			answer: 'boolean',
			asks: { 'en-GB': 'Do you keep copies of your own files somewhere else?' },
			help: { 'en-GB': 'Q can tell you when a copy location has gone quiet, if it knows you rely on one.' }
		},
		{
			id: 'q:person/here-for',
			answer: 'longtext',
			asks: { 'en-GB': 'What are you hoping to keep in Q?' },
			optional: true
		}
	]
};
