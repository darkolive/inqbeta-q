
<script lang="ts">
	/*
	 * The battery: Q's health indicator (5 October 2026). Not how much you
	 * have — whether you have enough. Darren: "It represents the truth of the
	 * person. It's not about a comparison of wealth. It's about having enough
	 * … I have enough."
	 *
	 * Ten cells, lit for how full it is. Its colour is the warning, never the
	 * only message (the words travel with it, as the tooltip and to screen
	 * readers): green when full, blending through orange at the middle, to
	 * red for the last two cells; an empty case is red if there's something
	 * to be empty of, grey if there's nothing at all. The colour moves as the
	 * level moves, so a change is seen while it happens.
	 *
	 * Used for credits you can cash out (CashOutBattery); the same battery
	 * fits anything that should be enough rather than more. `enoughLevel`
	 * gives the usual rule: empty at what's needed, full at twice it.
	 */
	interface Props {
		/** How full, 0 to 1. */
		level: number;
		/** What it means, in words: the tooltip, and what a screen reader hears. */
		says: string;
		/** Small, for a dashboard or a header; or the full size. */
		size?: 'sm' | 'md';
		/** False when there's nothing at all to measure: an empty grey case rather than a red one. */
		present?: boolean;
	}
	let { level, says, size = 'md', present = true }: Props = $props();

	const CELLS = 10;
	/* Red for the last two cells; above that, red → orange → green as it fills. */
	const RED = 0.2;
	const GREEN = 'var(--color-success-600-400)';
	const ORANGE = 'var(--color-warning-600-400)';
	const REDS = 'var(--color-error-600-400)';

	const l = $derived(Math.max(0, Math.min(1, level || 0)));
	/* Anything above empty lights at least one cell. */
	const lit = $derived(l > 0 ? Math.max(1, Math.round(l * CELLS)) : 0);
	const colour = $derived.by(() => {
		if (!present) return 'var(--color-surface-300-700)';
		if (l <= RED) return REDS;
		const t = (l - RED) / (1 - RED);
		return t >= 0.5
			? `color-mix(in oklch, ${GREEN} ${Math.round(((t - 0.5) / 0.5) * 100)}%, ${ORANGE})`
			: `color-mix(in oklch, ${ORANGE} ${Math.round((t / 0.5) * 100)}%, ${REDS})`;
	});
	const sm = $derived(size === 'sm');
</script>

<!-- a case of ten cells, and its terminal -->
<div class="inline-flex items-center" role="meter" aria-valuemin={0} aria-valuemax={CELLS} aria-valuenow={lit} aria-valuetext="{lit} of {CELLS} cells: {says}" title={says}>
	<div class="flex {sm ? 'gap-0.5 p-0.5 rounded-md border-2' : 'gap-1 p-1.5 rounded-lg border-4'} motion-safe:transition-colors motion-safe:duration-700" style:border-color={colour}>
		{#each Array(CELLS) as _, i (i)}
			<span
				class="block rounded-sm motion-safe:transition-colors motion-safe:duration-700 {sm ? 'w-2 h-4' : 'w-5 sm:w-7 h-12'} {i < lit ? '' : 'bg-surface-200-800'}"
				style:background-color={i < lit ? colour : undefined}
			></span>
		{/each}
	</div>
	<span class="block rounded-r-md motion-safe:transition-colors motion-safe:duration-700 {sm ? 'w-1 h-2.5' : 'w-2 h-6'}" style:background-color={colour}></span>
</div>
