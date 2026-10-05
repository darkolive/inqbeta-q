<script lang="ts">
	/*
	 * A federation's Bank tab (5 October 2026, ADR-Q-035). Darren: "the Mint
	 * Bank needs to have its own tab in the Federation … anyone who goes on the
	 * Federation page … can go on and have a look at the Mint, what coins have
	 * been released, all of that."
	 *
	 * Open to anyone, signed in or not: the coin, whether it was really minted
	 * here, its reserves and books, its last reconciliation and what one coin
	 * is worth (CoinCheck, the same check a coin's QR code opens). If you hold
	 * its coins, your statement with the bank is one tap away.
	 */
	import { Section, Empty } from '@inqbeta/q-ui';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import CoinCheck from './CoinCheck.svelte';
	import { readMint, type MintView } from '$lib/money';

	let { name, identity }: { name: string; identity: Identity | null } = $props();

	let mint = $state<MintView | null>(null);
	let says = $state('');
	let asked = $state(false);
	$effect(() => {
		void readMint().then((m) => {
			mint = m.view;
			says = m.says ?? '';
			asked = true;
		});
	});
</script>

<Section title="{name}’s bank" description="The coin {name} issues, and the books behind it. Anyone can look: every figure is added up from the mint’s own signed receipts.">
	{#if !asked}
		<p class="card preset-tonal-surface p-4" aria-live="polite">Asking the mint…</p>
	{:else if !mint}
		<Empty icon="balance" title="No bank yet" description={says || `${name} hasn’t switched on a mint, so it hasn’t issued a coin.`} />
	{:else}
		<div class="flex flex-col gap-6">
			{#if identity}
				<div class="flex flex-wrap gap-2">
					<a class="btn preset-filled-primary-500 min-h-11" href="/balance/{encodeURIComponent(mint.mint)}">Your statement with the bank</a>
					<a class="btn preset-tonal min-h-11" href="/verify/{encodeURIComponent(mint.mint)}">The coin’s public page</a>
				</div>
			{/if}
			<CoinCheck mint={mint.mint} here />
		</div>
	{/if}
</Section>
