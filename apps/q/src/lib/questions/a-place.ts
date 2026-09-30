/*
 * A place, asked as questions.
 *
 * Darren, 2026-09-20: "each hard drive that you've plugged in or flash drive
 * that you've plugged in has its own DID… it's either available or
 * unavailable. But you know what it is. And I called that one flash drive
 * 2026. They're the channels."
 *
 * The same four questions for every kind of place, so the archive screen and
 * the folder screen are recognisably the same screen and a person learns the
 * shape once.
 *
 * THE FATE QUESTION IS NOT HERE, AND THAT IS ON PURPOSE. What would have to go
 * wrong for a place to be lost is defaulted from its kind (`fateOf`) and only
 * asked when the default is wrong — two folders in one Dropbox share a fate
 * and Q cannot see that, but neither should it interrogate somebody about it
 * before they have added anything. It belongs in a second pass, when there is
 * more than one place to compare.
 */
import { QUESTION_SET_SCHEMA, type QuestionSet } from '@inqbeta/q-core/questions';

export const A_PLACE: QuestionSet = {
	schema: QUESTION_SET_SCHEMA,
	id: 'q/a-place',
	title: { 'en-GB': 'A place' },
	questions: [
		{
			id: 'q:place/kind',
			answer: 'choice',
			asks: { 'en-GB': 'What kind of place is it?' },
			choices: [
				{ id: 'folder', label: { 'en-GB': 'A folder on this computer' } },
				{ id: 'synced', label: { 'en-GB': 'A folder that syncs — iCloud, Dropbox, OneDrive' } },
				{ id: 'bucket', label: { 'en-GB': 'A bucket, or a federation’s' } },
				{ id: 'drive', label: { 'en-GB': 'A drive you unplug' } },
				/* Offered so a person can name what they are currently relying on,
				 * and be told what it is. canHoldTheOnlyCopy() refuses it as a home. */
				{ id: 'cache', label: { 'en-GB': 'Inside this browser' } }
			]
		},
		{
			id: 'q:place/called',
			answer: 'text',
			asks: { 'en-GB': 'What do you call it?' },
			help: {
				'en-GB': 'The name you would use looking for it. "Flash drive 2026" is a better answer than "Backup".'
			}
		},
		{
			id: 'q:place/proved',
			answer: 'boolean',
			asks: { 'en-GB': 'Has something been written there and read back?' },
			help: {
				'en-GB': 'Q writes something small and reads it again. Until that has worked, a place is only a plan.'
			},
			optional: true
		},
		{
			id: 'q:place/seen',
			answer: 'date',
			asks: { 'en-GB': 'When did you last see it?' },
			help: { 'en-GB': 'For a drive in a drawer this is the only thing Q can go on.' },
			optional: true
		}
	]
};
