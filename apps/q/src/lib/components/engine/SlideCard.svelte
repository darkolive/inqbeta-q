<script lang="ts">
	/*
	 * One slide as a card: its picture, its title and subtext, and "Draft"
	 * until it's kept. A draft offers Accept or Reject (Darren, 5 October:
	 * "then review, either accept or reject"). Other actions go in the snippet.
	 */
	import type { Snippet } from 'svelte';
	import { Icon } from '@inqbeta/q-ui';
	import { drawsItself, type Slide, type Style } from '@inqbeta/q-core/storybook';
	import PieceIcon from './PieceIcon.svelte';
	import StyleSwatch from './StyleSwatch.svelte';
	let { slide, n, look = null, actions, onkeep, onreject }: { slide: Slide; n: number; look?: Style | null; actions?: Snippet; onkeep?: () => void; onreject?: () => void } = $props();
	const empty = $derived(!slide.title && !slide.subtext);
</script>

<article class="card p-4 flex gap-4 items-start {slide.draft ? 'preset-outlined-secondary-500 border-dashed' : 'preset-outlined-surface-200-800'} bg-surface-50-950" aria-label="Slide {n}{slide.draft ? ', a draft' : ''}">
	<span class="size-7 shrink-0 rounded-full border-2 border-surface-400-600 flex items-center justify-center text-xs tabular-nums" aria-hidden="true">{n}</span>
	{#if drawsItself(look)}
		<span class="shrink-0 rounded-container bg-surface-100-900 p-1"><PieceIcon piece={slide.piece} size={56} /></span>
	{:else}
		<span class="shrink-0 w-24 sm:w-28"><StyleSwatch style={look} /></span>
	{/if}
	<div class="flex-1 min-w-0 flex flex-col gap-1">
		{#if empty}
			<p class="text-surface-700-300 italic">Empty: the first draft will write it.</p>
		{:else}
			<p class="h6 font-normal">{slide.title}</p>
			<p class="text-surface-700-300">{slide.subtext}</p>
		{/if}
		{#if slide.scene}<p class="text-sm italic opacity-80"><span class="not-italic opacity-70">Picture:</span> {slide.scene}</p>{/if}
		{#if slide.draft}<span class="badge preset-tonal-secondary self-start">Draft: not kept yet</span>{/if}
		{#if slide.draft && (onkeep || onreject)}
			<div class="flex flex-wrap gap-2 mt-2">
				{#if onkeep}<button type="button" class="btn preset-filled-primary-500 min-h-11" aria-label="Accept slide {n}" onclick={onkeep}><Icon name="check" size={18} /> Accept</button>{/if}
				{#if onreject}<button type="button" class="btn preset-tonal min-h-11" aria-label="Reject slide {n}" onclick={onreject}><Icon name="close" size={18} /> Reject</button>{/if}
			</div>
		{/if}
		{#if actions}<div class="flex flex-wrap gap-2 mt-2">{@render actions()}</div>{/if}
	</div>
</article>
