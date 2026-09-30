<script lang="ts">
	/*
	 * Contacts - ZK Contact Exchange
	 *
	 * Your address book, stored locally.
	 * Contacts are shared via receipts.
	 */
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { getAccessLevel } from '@inqbeta/q-core/access';
	import { 
		getAddressBook, 
		addToAddressBook, 
		removeFromAddressBook,
		type AddressBookEntry 
	} from '@inqbeta/q-core/contacts';

	let identity = $state<Identity | null>(null);
	const accessLevel = $derived(getAccessLevel());

	// Get contacts
	let contacts = $state<AddressBookEntry[]>([]);
	
	$effect(() => {
		watch((id) => {
			identity = id;
			contacts = getAddressBook();
		});
	});

	// Filter state
	let filter = $state<'all' | 'favorites'>('all');
	
	const shown = $derived(
		filter === 'favorites' 
			? contacts.filter(c => c.favorite)
			: contacts
	);

    // Stats
	const totalContacts = $derived(contacts.length);
	const favorites = $derived(contacts.filter(c => c.favorite).length);

	function toggleFavorite(did: string) {
		const contact = contacts.find(c => c.did === did);
		if (contact) {
			contact.favorite = !contact.favorite;
			addToAddressBook(contact.card, contact.label);
		}
    }

	function removeContact(did: string) {
		removeFromAddressBook(did);
		contacts = getAddressBook();
	}

	const channelIcon = (can: boolean) => can ? '✓' : '–';

	// Drawer state
	let selectedContact = $state<AddressBookEntry | null>(null);
	let drawerOpen = $state(false);

	function openDrawer(contact: AddressBookEntry) {
		selectedContact = contact;
		drawerOpen = true;
	}
</script>

<svelte:head><title>Contacts — Q</title></svelte:head>

<Page title="Contacts" lead="Your address book — contacts shared with you via receipts.">
	{#if !identity}
		<Empty icon="contacts" title="Locked" description="Sign in to view your contacts." />
	{:else}
		<!-- Stats -->
		<div class="grid grid-cols-3 gap-4 mb-6">
			<div class="card p-4">
				<div class="text-2xl font-bold">{totalContacts}</div>
				<div class="text-sm text-surface-700-300">Total Contacts</div>
			</div>
			<div class="card p-4">
				<div class="text-2xl font-bold">{favorites}</div>
				<div class="text-sm text-surface-700-300">Favorites</div>
			</div>
			<div class="card p-4">
				<div class="text-2xl font-bold">v1</div>
				<div class="text-sm text-surface-700-300">Schema Version</div>
			</div>
		</div>

		<!-- Filter -->
		<div class="flex gap-2 mb-4">
			<button 
				class="btn {filter === 'all' ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
				onclick={() => filter = 'all'}
			>
				All ({totalContacts})
			</button>
			<button 
				class="btn {filter === 'favorites' ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
				onclick={() => filter = 'favorites'}
			>
				Favorites ({favorites})
			</button>
		</div>

		{#if shown.length === 0}
			<Empty 
				icon="contacts" 
				title="No contacts" 
				description="Contacts are shared via receipts. When someone shares their contact with you, it appears here."
			/>
		{:else}
			<Section title="Address Book">
				<!-- Table -->
				<div class="table-container">
					<table class="table table-hover">
						<thead>
							<tr>
								<th>Name</th>
								<th>DID</th>
								<th>Added</th>
								<th>Channels</th>
							</tr>
						</thead>
						<tbody>
							{#each shown as contact (contact.did)}
								<tr onclick={() => openDrawer(contact)} class="cursor-pointer hover:preset-tonal-primary">
									<td>
										<span class="flex items-center gap-2">
											{contact.label || 'Unknown'}
											{#if contact.favorite}★{/if}
										</span>
									</td>
									<td class="text-xs opacity-60">{contact.did.slice(0, 16)}...</td>
									<td>{new Date(contact.addedAt).toLocaleDateString()}</td>
									<td>
										<div class="flex gap-1">
											{#if contact.card.channels.canCall}📞{/if}
											{#if contact.card.channels.canMessage}💬{/if}
											{#if contact.card.channels.canEmail}📧{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Section>
		{/if}
	{/if}
</Page>

<!-- Drawer for Contact Details -->
<Dialog open={drawerOpen} onOpenChange={(e) => (drawerOpen = e.open)}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-end">
			<Dialog.Content class="h-full w-full max-w-md card bg-surface-50-950 p-6 shadow-xl overflow-y-auto">
				<header class="flex justify-between items-center mb-6">
					<h2 class="h3">{selectedContact?.label || 'Unknown'}</h2>
					<button type="button" class="btn btn-sm preset-tonal-surface" onclick={() => drawerOpen = false}>
						Close
					</button>
				</header>

				{#if selectedContact}
					<dl class="space-y-4">
						<div>
							<dt class="text-sm opacity-60">DID</dt>
							<dd class="role-token text-xs break-all">{selectedContact.did}</dd>
						</div>
						<div>
							<dt class="text-sm opacity-60">Added</dt>
							<dd>{new Date(selectedContact.addedAt).toLocaleString()}</dd>
						</div>
						<div>
							<dt class="text-sm opacity-60">Channels</dt>
							<dd class="flex gap-2">
								{#if selectedContact.card.channels.canCall}
									<span class="badge badge-success-500">📞 Call</span>
								{/if}
								{#if selectedContact.card.channels.canMessage}
									<span class="badge badge-success-500">💬 Message</span>
								{/if}
								{#if selectedContact.card.channels.canEmail}
									<span class="badge badge-success-500">📧 Email</span>
								{/if}
							</dd>
						</div>
					</dl>

					<div class="mt-8 pt-6 border-t border-surface-200-800 flex gap-2">
						<button 
							class="btn preset-outlined-surface-500"
							onclick={() => toggleFavorite(selectedContact!.did)}
						>
							{selectedContact.favorite ? '★ Remove from favorites' : '☆ Add to favorites'}
						</button>
						<button 
							class="btn preset-outlined-error-500"
							onclick={() => { removeContact(selectedContact!.did); drawerOpen = false; }}
						>
							Remove
						</button>
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
