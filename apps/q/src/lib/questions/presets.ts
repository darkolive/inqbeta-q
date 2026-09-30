/*
 * Somewhere to start.
 *
 * Darren, 2026-09-19: "just so that we can start, not selecting."
 *
 * A blank list of tick boxes asks a person to design a card before they have
 * seen one. A preset is a sensible first answer to "what goes on a business
 * card" — filled in, then changed. It decides nothing: picking one only fills
 * the selection, and what is saved is whatever is ticked at the end.
 *
 * Presets name QUESTION IDS, so they work across any set that asks those
 * questions, and a preset naming a question nobody has answered simply shows
 * fewer things rather than breaking. `unknownQuestions` in q-core/cards.ts is
 * what keeps a typo here from silently becoming a card that shows nothing —
 * and there is a test asserting every preset below passes it.
 */


export interface CardPreset {
	id: string;
	name: string;
	says: string;
	/** Question ids, in the order a card would read. */
	shows: string[];
	/** Whether a way to be reached belongs on this kind of card by default. */
	channels: boolean;
}

export const CARD_PRESETS: CardPreset[] = [
	{
		id: 'business',
		name: 'Business',
		says: 'What you do and who for. The card you would hand to someone at an event.',
		shows: ['q:person/called', 'q:person/role', 'q:org/name', 'q:person/site'],
		channels: true
	},
	{
		id: 'friends',
		name: 'Friends',
		says: 'Enough for people who already know you. No work, no company.',
		shows: ['q:person/called', 'q:person/near', 'q:person/about'],
		channels: true
	},
	{
		id: 'contact',
		name: 'Contact only',
		says: 'A name and a way to reach you. Nothing else at all.',
		shows: ['q:person/called'],
		channels: true
	},
	{
		id: 'anonymous',
		name: 'Anonymous',
		says: 'A way to reach you and no name. Useful more often than you would think.',
		shows: [],
		channels: true
	}
];

/* `unknownQuestions` lives in q-core/cards.ts, where there are tests. */
