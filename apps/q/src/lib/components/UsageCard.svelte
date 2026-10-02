<script lang="ts">
	/*
	 * Your use this month (ADR-Q-017 §5 and its 2 October addendum): small,
	 * plain, always there. Counted from your own receipts; the free amount is
	 * the storage's own published terms. Passing things between people is
	 * free up to a daily amount; heavier use is what credits will be for.
	 */
	import { Section } from '@inqbeta/q-ui';
	import { Icon } from '@inqbeta/q-ui';
	import type { Ledger } from '$lib/ledger';
	import { usageFrom, readTerms, sizeOf, type StorageTerms } from '$lib/usage';
	import { lengthOf } from '$lib/voicemail';

	let { ledger, did }: { ledger: Ledger | null; did: string } = $props();

	const use = $derived(usageFrom(ledger, did));
	let terms = $state<StorageTerms | null>(null);
	$effect(() => void readTerms().then((t) => (terms = t)));
	const share = $derived(terms ? Math.min(100, Math.round((use.bytesToday / terms.sendBytesPerDay) * 100)) : 0);
</script>

<Section title="Your use this month" description="Counted from your own receipts. Nobody else keeps a tally of what you do.">
	<div class="grid gap-4 sm:grid-cols-3">
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 space-y-2">
			<p class="flex items-center gap-2 font-semibold"><Icon name="storage-unit" size={18} /> Sent through storage today</p>
			<p class="h4">{sizeOf(use.bytesToday)}{#if terms}<span class="text-base font-normal text-surface-700-300"> of {sizeOf(terms.sendBytesPerDay)} free</span>{/if}</p>
			{#if terms}
				<div class="h-2 w-full overflow-hidden rounded-full bg-surface-200-800" role="meter" aria-label="Today’s free amount used" aria-valuemin="0" aria-valuemax="100" aria-valuenow={share}>
					<div class="h-full rounded-full {share > 85 ? 'bg-warning-500' : 'bg-primary-500'}" style="width: {share}%"></div>
				</div>
			{/if}
			<p class="text-sm text-surface-700-300">{sizeOf(use.bytesMonth)} this month. Held only until it’s collected.</p>
		</div>
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 space-y-2">
			<p class="flex items-center gap-2 font-semibold"><Icon name="message" size={18} /> Messages</p>
			<p class="h4">{use.messages} written</p>
			<p class="text-sm text-surface-700-300">{use.voicemails} voice message{use.voicemails === 1 ? '' : 's'}{use.voiceSeconds ? `, ${lengthOf(use.voiceSeconds)} in all` : ''}</p>
		</div>
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 space-y-2">
			<p class="flex items-center gap-2 font-semibold"><Icon name="video" size={18} /> Calls</p>
			<p class="h4">{use.callsDirect + use.callsRelayed} answered</p>
			<p class="text-sm text-surface-700-300">{use.callsDirect} direct, free{use.callsRelayed ? ` · ${use.callsRelayed} through the switchboard, ${use.relayedMinutes} min` : ''}</p>
		</div>
	</div>
	<p class="mt-3 text-sm text-surface-700-300">Passing things between people is free up to a daily amount. Credits, for heavier use, are coming.</p>
</Section>
