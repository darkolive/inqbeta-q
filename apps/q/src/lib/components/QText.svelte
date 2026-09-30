<script lang="ts">
	/*
	 * Words with every standalone "Q" drawn as the brand mark (QMark). Works on
	 * any language's string, so a translation only has to keep the letter Q
	 * where Q is meant. "QR" and other words that merely start with Q are left
	 * alone.
	 */
	import QMark from './QMark.svelte';

	let { text }: { text: string } = $props();

	const parts = $derived(text.split(/\bQ\b/));
</script>

{#each parts as part, i (i)}{part}{#if i < parts.length - 1}<QMark />{/if}{/each}
