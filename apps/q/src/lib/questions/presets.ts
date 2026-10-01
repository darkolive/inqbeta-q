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

/*
 * Two kinds you make (ADR-Q-015 §2, 1 October 2026): Personal and Business.
 * Basic, Friends and Contact folded into Personal; membership and agreement
 * cards are drawn from the receipts they belong to, never made by hand.
 */
export const CARD_PRESETS: CardPreset[] = [
	{
		id: 'personal',
		name: 'Personal',
		says: 'For the people in your life: your picture, cover, name, where you are and a line about you.',
		shows: ['q:person/cover', 'q:person/picture', 'q:person/called', 'q:person/near', 'q:person/about', 'q:person/phone', 'q:person/whatsapp', 'q:person/email'],
		channels: true
	},
	{
		id: 'business',
		name: 'Business',
		says: 'You at work: what you do, who for, and your page.',
		shows: ['q:person/cover', 'q:person/picture', 'q:person/called', 'q:person/role', 'q:org/name', 'q:person/site', 'q:person/email', 'q:person/phone'],
		channels: true
	}
];


/* `unknownQuestions` lives in q-core/cards.ts, where there are tests. */
