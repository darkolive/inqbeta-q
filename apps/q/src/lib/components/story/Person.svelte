<svelte:options namespace="svg" />

<script lang="ts">
	/* Someone in the story: a coloured circle with their initial, and their name underneath if given. */
	let { x, y, letter, fill = 'fill-secondary-500', name = '', nameY = 0 }: { x: number; y: number; letter: string; fill?: string; name?: string; nameY?: number } = $props();
</script>

<circle cx={x} cy={y} r="22" class={fill} />
<text {x} y={y + 8} text-anchor="middle" class="fill-surface-50 text-xl font-bold">{letter}</text>
{#if name}
	<text {x} y={nameY || y + 52} text-anchor="middle" class="fill-surface-950-50 text-lg font-semibold">{name}</text>
{/if}
