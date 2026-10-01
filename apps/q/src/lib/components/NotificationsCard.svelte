<script lang="ts">
	/*
	 * Your notifications card (ADR-Q-016 §6): what reaches you, from whom, and
	 * whether it rings. One row per source, one choice per row, and a line
	 * underneath saying in plain words what that choice means.
	 */
	import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import { Icon, type IconName } from '@inqbeta/q-ui';
	import { CHOICES, SAYS, reachFor, setReach, watchReach, type Reach, type Source } from '$lib/notify';

	type Row = { source: Source; name: string; what: string; icon: IconName };
	let { federations = [] }: { federations?: { did: string; name: string }[] } = $props();

	const rows = $derived<Row[]>([
		{ source: 'people', name: 'People', what: 'Messages, invitations and links from people', icon: 'contacts' },
		...federations.map((f) => ({ source: `fed:${f.did}` as Source, name: f.name, what: 'Announcements: what’s new, try this, tell us', icon: 'federations' as IconName }))
	]);

	let all = $state<Record<string, Reach>>({});
	$effect(() => watchReach((a) => (all = a)));
	const kind = (s: Source) => (s === 'people' ? 'people' : 'fed');
</script>

<article class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-5 max-w-xl">
	<header class="flex items-center justify-between gap-3">
		<span class="flex items-center gap-2 h5"><Icon name="bell" /> Your notifications</span>
		<span class="badge preset-filled-primary-500 shadow">Just for you</span>
	</header>

	{#each rows as r (r.source)}
		{@const now = reachFor(r.source, all)}
		<section class="flex flex-col gap-2">
			<div class="flex items-start gap-3">
				<Icon name={r.icon} class="mt-1 shrink-0" />
				<div class="flex flex-col">
					<span class="font-bold">{r.name}</span>
					<span class="text-sm opacity-70">{r.what}</span>
				</div>
			</div>
			<SegmentedControl value={now} onValueChange={(d) => d.value && setReach(r.source, d.value as Reach)}>
				<SegmentedControl.Label class="sr-only">{r.name}</SegmentedControl.Label>
				<SegmentedControl.Control>
					<SegmentedControl.Indicator />
					{#each CHOICES[kind(r.source)] as c (c)}
						<SegmentedControl.Item value={c} class="min-h-11">
							<SegmentedControl.ItemText>{SAYS[c].label}</SegmentedControl.ItemText>
							<SegmentedControl.ItemHiddenInput />
						</SegmentedControl.Item>
					{/each}
				</SegmentedControl.Control>
			</SegmentedControl>
			<p class="text-sm" aria-live="polite">{SAYS[now].means}</p>
		</section>
	{/each}

	<footer class="flex flex-col gap-1 text-sm opacity-70 border-t border-surface-200-800 pt-4">
		<p>Calls always ring.</p>
		<p>This is kept on this device. Nobody else sees it, and nobody can tell what you’ve turned down.</p>
	</footer>
</article>
