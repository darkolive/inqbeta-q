<script lang="ts">
	/* Nothing here yet — said plainly, with what would put something here. */
	import type { Snippet } from 'svelte';
	import type { IconName } from '../icons';
	import Icon from './Icon.svelte';
	import Heading from './Heading.svelte';
	import Text from './Text.svelte';

	let { icon, title, description, children }: { icon: IconName; title: string; description?: string; children?: Snippet } = $props();
</script>

<div class="card preset-outlined-surface-200-800 flex flex-col items-center gap-2 p-8 text-center">
	<span class="text-surface-500"><Icon name={icon} size={32} /></span>
	<Heading role="title">{title}</Heading>
	{#if description}<Text role="description" class="max-w-prose">{description}</Text>{/if}
	{#if children}<div class="actions mt-2 justify-center">{@render children()}</div>{/if}
</div>
