<script lang="ts">
	/*
	 * Your people, on the You home page (3 October 2026): the faces of the
	 * people you're linked with (lib/people.ts, from your own receipts), newest
	 * first. A face opens your conversation with them. Underneath, the three
	 * things you'd do next: write, call, or invite someone by sharing your card.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import type { Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';

	let { ledger, did }: { ledger: Ledger | null; did: string } = $props();

	const people = $derived(peopleFrom(ledger, did).sort((a, b) => b.at.localeCompare(a.at)));
	const faces = $derived(people.slice(0, 8));
</script>

<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 flex flex-col gap-4">
	{#if faces.length}
		<ul class="grid grid-cols-4 gap-3">
			{#each faces as p (p.did)}
				<li>
					<a href="/messages/{encodeURIComponent(p.did)}" class="flex flex-col items-center gap-1 rounded-container p-1 hover:preset-tonal-surface min-h-11" aria-label="Write to {p.name}">
						<span class="size-14 overflow-hidden rounded-full bg-surface-100-900 border-2 border-surface-200-800 flex items-center justify-center">
							{#if p.picture}<img src={p.picture} alt="" class="size-full object-cover" />{:else}<span class="text-lg font-bold opacity-70">{p.name.slice(0, 1)}</span>{/if}
						</span>
						<span class="text-xs text-center line-clamp-1 w-full">{p.name.split(' ')[0]}</span>
					</a>
				</li>
			{/each}
		</ul>
		{#if people.length > faces.length}
			<a href="/contacts" class="text-sm font-semibold text-primary-700-300">All {people.length} people</a>
		{/if}
	{:else}
		<p class="text-surface-700-300">Nobody yet. Share your card with someone, and when they link up their face appears here.</p>
	{/if}
	<div class="grid grid-cols-3 gap-2">
		<a href="/messages" class="btn preset-tonal flex-col h-auto py-3 min-h-11 gap-1"><Icon name="message" size={22} /><span class="text-sm">Write</span></a>
		<a href="/call" class="btn preset-tonal flex-col h-auto py-3 min-h-11 gap-1"><Icon name="video" size={22} /><span class="text-sm">Call</span></a>
		<a href="/cards?tab=personal" class="btn preset-filled-primary-500 flex-col h-auto py-3 min-h-11 gap-1"><Icon name="share" size={22} /><span class="text-sm">Invite</span></a>
	</div>
</div>
