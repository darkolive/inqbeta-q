<script lang="ts">
	/*
	 * User - Personal dashboard after sign-in
	 * This is where you land when signed in
	 */
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);

	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const found = $derived(ledger ? newestPerKey(ledger.found) : []);
	const recent = $derived(found.slice(0, 5));
</script>

<svelte:head><title>My Dashboard — Q</title></svelte:head>

<Page title="My Dashboard" lead="Welcome back. Here's what's new.">
	<Section title="Quick Stats">
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
			<div class="card preset-tonal p-4 text-center">
				<div class="text-2xl font-bold">{identity?.did?.slice(-8) || '---'}</div>
				<div class="text-sm opacity-60">Your ID</div>
			</div>
			<div class="card preset-tonal p-4 text-center">
				<div class="text-2xl font-bold">{ledger?.items.length || 0}</div>
				<div class="text-sm opacity-60">Files</div>
			</div>
			<div class="card preset-tonal p-4 text-center">
				<div class="text-2xl font-bold">{ledger?.receipts.length || 0}</div>
				<div class="text-sm opacity-60">Receipts</div>
			</div>
			<div class="card preset-tonal p-4 text-center">
				<div class="text-2xl font-bold">{found.filter(f => f.kind === 'federation' || f.kind === 'membership').length}</div>
				<div class="text-sm opacity-60">Federations</div>
			</div>
		</div>
	</Section>

	<Section title="Recent Activity">
		{#if recent.length}
			<div class="stack-tight">
				{#each recent as item (item.key)}
					<Item title={item.title} description={item.description} meta={item.meta}>
						{#snippet status()}
							{#if item.status}<Status tone={item.status.tone}>{item.status.text}</Status>{/if}
						{/snippet}
					</Item>
				{/each}
			</div>
		{:else}
			<Empty icon="activity" title="No activity yet" description="Your recent items will appear here." />
		{/if}
	</Section>
</Page>
