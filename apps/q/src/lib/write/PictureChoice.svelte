<script lang="ts">
	/*
	 * Choosing a picture that is already on the site, by sight.
	 * The block keeps its content address; nobody sees a path.
	 */
	import type { SitePicture } from './types';

	let {
		pictures,
		origin,
		value = '',
		onchange,
		label = 'Choose a picture'
	}: { pictures: SitePicture[]; origin: string; value?: string; onchange: (address: string) => void; label?: string } = $props();

	let open = $state(false);
	let filter = $state('');

	/* One tile per picture, even where the same bytes sit in two folders. */
	const unique = $derived([...new Map(pictures.map((p) => [p.address, p])).values()]);
	const shown = $derived(
		unique.filter((p) => !filter.trim() || p.path.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 120)
	);
	const chosen = $derived(pictures.find((p) => p.address === value));
</script>

<div class="flex items-start gap-3">
	<button
		type="button"
		class="h-24 w-36 shrink-0 overflow-hidden rounded-base border-2 border-dashed border-surface-300-700 bg-surface-100-900"
		onclick={() => (open = !open)}
		title={chosen ? chosen.name : label}
	>
		{#if chosen}
			<img src={origin + chosen.thumb} alt="" class="h-full w-full object-cover" />
		{:else}
			<span class="text-sm opacity-70">{label}</span>
		{/if}
	</button>
	{#if chosen && !open}
		<button type="button" class="btn btn-sm preset-tonal" onclick={() => (open = true)}>Change</button>
	{/if}
</div>

{#if open}
	<div class="mt-2 rounded-base border border-surface-200-800 p-2">
		<div class="mb-2 flex items-center gap-2">
			<input class="input input-sm" aria-label="Find by name or project — e.g. lantern, aura" bind:value={filter} />
			<button type="button" class="btn btn-sm preset-tonal" onclick={() => (open = false)}>Close</button>
		</div>
		<div class="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
			{#each shown as p (p.address)}
				<button
					type="button"
					class="aspect-square overflow-hidden rounded-base border-2 {p.address === value ? 'border-primary-500' : 'border-transparent'}"
					title={p.path}
					onclick={() => {
						onchange(p.address);
						open = false;
					}}
				>
					<img src={origin + p.thumb} alt={p.name} loading="lazy" class="h-full w-full object-cover" />
				</button>
			{/each}
		</div>
		<p class="hint mt-2">Pictures already on the site. Adding new ones from your computer comes next.</p>
	</div>
{/if}
