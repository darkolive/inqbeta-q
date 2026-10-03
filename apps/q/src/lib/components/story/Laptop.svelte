<svelte:options namespace="svg" />

<script lang="ts">
	/* A laptop. (x, y) is the screen's top-left; the screen is 160 × 108, the base sticks out 20 each side. */
	let { x, y }: { x: number; y: number } = $props();
</script>

<rect {x} {y} width="160" height="108" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
<path d="M{x - 20} {y + 120}h200l-16 14H{x - 4}z" class="fill-surface-300-700" />
