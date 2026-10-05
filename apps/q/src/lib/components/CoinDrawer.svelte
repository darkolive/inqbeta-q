<script lang="ts">
	/*
	 * A coin, opened (5 October 2026, ADR-Q-035): the drawer from the side,
	 * like a receipt (ReceiptDrawer), holding the coin's check — whether this
	 * house minted it and how its books stand, read live from the mint. The
	 * same check as the page its QR code opens.
	 */
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import CoinCheck from './CoinCheck.svelte';

	let { mint, open = $bindable(false) }: { mint: string; open?: boolean } = $props();
</script>

<Dialog {open} onOpenChange={(e) => (open = e.open)}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-end">
			<Dialog.Content class="h-full w-full max-w-xl card bg-surface-50-950 p-5 sm:p-6 shadow-xl overflow-y-auto flex flex-col gap-5">
				<header class="flex justify-between items-center">
					<Dialog.Title class="h5">Check this coin</Dialog.Title>
					<button type="button" class="btn btn-sm preset-tonal-surface min-h-11" onclick={() => (open = false)}>Close</button>
				</header>
				{#if open}<CoinCheck {mint} />{/if}
				<footer class="pt-4 border-t border-surface-200-800">
					<a class="btn preset-outlined-surface-500 min-h-11" href="/verify/{encodeURIComponent(mint)}">Open the check page</a>
				</footer>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
