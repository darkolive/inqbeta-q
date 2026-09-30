/*
 * Drag and drop, and "where the next block goes", shared by the palette and
 * every list on the page (lists nest, so this cannot live in one of them).
 *
 * Dragging is a convenience, never the only way: every block can also be
 * added with a click and moved with the ↑ ↓ buttons, which is what a
 * keyboard, a screen reader or a phone uses.
 */
import { make, PICTURE_ONLY } from './library';
import type { EditBlock } from './types';

export type Drag = { what: 'new'; kind: string } | { what: 'move'; from: EditBlock[]; id: string; kind: string };

export const dnd = $state<{
	now: Drag | null;
	/** The block last worked on, so a click in the palette adds after it. */
	here: { list: EditBlock[]; index: number; pictureOnly: boolean } | null;
	/** The block just added, so its list can put the cursor in it. */
	fresh: string | null;
}>({ now: null, here: null, fresh: null });

/** Is `list` inside `block` (or is it block's own children)? A group cannot go inside itself. */
function holds(block: EditBlock, list: EditBlock[]): boolean {
	if (!block.children) return false;
	if (block.children === list) return true;
	return (block.children as EditBlock[]).some((c) => holds(c, list));
}

export function accepts(list: EditBlock[], pictureOnly: boolean, d: Drag | null = dnd.now): boolean {
	if (!d) return false;
	if (pictureOnly && !(PICTURE_ONLY.has(d.kind) || (d.what === 'move' && d.kind === 'embed'))) return false;
	if (d.what === 'move') {
		const b = d.from.find((x) => x.id === d.id);
		if (!b || holds(b, list)) return false;
	}
	return true;
}

/** Put what is being dragged at `at` in `list`. */
export function dropInto(list: EditBlock[], at: number, pictureOnly: boolean): boolean {
	const d = dnd.now;
	dnd.now = null;
	if (!d || !accepts(list, pictureOnly, d)) return false;
	if (d.what === 'new') {
		const b = make(d.kind);
		list.splice(at, 0, b);
		dnd.fresh = b.id;
		return true;
	}
	const from = d.from.findIndex((x) => x.id === d.id);
	if (from < 0) return false;
	const [b] = d.from.splice(from, 1);
	if (d.from === list && from < at) at -= 1;
	list.splice(at, 0, b);
	return true;
}

/** A click in the palette: after the block last worked on, or at the end. */
export function addFromPalette(kind: string, body: EditBlock[]) {
	const b = make(kind);
	const h = dnd.here;
	if (h && (!h.pictureOnly || PICTURE_ONLY.has(kind)) && h.index < h.list.length) {
		h.list.splice(h.index + 1, 0, b);
		dnd.here = { ...h, index: h.index + 1 };
	} else {
		body.push(b);
		dnd.here = { list: body, index: body.length - 1, pictureOnly: false };
	}
	dnd.fresh = b.id;
}
