<script lang="ts">
	/*
	 * Federations — drafts you are still shaping, the ones you founded, and the
	 * ones you belong to, found in your folder; and the features each one adds.
	 *
	 * "New federation" starts a DRAFT (ADR-Q-007): yours alone, saved as often
	 * as you like, founded only when you say so — with two signatures and the
	 * rule engine's check (lib/federations.ts).
	 *
	 * Built around its story (3 October 2026, StoryGuide): with no clubs yet,
	 * the story comes first and, beside it, the two ways in — start one, or
	 * join from an invitation. With clubs, they come first, as cards rather
	 * than a table, and the story folds into one line.
	 */
	import { Page, Section, Status, Empty, Tile, type Tone } from '@inqbeta/q-ui';
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
	import StoryGuide from '$lib/components/StoryGuide.svelte';
	import { Icon } from '@inqbeta/q-ui';
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

	const ready = $derived(ledger?.state === 'ready' || ledger?.state === 'no-folder');
	const none = $derived(!founded.length && !memberships.length && !drafts.length);

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

<!-- One club, as a card: founded ones filled, memberships tonal. -->
{#snippet club(f: Found, kind: 'federation' | 'membership')}
	<button
		type="button"
		class="card preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal-primary p-4 flex items-start gap-4 text-left min-h-11"
		onclick={() => open(f, { key: f.key, title: f.title, description: f.description, meta: f.meta, kind, status: f.status })}
	>
		<span class="size-14 shrink-0 rounded-full {kind === 'federation' ? 'preset-filled-primary-500' : 'preset-tonal-primary'} flex items-center justify-center h4" aria-hidden="true">{f.title.slice(0, 1)}</span>
		<span class="flex flex-col gap-1 min-w-0 flex-1">
			<span class="font-bold">{f.title}</span>
			{#if f.description}<span class="text-sm text-surface-700-300 line-clamp-2">{f.description}</span>{/if}
			<span class="flex flex-wrap gap-2 mt-1">
				{#if isHostRow(f)}<Status tone="good">Your host</Status>{/if}
				<Status tone="plain">{kind === 'federation' ? 'You founded it' : 'Member'}</Status>
				{#if f.status}<Status tone={f.status.tone}>{f.status.text}</Status>{/if}
			</span>
		</span>
		<Icon name="chevronRight" size={18} class="self-center opacity-60" />
	</button>
{/snippet}

<Page title="Federations" lead="Clubs and groups that vouch for each other's evidence. Each one can add its own screens to Q.">
	<!-- What a federation is, as pictures: first for someone new, one line once they have clubs. -->
	<StoryGuide title="What a federation is" ready={!identity || ready} empty={!identity || none}>
		<FederationStory />
	</StoryGuide>

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


	{#if !identity}
		<Empty icon="lock" title="Locked" description="Sign in to see your federations." />
	{:else}
		{#if founded.length || memberships.length}
			<Section title="Your clubs" description="The ones you founded, then the ones you belong to.">
				<div class="grid gap-4 sm:grid-cols-2">
					{#each founded as f (f.key)}{@render club(f, 'federation')}{/each}
					{#each memberships as m (m.key)}{@render club(m, 'membership')}{/each}
				</div>
			</Section>
		{/if}

		{#if drafts.length}
			<Section title="Drafts" description="Yours alone until you found them. Open one to carry on.">
				<div class="grid gap-4 sm:grid-cols-2">
					{#each drafts as d (d.key)}
						<a href={draftHref(d.key)} class="card preset-outlined-warning-500 bg-surface-50-950 hover:preset-tonal-warning p-4 flex items-start gap-4 min-h-11">
							<span class="size-14 shrink-0 rounded-full border-2 border-dashed border-warning-500 flex items-center justify-center h4" aria-hidden="true">{d.title.slice(0, 1)}</span>
							<span class="flex flex-col gap-1 min-w-0 flex-1">
								<span class="font-bold">{d.title}</span>
								{#if d.description}<span class="text-sm text-surface-700-300 line-clamp-2">{d.description}</span>{/if}
								<span class="flex flex-wrap items-center gap-2 mt-1">
									<Status tone="waiting">Draft</Status>
									{#if d.meta}<span class="text-xs opacity-70">{d.meta}</span>{/if}
								</span>
							</span>
							<span class="btn btn-sm preset-filled-warning-500 self-center pointer-events-none">Carry on</span>
						</a>
					{/each}
				</div>
			</Section>
		{/if}

		<!-- The two ways in, as the story tells them: start one, or join one. -->
		<Section title={none ? 'Get started' : 'Start or join another'}>
			<div class="grid gap-4 sm:grid-cols-2">
				{#if clubs}
					<div class="card preset-tonal-primary p-5 flex flex-col gap-3">
						<span class="flex items-center gap-2 font-bold"><Icon name="plus" size={20} /> Start a club</span>
						<p class="text-sm">Write down what you agree. It stays a draft, yours alone, until you found it with its own key.</p>
						<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" onclick={() => goto('/federations/draft')}>New federation</button>
					</div>
				{:else}
					<div class="card preset-tonal-surface p-5 flex flex-col gap-3">
						<span class="flex items-center gap-2 font-bold"><Icon name="info" size={20} /> No new clubs here</span>
						<p class="text-sm">{home?.ok ? home.name : 'This host'} is a single site: it doesn’t offer clubs. Clubs you join elsewhere show here.</p>
					</div>
				{/if}
				<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-3">
					<span class="flex items-center gap-2 font-bold"><Icon name="mail" size={20} /> Join a club</span>
					<p class="text-sm">Got an invitation? Open its link. You’ll read the club’s rules and agree to them one step at a time, and choose how members know you.</p>
				</div>
			</div>
		</Section>
	{/if}

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
