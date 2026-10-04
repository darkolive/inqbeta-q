<script lang="ts">
	/*
	 * One story, on its own (4 October 2026): the page to share, as a short
	 * advert for one idea. Open to anyone.
	 */
	import { page } from '$app/state';
	import { Page, Icon } from '@inqbeta/q-ui';
	import ShareLink from '$lib/components/ShareLink.svelte';
	import { deckOf } from '$lib/components/decks';

	const deck = $derived(deckOf(page.params.id ?? ''));
	const link = $derived(typeof location === 'undefined' ? '' : `${location.origin}/stories/${deck?.id ?? ''}`);
</script>

<svelte:head>
	<title>{deck?.title ?? 'Story'} — Q</title>
	{#if deck}<meta name="description" content={deck.line} />{/if}
</svelte:head>

{#if deck}
	<Page title={deck.title} lead={deck.line}>
		{#snippet actions()}
			<a href="/stories" class="btn preset-tonal min-h-11"><Icon name="arrowLeft" size={16} /> All stories</a>
		{/snippet}
		<div class="flex flex-col items-center gap-6">
			<deck.component hideable={false} />
			{#if link}
				<div class="w-full max-w-3xl">
					<ShareLink {link} label="This story’s link" subject={deck.title} message={`${deck.line} Watch it here:`} note="Anyone can watch it, signed in or not." />
				</div>
			{/if}
		</div>
	</Page>
{:else}
	<Page title="Story not found" lead="There’s no story by that name.">
		<a href="/stories" class="btn preset-tonal min-h-11 self-start"><Icon name="arrowLeft" size={16} /> All stories</a>
	</Page>
{/if}
