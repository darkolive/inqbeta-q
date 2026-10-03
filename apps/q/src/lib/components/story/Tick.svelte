<svelte:options namespace="svg" />

<script lang="ts">
	/* Yes: a tick in a green circle, centred on (x, y). */
	let { x, y, r = 12 }: { x: number; y: number; r?: number } = $props();
</script>

<circle cx={x} cy={y} {r} class="fill-success-500" />
<path d="M{x - r * 0.45} {y}l{r * 0.3} {r * 0.3} {r * 0.6} {-r * 0.6}" fill="none" class="stroke-surface-50" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
