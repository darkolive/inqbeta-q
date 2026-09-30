<script lang="ts">
	/*
	 * The frame a static page is drawn in: one <main>, exactly one h1, and the
	 * blocks drawn by the same BlockView/PageView as the preview — so what was
	 * previewed is what goes public.
	 *
	 * A page that opens with a hero already has its title: the hero's big line
	 * becomes the h1, instead of the page's name being said twice. Otherwise
	 * the page's name is the h1. Either way, everything else sits at h2 and
	 * below, so a screen reader's list of headings is a true outline.
	 */
	import { BlockView, Page, PageView, type Supply, type Drawn } from '@inqbeta/q-ui';
	import Level from './Level.svelte';

	let { page, supply = {} }: { page: { called: string; blocks: Drawn[] }; supply?: Supply } = $props();

	const hero = $derived(page.blocks[0]?.kind === 'hero' ? page.blocks[0] : null);
	const rest = $derived(hero ? { ...page, blocks: page.blocks.slice(1) } : page);
</script>

<main class="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-12">
	{#if hero}
		<Level n={1}><BlockView block={hero} {supply} /></Level>
		<Level n={2}><PageView page={rest} {supply} /></Level>
	{:else}
		<Page title={page.called}>
			<PageView {page} {supply} />
		</Page>
	{/if}
</main>
