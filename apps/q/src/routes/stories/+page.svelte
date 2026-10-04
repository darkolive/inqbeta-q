<script lang="ts">
	/*
	 * The stories (4 October 2026): Q's ideas as short picture decks, each one
	 * a little advert for one kind of reader. Open to anyone, signed in or not.
	 *
	 * A story manual: the index runs down the side (Darren: "on the side there
	 * an index, so it becomes like a story manual … a beautiful way of
	 * teaching"), each story with its scenes, and stays in view as you read.
	 */
	import { Page, Icon } from '@inqbeta/q-ui';
	import { DECKS } from '$lib/components/decks';

	/*
	 * Keep the index in view as you scroll. The dashboard's <main> sets its own
	 * overflow, which stops CSS sticky working here, so the index is moved
	 * down with the page instead, never past the end of the stories.
	 */
	let aside = $state<HTMLElement | null>(null);
	let column = $state<HTMLElement | null>(null);
	let shift = $state(0);
	$effect(() => {
		if (!aside || !column) return;
		const wide = matchMedia('(min-width: 1024px)');
		const place = () => {
			if (!aside || !column || !wide.matches) return void (shift = 0);
			const top = column.getBoundingClientRect().top - 96;
			const room = column.offsetHeight - aside.offsetHeight;
			shift = Math.max(0, Math.min(room, -top));
		};
		place();
		addEventListener('scroll', place, { passive: true });
		addEventListener('resize', place);
		return () => {
			removeEventListener('scroll', place);
			removeEventListener('resize', place);
		};
	});
</script>

<svelte:head><title>Stories — Q</title></svelte:head>

<Page title="Stories" lead="Q’s ideas, one short picture story each. Watch, skim with the slider, or share the one that fits someone you know.">
	<div bind:this={column} class="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] gap-8 items-start">
		<!-- The index: every story and its scenes. -->
		<aside bind:this={aside} style="transform: translateY({shift}px)" class="lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto card preset-outlined-surface-200-800 bg-surface-50-950 p-4">
			<nav aria-label="Story index">
				<p class="text-xs font-bold uppercase tracking-wider text-surface-700-300 mb-3">Index</p>
				<ol class="flex flex-col gap-4">
					{#each DECKS as d, i (d.id)}
						<li>
							<a href="#{d.id}" class="anchor font-semibold leading-snug block">{i + 1}. {d.title}</a>
							<p class="text-xs text-surface-700-300 mt-0.5">For {d.forWhom.toLowerCase()}</p>
							<ol class="mt-1.5 ms-4 list-decimal text-xs text-surface-700-300 flex flex-col gap-0.5">
								{#each d.scenes as s, n (n)}<li><a href="#{d.id}-{n + 1}" class="hover:underline">{s.title}</a></li>{/each}
							</ol>
						</li>
					{/each}
				</ol>
			</nav>
		</aside>

		<div class="flex flex-col gap-10 min-w-0">
			{#each DECKS as d (d.id)}
				<section id={d.id} class="flex flex-col items-center gap-3 scroll-mt-24">
					<d.component hideable={false} />
					<a href="/stories/{d.id}" class="btn preset-tonal min-h-11"><Icon name="share" size={16} /> This story on its own, to share</a>
				</section>
			{/each}
		</div>
	</div>
</Page>
