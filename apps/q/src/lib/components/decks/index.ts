/*
 * The story decks (4 October 2026): short picture stories, each one a little
 * advert for one idea, for one kind of reader. Shown together at /stories and
 * each on its own at /stories/<id>, to share.
 */
import type { Component } from 'svelte';
import FestivalDeck, { title as festival, scenes as festivalScenes } from './FestivalDeck.svelte';
import VaultDeck, { title as vault, scenes as vaultScenes } from './VaultDeck.svelte';
import BackingDeck, { title as backing, scenes as backingScenes } from './BackingDeck.svelte';
import BackedDeck, { title as backed, scenes as backedScenes } from './BackedDeck.svelte';
import NetworkDeck, { title as network, scenes as networkScenes } from './NetworkDeck.svelte';
import type { DeckScene } from './frame';
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
	{ id: 'festival', open: DECK_WORDS.festival.open, title: festival, forWhom: 'Festivals, events, anyone off-grid', line: 'No signal in the field? Every phone carries for every other, sealed, and earns a little for it.', scenes: festivalScenes, component: FestivalDeck },
	{ id: 'vault', open: DECK_WORDS.vault.open, title: vault, forWhom: 'Everyone with things worth keeping', line: 'Your records in your hand, and in places you choose. Lose your phone; lose nothing that reached them.', scenes: vaultScenes, component: VaultDeck },
	{ id: 'backing', open: DECK_WORDS.backing.open, title: backing, forWhom: 'Makers, start-ups, community causes', line: 'Back an idea with a promise, not a payment. If it falls short, your credits come back.', scenes: backingScenes, component: BackingDeck },
	{ id: 'backed', open: DECK_WORDS.backed.open, title: backed, forWhom: 'Clubs, treasurers, anyone asked to trust a currency', line: 'Credits made only when value comes in, and a page that shows how well they’re backed.', scenes: backedScenes, component: BackedDeck },
	{ id: 'network', open: DECK_WORDS.network.open, title: network, forWhom: 'Node operators, clubs running their own kit', line: 'When a club fills up, it asks; providers offer; its rules choose. No IT person needed.', scenes: networkScenes, component: NetworkDeck }
];
export const deckOf = (id: string) => DECKS.find((d) => d.id === id);
