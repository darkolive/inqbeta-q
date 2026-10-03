<svelte:options namespace="svg" />

<script lang="ts">
	/* A credit: a round token with Q on it, centred on (x, y). */
	let { x, y, r = 14 }: { x: number; y: number; r?: number } = $props();
</script>

<circle cx={x} cy={y} {r} class="fill-secondary-500 stroke-surface-50-950" stroke-width="2" />
<circle cx={x} cy={y} r={r - 4} fill="none" class="stroke-surface-50" stroke-width="1.5" opacity="0.6" />
<text {x} y={y + r * 0.36} text-anchor="middle" class="fill-surface-50 font-bold" font-size={r}>Q</text>
