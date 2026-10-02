<script lang="ts">
	/*
	 * Federations — drafts you are still shaping, the ones you founded, and the
	 * ones you belong to, found in your folder; and the features each one adds.
	 *
	 * "New federation" starts a DRAFT (ADR-Q-007): yours alone, saved as often
	 * as you like, founded only when you say so — with two signatures and the
	 * rule engine's check (lib/federations.ts).
	 */
	import { Page, Section, Item, Status, Empty, Tile, type Tone } from '@inqbeta/q-ui';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { FEATURES } from '$lib/features/registry';
	import { newestPerKey } from '$lib/features/dostudy';
	import { goto } from '$app/navigation';
	import type { Found } from '$lib/features/registry';
	import { readHome, type Home } from '$lib/home';
	import { offersFederations } from '$lib/offers';
	import FederationStory from '$lib/components/FederationStory.svelte';
	/* Federations are a plugin the host turns on (ADR-Q-020). Off: no new clubs here. */
	const clubs = offersFederations();

	/* Your host (ADR-Q-018 §3): always first, and it can't be hidden. */
	let home = $state<Home | null>(null);
	$effect(() => void readHome().then((h) => (home = h)));
	const hostDid = $derived(home?.ok ? home.federation : '');
	const isHostRow = (f: { key: string }) => !!hostDid && f.key.endsWith(`:${hostDid}`);
	const hostHref = $derived(hostDid ? `/federations/one?id=${encodeURIComponent(hostDid)}` : '');

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const found = $derived(ledger ? newestPerKey(ledger.found) : []);
	const drafts = $derived(found.filter((f) => f.kind === 'federation-draft'));
	/* The host first, whichever list it's in. */
	const hostFirst = <T extends { key: string }>(l: T[]) => [...l.filter(isHostRow), ...l.filter((f) => !isHostRow(f))];
	const founded = $derived(hostFirst(found.filter((f) => f.kind === 'federation')));
	const memberships = $derived(hostFirst(found.filter((f) => f.kind === 'membership')));

	// Drawer state
	type FederationItem = { key: string; title: string; description?: string; meta?: string; kind: 'federation' | 'membership'; status?: { tone: Tone; text: string } };
	const draftHref = (key: string) => `/federations/draft?id=${encodeURIComponent(key.replace(/^draft:/, ''))}`;
	/* Q's own federations and memberships have a page of their own; older records and other packs open the drawer. */
	const pageOf = (f: { feature: string; key: string; status?: { text: string } }) =>
		f.feature === 'federations' && f.status?.text !== 'Old record'
			? `/federations/one?id=${encodeURIComponent(f.key.replace(/^(federation|membership):/, ''))}`
			: null;
	function open(f: Found, item: FederationItem) {
		const href = pageOf(f);
		if (href) void goto(href);
		else openDrawer(item);
	}
	let selectedItem = $state<FederationItem | null>(null);
	let drawerOpen = $state(false);

	function openDrawer(item: FederationItem) {
		selectedItem = item;
		drawerOpen = true;
	}

</script>

<svelte:head><title>Federations — Q</title></svelte:head>

<Page title="Federations" lead="Groups that vouch for each other's evidence. Each one can add its own screens to Q.">
	<!-- What a federation is, as pictures: the same story style as the home page. -->
	<FederationStory />

	{#if home?.ok}
		<Section title="Your host" description="The federation this copy of Q belongs to. Signing up is joining it.">
			<a href={hostHref} class="card preset-outlined-surface-200-800 hover:preset-tonal p-4 sm:p-6 flex items-center gap-4 max-w-3xl">
				{#if home.logo}
					<img src={home.logo} alt="" class="size-16 shrink-0 object-contain" />
				{:else}
					<span class="size-16 shrink-0 rounded-base preset-tonal-primary flex items-center justify-center h3">{home.name.slice(0, 1)}</span>
				{/if}
				<span class="flex flex-col gap-1 min-w-0">
					<span class="h4">{home.name}</span>
					<span class="text-sm opacity-80">{home.purpose}</span>
					<span class="flex flex-wrap gap-2 mt-1">
						<Status tone="good">Your host</Status>
						{#if identity && identity.did === home.founder}<Status tone="plain">You founded it</Status>{/if}
					</span>
				</span>
			</a>
		</Section>
	{/if}

	{#if identity && drafts.length}
		<Section title="Drafts" description="Yours alone until you found them. Open one to carry on.">
			<div class="table-container">
				<table class="table table-hover">
					<thead>
						<tr>
							<th>Name</th>
							<th>What it is for</th>
							<th>Last saved</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{#each drafts as d (d.key)}
							<tr onclick={() => goto(draftHref(d.key))} class="cursor-pointer hover:preset-tonal-primary">
								<td><a class="anchor" href={draftHref(d.key)}>{d.title}</a></td>
								<td class="text-sm opacity-60">{d.description}</td>
								<td class="text-sm">{d.meta?.replace(/^Last saved /, '')}</td>
								<td><Status tone="waiting">Draft</Status></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Section>
	{/if}

	<Section title="Yours">
		{#snippet actions()}
			{#if identity && clubs}
				<button type="button" class="btn preset-filled-primary-500" onclick={() => goto('/federations/draft')}>
					New federation
				</button>
			{/if}
		{/snippet}
		{#if !identity}
			<Empty icon="lock" title="Locked" description="Sign in to see your federations." />
		{:else if !founded.length && !memberships.length}
			<Empty
				icon="federations"
				title="No federations yet"
				description={clubs
					? 'Start one with New federation. It stays a draft — yours alone — until you found it. Federations you join show here too.'
					: `${home?.ok ? home.name : 'This host'} is a single site: it doesn’t offer clubs. Federations you join elsewhere show here.`}
			/>
		{:else}
			<!-- Table -->
			<div class="table-container">
				<table class="table table-hover">
					<thead>
						<tr>
							<th>Name</th>
							<th>Description</th>
							<th>Type</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{#each founded as f (f.key)}
							<tr onclick={() => open(f, { key: f.key, title: f.title, description: f.description, meta: f.meta, kind: 'federation', status: f.status })} class="cursor-pointer hover:preset-tonal-primary">
								<td>{f.title}{#if isHostRow(f)} <Status tone="good">Your host</Status>{/if}</td>
								<td class="text-sm opacity-60">{f.description}</td>
								<td>Founded</td>
								<td><Status tone={f.status?.tone ?? 'good'}>{f.status?.text ?? 'Founded'}</Status></td>
							</tr>
						{/each}
						{#each memberships as m (m.key)}
							<tr onclick={() => open(m, { key: m.key, title: m.title, description: m.description, meta: m.meta, kind: 'membership', status: m.status })} class="cursor-pointer hover:preset-tonal-primary">
								<td>{m.title}{#if isHostRow(m)} <Status tone="good">Your host</Status>{/if}</td>
								<td class="text-sm opacity-60">{m.description}</td>
								<td>Member</td>
								<td>
									{#if m.status}
										<Status tone={m.status.tone}>{m.status.text}</Status>
									{:else}
										<Status tone="plain">Active</Status>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Section>

	<Section title="Features" description="What each federation adds. Every feature uses the same headings, blocks and layout.">
		<div class="grid gap-4 sm:grid-cols-2">
			{#each FEATURES as f (f.id)}
				<Tile href={f.href} icon={f.icon} title={f.title} meta={`${f.federation} — ${f.description}`} />
			{/each}
		</div>
	</Section>
</Page>

<!-- Drawer for Federation Details -->
<Dialog open={drawerOpen} onOpenChange={(e) => (drawerOpen = e.open)}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-end">
			<Dialog.Content class="h-full w-full max-w-md card bg-surface-50-950 p-6 shadow-xl overflow-y-auto">
				<header class="flex justify-between items-center mb-6">
					<h2 class="h3">{selectedItem?.title}</h2>
					<button type="button" class="btn btn-sm preset-tonal-surface" onclick={() => drawerOpen = false}>
						Close
					</button>
				</header>

				{#if selectedItem}
					<dl class="space-y-4">
						<div>
							<dt class="text-sm opacity-60">Type</dt>
							<dd class="capitalize">{selectedItem.kind}</dd>
						</div>
						{#if selectedItem.description}
							<div>
								<dt class="text-sm opacity-60">Description</dt>
								<dd>{selectedItem.description}</dd>
							</div>
						{/if}
						{#if selectedItem.meta}
							<div>
								<dt class="text-sm opacity-60">Details</dt>
								<dd>{selectedItem.meta}</dd>
							</div>
						{/if}
						{#if selectedItem.status}
							<div>
								<dt class="text-sm opacity-60">Status</dt>
								<dd>
									<Status tone={selectedItem.status.tone}>
										{selectedItem.status.text}
									</Status>
								</dd>
							</div>
						{/if}
						<div>
							<dt class="text-sm opacity-60">Key</dt>
							<dd class="role-token text-xs break-all">{selectedItem.key}</dd>
						</div>
					</dl>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
