/*
 * What's new in Q — the home page's own news (3 October 2026). Darren: the You
 * home page should be "visually and functionally really beautiful", with news
 * and updates.
 *
 * Plain, short, newest first. Each says what changed for the person, not how,
 * and where to try it. Add to the top when something people can use arrives;
 * the home page shows the newest few. Announcements from Incubator (signed,
 * ADR-Q-016 §6) sit above these for members; these are for everyone.
 */
import type { IconName } from '@inqbeta/q-ui/icons';

export interface NewThing {
	/** ISO date it arrived. */
	at: string;
	title: string;
	says: string;
	href: string;
	/** What the link says. */
	go: string;
	icon: IconName;
}

export const WHATS_NEW: NewThing[] = [
	{
		at: '2026-10-03',
		title: 'Picture stories for every part of You',
		says: 'Keys, Devices, Information, Address book, Communication and Credits each open with six pictures that show how they work.',
		href: '#how-q-works',
		go: 'Watch one',
		icon: 'play'
	},
	{
		at: '2026-10-03',
		title: 'Your menu, in your order',
		says: 'Switch plugins on, then drag them into the order you like. Only the ones you use appear.',
		href: '/plugins',
		go: 'Arrange plugins',
		icon: 'settings'
	},
	{
		at: '2026-10-02',
		title: 'Voice messages',
		says: 'When a call isn’t answered, leave a message of up to two minutes. Sealed, and kept by you both.',
		href: '/call',
		go: 'Open calls',
		icon: 'mic'
	},
	{
		at: '2026-10-02',
		title: 'Credits, in test mode',
		says: 'Try buying a pack and watch the rules check it. No money is taken.',
		href: '/balance',
		go: 'See credits',
		icon: 'wallet'
	},
	{
		at: '2026-10-02',
		title: 'Clubs, as a plugin',
		says: 'Switch on Federations to found a club or join one, one step at a time.',
		href: '/federations',
		go: 'See federations',
		icon: 'federations'
	}
];
