/*
 * The words of every story deck (4 October 2026), in one plain file, so the
 * pages and the voice build (scripts/build-voice.mjs) read the same words.
 * Each scene is recorded as "story.<deck>.<n>" in Darren's voice, timed word
 * by word; a scene then lasts as long as it takes to say, plus a breath, and
 * never less than its pictures need (frame.ts, sceneTimes).
 *
 * `voice`, when given, is how the scene is SAID (ElevenLabs tags in square
 * brackets, as in lib/voice/scripts); otherwise the title and words are read
 * as they are.
 */
import type { DeckScene } from './frame';

export interface DeckWords {
	title: string;
	/**
	 * Public: anyone with the link can watch it, signed in or not, and it can
	 * go out on social media. Members only: the host's members, signed in;
	 * shared only to people, never to social media.
	 */
	open: boolean;
	scenes: DeckScene[];
}

/*
 * The story player's one rule (Darren, 4 October 2026), the same at every
 * level: a title can carry a subtext.
 *   the book      a title and a subtext (the big intro, then a little description)
 *   a story       its title only, one size, no subtext (the list down the side)
 *   a slide       a title and a subtext (the words under the picture)
 * Each level is its own record inside the one above (ADR-Q-033): change one
 * story, and only that story changes, recordings and all.
 */
export const BOOK = {
	title: 'Q, in stories',
	subtext: 'Q’s ideas, one short picture story each. Choose one, watch, skim with the slider, and share the scene that fits someone you know.'
};

export const DECK_WORDS: Record<string, DeckWords> = {
	festival: {
		title: 'A field of phones, all carrying for each other',
		open: true,
		scenes: [
			{ title: 'A festival field. No signal.', says: 'Thousands of people, thousands of phones, and not a bar of signal between them.' },
			{ title: 'Ana takes a photo for Ben', says: 'Q seals it as she takes it. Only Ben can open it: nobody else, ever.' },
			{ title: 'Hop, hop, hop', says: 'Phones nearby pass the sealed box along, by Bluetooth or the site’s Wi-Fi. They carry it without being able to look inside.' },
			{ title: 'Ben has it', says: 'Ben’s phone checks it and says “got it”. Only then does each phone that carried it let its copy go.' },
			{ title: 'Signal at the edge', says: 'Anything going beyond the field waits. The moment any phone finds 4G, it goes up to the cloud.' },
			{ title: 'Everyone earns a little', says: 'Each phone earns a little for what it carried. What you earn carrying for others pays for what you need carried. It cancels out.' }
		]
	},
	vault: {
		title: 'Your vault, in many places at once',
		open: true,
		scenes: [
			{ title: 'The newest is in your hand', says: 'Your phone always has the newest of everything. You work from what’s right in front of you, even with no signal.' },
			{ title: 'Every save goes out', says: 'Each time you agree, sign or capture something, a sealed copy goes out to your places: your cloud, your own bucket.' },
			{ title: 'Join a federation', says: 'On a club’s page, press Join. Its storage becomes one of your places, the cost shown and agreed in one step.' },
			{ title: 'Three places, three fates', says: 'Copies in different places, run by different people, are separate ways to survive. Q counts ways, not copies.' },
			{ title: 'Lose your phone', says: 'In a river, on a hike, stolen. Sign in on a new phone and everything that reached your places comes back, checked against its seal.' },
			{ title: 'Hot and cold', says: 'Your phone keeps what’s recent. Everything else waits, cool and cheap, in your places, and comes back the moment you open it.' }
		]
	},
	backing: {
		title: 'Backing an idea, without handing your credits over first',
		open: true,
		scenes: [
			{ title: 'Sam has an idea', says: 'A small data farm for the club. It needs 300 credits by the first of December, or it can’t start.' },
			{ title: 'People pledge', says: 'Five people back it. Each pledge is a promise, signed, and the bar fills from those receipts, not from anyone’s say-so.' },
			{ title: 'Held, not spent', says: 'Pledged credits stay in your balance, but promised. You can’t spend them somewhere else while the campaign runs.' },
			{ title: 'The target is met', says: 'The moment it reaches 300, every pledge moves to Sam at once, and the farm can begin.' },
			{ title: 'Or it falls short', says: 'If it isn’t met by the date, nothing moves. Every pledge is simply released, back to the person who made it.' },
			{ title: 'Rewards, and the story', says: 'Backers get what the farm makes, like a year of storage, and follow its updates. Never shares, never money back with more on top.' }
		]
	},
	backed: {
		title: 'Credits you can trust: always backed, and you can see it',
		open: true,
		scenes: [
			{ title: 'It starts at nothing', says: 'A club’s mint begins at zero. No credit exists until value comes in.' },
			{ title: '£20 in, 20 credits out', says: 'Someone buys 20 credits for £20. Pounds and credits rise together: fully backed.' },
			{ title: 'Cash out 5', says: 'Cashing out destroys 5 credits and pays £5. Both fall together, so it’s still fully backed.' },
			{ title: 'When the reserve is drawn on', says: 'Over time, 100 credits are out, and the host spends £85 of the reserve running the node. Now £15 backs 100 credits: 15%. Below the host’s line of 20%, cash-outs pause.' },
			{ title: 'Buying heals it', says: 'Buying is never paused: each credit bought brings its own pound. Someone buys 50, and £65 backs 150 credits: 43%. Cash-outs open again.' },
			{ title: 'Trust you can see', says: 'The club’s page shows how it’s backed: stated by the host, honoured by every cash-out paid, witnessed by a treasurer, confirmed by the bank.' }
		]
	},
	network: {
		title: 'When a club gets full, the network grows itself',
		open: true,
		scenes: [
			{ title: 'The club’s own space', says: 'A club runs its own node: a terabyte, bought with a grant, run on solar. Only a little of it is used. It needs nobody.' },
			{ title: 'It warms up', says: 'As members join, it fills. At 70% full, the club’s own rule says: time to find more space.' },
			{ title: 'A wanted offer goes out', says: 'Q posts it for the club: “100 GB for a month, up to 70 credits.” Every provider can see it on the grid.' },
			{ title: 'Providers offer; the rules choose', says: 'Offers come in with each provider’s record. The club’s rules accept the one that meets them, with nobody deciding by hand.' },
			{ title: 'The new node joins', says: 'The provider gets a key to the club’s private network, valid until the month ends. Files spread onto its space, and the club cools down.' },
			{ title: 'Leaving cleanly', says: 'Before the month ends, everything on that node moves elsewhere first. Only then does its key run out. Nothing is let go until it’s held somewhere else.' }
		]
	}
};
