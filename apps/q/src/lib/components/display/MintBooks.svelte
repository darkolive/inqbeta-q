<script lang="ts">
	/*
	 * A mint's books, for reassurance (5 October 2026): every credit beside
	 * the pounds that back it (the backing picture), then what's in
	 * circulation, the reserves, and whether the books reconcile and are fully
	 * backed — added up from the mint's own receipts. The same on your
	 * Credits page (beneath your own credits) and on the federation's home
	 * page (Darren: "definitely something that should be on the Federation's
	 * node homepage").
	 */
	import { Status } from '@inqbeta/q-ui';
	import BackingDisplay from './BackingDisplay.svelte';
	import { pounds, type MintView } from '$lib/money';

	let { mint }: { mint: MintView } = $props();
	const b = $derived(mint.books);
</script>

<div class="max-w-3xl flex flex-col gap-4">
	<BackingDisplay pounds={(b.cashReserve + b.capitalReserve) / 100} credits={b.circulation} perCredit={mint.pencePerCredit / 100} />
	<div class="grid gap-4 sm:grid-cols-3">
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4">
			<p class="text-sm opacity-70">In circulation</p>
			<p class="h3 tabular-nums">{b.circulation}</p>
			<p class="text-xs opacity-70">{b.minted} made, {b.destroyed} destroyed{b.holders ? ` · ${b.holders} holding them` : ''}</p>
		</div>
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4">
			<p class="text-sm opacity-70">Cash reserve</p>
			<p class="h3 tabular-nums">{pounds(b.cashReserve)}</p>
			{#if b.capitalReserve}<p class="text-xs opacity-70">+ {pounds(b.capitalReserve)} capital</p>{/if}
		</div>
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 flex flex-col gap-2">
			<p class="text-sm opacity-70">The books</p>
			<Status tone={b.reconciled ? 'good' : 'bad'}>{b.reconciled ? 'Reconcile' : 'Don’t reconcile'}</Status>
			<Status tone={b.backed ? 'good' : 'bad'}>{b.backed ? 'Fully backed' : 'Not backed'}</Status>
		</div>
	</div>
</div>
