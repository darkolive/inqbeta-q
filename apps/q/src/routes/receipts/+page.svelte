<script lang="ts">
	/*
	 * Receipts — signed records, kept apart from files.
	 *
	 * Everything here carries a signature and says what happened; each
	 * is checked offline and says how far it holds up.
	 *
	 * 2026-09-17: Added search and system receipt filtering.
	 */
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import { watch, unlock, type Identity } from '@inqbeta/q-core/passkey';
	import { getAccessLevel, requireAttest, attest } from '@inqbeta/q-core/access';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import type { ReceiptEntry, ReceiptGroup } from '$lib/receipts';
	import ReceiptDrawer from '$lib/components/ReceiptDrawer.svelte';
	import { peopleFrom } from '$lib/people';
	import type { Names } from '$lib/receipt-read';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	/* People by name, for reading receipts (you, and those you're linked with). */
	const people = $derived(peopleFrom(ledger, identity?.did ?? ''));
	const names = $derived<Names>({ me: identity?.did ?? '', nameOf: (did) => people.find((p) => p.did === did)?.name });
	/* A receipt's proof ID (its content hash), so it can be found by it. */
	const proofOf = (r: ReceiptEntry) => ((r.json as { contentHash?: string } | undefined)?.contentHash ?? '').toLowerCase();

	// Access level
	const accessLevel = $derived(getAccessLevel());
	const canAttest = $derived(accessLevel === 'attest');

	// Filter state
	type Filter = 'all' | 'yes' | 'no';
	type ReceiptType = 'all' | 'course' | 'link' | 'permission' | 'system' | 'message' | 'request' | 'response';
	
	let holdFilter = $state<Filter>('all');
	let typeFilter = $state<ReceiptType>('all');
	let showSystem = $state(false);
	let searchQuery = $state('');

	// Derived data
	const all = $derived(ledger?.receipts ?? []);
	
	// System receipts are those from system accounts or with system: true flag
	const isSystemReceipt = (r: ReceiptEntry): boolean => {
		return r.where.includes('system/') || 
		       r.json !== undefined && typeof r.json === 'object' && 
		       (r.json as Record<string, unknown>)['system'] === true;
	};

	// Filter by hold status
	const byHold = $derived(all.filter((r) => 
		holdFilter === 'all' || 
		(holdFilter === 'no' ? r.holds === 'no' : r.holds !== 'no')
	));

	// Filter by type
	const byType = $derived(byHold.filter((r) => {
		switch (typeFilter) {
			case 'course': return r.group === 'courses';
			case 'link': return r.group === 'links';
			case 'permission': return r.group === 'permissions';
			case 'system': return isSystemReceipt(r);
			case 'message': return r.what.toLowerCase().includes('message');
			case 'request': return r.what.toLowerCase().includes('request');
			case 'response': return r.what.toLowerCase().includes('response');
			default: return true;
		}
	}));

	// Filter by search query
	const shown = $derived(
		searchQuery.trim() 
			? byType.filter((r) => 
				r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
				r.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
				r.what.toLowerCase().includes(searchQuery.toLowerCase()) ||
				(searchQuery.trim().length >= 6 && proofOf(r).includes(searchQuery.trim().toLowerCase()))
			)
			: byType
	);

	// Hide system by default unless toggled
	const visible = $derived(shown.filter((r) => showSystem || !isSystemReceipt(r)));

	const bad = $derived(all.filter((r) => r.holds === 'no').length);
	const systemCount = $derived(all.filter((r) => isSystemReceipt(r)).length);

	// Groups for display
	const GROUPS: { id: ReceiptGroup; title: string; description: string; empty: string }[] = [
		{ id: 'courses', title: 'Course records', description: 'Receipts and chains from DoStudy — named, revised, reviewed, read.', empty: 'Receipts you save from DoStudy appear here.' },
		{ id: 'links', title: 'Links', description: 'Which keys speak for which identity — requests, links and unlinks.', empty: 'Links you approve on the Keys page appear here.' },
		{ id: 'permissions', title: 'Permissions', description: 'Powers given, used, asked for and taken back — as UCAN.', empty: 'Permissions you give or are given appear here.' },
		{ id: 'people', title: 'Calls and messages', description: 'Calls, messages and link-ups with the people in your contacts.', empty: 'Calls and messages appear here.' },
		{ id: 'agreements', title: 'Agreements', description: 'Offers, counteroffers, agreements and settlements — each step signed by one side.', empty: 'Agreements you make appear here, step by step.' },
		{ id: 'other', title: 'Founding and membership', description: 'Federation founding records and membership credentials.', empty: 'Founding records and credentials appear here.' }
	];

	// Type options for search
	const TYPE_OPTIONS = [
		{ value: 'all', label: 'All types' },
		{ value: 'course', label: 'Courses' },
		{ value: 'link', label: 'Links' },
		{ value: 'permission', label: 'Permissions' },
		{ value: 'system', label: 'System' },
		{ value: 'message', label: 'Messages' },
		{ value: 'request', label: 'Requests' },
		{ value: 'response', label: 'Responses' },
	];

	let says = $state('');

	const TONE = { yes: 'good', partly: 'good', no: 'bad' } as const;
	const WORD = { yes: 'Holds up', partly: 'Signatures hold', no: 'Does not hold' } as const;

	const when = (iso: string) =>
		iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No date';


	async function toggleSystem() {
		if (!showSystem && !canAttest) {
			const result = await requireAttest();
			if (!result.ok) {
				says = 'System receipts require your passkey to view.';
				return;
			}
		}
		showSystem = !showSystem;
	}

	// Drawer state
	let selectedReceipt = $state<ReceiptEntry | null>(null);
	let drawerOpen = $state(false);

	function openDrawer(r: ReceiptEntry) {
		selectedReceipt = r;
		drawerOpen = true;
	}
</script>

<svelte:head><title>Receipts — Q</title></svelte:head>

<Page title="Receipts" lead="Signed records of what happened — kept apart from your files, and checked here, offline.">
	{#snippet actions()}
		<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => void refreshLedger()}>Check again</button>
	{/snippet}

	{#if !identity}
		<Empty icon="lock" title="Locked" description="Receipts are kept in your folder, locked to your passkey. Sign in to see them.">
			<button type="button" class="btn preset-filled-primary-500" onclick={() => void unlock()}>Sign in with my passkey</button>
		</Empty>
	{:else if ledger?.state === 'no-folder'}
		<Empty icon="files" title="No folder yet" description="Receipts live in your folder. Set it up under Copy locations." />
	{:else}
		<!-- Search and Filters -->
		<div class="space-y-4">
			<!-- Search -->
			<label class="label flex flex-col gap-1">
				<span class="text-sm font-semibold">Search by words, or by a proof ID</span>
				<input type="search" bind:value={searchQuery} class="input min-h-11" />
			</label>

			<!-- Filters Row -->
			<div class="flex flex-wrap items-center gap-2">
				<!-- Hold filter -->
				<div class="flex gap-1" role="group" aria-label="Hold status">
					{#each [['all', `All (${all.length})`], ['yes', 'Holding up'], ['no', `Not holding (${bad})`]] as [value, text] (value)}
						<button
							type="button"
							class="btn btn-sm {holdFilter === value ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
							aria-pressed={holdFilter === value}
							onclick={() => (holdFilter = value as Filter)}>{text}</button
						>
					{/each}
				</div>

				<span class="text-surface-400-600">|</span>

				<!-- Type filter -->
				<div class="flex gap-1" role="group" aria-label="Receipt type">
					{#each TYPE_OPTIONS as opt (opt.value)}
						<button
							type="button"
							class="btn btn-sm {typeFilter === opt.value ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
							aria-pressed={typeFilter === opt.value}
							onclick={() => (typeFilter = opt.value as ReceiptType)}>{opt.label}</button
						>
					{/each}
				</div>

				<span class="text-surface-400-600">|</span>

				<!-- System toggle -->
				<button
					type="button"
					class="btn btn-sm {showSystem ? 'preset-filled-warning-500' : 'preset-outlined-surface-500'}"
					aria-pressed={showSystem}
					onclick={() => void toggleSystem()}
				>
					{showSystem ? 'Hide' : 'Show'} System ({systemCount})
				</button>

				{#if ledger?.state === 'loading'}<span class="role-meta" data-role="meta">Checking…</span>{/if}
			</div>

			<!-- Results count -->
			<p class="text-sm text-surface-700-300">
				{#if searchQuery.trim()}
					Showing {visible.length} of {shown.length} receipts matching "{searchQuery}"
				{:else}
					Showing {visible.length} of {all.length} receipts
				{/if}
				{#if showSystem && systemCount > 0}
					<span class="text-warning-600-400"> (including {systemCount} system)</span>
				{/if}
			</p>
		</div>

		{#if says}<p class="role-meta text-warning-700-300" aria-live="polite">{says}</p>{/if}

		{#each GROUPS as g (g.id)}
			{@const list = visible.filter((r) => r.group === g.id)}
			<Section title={g.title} description={g.description}>
				{#if !list.length}
					<Empty icon="receipts" title="None" description={holdFilter === 'all' && typeFilter === 'all' && !searchQuery.trim() ? g.empty : 'None match your filters.'} />
				{:else}
					<!-- Table -->
					<div class="table-container">
						<table class="table table-hover">
							<thead>
								<tr>
									<th>Title</th>
									<th>What</th>
									<th>When</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{#each list as r (r.id)}
									<tr onclick={() => openDrawer(r)} class="cursor-pointer hover:preset-tonal-primary">
										<td>
											<span class="flex items-center gap-2">
												{isSystemReceipt(r) ? '🛡️ ' : ''}{r.title}
											</span>
										</td>
										<td class="text-sm opacity-60">{r.what}</td>
										<td>{when(r.at)}</td>
										<td>
											<Status tone={TONE[r.holds]}>{WORD[r.holds]}</Status>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Section>
		{/each}
	{/if}
</Page>

<!-- Drawer for Receipt Details -->
<!-- A receipt, opened: a read-only card (ReceiptDrawer, lib/receipt-read.ts). -->
<ReceiptDrawer receipt={selectedReceipt} {names} bind:open={drawerOpen} />
