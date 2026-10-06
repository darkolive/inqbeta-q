<script lang="ts">
	/*
	 * A federation's receipt page on Incubator (ADR-Q-021 addendum, 6 October
	 * 2026): like a coin's verify page, but for the federation. Darren: "it takes
	 * you to the receipt of the federation, the receipt page. And you can click on
	 * go to site, and it will open up the host's website. And that can be
	 * updated any given time through the receipt."
	 *
	 * Checked on this device: the card's two signatures, Incubator's
	 * registration, the chain of versions. Anyone with the link can check it;
	 * only public ones are listed.
	 */
	import { page } from '$app/state';
	import { Page, Section, Status, Empty, Icon } from '@inqbeta/q-ui';
	import { QrCode } from '@skeletonlabs/skeleton-svelte';
	import { VISIBILITY } from '@inqbeta/q-core/registration';
	import { compareLink } from '@inqbeta/q-core/core-served';
	import { readRegistration, logoOf, type Entry } from '$lib/registry';

	const federation = $derived(decodeURIComponent(page.params.federation ?? ''));
	let found = $state<{ latest: Entry | null; history: Entry[] } | null>(null);
	$effect(() => void readRegistration(federation).then((r) => (found = r)));
	const card = $derived(found?.latest?.card ?? null);
	const onDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	const here = $derived(typeof location !== 'undefined' ? location.href : '');
</script>

<svelte:head><title>{card?.name ?? 'A federation'} — registered with Incubator</title></svelte:head>

<Page title={card?.name ?? 'A federation'} lead={card?.purpose ?? 'Its registration with Incubator, checked on this device.'}>
	{#if !found}
		<p class="opacity-60">Checking…</p>
	{:else if !card || !found.latest}
		<Empty icon="federations" title="Not registered" description="Incubator has no registration for this federation. It may not have registered yet, or the link may be wrong." />
	{:else}
		{@const e = found.latest}
		{@const core = e.registered.content.core}
		<div class="flex flex-wrap gap-6 items-start">
			<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-4 flex-[999_1_28rem] min-w-0">
				<div class="flex items-center gap-4">
					<span class="size-16 shrink-0 overflow-hidden rounded-full bg-surface-100-900 flex items-center justify-center">
						{#if logoOf(card)}<img src={logoOf(card)} alt="" class="size-full object-contain" />{:else}<Icon name="federations" />{/if}
					</span>
					<div class="flex flex-col gap-1 min-w-0">
						<p class="h4">{card.name}</p>
						<div class="flex flex-wrap gap-2">
							<Status tone={e.holds ? 'good' : 'bad'}>{e.holds ? 'Registered with Incubator' : 'Not registered now'}</Status>
							<Status tone="plain">{VISIBILITY.find((v) => v.id === card.visibility)?.called}</Status>
						</div>
					</div>
				</div>
				<p class="text-sm">{e.says}</p>
				<dl class="grid gap-2 text-sm sm:grid-cols-2">
					<div><dt class="opacity-70">Its site</dt><dd class="break-all">{card.site}</dd></div>
					<div><dt class="opacity-70">Runs</dt><dd>Q {card.runs.q}{card.runs.commit ? ` · ${card.runs.commit.slice(0, 7)}` : ''}</dd></div>
					<div><dt class="opacity-70">This version</dt><dd>{onDay(card.at)}</dd></div>
					<div><dt class="opacity-70">Federation</dt><dd class="role-token text-xs break-all" title={card.federation}>{card.federation.slice(0, 18)}…{card.federation.slice(-6)}</dd></div>
				</dl>
				{#if core}
					<div class="flex flex-wrap items-center gap-3 text-sm">
						<span class="opacity-70">Its core</span>
						{#if core.kind === 'unchanged'}
							<Status tone="good">Q’s core, unchanged</Status><span>release {core.release}</span>
						{:else if core.kind === 'branch'}
							<Status tone="plain">A branch of Q</Status>
							<span class="break-all">{core.source.branch} · {core.source.commit.slice(0, 7)}</span>
							<a class="anchor whitespace-nowrap" href={compareLink(core.source, core.nearest)} rel="noopener">See what’s different <Icon name="arrowRight" size={14} /></a>
						{:else}
							<Status tone="needs-you">Not checked</Status><span>Registered while testing, before its core could be checked.</span>
						{/if}
					</div>
				{/if}
				<ul class="text-sm flex flex-col gap-1">
					{#each e.registered.content.checked as c (c)}<li class="flex gap-2"><Icon name="check" size={16} class="text-success-700-300 shrink-0 mt-0.5" />{c}</li>{/each}
				</ul>
				<a class="btn preset-filled-primary-500 min-h-11 self-start" href={card.site} rel="noopener">Go to site <Icon name="arrowRight" size={18} /></a>
			</div>
			<!-- The page's own code, for the host to show on its site, like a coin's. -->
			<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 flex flex-col items-center gap-2 w-56">
				{#if here}
					<QrCode value={here} class="size-44">
						<QrCode.Frame class="size-full" aria-hidden="true"><QrCode.Pattern /></QrCode.Frame>
					</QrCode>
				{/if}
				<p class="text-xs text-center opacity-70">Scan to check this federation’s registration.</p>
			</div>
		</div>

		{#if found.history.length > 1}
			<Section title="Its history" description="Every version of its card, each signed by the federation and its founder, each registered by Incubator.">
				<ol class="flex flex-col gap-2 max-w-3xl">
					{#each [...found.history].reverse() as h (h.registered.contentHash)}
						<li class="card preset-outlined-surface-200-800 p-3 flex flex-wrap items-center gap-3 text-sm">
							<span>{onDay(h.card.at)}</span>
							<Status tone="plain">{VISIBILITY.find((v) => v.id === h.card.visibility)?.called}</Status>
							<span class="opacity-70 break-all">{h.card.site}</span>
						</li>
					{/each}
				</ol>
			</Section>
		{/if}
	{/if}
</Page>
