<svelte:options namespace="svg" />

<script lang="ts">
	/* No: a cross in a red circle, centred on (x, y). */
	let { x, y, r = 14 }: { x: number; y: number; r?: number } = $props();
</script>

<circle cx={x} cy={y} {r} class="fill-error-500" />
<path d="M{x - r * 0.4} {y - r * 0.4}l{r * 0.8} {r * 0.8}M{x + r * 0.4} {y - r * 0.4}l{-r * 0.8} {r * 0.8}" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" />
