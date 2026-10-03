<script lang="ts">
	/*
	 * An agreement's steps, as a timeline of sentences from your side — the
	 * way the Workhouse demonstrator recorded every offer, counter and
	 * acceptance — each with a magnifier that opens its receipt.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { sayStep, type AgreementReceipt, type Terms } from '@inqbeta/q-core/agreements';
	import type { Ledger } from '$lib/ledger';
	import type { ReceiptEntry } from '$lib/receipts';
	import type { Names } from '$lib/receipt-read';
	import ReceiptDrawer from './ReceiptDrawer.svelte';

	let { steps, terms, me, names, ledger }: { steps: AgreementReceipt[]; terms: Terms | null; me: string; names: Names; ledger: Ledger | null } = $props();

	const nameOf = (d: string) => names.nameOf(d) ?? 'Someone';
	const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
	const receiptOf = (s: AgreementReceipt) => ledger?.receipts.find((r) => (r.json as { contentHash?: string } | undefined)?.contentHash === s.contentHash) ?? null;
	const DOT: Record<string, string> = { proposed: 'bg-secondary-500', countered: 'bg-secondary-500', agreed: 'bg-primary-500', settled: 'bg-success-500', taken: 'bg-primary-500', done: 'bg-primary-500', declined: 'bg-surface-400-600', withdrawn: 'bg-surface-400-600' };

	let opened = $state<ReceiptEntry | null>(null);
	let open = $state(false);
</script>

<ol class="ms-3 border-s-2 border-surface-200-800 ps-6 flex flex-col gap-6">
	{#each steps as s (s.contentHash)}
		<li class="relative">
			<span aria-hidden="true" class="absolute -start-[1.95rem] top-1.5 size-3 rounded-full ring-4 ring-surface-50-950 {DOT[s.content.step] ?? 'bg-surface-400-600'}"></span>
			<div class="flex items-start gap-3">
				<div class="flex-1 min-w-0">
					<p class="text-sm opacity-70">{when(s.content.at)}</p>
					<p class="mt-1">{sayStep(s, me, nameOf, s.content.terms ?? terms)}</p>
					{#if s.content.note}<p class="mt-1 text-sm text-surface-700-300">“{s.content.note}”</p>{/if}
				</div>
				{#if receiptOf(s)}
					<button type="button" class="btn-icon preset-tonal shrink-0" aria-label="See the receipt" title="See the receipt" onclick={() => ((opened = receiptOf(s)), (open = true))}>
						<Icon name="search" size={18} />
					</button>
				{/if}
			</div>
		</li>
	{/each}
</ol>

<ReceiptDrawer receipt={opened} {names} bind:open />
