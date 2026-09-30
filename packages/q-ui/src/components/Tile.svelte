<script lang="ts">
	/*
	 * A dashboard tile: what it is, how many, where to go. The whole tile is the
	 * link, so there is one target, not three.
	 */
	import type { Snippet } from 'svelte';
	import type { IconName } from '../icons';
	import Icon from './Icon.svelte';
	import Heading from './Heading.svelte';
	import Text from './Text.svelte';

	let {
		href,
		icon,
		title,
		count,
		meta,
		status
	}: { href: string; icon: IconName; title: string; count?: string | number; meta?: string; status?: Snippet } = $props();
</script>

<a {href} class="card preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal-surface flex flex-col gap-3 p-4">
	<div class="flex items-center justify-between gap-2">
		<span class="flex items-center gap-2 text-primary-700-300">
			<Icon name={icon} />
			<Heading role="title">{title}</Heading>
		</span>
		{#if status}{@render status()}{/if}
	</div>
	{#if count !== undefined}<Text role="count" as="span">{count}</Text>{/if}
	{#if meta}<Text role="meta">{meta}</Text>{/if}
</a>
