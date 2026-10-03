<svelte:options namespace="svg" />

<script lang="ts">
	/* A phone. (x, y) is the top-left; 60 × 104. */
	let { x, y }: { x: number; y: number } = $props();
</script>

<rect {x} {y} width="60" height="104" rx="12" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
<rect x={x + 19} y={y + 90} width="22" height="5" rx="2.5" class="fill-surface-300-700" />
