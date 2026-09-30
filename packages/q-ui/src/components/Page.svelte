<script lang="ts">
	/*
	 * A page: its one title (h1), an optional lead, optional actions, then the
	 * content — whose headings start at level 2.
	 */
	import type { Snippet } from 'svelte';
	import { provideLevel } from '../levels';
	import Heading from './Heading.svelte';
	import Text from './Text.svelte';

	let {
		title,
		lead,
		actions,
		children
	}: { title: string; lead?: string; actions?: Snippet; children?: Snippet } = $props();

	provideLevel(2);
</script>

<div class="stack">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div class="block-head">
			<Heading role="page-title" level={1}>{title}</Heading>
			{#if lead}<Text role="lead">{lead}</Text>{/if}
		</div>
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</header>
	{@render children?.()}
</div>
