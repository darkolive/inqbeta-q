<script lang="ts">
	/*
	 * The stories (4 October 2026): Q's ideas as short picture decks, each one
	 * a little advert for one kind of reader. Open to anyone, signed in or not.
	 */
	import { Page, Icon } from '@inqbeta/q-ui';
	import { DECKS } from '$lib/components/decks';
</script>

<svelte:head><title>Stories — Q</title></svelte:head>

<Page title="Stories" lead="Q’s ideas, one short picture story each. Watch, skim with the slider, or share the one that fits someone you know.">
	<nav aria-label="The stories" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each DECKS as d (d.id)}
			<a href="#{d.id}" class="card preset-outlined-surface-200-800 hover:preset-tonal p-4 flex flex-col gap-1 min-h-11">
				<span class="font-bold">{d.title}</span>
				<span class="text-sm text-surface-700-300">For {d.forWhom.toLowerCase()}</span>
			</a>
		{/each}
	</nav>
	{#each DECKS as d (d.id)}
		<section id={d.id} class="flex flex-col items-center gap-3 scroll-mt-24">
			<d.component hideable={false} />
			<a href="/stories/{d.id}" class="btn preset-tonal min-h-11"><Icon name="share" size={16} /> This story on its own, to share</a>
		</section>
	{/each}
</Page>
