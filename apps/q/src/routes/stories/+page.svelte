<script lang="ts">
	/*
	 * The stories (4 October 2026): Q's ideas as short picture decks, each one
	 * a little advert for one kind of reader. Open to anyone, signed in or not.
	 *
	 * A story manual, one story at a time (Darren, 4 October: "the index on
	 * the left, just the title … less weight on the font … rather than scroll
	 * down like an anchor, it should replace the story, so you only have one
	 * storyboard at a time … at the bottom of the index, share the whole
	 * novel"). Choosing a title swaps the story in place; the address follows
	 * (#vault), so Back works and a link opens the same story.
	 */
	import { Page } from '@inqbeta/q-ui';
	import { DECKS } from '$lib/components/decks';
	import ShareButton from '$lib/components/ShareButton.svelte';

	/* Which story: from the address (#vault, or #vault-3 for a scene), else the first. */
	const fromHash = () => {
		if (typeof location === 'undefined') return DECKS[0].id;
		const h = location.hash.slice(1);
		return DECKS.find((d) => h === d.id || h.startsWith(`${d.id}-`))?.id ?? DECKS[0].id;
	};
	let chosen = $state(DECKS[0].id);
	$effect(() => {
		chosen = fromHash();
		const back = () => (chosen = fromHash());
		addEventListener('popstate', back);
		addEventListener('hashchange', back);
		return () => {
			removeEventListener('popstate', back);
			removeEventListener('hashchange', back);
		};
	});
	const deck = $derived(DECKS.find((d) => d.id === chosen) ?? DECKS[0]);
	function choose(id: string, e: MouseEvent) {
		e.preventDefault();
		if (id === chosen) return;
		history.pushState(null, '', `#${id}`);
		chosen = id;
		/* On a phone the index sits above the story: bring the story up. */
		if (!matchMedia('(min-width: 1024px)').matches) requestAnimationFrame(() => stage?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
	}
	let stage = $state<HTMLElement | null>(null);

	let origin = $state('');
	$effect(() => void (origin = location.origin));
</script>

<svelte:head><title>{deck.title} — Stories — Q</title></svelte:head>

<Page title="Stories" lead="Q’s ideas, one short picture story each. Choose one, watch, skim with the slider, and share the scene that fits someone you know.">
	<div class="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-8 items-start">
		<!-- The index: titles only, light, the one showing marked. -->
		<aside class="card preset-outlined-surface-200-800 bg-surface-50-950 p-3 flex flex-col gap-3">
			<nav aria-label="Chapters">
				<p class="text-xs font-semibold uppercase tracking-wider text-surface-700-300 px-2 pt-1 pb-2">Chapters</p>
				<ol class="flex flex-col gap-1">
					{#each DECKS as d, i (d.id)}
						{@const on = d.id === chosen}
						<li>
							<a
								href="#{d.id}"
								class="flex gap-2 rounded-base px-2 py-2 leading-snug font-normal transition-colors {on ? 'preset-tonal-primary text-primary-800-200' : 'hover:preset-tonal'}"
								aria-current={on ? 'page' : undefined}
								onclick={(e) => choose(d.id, e)}
							>
								<span class="tabular-nums opacity-60 w-4 shrink-0">{i + 1}</span>
								<span>{d.title}</span>
							</a>
						</li>
					{/each}
				</ol>
			</nav>
			<!-- The whole book, to share. -->
			{#if origin}
				<div class="pt-3 border-t border-surface-200-800">
					<ShareButton link="{origin}/stories" title="Q, in stories" message="Q’s ideas, one short picture story each." label="Share the whole book" wide />
				</div>
			{/if}
		</aside>

		<!-- One story at a time. -->
		<div bind:this={stage} class="flex flex-col items-center min-w-0 scroll-mt-24">
			{#key deck.id}
				<deck.component hideable={false} />
			{/key}
		</div>
	</div>
</Page>
