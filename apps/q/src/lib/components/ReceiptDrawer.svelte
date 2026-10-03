<script lang="ts">
	/*
	 * A receipt, opened (3 October 2026): the drawer from the side, with the
	 * receipt as a read-only card. Used by Receipts and by the magnifier beside
	 * each line of your activity, so a receipt looks the same wherever it's
	 * opened from. Something the bell collected keeps its own view
	 * (ReceivedView) inside the same drawer.
	 */
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { download, readItem } from '@inqbeta/q-core/folder';
	import type { ReceiptEntry } from '$lib/receipts';
	import type { Names } from '$lib/receipt-read';
	import ReceiptCard from './ReceiptCard.svelte';
	import ReceivedView from './ReceivedView.svelte';

	let { receipt, names, open = $bindable(false) }: { receipt: ReceiptEntry | null; names: Names; open?: boolean } = $props();

	const kept = $derived.by(() => {
		const c = (receipt?.json as { content?: { schema?: string } } | undefined)?.content;
		return c?.schema === 'inqbeta.received/1' ? (c as Record<string, unknown>) : null;
	});

	let says = $state('');
	async function saveCopy(r: ReceiptEntry) {
		says = '';
		try {
			if (r.token) download(`${r.token.cid}.ucan`, r.token.bytes as Uint8Array<ArrayBuffer>, 'application/vnd.ipld.dag-cbor');
			else if (r.item) {
				const { meta, data } = await readItem(r.item);
				download(meta.name, data, meta.type || 'application/json');
			}
		} catch (e) {
			says = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<Dialog {open} onOpenChange={(e) => (open = e.open)}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-end">
			<Dialog.Content class="h-full w-full max-w-xl card bg-surface-50-950 p-5 sm:p-6 shadow-xl overflow-y-auto flex flex-col gap-5">
				<header class="flex justify-between items-center">
					<Dialog.Title class="h5">Receipt</Dialog.Title>
					<button type="button" class="btn btn-sm preset-tonal-surface min-h-11" onclick={() => (open = false)}>Close</button>
				</header>

				{#if receipt && kept}
					<ReceivedView {kept} holds={receipt.holds !== 'no'} where={receipt.where} />
				{:else if receipt}
					<ReceiptCard {receipt} {names} />
					<footer class="pt-4 border-t border-surface-200-800 flex flex-wrap items-center gap-3">
						<button type="button" class="btn preset-outlined-surface-500 min-h-11" onclick={() => void saveCopy(receipt)}>Save a copy</button>
						{#if says}<p class="text-sm text-error-600-400" role="alert">{says}</p>{/if}
					</footer>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
