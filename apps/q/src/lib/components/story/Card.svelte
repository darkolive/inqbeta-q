<svelte:options namespace="svg" />

<script lang="ts">
	/*
	 * A card, as Q shows one: cover along the top, a photo, a name, a few
	 * details. (x, y) is the top-left; 200 × 124 at s = 1.
	 */
	let { x, y, s = 1, cover = 'fill-secondary-200-800', photo = 'fill-secondary-500' }: { x: number; y: number; s?: number; cover?: string; photo?: string } = $props();
</script>

<g transform="translate({x} {y}) scale({s})">
	<rect width="200" height="124" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
	<path d="M1.5 11.5a10 10 0 0 1 10-10h177a10 10 0 0 1 10 10v28.5h-197z" class={cover} />
	<circle cx="38" cy="44" r="18" class="{photo} stroke-surface-50-950" stroke-width="3" />
	<rect x="64" y="50" width="90" height="9" rx="4.5" class="fill-surface-950-50" opacity="0.7" />
	<rect x="18" y="78" width="120" height="6" rx="3" class="fill-surface-300-700" />
	<rect x="18" y="92" width="90" height="6" rx="3" class="fill-surface-300-700" />
	<rect x="18" y="106" width="104" height="6" rx="3" class="fill-surface-300-700" />
</g>
