<script lang="ts">
	/*
	 * A small sample of a look, so a style can be chosen by seeing it rather
	 * than reading about it (the story engine's look step, 5 October 2026).
	 * Drawn, not photographed: a few shapes in each style's own colours. Also
	 * the frame a slide's scene sits in until its picture is made.
	 */
	import type { Snippet } from 'svelte';
	import type { Style } from '@inqbeta/q-core/storybook';
	import Piece from './Piece.svelte';
	let { style, children, class: klass = '' }: { style: Style | null; children?: Snippet; class?: string } = $props();
	const key = $derived(style?.key ?? 'icons');
</script>

<div class="relative overflow-hidden rounded-base aspect-[2/1] {klass}">
	<svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" class="absolute inset-0 w-full h-full" aria-hidden="true" focusable="false">
		{#if key === 'icons'}
			<rect width="200" height="100" class="fill-surface-100-900" />
			<circle cx="100" cy="50" r="34" class="fill-primary-100-900" />
			<Piece piece="person" x={100} y={50} size={40} />
		{:else if key === 'photo'}
			<defs><linearGradient id="ph-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9c7a6" /><stop offset="0.55" stop-color="#e9dcc3" /><stop offset="0.56" stop-color="#6d7754" /><stop offset="1" stop-color="#3f4a2f" /></linearGradient><radialGradient id="ph-v" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity="0.45" /></radialGradient></defs>
			<rect width="200" height="100" fill="url(#ph-sky)" />
			<circle cx="150" cy="30" r="12" fill="#fff4dc" opacity="0.9" />
			<path d="M0 62 Q50 48 100 60 T200 56 V100 H0z" fill="#56603f" />
			<rect x="58" y="34" width="9" height="30" rx="4" fill="#2c2a26" /><circle cx="62.5" cy="30" r="5" fill="#2c2a26" />
			<rect width="200" height="100" fill="url(#ph-v)" />
		{:else if key === 'ink'}
			<rect width="200" height="100" fill="#f3ead8" />
			<path d="M20 70 C50 30, 80 85, 110 45 S170 30, 185 60" fill="none" stroke="#1d1a17" stroke-width="3.5" stroke-linecap="round" />
			<path d="M40 30 q10 -12 22 0" fill="none" stroke="#1d1a17" stroke-width="2" stroke-linecap="round" />
			<circle cx="140" cy="38" r="9" fill="#c0392b" opacity="0.85" />
			<path d="M128 78 l30 -2" stroke="#1d1a17" stroke-width="1.5" stroke-linecap="round" />
		{:else if key === 'watercolour'}
			<rect width="200" height="100" fill="#fbf8f2" />
			<circle cx="70" cy="50" r="34" fill="#9cc3d5" opacity="0.45" /><circle cx="110" cy="46" r="30" fill="#e7b6a7" opacity="0.45" /><circle cx="140" cy="60" r="24" fill="#b9cf9a" opacity="0.5" />
		{:else if key === 'gothic'}
			<defs><radialGradient id="go-c" cx="0.5" cy="0.62" r="0.5"><stop offset="0" stop-color="#e8a33d" stop-opacity="0.85" /><stop offset="0.35" stop-color="#8e2b1f" stop-opacity="0.45" /><stop offset="1" stop-color="#140d0f" stop-opacity="0" /></radialGradient></defs>
			<rect width="200" height="100" fill="#140d0f" />
			<path d="M60 100 V40 Q100 0 140 40 V100" fill="#24181b" stroke="#3b2a2c" stroke-width="2" />
			<rect width="200" height="100" fill="url(#go-c)" />
			<rect x="97" y="58" width="6" height="16" fill="#e9dcc3" /><path d="M100 50 q4 5 0 8 q-4 -3 0 -8z" fill="#ffd27a" />
		{:else if key === 'paper'}
			<rect width="200" height="100" fill="#f4c95d" />
			<path d="M0 70 Q60 45 120 66 T200 58 V100 H0z" fill="#3f8f6b" style="filter: drop-shadow(0 -2px 1.5px rgb(0 0 0 / 0.25))" />
			<path d="M0 84 Q70 70 140 86 T200 80 V100 H0z" fill="#2f6b8f" style="filter: drop-shadow(0 -2px 1.5px rgb(0 0 0 / 0.25))" />
			<circle cx="150" cy="30" r="13" fill="#e8553a" style="filter: drop-shadow(1px 2px 1.5px rgb(0 0 0 / 0.25))" />
		{:else if key === 'line'}
			<rect width="200" height="100" fill="#ffffff" />
			<rect x="30" y="35" width="40" height="30" rx="4" fill="none" stroke="#2b2b2b" stroke-width="1.5" /><circle cx="150" cy="50" r="15" fill="none" stroke="#2b2b2b" stroke-width="1.5" />
			<path d="M72 50 H130" stroke="#d16900" stroke-width="2" /><path d="M126 46 l5 4 -5 4" fill="none" stroke="#d16900" stroke-width="2" />
		{:else if key === 'comic'}
			<defs><pattern id="co-dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.3" fill="#f2b705" /></pattern></defs>
			<rect width="200" height="100" fill="#ffe680" /><rect width="200" height="100" fill="url(#co-dots)" opacity="0.6" />
			<path d="M100 12 L112 40 L142 36 L120 56 L134 84 L104 68 L76 86 L84 56 L60 38 L90 40z" fill="#e63946" stroke="#111" stroke-width="3" stroke-linejoin="round" />
		{:else}
			<rect width="200" height="100" class="fill-surface-100-900" />
			<rect x="8" y="8" width="184" height="84" rx="8" fill="none" class="stroke-surface-400-600" stroke-width="2" stroke-dasharray="6 5" />
		{/if}
	</svg>
	{#if children}<div class="relative h-full">{@render children()}</div>{/if}
</div>
