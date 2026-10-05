<script lang="ts">
	/* A picture piece on its own, as a small square picture (the piece picker, a slide card). */
	import type { Piece as PieceName } from '@inqbeta/q-core/storybook';
	import Piece from './Piece.svelte';
	let { piece, size = 48 }: { piece: PieceName | null; size?: number } = $props();
</script>

<svg viewBox="0 0 120 120" width={size} height={size} class="shrink-0" aria-hidden="true" focusable="false">
	{#if piece}<Piece {piece} x={60} y={60} size={84} />{:else}<rect x="20" y="20" width="80" height="80" rx="16" fill="none" class="stroke-surface-400-600" stroke-width="4" stroke-dasharray="10 8" />{/if}
</svg>
