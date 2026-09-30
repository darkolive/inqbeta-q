/*
 * The things a card usually carries.
 *
 * A second question set, declared the same way as the first, and it
 * deliberately REUSES `q:person/called` from About You rather than minting a
 * second id for the same thing. That is the mechanism ADR-Q-001 §11 leans on:
 * a question gains authority by being cited, not by being blessed, and two sets
 * asking the same question are asking the same question.
 *
 * Answering both sets leaves two answers for that predicate; the newest wins
 * (`cardView`), so a card follows whichever you said most recently. That is the
 * behaviour you would want and it falls out of the model rather than being
 * arranged.
 *
 * WHAT IS NOT HERE. A profile is written to be shown to other people, so the
 * bar is higher, not lower: no date of birth, no address, nothing protected.
 * A town is not a street. Anything sharper than this belongs to a federation
 * that has a reason to ask and says what the reason is.
 */
import { QUESTION_SET_SCHEMA, type QuestionSet } from '@inqbeta/q-core/questions';

export const YOUR_PROFILE: QuestionSet = {
	schema: QUESTION_SET_SCHEMA,
	id: 'q/your-profile',
	title: { 'en-GB': 'Your profile' },
	questions: [
		{
			/* The same question About You asks. One predicate, two askings. */
			id: 'q:person/called',
			answer: 'text',
			asks: { 'en-GB': 'What should Q call you?' },
			help: { 'en-GB': 'Already answered if you have done About You — this just lets you change it.' }
		},
		{
			id: 'q:person/role',
			answer: 'text',
			asks: { 'en-GB': 'What do you do?' },
			help: { 'en-GB': 'However you would say it out loud. "Sound engineer", not a job title from a form.' },
			optional: true
		},
		{
			id: 'q:org/name',
			answer: 'text',
			asks: { 'en-GB': 'Who do you do it for, or under what name?' },
			help: { 'en-GB': 'A company, a practice, your own name. Leave it if none of those fit.' },
			optional: true
		},
		{
			id: 'q:person/near',
			answer: 'text',
			asks: { 'en-GB': 'Roughly where are you?' },
			help: { 'en-GB': 'A town or a region. Not an address — Q has no reason to hold one.' },
			optional: true
		},
		{
			id: 'q:person/site',
			answer: 'link',
			asks: { 'en-GB': 'Is there a page about your work?' },
			help: { 'en-GB': 'Type it however you like — "darkolive.co.uk" is enough.' },
			optional: true
		},
		{
			id: 'q:person/about',
			answer: 'longtext',
			asks: { 'en-GB': 'Anything you would want someone to know before they get in touch?' },
			optional: true
		}
	]
};

/** Every question set Q itself declares. A federation would declare its own. */
export const Q_SETS = ['q/about-you', 'q/your-profile'] as const;
