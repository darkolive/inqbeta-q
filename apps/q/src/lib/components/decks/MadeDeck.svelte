<script lang="ts">
	/*
	 * A made story (the story engine, ADR-Q-033 Part 2): the same player as
	 * Q's own five, drawn from the story's record instead of hand-written
	 * pictures. Each slide shows its one picture piece, big, arriving gently as
	 * the slide begins; the words sit under it as in every story. With less
	 * motion asked for, each piece appears whole.
	 *
	 * Darren's choice for the first draft (4 October 2026): icon + words.
	 * Scene recipes (which pieces, where, what moves) can come later, drawn by
	 * this same deck.
	 */
	import { drawsItself, type Story, type Style } from '@inqbeta/q-core/storybook';
	import ScenePicture from '../engine/ScenePicture.svelte';
	import StoryDeck from './StoryDeck.svelte';
	import type { Frame } from './frame';
	import Piece from '../engine/Piece.svelte';
	import RecipePicture from '../engine/RecipePicture.svelte';
	import ArtPicture from '../engine/ArtPicture.svelte';

	/*
	 * `look`: the book's look (5 October 2026). Q's own icons are drawn here;
	 * any other look shows each slide's scene, as imagined, in that look's
	 * frame, until its picture is made.
	 */
	let { story, shareable = false, look = null }: { story: Story; shareable?: boolean; look?: Style | null } = $props();
	/* A slide still waiting for words plays as a quiet "…", so a half-made story can be tried. */
	const scenes = $derived(story.slides.map((s) => ({ title: s.title || '…', says: s.subtext })));
	const n = $derived(story.slides.length);
</script>

{#snippet pictures(f: Frame)}
	{@const slide = story.slides[f.scene - 1]}
	{#snippet moving()}
		{#if slide?.motion && drawsItself(look)}
			<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true"><RecipePicture recipe={slide.motion} t={f.still ? 1 : f.p} /></svg>
		{:else}
			<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">{#if slide?.piece}<Piece piece={slide.piece} x={320} y={150} size={150} />{/if}</svg>
		{/if}
	{/snippet}
	{#if slide?.art}
		<!-- The polished build (6 October 2026): drawn by the stronger model, on the slide's own clock. -->
		<ArtPicture hash={slide.art.hash} t={f.still ? Infinity : f.into} fallback={moving} />
	{:else if slide?.motion && drawsItself(look)}
		<!-- Brought to life (6 October 2026): the slide's scene recipe, performed. A still is its end. -->
		<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
			<RecipePicture recipe={slide.motion} t={f.still ? 1 : f.p} />
			{#each story.slides as _, i (i)}
				<circle cx={320 + (i - (n - 1) / 2) * 22} cy="306" r="5" class={i < f.scene ? 'fill-primary-500' : 'fill-surface-300-700'} />
			{/each}
		</svg>
	{:else if !drawsItself(look)}
		<div class="transition-opacity duration-500 motion-reduce:transition-none" style="opacity: {0.35 + 0.65 * f.p}"><ScenePicture scene={slide?.scene} style={look} big /></div>
	{:else}
	{@const grow = 0.82 + 0.18 * f.p}
	<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
		<circle cx="320" cy="150" r={110 * grow} class="fill-primary-100-900" opacity={0.5 * f.p + 0.5} />
		{#if slide?.piece}
			<g opacity={0.35 + 0.65 * f.p} transform="translate(320 150) scale({grow}) translate(-320 -150)">
				<Piece piece={slide.piece} x={320} y={150} size={150} />
			</g>
		{/if}
		<!-- Where we are in the story: a dot a slide, the ones passed in olive. -->
		{#each story.slides as _, i (i)}
			<circle cx={320 + (i - (n - 1) / 2) * 22} cy="296" r="5" class={i < f.scene ? 'fill-primary-500' : 'fill-surface-300-700'} />
		{/each}
	</svg>
	{/if}
{/snippet}

{#if n}
	<StoryDeck id={story.id} title={story.title} {scenes} {pictures} hideable={false} {shareable} />
{:else}
	<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-6 w-full max-w-3xl text-center">
		<p class="h5 font-normal">{story.title}</p>
		<p class="text-surface-700-300">No slides yet.</p>
	</div>
{/if}
