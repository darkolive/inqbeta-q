<script lang="ts">
	/*
	 * Words with every standalone "Q" drawn as the brand mark (QMark). Works on
	 * any language's string, so a translation only has to keep the letter Q
	 * where Q is meant. "QR" and other words that merely start with Q are left
	 * alone.
	 *
	 * With linkOrg, "Dark Olive CIC" (or "Dark Olive") becomes a link to its
	 * home page. Off by default, because text already inside a link must not
	 * hold another.
	 */
	import QMark from './QMark.svelte';

	const DARK_OLIVE = 'https://darkolive.co.uk';

	let { text, linkOrg = false }: { text: string; linkOrg?: boolean } = $props();

	const chunks = $derived(linkOrg ? text.split(/(Dark Olive(?: CIC)?)/) : [text]);
</script>

{#each chunks as chunk, c (c)}{#if linkOrg && c % 2 === 1}<a class="anchor" href={DARK_OLIVE} rel="noopener" target="_blank">{chunk}</a>{:else}{@const parts = chunk.split(/\bQ\b/)}{#each parts as part, i (i)}{part}{#if i < parts.length - 1}<QMark />{/if}{/each}{/if}{/each}
