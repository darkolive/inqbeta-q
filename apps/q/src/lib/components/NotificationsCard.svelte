<script lang="ts">
	/*
	 * Your notifications card (ADR-Q-016 §6), 2 October 2026: one switch per
	 * source. On, the bell rings and counts it; off, Q doesn't even listen.
	 * Messages from people, and each federation you're in.
	 */
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { Icon, type IconName } from '@inqbeta/q-ui';
	import { reachFor, setReach, watchReach, type Reach, type Source } from '$lib/notify';

	let { federations = [] }: { federations?: { did: string; name: string }[] } = $props();

	type Row = { source: Source; name: string; what: string; icon: IconName };
	const rows = $derived<Row[]>([
		{ source: 'people', name: 'Messages', what: 'From people: messages, invitations, linking up', icon: 'message' },
		...federations.map((f) => ({ source: `fed:${f.did}` as Source, name: f.name, what: 'What’s new, things to try, asking what you think', icon: 'federations' as IconName }))
	]);

	let all = $state<Record<string, Reach>>({});
	$effect(() => watchReach((a) => (all = a)));
</script>

<article class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-2 max-w-xl">
	<header class="flex items-center gap-2 h5 mb-2"><Icon name="bell" /> What rings your bell</header>
	<ul class="flex flex-col divide-y divide-surface-200-800">
		{#each rows as r (r.source)}
			{@const on = reachFor(r.source, all) !== 'off'}
			<li class="py-2">
				<Switch checked={on} onCheckedChange={(d) => setReach(r.source, d.checked ? 'ring' : 'off')} class="flex items-center justify-between gap-4 min-h-11">
					<Switch.Label class="flex items-start gap-3">
						<Icon name={r.icon} class="mt-1 shrink-0" />
						<span class="flex flex-col">
							<span class="font-bold">{r.name}</span>
							<span class="text-sm opacity-70">{on ? r.what : 'Off: nothing from here reaches you.'}</span>
						</span>
					</Switch.Label>
					<Switch.Control><Switch.Thumb /></Switch.Control>
					<Switch.HiddenInput />
				</Switch>
			</li>
		{/each}
	</ul>
	{#if !federations.length}<p class="text-sm opacity-70">When you join a federation that sends news, it appears here with its own switch.</p>{/if}
	<footer class="text-sm opacity-70 border-t border-surface-200-800 pt-3 mt-2">Calls always ring. This is kept in your vault; nobody else sees it.</footer>
</article>
