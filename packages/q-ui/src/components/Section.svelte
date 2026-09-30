<script lang="ts">
	/*
	 * A part of a page, with its own heading at the current level; headings
	 * inside it are one level deeper.
	 */
	import type { Snippet } from 'svelte';
	import { currentLevel, provideLevel } from '../levels';
	import Heading from './Heading.svelte';
	import Text from './Text.svelte';

	let {
		title,
		description,
		id,
		actions,
		children
	}: { title: string; description?: string; id?: string; actions?: Snippet; children?: Snippet } = $props();

	const level = currentLevel();
	provideLevel(level + 1);
	const headingId = $derived(id ?? `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
</script>

<section class="stack-tight" aria-labelledby={headingId}>
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div class="block-head">
			<Heading role="section-title" {level} id={headingId}>{title}</Heading>
			{#if description}<Text role="meta">{description}</Text>{/if}
		</div>
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</div>
	{@render children?.()}
</section>
