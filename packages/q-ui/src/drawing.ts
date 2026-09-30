/*
 * What a page renderer is given.
 *
 * Types live here rather than inside a .svelte file because a component's
 * instance script is not a module other code can import types from — the same
 * reason roles.ts exists beside Heading.svelte.
 *
 * THE SHAPE IS THE GUARANTEE. A renderer receives `Supply` and can draw
 * nothing else: it has no folder, no network and no way to ask. Whoever builds
 * a Supply is the one place that decides what leaves, exactly as cardView is
 * for a card. A renderer that could fetch would be a renderer a template could
 * aim.
 */

/** A block from a published page (q-core/pages.ts `Fixed`). */
export interface Drawn {
	kind: string;
	id: string;
	width?: string;
	heading?: string;
	settings: Record<string, string | number | boolean | string[]>;
	/** Question ids this block names. Predicates — the values arrive in Supply. */
	reads: string[];
	from?: { plugin: string; by: string };
	/** Blocks inside this one. Only a group has them. */
	children?: Drawn[];
}

/** Everything a page is allowed to draw with, already decided. */
export interface Supply {
	/** Question id → what to show. Absent means "not answered", and is drawn as such. */
	answers?: Record<string, { label: string; value: string }>;
	places?: { id: string; called: string; says: string }[];
	receipts?: { id: string; title: string; at: string }[];
	contacts?: { id: string; called: string }[];
	federations?: { id: string; called: string }[];
	cards?: Record<string, { name: string; shows: string[] }>;
	posts?: { id: string; title: string; at: string; opening?: string }[];
	/**
	 * Q's own chrome, handed in as snippets.
	 *
	 * Furniture — the header, the side menu, a drawer — is Q's, and a template
	 * only says where it sits. Passing it as a snippet is what makes that true
	 * in the code as well as in the rule: the renderer cannot build a header,
	 * so a template cannot describe one into existence.
	 */
	furniture?: {
		header?: unknown;
		menu?: unknown;
		drawer?: unknown;
	};
	/** Content address → something displayable. Never a remote URL. */
	pictures?: Record<string, string>;
}
