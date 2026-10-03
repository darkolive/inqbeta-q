<script lang="ts">
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import SignIn from '$lib/components/SignIn.svelte';
	import LinkRequests from '$lib/components/LinkRequests.svelte';
	import WaysBackIn from '$lib/components/WaysBackIn.svelte';
	import KeysStory from '$lib/components/KeysStory.svelte';
	import { watch, current, signerFor, type Identity } from '@inqbeta/q-core/passkey';
	import { unlinkKey, unlinkKeyUcan, linkId } from '@inqbeta/q-core/links';
	import { watchFolder, refresh, suggestFolderName, saveLocked, type FolderState } from '@inqbeta/q-core/folder';
	import { COMMANDS } from '@inqbeta/q-core/permissions';
	import { folderStore, revoke } from '@inqbeta/q-core/ucan/index';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	let folder = $state<FolderState>({ kind: 'checking' });
	
	$effect(() => watch((id) => {
		identity = id;
		// After sign-in, trigger folder refresh to look for folder
		if (id) {
			void refresh();
		}
	}));
	$effect(() => watchFolder((s) => (folder = s)));
	$effect(() => watchLedger((l) => (ledger = l)));

	/*
	 * One list, whichever way a link was written: UCAN (now) or KeyLink JSON
	 * (before 2026-09-16). Unlinking always writes the new way when it can.
	 */
	interface LinkedKey {
		id: string;
		key: string;
		label: string;
		origin?: string;
		since: string;
		unlinked: boolean;
		off: () => Promise<void>;
	}

	const legacyUnlinked = $derived(new Set((ledger?.links ?? []).filter((l) => l.link.event === 'identity.unlinked').map((l) => l.link.key)));
	const revoked = $derived(new Set((ledger?.revocations ?? []).map((r) => `${r.revoked}|${r.by}`)));

	const linked = $derived.by((): LinkedKey[] => {
		if (!identity) return [];
		const me = identity.did;
		const fromUcan = (ledger?.ucanLinks ?? [])
			.filter((l) => l.root === me)
			.map((l) => ({
				id: l.approval.cid.toString(),
				key: l.key,
				label: l.label,
				origin: l.origin,
				since: new Date(l.since * 1000).toISOString(),
				unlinked: revoked.has(`${l.approval.cid}|${me}`),
				off: async () => {
					const id = current();
					if (!id) return;
					await folderStore.put(await unlinkKeyUcan(signerFor(id), l.approval));
				}
			}));
		const fromJson = (ledger?.links ?? [])
			.filter((l) => l.link.event === 'identity.linked' && l.link.root === me)
			.map((l) => ({
				id: l.item.diskPath,
				key: l.link.key,
				label: l.link.label,
				origin: l.link.origin,
				since: l.link.at,
				unlinked: legacyUnlinked.has(l.link.key),
				off: async () => {
					const id = current();
					if (!id) return;
					const off = await unlinkKey(signerFor(id), l.link);
					await saveLocked('links', `unlink-${await linkId(off)}.json`, JSON.stringify(off, null, '\t'), 'application/json');
				}
			}));
		return [...fromUcan, ...fromJson];
	});

	let confirming = $state<string | null>(null);
	let selectedKey = $state<LinkedKey | null>(null);
	let drawerOpen = $state(false);

	function openDrawer(k: LinkedKey) {
		selectedKey = k;
		drawerOpen = true;
	}

	async function unlink(k: LinkedKey) {
		confirming = null;
		await k.off();
		await refreshLedger();
	}

	/* Permissions: what this identity has given, and what it holds. */
	const verb = (cmd: string) => Object.entries(COMMANDS).find(([, c]) => c === cmd)?.[0] ?? cmd;
	const thingOf = (pol: unknown[]) => {
		const hit = pol.find((s) => Array.isArray(s) && s[0] === '==' && s[1] === '.thing') as unknown[] | undefined;
		return typeof hit?.[2] === 'string' ? hit[2] : 'any thing';
	};
	const given = $derived((ledger?.grants ?? []).filter((d) => d.payload.iss === identity?.did));
	const held = $derived((ledger?.grants ?? []).filter((d) => d.payload.aud === identity?.did && d.payload.iss !== identity?.did));
	const isRevoked = (d: (typeof given)[number]) => (ledger?.revocations ?? []).some((r) => r.revoked.equals(d.cid));
	const until = (exp: number | null) => (exp === null ? 'No end date' : `Until ${new Date(exp * 1000).toLocaleDateString('en-GB')}`);

	async function takeBack(d: (typeof given)[number]) {
		const id = current();
		if (!id) return;
		confirming = null;
		await folderStore.put(await revoke(signerFor(id), d, [d]));
		await refreshLedger();
	}
</script>

<svelte:head><title>Keys — Q</title></svelte:head>

<Page title="Keys" lead="Your passkey is your root identity. Sites and other devices get keys of their own, linked to it.">
	<!-- How keys work, as pictures: the same story style as the home, Federations and Messages pages. -->
	<KeysStory />

	<Section title="Your passkey">
		<div class="panel"><SignIn /></div>
	</Section>

	{#if identity && folder.kind === 'ready'}
		<Section title="Ways back in" description="If your passkey is lost, these open your vault as the same you — the same DID, the same sealed keys.">
			<div class="panel"><WaysBackIn /></div>
		</Section>
	{/if}

	{#if identity && (folder.kind === 'none' || folder.kind === 'unsupported')}
		<Section title="Your Data Folder" description="Where your data is stored">
			<div class="card preset-filled-warning-500 p-4 space-y-4">
				{#if folder.kind === 'unsupported'}
					<p>Browser folder storage (Safari):</p>
				{:else}
					<p>No folder found for your identity. Create one to store your data:</p>
					<div class="p-3 card preset-tonal">
						<p class="text-sm"><strong>Suggested folder name:</strong></p>
						<p class="font-mono text-primary-700-300">{identity ? suggestFolderName(identity.did) : '...'}</p>
					</div>
				{/if}
				<a href="/data" class="btn preset-filled-primary-500 inline-block">
					{folder.kind === 'unsupported' ? 'Set up browser storage' : 'Choose or create folder'}
				</a>
			</div>
		</Section>
	{/if}

	{#if identity}
		<Section title="Linked keys" description="Keys on sites and devices that sign as you. Each link was signed by that key and by this root.">
			{#if !linked.length}
				<Empty icon="network" title="No linked keys yet" description="When a site asks to be linked, approve its request below." />
			{:else}
				<!-- Table -->
				<div class="table-container">
					<table class="table table-hover">
						<thead>
							<tr>
								<th>Label</th>
								<th>Origin</th>
								<th>Linked</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{#each linked as k (k.id)}
								<tr onclick={() => openDrawer(k)} class="cursor-pointer hover:preset-tonal-primary">
									<td>{k.label}</td>
									<td>{k.origin ?? 'This device'}</td>
									<td>{new Date(k.since).toLocaleDateString('en-GB')}</td>
									<td>
										<Status tone={k.unlinked ? 'bad' : 'good'}>
											{k.unlinked ? 'Unlinked' : 'Linked'}
										</Status>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Section>

		<Section title="Permissions" description="Powers over things, written as UCAN. Each one names who gave it, who holds it, and what it covers.">
			{#if !given.length && !held.length}
				<Empty icon="lock" title="No permissions yet" description="When you give someone a power over one of your things, or are given one, it appears here." />
			{:else}
				<div class="stack-tight">
					{#each given as d (d.cid.toString())}
						<Item icon="lock" title={`Gave ${verb(d.payload.cmd)}`} subtitle={thingOf(d.payload.pol)} meta={until(d.payload.exp)}>
							{#snippet status()}<Status tone={isRevoked(d) ? 'bad' : 'good'}>{isRevoked(d) ? 'Taken back' : 'Given'}</Status>{/snippet}
							<p class="role-token" data-role="token">{d.payload.aud}</p>
							{#snippet actions()}
								{#if !isRevoked(d)}
									{#if confirming === d.cid.toString()}
										<span class="role-meta">Take it back? What was done with it stays done.</span>
										<button type="button" class="btn btn-sm preset-filled-error-500" onclick={() => void takeBack(d)}>Take back</button>
										<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => (confirming = null)}>Keep</button>
									{:else}
										<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => (confirming = d.cid.toString())}>Take back…</button>
									{/if}
								{/if}
							{/snippet}
						</Item>
					{/each}
					{#each held as d (d.cid.toString())}
						<Item icon="keys" title={`Holds ${verb(d.payload.cmd)}`} subtitle={thingOf(d.payload.pol)} meta={until(d.payload.exp)}>
							{#snippet status()}<Status tone={isRevoked(d) ? 'bad' : 'plain'}>{isRevoked(d) ? 'Taken back' : 'Held'}</Status>{/snippet}
							<p class="role-token" data-role="token">From {d.payload.iss}</p>
						</Item>
					{/each}
				</div>
			{/if}
		</Section>

		<Section title="Approve a link request" description="A site shows you a request after you sign in there. Bring it here.">
			<div class="panel"><LinkRequests /></div>
		</Section>
	{/if}
</Page>

<!-- Drawer for Key Details -->
<Dialog open={drawerOpen} onOpenChange={(e) => (drawerOpen = e.open)}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-end">
			<Dialog.Content class="h-full w-full max-w-md card bg-surface-50-950 p-6 shadow-xl overflow-y-auto">
				<header class="flex justify-between items-center mb-6">
					<h2 class="h3">{selectedKey?.label}</h2>
					<button type="button" class="btn btn-sm preset-tonal-surface" onclick={() => drawerOpen = false}>
						Close
					</button>
				</header>

				{#if selectedKey}
					<dl class="space-y-4">
						<div>
							<dt class="text-sm opacity-60">Key</dt>
							<dd class="role-token text-xs break-all">{selectedKey.key}</dd>
						</div>
						<div>
							<dt class="text-sm opacity-60">Origin</dt>
							<dd>{selectedKey.origin ?? 'This device'}</dd>
						</div>
						<div>
							<dt class="text-sm opacity-60">Linked</dt>
							<dd>{new Date(selectedKey.since).toLocaleString('en-GB')}</dd>
						</div>
						<div>
							<dt class="text-sm opacity-60">Status</dt>
							<dd>
								<Status tone={selectedKey.unlinked ? 'bad' : 'good'}>
									{selectedKey.unlinked ? 'Unlinked' : 'Linked'}
								</Status>
							</dd>
						</div>
					</dl>

					{#if !selectedKey.unlinked}
						<div class="mt-8 pt-6 border-t border-surface-200-800">
							{#if confirming === selectedKey.id}
								<p class="mb-4 text-sm">Unlink it? What it already signed stays signed.</p>
								<div class="flex gap-2">
									<button type="button" class="btn preset-filled-error-500" onclick={() => void unlink(selectedKey!)}>
										Unlink
									</button>
									<button type="button" class="btn preset-outlined-surface-500" onclick={() => (confirming = null)}>
										Keep
									</button>
								</div>
							{:else}
								<button type="button" class="btn preset-outlined-error-500" onclick={() => (confirming = selectedKey!.id)}>
									Unlink this key…
								</button>
							{/if}
						</div>
					{/if}
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
