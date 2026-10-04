<script lang="ts">
	/*
	 * A mint's backing, as a display (4 October 2026): the same picture as the
	 * "Credits you can trust" story, with real figures. Text alternative in
	 * the label, for screen readers and read aloud.
	 */
	import BackingGraphic from './BackingGraphic.svelte';
	let { pounds, credits, perCredit = 1, minRatio }: { pounds: number; credits: number; perCredit?: number; minRatio?: number } = $props();
	const ratio = $derived(credits * perCredit > 0 ? pounds / (credits * perCredit) : 1);
</script>

<figure class="card preset-outlined-surface-200-800 bg-surface-50-950 p-3 sm:p-4">
	<svg viewBox="0 0 640 300" class="w-full h-auto" role="img" aria-label="£{Math.round(pounds)} held for {credits} credits out: {Math.round(Math.min(1, ratio) * 100)}% backed.">
		<BackingGraphic {pounds} {credits} {perCredit} {minRatio} />
	</svg>
</figure>
