<script lang="ts">
	/*
	 * A published page, drawn.
	 *
	 * Takes a compiled page (q-core/pages.ts) and what it needs to draw, and
	 * draws it. It resolves nothing and fetches nothing: everything a page
	 * needs was decided when it was published, and everything about a PERSON
	 * arrives as `supply` from whoever is allowed to decide what leaves.
	 *
	 * WIDTHS ARE FOUR CLASSES WRITTEN OUT IN FULL, not assembled. Tailwind finds
	 * the classes it must generate by reading source text, so a width built at
	 * runtime would silently never exist — the same trap roles.ts documents, and
	 * it would fail as a page that looks right in dev and collapses in a build.
	 */
	import type { Snippet } from 'svelte';
	import BlockView from './BlockView.svelte';
	import type { Drawn, Supply } from '../drawing';
	import { widthClass } from '../look';

	let {
		page,
		supply = {},
		slot,
		header,
		menu,
		drawer
	}: {
		page: { called: string; blocks: Drawn[] };
		supply?: Supply;
		slot?: Snippet<[Drawn]>;
		/* Passed straight through to whichever block names them. Q's chrome
		 * enters here and nowhere else. */
		header?: Snippet<[{ signIn: boolean; search: boolean; reading: boolean }]>;
		menu?: Snippet<[{ open: boolean }]>;
		drawer?: Snippet<[{ called: string; open: boolean }]>;
	} = $props();

</script>

<div class="grid grid-cols-12 gap-4">
	{#each page.blocks as block (block.id)}
		<section class={widthClass(block.width)}>
			<BlockView {block} {supply} {slot} {header} {menu} {drawer} />
		</section>
	{/each}
</div>
