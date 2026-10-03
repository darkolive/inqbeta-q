<script lang="ts">
	/*
	 * A picture story that steps aside once you've started (3 October 2026).
	 *
	 * Theme 3 of the handover: "Federations and Messages page layouts, built
	 * around their stories." Someone with nothing yet sees the story first,
	 * open. Someone who already has conversations or clubs sees those first,
	 * with the story folded into one line they can open — so what's theirs
	 * isn't pushed down by something they've already watched.
	 *
	 * The choice is made once, when the page knows (`ready`), and then left to
	 * the person: it never opens or folds by itself afterwards. While folded,
	 * the story isn't on the page at all, so read aloud doesn't read it and its
	 * pictures don't play.
	 */
	import type { Snippet } from 'svelte';
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
	import { Icon } from '@inqbeta/q-ui';

	let { title, ready, empty, children }: { title: string; ready: boolean; empty: boolean; children: Snippet } = $props();

	let open = $state(false);
	let decided = false;
	$effect(() => {
		if (ready && !decided) {
			decided = true;
			open = empty;
		}
	});
</script>

<Collapsible {open} onOpenChange={(d) => (open = d.open)} class="card preset-outlined-surface-200-800 bg-surface-50-950 overflow-hidden">
	<Collapsible.Trigger class="w-full flex items-center gap-3 p-4 text-left hover:preset-tonal-surface min-h-11">
		<span class="btn-icon preset-tonal-secondary shrink-0 pointer-events-none" aria-hidden="true"><Icon name="play" size={18} /></span>
		<span class="flex-1 font-bold">{title}</span>
		<span class="text-sm text-surface-700-300">{open ? 'Hide' : 'Show'}</span>
		<Icon name="chevronDown" size={18} class="transition-transform motion-reduce:transition-none {open ? 'rotate-180' : ''}" />
	</Collapsible.Trigger>
	<Collapsible.Content>
		{#if open}
			<div class="flex justify-center px-4 pb-6">{@render children()}</div>
		{/if}
	</Collapsible.Content>
</Collapsible>
