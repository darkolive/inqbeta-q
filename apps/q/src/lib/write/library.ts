/*
 * The block library — every kind of thing Write can put on a page, grouped
 * the way the palette shows them. The palette, the + menu and drag and drop
 * all make blocks here, so a new component is one entry and one case.
 *
 * Kinds and settings are q-core's closed vocabulary (blocks.ts): nothing
 * made here can carry a style, a script or an address the checker refuses.
 */
import { newId, type EditBlock } from './types';

export interface LibraryItem {
	kind: string;
	label: string;
	about: string;
}

export const LIBRARY: { title: string; items: LibraryItem[] }[] = [
	{
		title: 'Words',
		items: [
			{ kind: 'text', label: 'Paragraph', about: 'Words, with bold, italic and links' },
			{ kind: 'heading', label: 'Heading', about: 'Starts a new part of the page' },
			{ kind: 'quote', label: 'Quote', about: "Somebody else's words, set apart" }
		]
	},
	{
		title: 'Pictures and film',
		items: [
			{ kind: 'figure', label: 'Picture', about: 'One picture, with what is in it' },
			{ kind: 'pair', label: 'Side by side', about: 'Two or three pictures in a row' },
			{ kind: 'gallery', label: 'Gallery', about: 'As many pictures as you like' },
			{ kind: 'embed', label: 'Film or recording', about: 'YouTube, Vimeo, Dailymotion, SoundCloud' }
		]
	},
	{
		title: 'Layout',
		items: [
			{ kind: 'columns', label: 'Columns', about: 'Two or three, side by side' },
			{ kind: 'disclosure', label: 'Accordion', about: 'Folded until a reader opens it' }
		]
	},
	{
		title: 'Actions',
		items: [{ kind: 'button', label: 'Button', about: 'Takes the reader somewhere' }]
	},
	{
		title: 'Spacing and notes',
		items: [
			{ kind: 'divider', label: 'Line', about: 'A rule across the page' },
			{ kind: 'space', label: 'Space', about: 'A little room, or a lot' },
			{ kind: 'note', label: 'Note to self', about: 'Kept with the page, never shown' }
		]
	}
];

export const ALL_ITEMS = LIBRARY.flatMap((g) => g.items);

/** What a list of pictures in a row may hold. */
export const PICTURE_ONLY = new Set(['figure']);

export function make(kind: string): EditBlock {
	switch (kind) {
		case 'heading':
			return { kind: 'heading', id: newId('heading'), settings: { 'q:block/says': '', 'q:block/size': 'large' } };
		case 'figure':
			return { kind: 'figure', id: newId('figure'), settings: {} };
		case 'pair':
			return { kind: 'section', id: newId('section'), settings: { 'q:block/arrange': 'grid' }, children: [make('figure'), make('figure')] };
		case 'embed':
			return { kind: 'embed', id: newId('embed'), settings: {} };
		case 'quote':
			return { kind: 'quote', id: newId('quote'), settings: { 'q:block/says': '' } };
		case 'note':
			return { kind: 'note', id: newId('note'), settings: { 'q:block/says': '' } };
		case 'divider':
			return { kind: 'divider', id: newId('divider'), settings: {} };
		case 'space':
			return { kind: 'space', id: newId('space'), settings: { 'q:block/size': 'small' } };
		case 'button':
			return { kind: 'button', id: newId('button'), settings: { 'q:block/says': '', 'q:block/to': '' } };
		case 'gallery':
			return { kind: 'section', id: newId('section'), settings: { 'q:block/arrange': 'gallery' }, children: [make('figure'), make('figure'), make('figure')] };
		case 'disclosure':
			return { kind: 'section', id: newId('section'), settings: { 'q:block/arrange': 'disclosure', 'q:block/says': '' }, children: [make('text')] };
		case 'columns':
			return { kind: 'section', id: newId('section'), settings: { 'q:block/arrange': 'columns', 'q:block/columns': '2' }, children: [make('text'), make('text')] };
		default:
			return { kind: 'text', id: newId('text'), settings: { 'q:block/says': '' } };
	}
}
