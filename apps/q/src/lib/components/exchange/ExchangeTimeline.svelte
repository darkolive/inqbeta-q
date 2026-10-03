<script lang="ts" module>
	export interface TimelineStep {
		contentHash: string;
		content: { parent: string | null; at: string };
		/** What happened, said from your side. */
		text: string;
		note?: string;
		/** How the dot looks: an offer, an agreement, settled, or an ending. */
		tone: 'offer' | 'agreed' | 'settled' | 'ended';
	}
</script>

<script lang="ts">
	/*
	 * The exchange set's timeline (ADR-Q-029): every step as a sentence from
	 * your side, each with a magnifier that opens its receipt — and, read from
	 * the latest step back, whether every step links to the one before it.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { fromHead } from '@inqbeta/q-core/from-head';
	import type { Ledger } from '$lib/ledger';
	import type { ReceiptEntry } from '$lib/receipts';
	import type { Names } from '$lib/receipt-read';
	import ReceiptDrawer from '../ReceiptDrawer.svelte';

	let { steps, head, names, ledger }: { steps: TimelineStep[]; head?: string; names: Names; ledger: Ledger | null } = $props();

	const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
	const receiptOf = (s: TimelineStep) => ledger?.receipts.find((r) => (r.json as { contentHash?: string } | undefined)?.contentHash === s.contentHash) ?? null;
	const DOT = { offer: 'bg-secondary-500', agreed: 'bg-primary-500', settled: 'bg-success-500', ended: 'bg-surface-400-600' } as const;
	/* The story from its end: the latest step's hash vouches for all before it. */
	const proof = $derived(head ? fromHead(steps, head) : null);

	let opened = $state<ReceiptEntry | null>(null);
	let open = $state(false);
</script>

<ol class="ms-3 border-s-2 border-surface-200-800 ps-6 flex flex-col gap-6">
	{#each steps as s (s.contentHash)}
		<li class="relative">
			<span aria-hidden="true" class="absolute -start-[1.95rem] top-1.5 size-3 rounded-full ring-4 ring-surface-50-950 {DOT[s.tone]}"></span>
			<div class="flex items-start gap-3">
				<div class="flex-1 min-w-0">
					<p class="text-sm opacity-70">{when(s.content.at)}</p>
					<p class="mt-1">{s.text}</p>
					{#if s.note}<p class="mt-1 text-sm text-surface-700-300">“{s.note}”</p>{/if}
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
{#if proof}
	<p class="mt-4 text-sm flex items-start gap-2 {proof.whole ? 'text-surface-700-300' : 'text-warning-700-300'}">
		<Icon name={proof.whole ? 'check' : 'info'} size={16} class="mt-0.5 shrink-0" />
		{proof.whole
			? proof.chain.length === 1
				? 'Just the first step so far. Each step after it will name the one before by its hash.'
				: `Read from the latest step back: ${proof.chain.length} steps, each naming the one before it by its hash, back to the first.`
			: `Read from the latest step back, the story doesn’t join up: ${proof.problems.join(' ')}`}
	</p>
{/if}

<ReceiptDrawer receipt={opened} {names} bind:open />
