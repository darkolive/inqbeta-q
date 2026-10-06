<script lang="ts">
	/*
	 * Testing (6 October 2026). Every page of Q, and every tab of a page, has
	 * its checklist. Take one, test it, report back: each claim and report is
	 * signed, so who tested what, on which version, is never in doubt. The AI
	 * runner reports with its own key, beside the people.
	 */
	import { Page, Status, Icon } from '@inqbeta/q-ui';
	import type { Tone } from '@inqbeta/q-ui';
	import { allChecks, EVERY_PAGE, STATE_WORDS, type State, type Standing } from '@inqbeta/q-core/checks';
	import { CHECKLISTS, GROUP_NAMES, readChecks, standings } from '$lib/checklists';

	let found = $state<Map<string, Standing> | null>(null);
	$effect(() => {
		void readChecks()
			.then(standings)
			.then((s) => (found = s));
	});

	type Show = 'all' | 'free' | 'problems' | 'ai';
	let show = $state<Show>('all');
	const SHOWS: { id: Show; called: string }[] = [
		{ id: 'all', called: 'Everything' },
		{ id: 'free', called: 'Free to take' },
		{ id: 'problems', called: 'Problems found' },
		{ id: 'ai', called: 'Has AI checks' }
	];
	const tone = (s: State): Tone => (s === 'passed' ? 'good' : s === 'issues' ? 'bad' : s === 'claimed' || s === 'part' ? 'waiting' : s === 'out-of-date' ? 'needs-you' : 'plain');
	const stateOf = (id: string) => found?.get(id);
	const lists = $derived(
		CHECKLISTS.filter((l) => {
			const s = stateOf(l.id);
			if (show === 'free') return !s || s.state === 'open' || s.state === 'part' || s.state === 'out-of-date';
			if (show === 'problems') return s?.state === 'issues';
			if (show === 'ai') return l.checks.some((c) => c.how !== 'human');
			return true;
		})
	);
	const groups = $derived([...new Set(lists.map((l) => l.group))]);
	const count = (st: State) => (found ? [...found.values()].filter((s) => s.state === st).length : 0);
	const totalChecks = CHECKLISTS.reduce((n, l) => n + allChecks(l).length, 0);
</script>

<svelte:head><title>Testing — Q</title></svelte:head>

<Page title="Testing" lead="Every page of Q has a checklist. Take one, test it, and report back: each report is signed, so we always know who checked what.">
	<div class="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
		{#each [['Checklists', CHECKLISTS.length], ['Passed', count('passed')], ['Being tested', count('claimed')], ['Problems found', count('issues')]] as [called, n] (called)}
			<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4">
				<p class="text-sm opacity-70">{called}</p>
				<p class="h3">{found || called === 'Checklists' ? n : '…'}</p>
			</div>
		{/each}
	</div>
	<p class="text-sm mb-4">{totalChecks} checks in all: each page’s own, the {EVERY_PAGE.length} every page gets, and one for each language.</p>

	<div class="flex flex-wrap gap-2 mb-6" role="radiogroup" aria-label="Show">
		{#each SHOWS as s (s.id)}
			<button type="button" role="radio" aria-checked={show === s.id} class="btn min-h-11 {show === s.id ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => (show = s.id)}>{s.called}</button>
		{/each}
	</div>

	{#each groups as g (g)}
		<section class="mb-8" aria-labelledby="group-{g}">
			<h2 id="group-{g}" class="h4 mb-3">{GROUP_NAMES[g] ?? g}</h2>
			<ul class="flex flex-col gap-2">
				{#each lists.filter((l) => l.group === g) as l (l.id)}
					{@const s = stateOf(l.id)}
					<li>
						<a class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 flex flex-wrap items-center gap-3 hover:preset-tonal min-h-11" href="/testing/{l.id}">
							<span class="flex flex-col flex-1 min-w-48">
								<span class="font-bold">{l.title}</span>
								<span class="text-sm opacity-70">{l.page === '*' ? 'Every page' : l.page}{l.tab ? ` · ${l.tab}` : ''} · {allChecks(l).length} checks</span>
							</span>
							{#if s}
								{#if s.claimed}<span class="text-sm opacity-80">{s.claimed.name ?? 'Someone'} has it</span>{/if}
								<Status tone={tone(s.state)}>{STATE_WORDS[s.state]}</Status>
								<span class="text-sm opacity-70 w-16 text-right">{s.passed}/{s.total}</span>
							{/if}
							<Icon name="arrowRight" size={18} />
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<p class="opacity-70">Nothing here.</p>
	{/each}
</Page>
