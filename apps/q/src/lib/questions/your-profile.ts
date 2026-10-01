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
import { JUST_FOR_ME } from '@inqbeta/q-core/cards';

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
		},
		/*
		 * 1 October 2026: a profile you fill in like a form, with a picture and a
		 * cover (Darren: "like the Facebook, your profile, your cover image").
		 * Both are kept as small images in the answer itself — a data: URL, made
		 * on your device, so no picture goes anywhere you didn't send it.
		 */
		{
			id: 'q:person/picture',
			answer: 'text',
			asks: { 'en-GB': 'A picture of you' },
			help: { 'en-GB': 'Made small on your device before it is kept.' },
			optional: true
		},
		{
			id: 'q:person/cover',
			answer: 'text',
			asks: { 'en-GB': 'A cover image' },
			help: { 'en-GB': 'The wide picture along the top of your cards.' },
			optional: true
		},
		/*
		 * Ways to reach you (ADR-Q-015, 1 October 2026): each one a button on a
		 * card — email opens your mail, call opens the phone, WhatsApp opens
		 * WhatsApp. Q isn't involved in any of them; the card just knows how.
		 */
		{
			id: 'q:person/email',
			answer: 'text',
			asks: { 'en-GB': 'Your email' },
			optional: true
		},
		{
			id: 'q:person/phone',
			answer: 'text',
			asks: { 'en-GB': 'Your phone number' },
			help: { 'en-GB': 'With the country code if you’ll share it abroad: +44 7…' },
			optional: true
		},
		{
			id: 'q:person/whatsapp',
			answer: 'text',
			asks: { 'en-GB': 'Your WhatsApp number' },
			help: { 'en-GB': 'With the country code: +44 7…' },
			optional: true
		},
		{
			/* Which details are just for you. cardView never lets these leave. */
			id: JUST_FOR_ME,
			answer: 'questions',
			asks: { 'en-GB': 'Which details are just for you?' },
			optional: true
		}
	]
};

/** Every question set Q itself declares. A federation would declare its own. */
export const Q_SETS = ['q/about-you', 'q/your-profile'] as const;
