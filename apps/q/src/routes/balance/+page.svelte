<script lang="ts">
	/*
	 * Balance Sheet
	 *
	 * Shows assets, credits, and values from exchanges.
	 */
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { getAccessLevel } from '@inqbeta/q-core/access';
	import { 
		type AssetClass, 
		type BalanceSheet,
		ASSET_CLASS_INFO 
	} from '@inqbeta/q-core/exchange';

	let identity = $state<Identity | null>(null);
	const accessLevel = $derived(getAccessLevel());

	// Mock balance data (would come from ledger)
	const balances = $state<Record<AssetClass, number>>({
		'credit': 150,
		'bearer': 0,
		'bond': 0,
		'equity': 0,
		'commodity': 0,
		'service': 0,
		'token': 0
	});

	// Total
	const total = $derived(
		Object.values(balances).reduce((a, b) => a + b, 0)
	);

	// Asset class display info
	const assetInfo = {
		'credit': { icon: '💳', label: 'Credits', color: 'good' },
		'bearer': { icon: '🎫', label: 'Bearer', color: 'neutral' },
		'bond': { icon: '📜', label: 'Bonds', color: 'neutral' },
		'equity': { icon: '🏢', label: 'Equity', color: 'neutral' },
		'commodity': { icon: '📦', label: 'Commodities', color: 'neutral' },
		'service': { icon: '🛠️', label: 'Services', color: 'neutral' },
		'token': { icon: '🪙', label: 'Tokens', color: 'neutral' }
	};

	$effect(() => {
		watch((id) => identity = id);
	});
</script>

<svelte:head><title>Balance — Q</title></svelte:head>

<Page title="Balance Sheet" lead="Your assets and credits from exchanges.">
	{#if !identity}
		<Empty icon="wallet" title="Locked" description="Sign in to view your balance." />
	{:else}
		<!-- Total -->
		<div class="card p-6 mb-6">
			<div class="text-sm text-surface-700-300">Total Net Worth</div>
			<div class="text-4xl font-bold">{total} credits</div>
			<div class="text-sm text-surface-600-400">As of {new Date().toLocaleDateString()}</div>
		</div>

		<!-- By Asset Class -->
		<Section title="By Asset Class">
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each Object.entries(balances) as [asset, balance] (asset)}
					{@const info = assetInfo[asset as AssetClass]}
					<div class="card p-4">
						<div class="flex items-center gap-2">
							<span class="text-xl">{info?.icon || '?'}</span>
							<span class="font-medium">{info?.label || asset}</span>
						</div>
						<div class="text-2xl font-bold mt-2">{balance}</div>
						{#if ASSET_CLASS_INFO[asset as AssetClass]?.divisible}
							<div class="text-xs text-surface-600-400">Divisible</div>
						{/if}
						{#if ASSET_CLASS_INFO[asset as AssetClass]?.expiry}
							<div class="text-xs text-warning-600-400">Can expire</div>
						{/if}
					</div>
				{/each}
			</div>
		</Section>

		<!-- Recent Activity (placeholder) -->
		<Section title="Recent Activity">
			<Empty 
				icon="history" 
				title="No activity yet" 
				description="Exchanges and transfers will appear here."
			/>
		</Section>
	{/if}
</Page>
