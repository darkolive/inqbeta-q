<script lang="ts">
	/*
	 * How Q works, on the You home page (3 October 2026): every picture story
	 * in one place, one at a time. Choose a part of Q, watch its six pictures.
	 *
	 * Only the chosen story is on the page at all — not hidden, absent — so
	 * read aloud reads one story, and only that story's pictures play.
	 */
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { Icon } from '@inqbeta/q-ui';
	import type { IconName } from '@inqbeta/q-ui/icons';
	import ReceiptStory from './ReceiptStory.svelte';
	import KeysStory from './KeysStory.svelte';
	import DevicesStory from './DevicesStory.svelte';
	import InformationStory from './InformationStory.svelte';
	import AddressBookStory from './AddressBookStory.svelte';
	import CommunicationStory from './CommunicationStory.svelte';
	import CreditsStory from './CreditsStory.svelte';

	const STORIES: { id: string; label: string; icon: IconName; href: string; story: typeof KeysStory }[] = [
		{ id: 'receipts', label: 'Receipts', icon: 'receipts', href: '/receipts', story: ReceiptStory },
		{ id: 'keys', label: 'Keys', icon: 'keys', href: '/keys', story: KeysStory },
		{ id: 'devices', label: 'Devices', icon: 'devices', href: '/devices', story: DevicesStory },
		{ id: 'cards', label: 'Cards', icon: 'card', href: '/cards', story: InformationStory },
		{ id: 'people', label: 'Address book', icon: 'contacts', href: '/contacts', story: AddressBookStory },
		{ id: 'talk', label: 'Talking safely', icon: 'lock', href: '/communication', story: CommunicationStory },
		{ id: 'credits', label: 'Credits', icon: 'wallet', href: '/balance', story: CreditsStory }
	];

	let chosen = $state('keys');
</script>

<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6">
	<Tabs value={chosen} onValueChange={(d) => (chosen = d.value)}>
		<Tabs.List class="mb-6 flex-wrap justify-center">
			{#each STORIES as s (s.id)}
				<Tabs.Trigger value={s.id} class="min-h-11 gap-2"><Icon name={s.icon} size={18} />{s.label}</Tabs.Trigger>
			{/each}
			<Tabs.Indicator />
		</Tabs.List>
		{#each STORIES as s (s.id)}
			<Tabs.Content value={s.id}>
				{#if chosen === s.id}
					<div class="flex flex-col items-center gap-4">
						<s.story />
						<a href={s.href} class="btn preset-tonal min-h-11">Go to {s.label} <Icon name="chevronRight" size={16} /></a>
					</div>
				{/if}
			</Tabs.Content>
		{/each}
	</Tabs>
</div>
