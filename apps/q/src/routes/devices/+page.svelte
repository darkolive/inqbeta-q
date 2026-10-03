<script lang="ts">
	/*
	 * Devices — where your keys are. This device first, then every linked key:
	 * sites (they have an origin) and other devices (they do not).
	 */
	import { Page, Section, Item, Status, Empty, Field } from '@inqbeta/q-ui';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { watch, keyPlace, KEY_PLACES, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import DevicesStory from '$lib/components/DevicesStory.svelte';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	let platform = $state('');
	let place = $state('');
	let host = $state('');
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	$effect(() => {
		const ua = navigator.userAgent;
		platform = /iPhone|iPad/.test(ua) ? 'iPhone or iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'This device';
		host = location.host;
		place = KEY_PLACES.find((p) => p.id === keyPlace())?.label ?? '';
	});

	const links = $derived((ledger?.links ?? []).filter((l) => l.link.event === 'identity.linked'));
	const sites = $derived(links.filter((l) => l.link.origin));
	const devices = $derived(links.filter((l) => !l.link.origin));

	// Drawer state
	let selectedItem = $state<{ type: 'site' | 'device'; label: string; origin?: string; key: string; since: string } | null>(null);
	let drawerOpen = $state(false);

	function openSiteDrawer(s: typeof sites[number]) {
		selectedItem = {
			type: 'site',
			label: s.link.label,
			origin: s.link.origin,
			key: s.link.key,
			since: s.link.at
		};
		drawerOpen = true;
	}

	function openDeviceDrawer(d: typeof devices[number]) {
		selectedItem = {
			type: 'device',
			label: d.link.label,
			key: d.link.key,
			since: d.link.at
		};
		drawerOpen = true;
	}
</script>

<svelte:head><title>Devices — Q</title></svelte:head>

<Page title="Devices" lead="Every key that can act as you, and where it lives.">
	<!-- How Q works across devices, as pictures: the same story style as Keys, Messages and Federations. -->
	<DevicesStory />

	<Section title="This device">
		<Item icon="devices" title={platform} subtitle={host}>
			{#snippet status()}<Status tone={identity ? 'good' : 'waiting'}>{identity ? 'Root key, signed in' : 'Not signed in'}</Status>{/snippet}
			<dl class="field-list">
				<Field label="Passkey kept on">{place || '—'}</Field>
				<Field label="DID" token>{identity?.did ?? '—'}</Field>
			</dl>
		</Item>
	</Section>

	<Section title="Sites" description="Each site you sign in to keeps its own key. Linked ones sign as you.">
		{#if !identity}
			<Empty icon="lock" title="Locked" description="Sign in to see your linked keys." />
		{:else if !sites.length}
			<Empty icon="network" title="No linked sites" description="Sign in on a site such as DoStudy, ask it to link, and approve the request on the Keys page." />
		{:else}
			<!-- Table -->
			<div class="table-container">
				<table class="table table-hover">
					<thead>
						<tr>
							<th>Site</th>
							<th>Origin</th>
							<th>Linked</th>
						</tr>
					</thead>
					<tbody>
						{#each sites as s (s.item.diskPath)}
							<tr onclick={() => openSiteDrawer(s)} class="cursor-pointer hover:preset-tonal-primary">
								<td>{s.link.label}</td>
								<td>{s.link.origin}</td>
								<td>{new Date(s.link.at).toLocaleDateString('en-GB')}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Section>

	<Section title="Other devices" description="Phones and computers with their own passkey, linked to this one.">
		{#if identity && devices.length}
			<!-- Table -->
			<div class="table-container">
				<table class="table table-hover">
					<thead>
						<tr>
							<th>Device</th>
							<th>Linked</th>
						</tr>
					</thead>
					<tbody>
						{#each devices as d (d.item.diskPath)}
							<tr onclick={() => openDeviceDrawer(d)} class="cursor-pointer hover:preset-tonal-primary">
								<td>{d.link.label}</td>
								<td>{new Date(d.link.at).toLocaleDateString('en-GB')}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<Empty icon="phone" title="None yet" description="Linking a phone works the same way as linking a site: its key asks, this root approves. The Q phone app is where that will start." />
		{/if}
	</Section>
</Page>

<!-- Drawer for Device/Site Details -->
<Dialog open={drawerOpen} onOpenChange={(e) => (drawerOpen = e.open)}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-end">
			<Dialog.Content class="h-full w-full max-w-md card bg-surface-50-950 p-6 shadow-xl overflow-y-auto">
				<header class="flex justify-between items-center mb-6">
					<h2 class="h3">{selectedItem?.label}</h2>
					<button type="button" class="btn btn-sm preset-tonal-surface" onclick={() => drawerOpen = false}>
						Close
					</button>
				</header>

				{#if selectedItem}
					<dl class="space-y-4">
						<div>
							<dt class="text-sm opacity-60">Type</dt>
							<dd class="capitalize">{selectedItem.type === 'site' ? 'Website' : 'Device'}</dd>
						</div>
						{#if selectedItem.origin}
							<div>
								<dt class="text-sm opacity-60">Origin</dt>
								<dd>{selectedItem.origin}</dd>
							</div>
						{/if}
						<div>
							<dt class="text-sm opacity-60">Key</dt>
							<dd class="role-token text-xs break-all">{selectedItem.key}</dd>
						</div>
						<div>
							<dt class="text-sm opacity-60">Linked</dt>
							<dd>{new Date(selectedItem.since).toLocaleString('en-GB')}</dd>
						</div>
					</dl>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
