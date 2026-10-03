<svelte:options namespace="svg" />

<script lang="ts">
	/*
	 * A padlock, shut or open. (x, y) is the middle of the top of its body;
	 * the body is 36 × 28. Give it a fill and the matching stroke.
	 */
	let { x, y, open = false, fill = 'fill-primary-500', stroke = 'stroke-primary-500' }: { x: number; y: number; open?: boolean; fill?: string; stroke?: string } = $props();
</script>

<path d={open ? `M${x + 11} ${y}v-16a11 11 0 0 0-22 0v4` : `M${x - 11} ${y}v-8a11 11 0 0 1 22 0v8`} fill="none" class={stroke} stroke-width="5" stroke-linecap="round" />
<rect x={x - 18} {y} width="36" height="28" rx="5" class={fill} />
<circle cx={x} cy={y + 12} r="3.5" class="fill-surface-50" />
<rect x={x - 1.5} y={y + 13} width="3" height="8" rx="1.5" class="fill-surface-50" />
