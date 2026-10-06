<script lang="ts">
	/*
	 * A slide's picture for a video frame (ADR-Q-033, export as video): the
	 * same drawing the player shows for a slide without polished art (its
	 * movement, or its piece arriving), at moment `t` (0 to 1). Mounted out of
	 * sight while a video is made, and copied frame by frame.
	 */
	import type { Slide } from '@inqbeta/q-core/storybook';
	import RecipePicture from '../components/engine/RecipePicture.svelte';
	import Piece from '../components/engine/Piece.svelte';
	let { slide, t }: { slide: Slide; t: number } = $props();
	const grow = $derived(0.82 + 0.18 * t);
</script>

<svg viewBox="0 0 640 320" width="640" height="320" xmlns="http://www.w3.org/2000/svg">
	{#if slide.motion}
		<RecipePicture recipe={slide.motion} t={Math.max(0.0001, t)} />
	{:else}
		<circle cx="320" cy="150" r={110 * grow} class="fill-primary-100-900" opacity={0.5 * t + 0.5} />
		{#if slide.piece}
			<g opacity={0.35 + 0.65 * t} transform="translate(320 150) scale({grow}) translate(-320 -150)"><Piece piece={slide.piece} x={320} y={150} size={150} /></g>
		{/if}
	{/if}
</svg>
