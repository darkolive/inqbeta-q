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
	import { carryOnNext } from '$lib/components/decks/StoryDeck.svelte';
	import { BOOK } from '$lib/components/decks/words';
	import { storyVoice, setStoryVoice } from '$lib/components/decks/voice.svelte';
	/* The book owns the speaker here; each story follows it. */
	$effect(() => {
		storyVoice.inBook = true;
		return () => (storyVoice.inBook = false);
	});
	import SignIn from '$lib/components/SignIn.svelte';
	import { Icon } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';

	/* A members-only story opens for someone signed in; a public one for anyone. */
	let identity = $state<Identity | null>(null);
	$effect(() => watch((id) => (identity = id)));

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

	/*
	 * One continuous flow (Darren, 4 October): a chapter that ends while
	 * playing turns the page to the next, which carries straight on with the
	 * sound as it was. The last chapter ends the book. Pausing, scrubbing or
	 * choosing a chapter is intervening, and the flow follows that instead.
	 */
	$effect(() => {
		const ended = (e: Event) => {
			const { id, voice } = (e as CustomEvent<{ id: string; voice: boolean }>).detail;
			if (id !== chosen) return;
			const i = DECKS.findIndex((d) => d.id === id);
			const next = DECKS[i + 1];
			if (!next || (!next.open && !identity)) return;
			carryOnNext(voice);
			history.pushState(null, '', `#${next.id}`);
			chosen = next.id;
		};
		addEventListener('q-story-end', ended);
		return () => removeEventListener('q-story-end', ended);
	});

	let origin = $state('');
	$effect(() => void (origin = location.origin));
</script>

<svelte:head><title>{deck.title} — {BOOK.title}</title></svelte:head>

<!-- The book's title stays at the top, whichever story is showing. -->
<Page title={BOOK.title} lead={BOOK.subtext}>
	<div class="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-8 lg:items-stretch">
		<!--
			The index: titles only, light, the one showing marked. Never taller
			than the story beside it (Darren: "all controlled within a visual
			block"): more stories than fit, and the list scrolls.
		-->
		<div class="relative">
		<aside class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6 flex flex-col gap-5 max-h-[32rem] lg:max-h-none lg:absolute lg:inset-0">
			<!-- The book's sound: one speaker for every story, level with the story's title row. -->
			<div class="min-h-11 flex items-center">
				<button
					type="button"
					class="btn-icon min-h-11 min-w-11 {storyVoice.on ? 'preset-filled-primary-500' : 'preset-tonal'}"
					aria-pressed={storyVoice.on}
					aria-label={storyVoice.on ? 'Sound off' : 'Sound on: tell the stories aloud'}
					title={storyVoice.on ? 'Sound off' : 'Sound on'}
					onclick={() => setStoryVoice(!storyVoice.on)}
				>
					<Icon name={storyVoice.on ? 'speaker' : 'speaker-off'} size={18} />
				</button>
			</div>
			<!-- The stories begin level with the pictures, a touch beneath. -->
			<nav aria-label="Stories" class="flex-1 min-h-0 overflow-y-auto -mx-2 pt-1">
				<!-- A timeline: a numbered circle per chapter, a line running down between them. -->
				<ol class="flex flex-col">
					{#each DECKS as d, i (d.id)}
						{@const on = d.id === chosen}
						<li class="relative">
							{#if i < DECKS.length - 1}<span class="absolute left-[1.3rem] top-9 -bottom-1 w-0.5 bg-surface-300-700" aria-hidden="true"></span>{/if}
							<a
								href="#{d.id}"
								class="relative flex items-start gap-3 rounded-base px-2 py-1.5 leading-snug font-normal transition-colors {on ? 'text-primary-800-200' : 'hover:preset-tonal'}"
								aria-current={on ? 'page' : undefined}
								onclick={(e) => choose(d.id, e)}
							>
								<span class="size-7 shrink-0 rounded-full border-2 flex items-center justify-center text-xs tabular-nums font-medium {on ? 'bg-primary-500 border-primary-500 text-white' : 'bg-surface-50-950 border-surface-400-600'}" aria-hidden="true">{i + 1}</span>
								<span class="flex-1 pt-0.5">{d.title}</span>
								{#if !d.open}<span class="mt-1 shrink-0 opacity-60" title="Members only"><Icon name="lock" size={14} /><span class="sr-only">Members only</span></span>{/if}
							</a>
						</li>
					{/each}
				</ol>
			</nav>
			<!-- The whole book, to share. -->
			{#if origin}
				<div class="flex items-center min-h-11">
					 <ShareButton link="{origin}/stories" title={BOOK.title} message={BOOK.subtext} label="Share all" wide open />
				</div>
			{/if}
		</aside>
		</div>

		<!-- One story at a time. -->
		<div bind:this={stage} class="flex flex-col items-center min-w-0 scroll-mt-24">
			{#key deck.id}
				{#if deck.open || identity}
					<deck.component hideable={false} />
				{:else}
					<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-6 w-full max-w-3xl flex flex-col items-center gap-4 text-center">
						<Icon name="lock" size={28} />
						<p class="h4 font-normal">{deck.title}</p>
						<p>This story is for members. Sign in to watch it.</p>
						<SignIn stay />
					</div>
				{/if}
			{/key}
		</div>
	</div>
</Page>
