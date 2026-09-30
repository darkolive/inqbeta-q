/*
 * Publishing a page — one file that says everything.
 *
 * Darren, 2026-09-20: "when you publish, what should be produced is the merged
 * whole page, so it doesn't become multiple lookups. It is a complete page and
 * it is one file that on it says everything with its receipt."
 *
 * Right, and it is a build step: the builder holds blocks, settings and
 * whatever plugins somebody used; publishing resolves all of that into one
 * self-contained thing with one address. Nothing is fetched to draw it. A page
 * that needs three other files to render is a page that renders wrongly the
 * day one of them is missing, and says nothing about why.
 *
 * THE DISTINCTION THAT DECIDES WHETHER THIS WORKS:
 *
 *   A PUBLISHED PAGE MERGES THE DESIGN. IT NEVER MERGES THE ANSWERS.
 *
 * If "the whole page" meant the person's answers baked in, the page would be a
 * snapshot — stale the moment they corrected anything, and lying by the end of
 * the week. Worse, handing it to somebody would hand over the VALUES, when the
 * whole point of a card is that it names PREDICATES and follows what you say
 * as you change it (cards.ts). So a published page is complete as a DESIGN and
 * fills in from your own answers, live, every time it is opened.
 *
 * That keeps both things Darren wants at once: one file, no lookups for
 * structure — and a page that is still true next month.
 *
 * PLUGIN SETTINGS ARE INLINED, AND THEIR AUTHOR IS RECORDED. Inlining is the
 * point: a plugin can be withdrawn, changed or gone, and the page must still
 * draw. But inlining WITHOUT provenance is laundering — somebody has to be
 * able to ask "I no longer trust that author; what did they put on my pages?"
 * and get an answer. So `from` keeps the plugin id and its author on every
 * block that came from one.
 *
 * THE SAME PAGE COMPILES TO THE SAME BYTES. No timestamps inside the body, a
 * canonical shape, so one design has one address however many times it is
 * built. The receipt's own `at` sits outside, where it belongs.
 *
 * Pure. No rendering, no storage.
 */
import { canonical } from './canonical';
/* contentAddress, not a hand-rolled string: one definition of what
 * `content://sha256/…` means, shared with every locked file and every question
 * set. A second spelling of an address is a second address. */
import { contentAddress } from './vault';
import { BEHAVIOUR_FIELDS, checkTemplate, fieldOf, type Block, type BlockKind, type Plugin, type Width } from './blocks';

export const PAGE_SCHEMA = 'inqbeta.page/1';

/** A block once everything about it has been resolved. */
export interface Fixed {
	kind: BlockKind;
	id: string;
	width: Width;
	/** The heading above it, if any. */
	heading?: string;
	/** Everything this block was set to. Already resolved; nothing to look up. */
	settings: Record<string, string | number | boolean | string[]>;
	/** Which questions it will read when somebody opens the page. Predicates, never values. */
	reads: string[];
	/** Where this block came from, when it came from a plugin. */
	from?: { plugin: string; by: string };
	/** Blocks inside this one. Only a group has them. */
	children?: Fixed[];
}

export interface Page {
	schema: typeof PAGE_SCHEMA;
	/** What it is called. */
	called: string;
	blocks: Fixed[];
	/**
	 * What a page says about itself to search engines and share cards, and
	 * nothing a reader sees on it. Optional, and left out of the page entirely
	 * when absent, so every page published before it existed keeps its address.
	 */
	head?: Head;
}

export interface Head {
	/** One or two sentences for search results and link previews. */
	description?: string;
	/** When it happened or was first published — `YYYY-MM-DD`. */
	published?: string;
	/** The picture a link preview shows, by content address. */
	image?: string;
	imageAlt?: string;
	/** Tags for the share kit. Never drawn on the page. */
	tags?: string;
	/** Who to @-mention when it is shared. Never drawn on the page. */
	mentions?: string;
	/** `yes` while it is not ready: listed with a Draft mark, kept out of search. */
	draft?: string;
}

const HEAD_KEYS: (keyof Head)[] = ['description', 'published', 'image', 'imageAlt', 'tags', 'mentions', 'draft'];

export interface Published {
	page: Page;
	/** `content://sha256/…` — one design, one address. */
	address: string;
	/**
	 * Every question this page will ever read, across all its blocks.
	 *
	 * Gathered so a person can be shown, BEFORE publishing, exactly what this
	 * page will look at. The same guarantee cardView gives for a card, one
	 * level up.
	 */
	reads: string[];
	/** Every plugin author whose work ended up in here. */
	authors: { plugin: string; by: string }[];
}

const asList = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : [];

/**
 * What a block will read when it is drawn.
 *
 * Only `answers` blocks read anything of a person's; the rest draw what is in
 * the folder by kind. Said as a function so the list on the publish screen and
 * the list in the page are the same list.
 */
export function readsOf(block: Block): string[] {
	/* Tables name columns the same way an answers block names questions, so
	 * both read from here — and both through fieldOf, which is the one reader
	 * for a value that has two spellings. */
	return block.kind === 'answers' || block.kind === 'table'
		? asList(fieldOf(block as unknown as Record<string, unknown>, 'shows'))
		: [];
}

export interface Refusal {
	ok: false;
	says: string;
	wrong: { at: number; says: string; refused: string[] }[];
}

/**
 * Resolve a builder's blocks into one page.
 *
 * Refuses before it builds, using the same check a single block gets, because
 * compiling must never be a way to get past what a block was refused for.
 */
export async function publish(
	called: string,
	blocks: Block[],
	plugins: Plugin[] = [],
	head: Head = {}
): Promise<({ ok: true } & Published) | Refusal> {
	const checked = checkTemplate(blocks as unknown as Record<string, unknown>[]);
	if (!checked.ok) return { ok: false, says: checked.says, wrong: checked.wrong };
	if (!called.trim()) return { ok: false, says: 'This page needs a name.', wrong: [] };

	const byKind = new Map(plugins.map((p) => [p.id, p]));

	const fix = (b: Block): Fixed => {
		const settings = { ...(b.settings ?? {}) };
		/* The fields a block carries directly are settings too — merged here so
		 * a drawn page has one place to look and not two. */
		if (b.says !== undefined) settings['q:block/says'] = b.says;
		if (b.shows !== undefined) settings['q:block/shows'] = b.shows;
		if (b.card !== undefined) settings['q:block/card'] = b.card;
		if (b.at !== undefined) settings['q:block/at'] = b.at;
		if (b.howMany !== undefined) settings['q:block/how-many'] = b.howMany;
		if (b.component !== undefined) settings['q:block/component'] = b.component;

		const headingValue = settings['q:block/heading'];
		const heading = typeof headingValue === 'string' && headingValue.trim() ? headingValue.trim() : undefined;
		delete settings['q:block/heading'];
		delete settings['q:block/width'];

		const pluginId = typeof settings['q:block/plugin'] === 'string' ? (settings['q:block/plugin'] as string) : null;
		const plugin = pluginId ? byKind.get(pluginId) : undefined;

		return {
			kind: b.kind,
			id: b.id,
			width: b.width ?? 'full',
			...(heading ? { heading } : {}),
			settings: sorted(settings),
			reads: readsOf(b),
			...(plugin ? { from: { plugin: plugin.id, by: plugin.by } } : {}),
			...(b.children?.length ? { children: b.children.map(fix) } : {})
		};
	};

	const fixed: Fixed[] = blocks.map(fix);

	/* Flattened once, so the checks and the gathering below read the whole tree
	 * rather than only its top. A block three groups deep is as much part of
	 * this page as one at the top, and anything that treated it otherwise would
	 * be a hiding place. */
	const every = (list: Fixed[]): Fixed[] => list.flatMap((f) => [f, ...every(f.children ?? [])]);
	const all = every(fixed);

	/* Belt and braces: whatever merging did, the result must still carry nothing
	 * that runs. A compiler that can introduce what its input was refused for is
	 * the hole the input check was guarding. */
	for (const [i, f] of all.entries()) {
		const smuggled = Object.keys(f.settings).filter((k) =>
			BEHAVIOUR_FIELDS.includes(k.toLowerCase().replace(/^q:block\//, ''))
		);
		if (smuggled.length) {
			return {
				ok: false,
				says: 'Something that runs got as far as the finished page. It has not been published.',
				wrong: [{ at: i + 1, says: 'This block carries something that runs.', refused: smuggled }]
			};
		}
	}

	if (head.image !== undefined && !/^content:\/\/sha256\/[0-9a-f]{64}$/.test(head.image)) {
		return { ok: false, says: 'A preview picture has to be one you hold, named by its content.', wrong: [] };
	}
	/* Only the keys a head may have, only when they say something, in a fixed
	 * order — so the same head is always the same bytes. */
	const kept = Object.fromEntries(
		HEAD_KEYS.filter((k) => typeof head[k] === 'string' && head[k]!.trim()).map((k) => [k, head[k]!.trim()])
	) as Head;
	const page: Page = {
		schema: PAGE_SCHEMA,
		called: called.trim(),
		blocks: fixed,
		...(Object.keys(kept).length ? { head: kept } : {})
	};
	const address = await contentAddress(new TextEncoder().encode(canonical(page)));

	const reads = [...new Set(all.flatMap((f) => f.reads))].sort();
	const authors = [...new Map(all.filter((f) => f.from).map((f) => [f.from!.plugin, f.from!])).values()];

	return { ok: true, page, address, reads, authors };
}

function sorted(o: Record<string, string | number | boolean | string[]>) {
	return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export interface Standing {
	same: boolean;
	says: string;
}

/**
 * Whether what was published still matches what is being edited.
 *
 * A published page is frozen and the draft carries on; a person should be told
 * which they are looking at rather than discovering it when somebody else sees
 * the old one.
 */
export async function stillMatches(published: string, draft: Page): Promise<Standing> {
	const now = await contentAddress(new TextEncoder().encode(canonical(draft)));
	return now === published
		? { same: true, says: 'What you have shared is what you are looking at.' }
		: { same: false, says: 'You have changed this since you shared it. Anyone with the link still sees the old one.' };
}
