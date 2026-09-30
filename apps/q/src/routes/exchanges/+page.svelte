<script lang="ts">
	/*
	 * Exchanges
	 *
	 * Value transfers, gifts, trades, contracts.
	 */
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { getAccessLevel } from '@inqbeta/q-core/access';
	import { 
		type ExchangeReceipt, 
		type EventReceipt,
		EVENT_CATEGORIES,
		EXCHANGE_TYPE_INFO
	} from '@inqbeta/q-core/exchange';

	let identity = $state<Identity | null>(null);
	const accessLevel = $derived(getAccessLevel());

	// Mock data
	const exchanges = $state<ExchangeReceipt[]>([]);
	const events = $state<EventReceipt[]>([]);

	// Filter
	type Filter = 'all' | 'exchange' | 'event';
	let filter = $state<Filter>('all');

	const all = $derived(
		filter === 'all' 
			? [...exchanges, ...events]
			: filter === 'exchange' 
				? exchanges 
				: events
	);

	$effect(() => {
		watch((id) => identity = id);
	});

	const formatAmount = (amount: number) => {
		if (amount === 0) return '—';
		return amount > 0 ? `+${amount}` : `${amount}`;
	};

	const getTypeIcon = (type: string) => {
		const icons: Record<string, string> = {
			'value': '💳',
			'gift': '🎁',
			'trade': '🔄',
			'contract': '📝',
			'settlement': '✓',
			'course.completed': '🎓',
			'badge.earned': '🏆',
			'message.sent': '✉️',
			'contact.shared': '📇',
			'permission.granted': '🔑',
			'federation.joined': '🤝'
		};
		return icons[type] || '•';
	};
</script>

<svelte:head><title>Exchanges — Q</title></svelte:head>

<Page title="Exchanges" lead="Events and value transfers.">
	{#if !identity}
		<Empty icon="repeat" title="Locked" description="Sign in to view your exchanges." />
	{:else}
		<!-- Filter -->
		<div class="flex gap-2 mb-4">
			<button 
				class="btn {filter === 'all' ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
				onclick={() => filter = 'all'}
			>
				All ({exchanges.length + events.length})
			</button>
			<button 
				class="btn {filter === 'exchange' ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
				onclick={() => filter = 'exchange'}
			>
				Exchanges ({exchanges.length})
			</button>
			<button 
				class="btn {filter === 'event' ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
				onclick={() => filter = 'event'}
			>
				Events ({events.length})
			</button>
		</div>

		{#if all.length === 0}
			<Empty 
				icon="repeat" 
				title="No exchanges yet" 
				description="Events and transfers will appear here."
			/>
		{:else}
			<Section title="History">
				<div class="stack-tight">
					{#each all as item ('id' in item ? item.id : 'ev_' + Math.random())}
						{@const isExchange = 'exchange' in item}
						{@const type = isExchange ? (item as ExchangeReceipt).type : (item as EventReceipt).event}
						{@const date = new Date(isExchange ? (item as ExchangeReceipt).createdAt : (item as EventReceipt).createdAt)}
						<Item 
							icon="receipts"
							title={type}
							subtitle={isExchange ? 'Value transfer' : 'Event'}
							meta={date.toLocaleDateString()}
						>
							{#snippet status()}
								<span class="text-lg">{getTypeIcon(type)}</span>
							{/snippet}
						</Item>
					{/each}
				</div>
			</Section>
		{/if}
	{/if}
</Page>
