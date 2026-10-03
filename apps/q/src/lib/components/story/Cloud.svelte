<svelte:options namespace="svg" />

<script lang="ts">
	/* Your own cloud — Google Drive, Dropbox or OneDrive. Centred on (x, y); about 140 × 80. */
	let { x, y }: { x: number; y: number } = $props();
</script>

<g transform="translate({x} {y})">
	<path d="M-50 36a28 28 0 0 1-4-56 34 34 0 0 1 64-14 26 26 0 0 1 42 20 24 24 0 0 1 2 50z" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
</g>
