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
 * WHAT CHANGED, 1 October 2026. This once said: no date of birth, no address,
 * nothing protected, because a profile was written to be shown. Darren then
 * asked for the whole of you in one place — first and last name, pronouns,
 * gender, home address — with each detail shown on cards or "just for me".
 * That holds up because of two things underneath, not good intentions:
 * cardView never lets a just-for-me detail leave, and the sharper ones
 * (home address, gender, birthday) START as just for me, so filling one in
 * never shows it to anyone until you say so. Nothing here leaves your vault
 * unless a card you hand over names it.
 *
 * YOUR OWN DETAILS. You can add details of your own (a date, a number, a
 * picture, anything): `profileSet` adds them to this set as `q:own/…`
 * questions, and their labels and kinds are kept as an answer too
 * (`q:profile/own-details`), so they travel with your profile.
 */
import { QUESTION_SET_SCHEMA, type QuestionSet } from '@inqbeta/q-core/questions';
import { JUST_FOR_ME } from '@inqbeta/q-core/cards';

export const YOUR_PROFILE: QuestionSet = {
	schema: QUESTION_SET_SCHEMA,
	id: 'q/your-profile',
	title: { 'en-GB': 'Your profile' },
	questions: [
		{
			id: 'q:person/first',
			answer: 'text',
			asks: { 'en-GB': 'Your first name' },
			optional: true
		},
		{
			id: 'q:person/last',
			answer: 'text',
			asks: { 'en-GB': 'Your last name' },
			optional: true
		},
		{
			id: 'q:person/pronouns',
			answer: 'text',
			asks: { 'en-GB': 'Your pronouns' },
			help: { 'en-GB': 'However you say them: “she/her”, “they/them”.' },
			optional: true
		},
		{
			/* Starts just for you (lib/profile QUIET). */
			id: 'q:person/gender',
			answer: 'text',
			asks: { 'en-GB': 'Your gender' },
			help: { 'en-GB': 'In your own words.' },
			optional: true
		},
		{
			/* Starts just for you. */
			id: 'q:person/birthday',
			answer: 'date',
			asks: { 'en-GB': 'Your birthday' },
			optional: true
		},
		{
			/* Starts just for you. */
			id: 'q:person/address',
			answer: 'longtext',
			asks: { 'en-GB': 'Your home address' },
			optional: true
		},
		{
			/* Your own details: what each is called and what kind it is. */
			id: 'q:profile/own-details',
			answer: 'longtext',
			asks: { 'en-GB': 'Details you added yourself' },
			optional: true
		},
		{
			/* The same question About You asks. One predicate, two askings. */
			id: 'q:person/called',
			answer: 'text',
			asks: { 'en-GB': 'What should Q call you?' },
			/* Optional since 1 October 2026: left blank, it's your first and last name. */
			optional: true,
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

/** A detail you added yourself (a building block). */
export type OwnKind = 'text' | 'longtext' | 'date' | 'number' | 'yesno' | 'link' | 'picture';
export interface OwnDetail {
	/** `q:own/<slug>` */
	id: string;
	label: string;
	kind: OwnKind;
}

const ANSWER_FOR: Record<OwnKind, QuestionSet['questions'][number]['answer']> = {
	text: 'text',
	longtext: 'longtext',
	date: 'date',
	number: 'number',
	yesno: 'boolean',
	link: 'link',
	picture: 'text'
};

/** Your profile's questions, with your own details added on the end. */
export function profileSet(own: OwnDetail[]): QuestionSet {
	if (!own.length) return YOUR_PROFILE;
	return {
		...YOUR_PROFILE,
		questions: [
			...YOUR_PROFILE.questions,
			...own.map((d) => ({ id: d.id, answer: ANSWER_FOR[d.kind], asks: { 'en-GB': d.label }, optional: true }))
		]
	};
}
