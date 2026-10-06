<script lang="ts">
	/*
	 * Incubator's directory (ADR-Q-021): every federation registered and
	 * public, each checked on this device. The first step towards Find.
	 * Federations that chose not to be found aren't here, and nothing says
	 * they exist.
	 */
	import { Page, Empty, Icon } from '@inqbeta/q-ui';
	import { readDirectory, logoOf, type Entry } from '$lib/registry';

	let list = $state<Entry[] | null>(null);
	$effect(() => void readDirectory().then((l) => (list = l)));
</script>

<svelte:head><title>Directory — Q</title></svelte:head>

<Page title="Directory" lead="Federations and hosts registered with Incubator that chose to be found. Each one is checked on this device.">
	{#if !list}
		<p class="opacity-60">Reading the directory…</p>
	{:else if !list.length}
		<Empty icon="federations" title="Nobody listed yet" description="When a host registers and chooses to be public, it appears here." />
	{:else}
		<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each list as e (e.card.federation)}
				<li class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 flex flex-col gap-3">
					<div class="flex items-center gap-3">
						<span class="size-12 shrink-0 overflow-hidden rounded-full bg-surface-100-900 flex items-center justify-center">
							{#if logoOf(e.card)}<img src={logoOf(e.card)} alt="" class="size-full object-contain" />{:else}<Icon name="federations" />{/if}
						</span>
						<p class="font-bold">{e.card.name}</p>
					</div>
					<p class="text-sm flex-1">{e.card.purpose}</p>
					<div class="flex flex-wrap gap-2">
						<a class="btn btn-sm preset-filled-primary-500 min-h-11" href={e.card.site} rel="noopener">Go to site</a>
						<a class="btn btn-sm preset-tonal min-h-11" href="/registered/{encodeURIComponent(e.card.federation)}">Its receipt</a>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</Page>
