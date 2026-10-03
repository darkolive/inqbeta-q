<svelte:options namespace="svg" />

<script lang="ts">
	/* Your vault, as a folder with things in it. (x, y) is the top-left; 60 × 44 at s = 1. */
	let { x, y, s = 1, fill = 'fill-primary-200-800', dashed = false }: { x: number; y: number; s?: number; fill?: string; dashed?: boolean } = $props();
</script>

<g transform="translate({x} {y}) scale({s})">
	{#if dashed}
		<path d="M0 6a4 4 0 0 1 4-4h16l6 6h30a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4z" fill="none" class="stroke-error-500" stroke-width="3" stroke-dasharray="5 4" />
	{:else}
		<path d="M0 6a4 4 0 0 1 4-4h16l6 6h30a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4z" class={fill} />
		<rect x="10" y="18" width="34" height="5" rx="2.5" class="fill-surface-50-950" />
		<rect x="10" y="28" width="24" height="5" rx="2.5" class="fill-surface-50-950" />
	{/if}
</g>
