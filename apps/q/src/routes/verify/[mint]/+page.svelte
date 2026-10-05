<script lang="ts">
	/*
	 * Check a coin (5 October 2026, ADR-Q-035): where a coin's QR code leads.
	 * Open to anyone, signed in or not, like DoStudy's verify page on the Dark
	 * Olive site. The check itself is CoinCheck, the same as in the drawer
	 * behind "Scan to check" on your statement.
	 */
	import { page } from '$app/state';
	import { Page } from '@inqbeta/q-ui';
	import CoinCheck from '$lib/components/CoinCheck.svelte';

	const asked = $derived(decodeURIComponent(page.params.mint ?? ''));
</script>

<svelte:head><title>Check a coin — Q</title></svelte:head>

<Page title="Check a coin" lead="A coin’s code leads here. It shows whether this house really minted it, and how the house stands right now: its reserves and its books.">
	<CoinCheck mint={asked} />
</Page>
