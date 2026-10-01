<script lang="ts">
	/*
	 * What's on this card: one switch per detail, and the card beside it,
	 * changing as you go. Anything switched off stays in your profile only.
	 */
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import CardFace from '$lib/components/CardFace.svelte';
	import { withLabels, type OwnDetail } from '$lib/profile';

	let {
		did,
		badge,
		options,
		values,
		own = [],
		shows = $bindable([])
	}: {
		did: string;
		badge: string;
		/** The details that could go on it, in order. */
		options: { id: string; label: string }[];
		/** id → value, as text. */
		values: Record<string, string>;
		own?: OwnDetail[];
		shows?: string[];
	} = $props();

	const filled = $derived(options.filter((o) => values[o.id]));
	const preview = $derived(withLabels(Object.fromEntries(shows.filter((id) => values[id]).map((id) => [id, values[id]])), own));
	const set = (id: string, on: boolean) => (shows = on ? [...new Set([...shows, id])] : shows.filter((x) => x !== id));
</script>

<div class="grid gap-6 md:grid-cols-[1fr_22rem]">
	<ul class="flex flex-col divide-y divide-surface-200-800">
		{#each filled as o (o.id)}
			<li class="py-1">
				<Switch checked={shows.includes(o.id)} onCheckedChange={(d) => set(o.id, d.checked)} class="flex items-center justify-between gap-4 min-h-11">
					<Switch.Label class="flex flex-col">
						<span>{o.label}</span>
						{#if !values[o.id].startsWith('data:')}<span class="text-sm opacity-60 truncate max-w-64">{values[o.id]}</span>{/if}
					</Switch.Label>
					<Switch.Control><Switch.Thumb /></Switch.Control>
					<Switch.HiddenInput />
				</Switch>
			</li>
		{/each}
	</ul>
	<aside class="flex flex-col gap-2 md:sticky md:top-4 self-start">
		<p class="text-sm opacity-70">What people will see.</p>
		<CardFace details={preview} {did} {badge} />
	</aside>
</div>
