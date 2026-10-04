/*
 * The story decks (4 October 2026): short picture stories, each one a little
 * advert for one idea, for one kind of reader. Shown together at /stories and
 * each on its own at /stories/<id>, to share.
 */
import type { Component } from 'svelte';
import FestivalDeck, { title as festival } from './FestivalDeck.svelte';
import VaultDeck, { title as vault } from './VaultDeck.svelte';
import BackingDeck, { title as backing } from './BackingDeck.svelte';
import BackedDeck, { title as backed } from './BackedDeck.svelte';
import NetworkDeck, { title as network } from './NetworkDeck.svelte';

export interface Deck {
	id: string;
	title: string;
	/** Who it's for, in a few words. */
	forWhom: string;
	/** One line, for a share message. */
	line: string;
	component: Component<{ hideable?: boolean }>;
}

export const DECKS: Deck[] = [
	{ id: 'festival', title: festival, forWhom: 'Festivals, events, anyone off-grid', line: 'No signal in the field? Every phone carries for every other, sealed, and earns a little for it.', component: FestivalDeck },
	{ id: 'vault', title: vault, forWhom: 'Everyone with things worth keeping', line: 'Your records in your hand, and in places you choose. Lose your phone; lose nothing that reached them.', component: VaultDeck },
	{ id: 'backing', title: backing, forWhom: 'Makers, start-ups, community causes', line: 'Back an idea with a promise, not a payment. If it falls short, your credits come back.', component: BackingDeck },
	{ id: 'backed', title: backed, forWhom: 'Clubs, treasurers, anyone asked to trust a currency', line: 'Credits made only when value comes in, and a page that shows how well they’re backed.', component: BackedDeck },
	{ id: 'network', title: network, forWhom: 'Node operators, clubs running their own kit', line: 'When a club fills up, it asks; providers offer; its rules choose. No IT person needed.', component: NetworkDeck }
];
export const deckOf = (id: string) => DECKS.find((d) => d.id === id);
