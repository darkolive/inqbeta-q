<script lang="ts">
	/*
	 * A slide's picture, before it's made: the scene Q imagined, in the book's
	 * look, so the storyboard can be read and judged now. The picture itself
	 * is made from this same scene later.
	 */
	import type { Style } from '@inqbeta/q-core/storybook';
	import StyleSwatch from './StyleSwatch.svelte';
	let { scene, style, big = false }: { scene?: string; style: Style | null; big?: boolean } = $props();
</script>

<StyleSwatch {style}>
	<div class="flex h-full items-end {big ? 'p-4 sm:p-6' : 'p-1.5'}">
		<p class="card bg-surface-50-950/90 text-surface-950-50 {big ? 'p-3 text-sm sm:text-base' : 'p-1.5 text-[0.6rem] leading-tight line-clamp-3'} italic">
			{#if big}<span class="not-italic text-xs opacity-70 block mb-1">The picture, imagined</span>{/if}{scene || 'Q will imagine this picture.'}
		</p>
	</div>
</StyleSwatch>
