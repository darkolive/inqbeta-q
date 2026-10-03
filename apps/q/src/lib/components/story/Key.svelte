<svelte:options namespace="svg" />

<script lang="ts">
	/* A key: round head with a hole, a shaft, two teeth. (x, y) is the head's centre; about 72 wide at s = 1. */
	let { x, y, s = 1, fill = 'fill-primary-500' }: { x: number; y: number; s?: number; fill?: string } = $props();
</script>

<g transform="translate({x} {y}) scale({s})">
	<circle r="16" class={fill} />
	<circle r="6" class="fill-surface-50-950" />
	<rect x="12" y="-4" width="44" height="8" rx="2" class={fill} />
	<rect x="40" y="4" width="6" height="10" rx="1" class={fill} />
	<rect x="50" y="4" width="6" height="7" rx="1" class={fill} />
</g>
