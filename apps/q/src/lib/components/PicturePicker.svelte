<script lang="ts">
	/*
	 * Choosing a picture for a block — from your own vault, never a link.
	 * Adding one locks it into the vault first, so what the page names is
	 * always something you hold.
	 */
	import type { Picture } from '$lib/pictures';
	import { addPicture } from '$lib/pictures';

	let {
		pictures,
		urls,
		value = $bindable(''),
		added
	}: { pictures: Picture[]; urls: Record<string, string>; value?: unknown; added?: () => void } = $props();

	let working = $state(false);
	let says = $state('');

	async function add(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const f = el.files?.[0];
		if (!f) return;
		working = true;
		says = '';
		try {
			value = await addPicture(f);
			added?.();
		} catch (err) {
			says = err instanceof Error ? err.message : String(err);
		} finally {
			working = false;
			el.value = '';
		}
	}
</script>

<div class="mt-3 flex flex-col gap-2">
	<p class="text-sm font-medium">Picture</p>
	{#if pictures.length}
		<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Choose a picture">
			{#each pictures as p (p.address)}
				<button
					type="button"
					role="radio"
					aria-checked={value === p.address}
					title={p.name}
					class="h-20 w-20 overflow-hidden rounded-base border-2 {value === p.address ? 'border-primary-500' : 'border-transparent'}"
					onclick={() => (value = p.address)}
				>
					{#if urls[p.address]}
						<img src={urls[p.address]} alt={p.name} class="h-full w-full object-cover" />
					{:else}
						<span class="text-xs">{p.name}</span>
					{/if}
				</button>
			{/each}
		</div>
	{:else}
		<p class="hint">No pictures in your vault yet.</p>
	{/if}
	<label class="btn btn-sm preset-outlined-surface-500 w-fit cursor-pointer">
		<input type="file" class="sr-only" accept="image/*" disabled={working} onchange={(e) => void add(e)} />
		{working ? 'Adding…' : 'Add a picture'}
	</label>
	<p class="hint">Give the block a title too — on a public page it is what a screen reader says instead of the picture.</p>
	{#if says}<p class="text-sm" role="alert">{says}</p>{/if}
</div>
