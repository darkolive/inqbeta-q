/*
 * The story decks (4 October 2026): short picture stories, each one a little
 * advert for one idea, for one kind of reader. Shown together at /stories and
 * each on its own at /stories/<id>, to share.
 */
import type { Component } from 'svelte';
import FestivalDeck from './FestivalDeck.svelte';
import VaultDeck from './VaultDeck.svelte';
import BackingDeck from './BackingDeck.svelte';
import BackedDeck from './BackedDeck.svelte';
import NetworkDeck from './NetworkDeck.svelte';
import type { DeckScene } from './frame';
// Title and scenes come straight from the words, as each deck's own
// module exports do (plain tsc can't see a .svelte file's module exports).
import { DECK_WORDS } from './words';

export interface Deck {
	id: string;
	title: string;
	/** Who it's for, in a few words. */
	forWhom: string;
	/** One line, for a share message. */
	line: string;
	scenes: DeckScene[];
	/** Public (anyone, social media too) or members only. */
	open: boolean;
	component: Component<{ hideable?: boolean }>;
}

export const DECKS: Deck[] = [
	{ id: 'festival', open: DECK_WORDS.festival.open, title: DECK_WORDS.festival.title, forWhom: 'Festivals, events, anyone off-grid', line: 'No signal in the field? Every phone carries for every other, sealed, and earns a little for it.', scenes: DECK_WORDS.festival.scenes, component: FestivalDeck },
	{ id: 'vault', open: DECK_WORDS.vault.open, title: DECK_WORDS.vault.title, forWhom: 'Everyone with things worth keeping', line: 'Your records in your hand, and in places you choose. Lose your phone; lose nothing that reached them.', scenes: DECK_WORDS.vault.scenes, component: VaultDeck },
	{ id: 'backing', open: DECK_WORDS.backing.open, title: DECK_WORDS.backing.title, forWhom: 'Makers, start-ups, community causes', line: 'Back an idea with a promise, not a payment. If it falls short, your credits come back.', scenes: DECK_WORDS.backing.scenes, component: BackingDeck },
	{ id: 'backed', open: DECK_WORDS.backed.open, title: DECK_WORDS.backed.title, forWhom: 'Clubs, treasurers, anyone asked to trust a currency', line: 'Credits made only when value comes in, and a page that shows how well they’re backed.', scenes: DECK_WORDS.backed.scenes, component: BackedDeck },
	{ id: 'network', open: DECK_WORDS.network.open, title: DECK_WORDS.network.title, forWhom: 'Node operators, clubs running their own kit', line: 'When a club fills up, it asks; providers offer; its rules choose. No IT person needed.', scenes: DECK_WORDS.network.scenes, component: NetworkDeck }
];
export const deckOf = (id: string) => DECKS.find((d) => d.id === id);
