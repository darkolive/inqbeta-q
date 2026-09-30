<script lang="ts">
	/*
	 * One thing in a list — a course, a federation, a device, a file:
	 * title, optional subtitle, description, the small print, a state, actions.
	 * Every list in Q is made of these, so every list reads the same way.
	 */
	import type { Snippet } from 'svelte';
	import type { IconName } from '../icons';
	import Icon from './Icon.svelte';
	import Heading from './Heading.svelte';
	import Text from './Text.svelte';

	let {
		title,
		subtitle,
		description,
		meta,
		icon,
		href,
		status,
		actions,
		children
	}: {
		title: string;
		subtitle?: string;
		description?: string;
		meta?: string;
		icon?: IconName;
		href?: string;
		status?: Snippet;
		actions?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<article class="card preset-outlined-surface-200-800 bg-surface-50-950 flex flex-col gap-2 p-4">
	<div class="flex items-start justify-between gap-3">
		<div class="flex min-w-0 items-start gap-2">
			{#if icon}<span class="mt-0.5 text-primary-700-300"><Icon name={icon} /></span>{/if}
			<div class="min-w-0">
				<Heading role="title">
					{#if href}<a class="anchor" {href}>{title}</a>{:else}{title}{/if}
				</Heading>
				{#if subtitle}<Heading role="subtitle">{subtitle}</Heading>{/if}
			</div>
		</div>
		{#if status}{@render status()}{/if}
	</div>
	{#if description}<Text role="description">{description}</Text>{/if}
	{#if meta}<Text role="meta">{meta}</Text>{/if}
	{@render children?.()}
	{#if actions}<div class="actions mt-1">{@render actions()}</div>{/if}
</article>
