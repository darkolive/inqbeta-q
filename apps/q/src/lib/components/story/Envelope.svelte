<svelte:options namespace="svg" />

<script lang="ts">
	/* A letter. (x, y) is the top-left; 70 × 48. Open shows the flap up and the writing inside. */
	let { x, y, open = false }: { x: number; y: number; open?: boolean } = $props();
</script>

{#if open}
	<path d="M{x + 1.5} {y + 2}l33.5-22 33.5 22" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" stroke-linejoin="round" />
	<rect x={x + 10} y={y - 24} width="50" height="40" rx="3" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="2" />
	<rect x={x + 18} y={y - 16} width="34" height="5" rx="2.5" class="fill-surface-300-700" />
	<rect x={x + 18} y={y - 6} width="24" height="5" rx="2.5" class="fill-surface-300-700" />
{/if}
<rect {x} {y} width="70" height="48" rx="5" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" />
{#if !open}
	<path d="M{x + 2} {y + 4}l33 24 33-24" fill="none" class="stroke-surface-500" stroke-width="3" stroke-linejoin="round" />
{/if}
