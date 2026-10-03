<script lang="ts">
	/*
	 * News and updates, on the You home page (3 October 2026).
	 *
	 * First, anything Incubator has announced to its members — signed, and
	 * checked against the federation's key before it's shown (ADR-Q-016 §6) —
	 * then what's new in Q (lib/whats-new.ts). Calm: a short list, no counters,
	 * nothing that flashes. An announcement opened here counts as read in the
	 * bell too.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import type { Announcement } from '@inqbeta/q-core/announcements';
	import { readAnnouncements, markRead } from '$lib/announcements';
	import type { Home } from '$lib/home';
	import { WHATS_NEW } from '$lib/whats-new';

	let { home, member, shown = 4 }: { home: Home | null; member: boolean; shown?: number } = $props();

	let announced = $state<Announcement[]>([]);
	$effect(() => {
		if (home?.ok && member) void readAnnouncements(home.federation, home.services.storage).then((a) => (announced = a.slice(0, 2)));
		else announced = [];
	});

	let all = $state(false);
	const news = $derived(all ? WHATS_NEW : WHATS_NEW.slice(0, shown));
	const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
</script>

<div class="flex flex-col gap-3">
	{#each announced as a (a.id)}
		<article class="card preset-tonal-primary p-4 flex gap-4 items-start">
			<span class="btn-icon preset-filled-primary-500 shrink-0 pointer-events-none" aria-hidden="true"><Icon name="bell" size={20} /></span>
			<div class="flex-1 min-w-0 space-y-1">
				<p class="text-xs opacity-70">From {home?.ok ? home.name : 'Incubator'} · {day(a.at)}</p>
				<h3 class="h5">{a.title}</h3>
				<p class="text-surface-800-200">{a.says}</p>
				{#if a.action}
					<a class="btn btn-sm preset-filled-primary-500 min-h-11 mt-2" href={a.action.href} onclick={() => markRead(a.id)}>{a.action.label}</a>
				{/if}
			</div>
		</article>
	{/each}

	<ul class="card preset-outlined-surface-200-800 bg-surface-50-950 divide-y divide-surface-200-800 overflow-hidden">
		{#each news as n (n.title)}
			<li>
				<a href={n.href} class="flex gap-4 items-start p-4 hover:preset-tonal-surface min-h-11">
					<span class="btn-icon preset-tonal-secondary shrink-0 pointer-events-none" aria-hidden="true"><Icon name={n.icon} size={20} /></span>
					<span class="flex-1 min-w-0 space-y-1">
						<span class="block text-xs opacity-70">{day(n.at)}</span>
						<span class="block font-bold">{n.title}</span>
						<span class="block text-surface-700-300">{n.says}</span>
					</span>
					<span class="hidden sm:flex items-center gap-1 text-primary-700-300 text-sm font-semibold self-center shrink-0">{n.go} <Icon name="chevronRight" size={16} /></span>
				</a>
			</li>
		{/each}
	</ul>
	{#if WHATS_NEW.length > shown}
		<button type="button" class="btn preset-tonal self-start min-h-11" onclick={() => (all = !all)}>
			{all ? 'Show fewer' : 'Everything new'}
		</button>
	{/if}
</div>
