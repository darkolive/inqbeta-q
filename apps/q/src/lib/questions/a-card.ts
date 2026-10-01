/*
 * A card, asked as questions.
 *
 * Darren, 2026-09-19: "can it be done in the same as everything else, which is
 * a question and an answer?"
 *
 * Yes, and this is it. A card is three answers — a name, a set of questions it
 * shows, a set of ways to be reached. `cardFromAnswers` in q-core reads a card
 * back out of an answer set that answers these, and the id it produces is the
 * same id a card built by hand gets, which is the test that says the two paths
 * are one thing.
 *
 * WHAT THIS UNLOCKS. A federation wanting its own kind of card does not need
 * code: it declares a question set that asks these three and whatever else it
 * needs. The extra answers ride along in the same receipt, and anything that
 * only understands cards reads the three it knows and ignores the rest.
 *
 * Q's own cards are still written as card receipts for now. Moving them onto
 * this path is a change of storage format and wants its own pass, with what
 * happens to the cards already in a folder thought through first.
 */
import { QUESTION_SET_SCHEMA, type QuestionSet } from '@inqbeta/q-core/questions';

export const A_CARD: QuestionSet = {
	schema: QUESTION_SET_SCHEMA,
	id: 'q/a-card',
	title: { 'en-GB': 'A card' },
	questions: [
		{
			id: 'q:card/name',
			answer: 'text',
			asks: { 'en-GB': 'What do you call this card?' },
			help: { 'en-GB': 'For you, so you know which is which. "Business", "Friends".' }
		},
		{
			id: 'q:card/shows',
			answer: 'questions',
			asks: { 'en-GB': 'What does it show?' },
			help: { 'en-GB': 'Questions you have answered. The card names them, never their answers — so it follows what you say as you change it.' },
			/* A card carrying only a way to be reached is a real card — see the
			 * Anonymous preset. `buildCard` refuses one that shows nothing AND
			 * carries nothing, which is the condition that actually matters. */
			optional: true
		},
		{
			/* Which tab it lives in (1 October 2026): Personal, Business, or one you built. */
			id: 'q:card/kind',
			answer: 'choice',
			asks: { 'en-GB': 'What kind of card is it?' },
			choices: [
				{ id: 'personal', label: { 'en-GB': 'Personal' } },
				{ id: 'business', label: { 'en-GB': 'Business' } },
				{ id: 'own', label: { 'en-GB': 'One you built' } }
			],
			optional: true
		},
		{
			id: 'q:card/channels',
			answer: 'channels',
			asks: { 'en-GB': 'Which ways to be reached belong on it?' },
			optional: true
		}
	]
};
