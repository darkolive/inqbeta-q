<svelte:options namespace="svg" />

<script lang="ts">
	/* A desktop computer: a screen on a stand. (x, y) is the top-left; 150 × 130 with the stand. */
	let { x, y }: { x: number; y: number } = $props();
</script>

<rect {x} {y} width="150" height="100" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
<path d="M{x + 65} {y + 100}h20l4 18h-28z" class="fill-surface-300-700" />
<rect x={x + 45} y={y + 116} width="60" height="8" rx="4" class="fill-surface-300-700" />
