<script lang="ts">
	/*
	 * A mint's backing, as a display (4 October 2026): the same picture as the
	 * "Credits you can trust" story, with real figures. Text alternative in
	 * the label, for screen readers and read aloud.
	 */
	import BackingGraphic from './BackingGraphic.svelte';
	import { creditsWorth } from '@inqbeta/q-core/currency';
	/* `held` in whole units of the currency; one credit is one unit (ADR-Q-042 §3). */
	let { held, credits, currency = 'GBP', minRatio }: { held: number; credits: number; currency?: string; minRatio?: number } = $props();
	const ratio = $derived(credits > 0 ? held / credits : 1);
</script>

<figure class="card preset-outlined-surface-200-800 bg-surface-50-950 p-3 sm:p-4">
	<svg viewBox="0 0 640 300" class="w-full h-auto" role="img" aria-label="{creditsWorth(Math.round(held), currency)} held for {credits} credits out: {Math.round(Math.min(1, ratio) * 100)}% backed.">
		<BackingGraphic {held} {credits} {currency} {minRatio} />
	</svg>
</figure>
