<script lang="ts">
	/*
	 * A mint's books, for reassurance (5 October 2026): every credit beside
	 * the money that backs it (the backing picture), then what's in
	 * circulation, the reserves, and whether the books reconcile and are fully
	 * backed — added up from the mint's own receipts. The same on your
	 * Credits page (beneath your own credits) and on the federation's home
	 * page (Darren: "definitely something that should be on the Federation's
	 * node homepage").
	 */
	import { Status } from '@inqbeta/q-ui';
	import BackingDisplay from './BackingDisplay.svelte';
	import { amount, type MintView } from '$lib/money';
	import { minorPerCredit } from '@inqbeta/q-core/currency';

	let { mint }: { mint: MintView } = $props();
	const b = $derived(mint.books);
</script>

<div class="max-w-3xl flex flex-col gap-4">
	<BackingDisplay held={(b.cashReserve + b.capitalReserve) / minorPerCredit(mint.currency)} credits={b.circulation} currency={mint.currency} />
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4">
			<p class="text-sm opacity-70">In circulation</p>
			<p class="h3 tabular-nums">{b.circulation}</p>
			<p class="text-xs opacity-70">{b.minted} made, {b.destroyed} destroyed{b.holders ? ` · ${b.holders} holding them` : ''}</p>
		</div>
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4">
			<p class="text-sm opacity-70">Cash reserve</p>
			<p class="h3 tabular-nums">{amount(b.cashReserve, mint)}</p>
			{#if b.capitalReserve}<p class="text-xs opacity-70">+ {amount(b.capitalReserve, mint)} capital</p>{/if}
		</div>
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 flex flex-col gap-2">
			<p class="text-sm opacity-70">The books</p>
			<Status tone={b.reconciled ? 'good' : 'bad'}>{b.reconciled ? 'Reconcile' : 'Don’t reconcile'}</Status>
			<Status tone={b.backed ? 'good' : 'bad'}>{b.backed ? 'Fully backed' : 'Not backed'}</Status>
		</div>
		<!-- Drift (ADR-Q-027): how much of what's owed isn't matched by money held. 0% is right; over 20%, cash-outs pause. -->
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 flex flex-col gap-2">
			<p class="text-sm opacity-70">Drift</p>
			<p class="h3 tabular-nums">{Math.round((b.drift ?? 0) * 100)}%</p>
			<Status tone={mint.valve?.shut ? 'bad' : mint.valve?.warn ? 'needs-you' : 'good'}>{mint.valve?.shut ? 'Cash-outs paused' : mint.valve?.warn ? 'Watch it' : 'Matched'}</Status>
		</div>
	</div>
	{#if mint.valve && (mint.valve.warn || mint.valve.shut)}
		<p class="card p-4 {mint.valve.shut ? 'preset-tonal-error' : 'preset-tonal-warning'}" role="status">{mint.valve.says}</p>
	{/if}
</div>
