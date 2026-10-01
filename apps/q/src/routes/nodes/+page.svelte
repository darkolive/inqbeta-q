<script lang="ts">
	/*
	 * Copy locations — the central sync. Your main folder, and every other place
	 * a copy is kept. They only ever hold locked files.
	 */
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import FolderPanel from '$lib/components/FolderPanel.svelte';
	import { watchFolder, type FolderState } from '@inqbeta/q-core/folder';
	import { untrack } from 'svelte';
	import { addReplica, allowReplica, listReplicas, removeReplica, syncReplica, type Replica } from '@inqbeta/q-core/replicas';
	import { startBackgroundSync, stopBackgroundSync, isBackgroundSyncRunning, triggerSync } from '@inqbeta/q-core/offline-queue';
	import { refreshLedger } from '$lib/ledger';
	import { watch, current } from '@inqbeta/q-core/passkey';
	import { connectGoogle, disconnectGoogle, googleChannel, watchGoogleReturn } from '$lib/google-channel';
	import { syncCloudNow, watchCloud, type CloudState } from '$lib/autosync';
	import NoteTouch from '$lib/components/NoteTouch.svelte';
	import BackupSteps from '$lib/components/BackupSteps.svelte';
	import { CLOUDS, cloudChannel, disconnectCloud, type CloudId } from '$lib/cloud-channels';
	import { folderOwner } from '@inqbeta/q-core/folder';

	/* Google Drive — a storage channel through its API, for Safari and the iPhone too. */
	let google = $state<{ connectedAt: string } | null>(null);
	let cloud = $state<CloudState[]>([]);
	let cloudBusy = $state(false);
	let cloudSays = $state('');
	let confirmingDisconnect = $state(false);
	let others = $state<Partial<Record<CloudId, string>>>({});
	async function disconnectOther(cid: CloudId, name: string) {
		cloudBusy = true;
		await disconnectCloud(cid);
		cloudBusy = false;
		await loadCloud();
		cloudSays = `${name} disconnected. What’s already there stays, locked; delete the “Q vault” folder in ${name} if you want it gone.`;
	}
	$effect(() => watchCloud((c) => (cloud = c)));
	const gState = $derived(cloud.find((c) => c.kind === 'google-drive'));
	/* Keys held in this tab. Without them the locked Google token cannot be
	 * read, so the page must not offer "Connect" as if there were none. */
	let signedIn = $state(false);
	let cloudChecked = $state(false);
	$effect(() =>
		watch((id) => {
			signedIn = !!id;
			if (id) void loadCloud();
		})
	);
	async function loadCloud() {
		const did = folderOwner();
		google = did && current() ? await googleChannel(did).catch(() => null) : null;
		const next: Partial<Record<CloudId, string>> = {};
		if (did && current()) for (const c of CLOUDS) {
			const ch = await cloudChannel(c.id, did).catch(() => null);
			if (ch) next[c.id] = ch.connectedAt;
		}
		others = next;
		cloudChecked = !!current();
	}
	/* The small Google window hands its code back here. */
	$effect(() =>
		watchGoogleReturn(async (out) => {
			if (!out.ok) {
				cloudSays = out.says;
				return;
			}
			cloudSays = 'Google Drive connected. Copying your vault there — only locked files leave.';
			await loadCloud();
			await syncNow();
		})
	);
	async function connect() {
		cloudSays = '';
		const out = await connectGoogle();
		if (!out.ok) cloudSays = out.says;
		else cloudSays = 'Finish in the Google window. This page stays signed in.';
	}
	async function syncNow() {
		cloudBusy = true;
		cloudSays = '';
		const out = await syncCloudNow();
		cloudBusy = false;
		const g = out.find((c) => c.kind === 'google-drive');
		cloudSays = !g
			? ''
			: g.error
				? g.error
				: `Sent ${g.result?.sent ?? 0}, received ${g.result?.received ?? 0}, ${g.result?.same ?? 0} already there.` +
					(g.result?.damaged.length ? ` ${g.result.damaged.length} damaged, not spread.` : '') +
					(g.holdsAll ? ' Google Drive holds every locked file — that counts as your backup.' : '');
		/* A sync you asked for offers to note it on your passkey (ADR-Q-012). */
		if (g && !g.error) noting = true;
	}
	let noting = $state(false);
	async function disconnect() {
		cloudBusy = true;
		await disconnectGoogle();
		cloudBusy = false;
		confirmingDisconnect = false;
		google = null;
		cloudSays = 'Disconnected. What is already in your Drive stays there, locked; delete the "Q vault" folder in Drive if you want it gone.';
	}

	let folder = $state<FolderState>({ kind: 'checking' });
	let replicas = $state<Replica[]>([]);
	let says = $state<Record<string, string>>({});
	let note = $state('');
	let busy = $state<string | null>(null);
	
	// Background sync state
	let syncRunning = $state(false);
	let lastAutoSync = $state<string | null>(null);
	
	// Watch for identity changes to manage background sync
	$effect(() => {
		return watch((id) => {
			if (id && folder.kind === 'ready') {
				// Start background sync when signed in and folder ready
				syncRunning = true;
				startBackgroundSync(5 * 60 * 1000, undefined, (result) => {
					if (result.synced > 0 || result.failed > 0) {
						lastAutoSync = result.timestamp;
						void load();
					}
				});
			} else {
				// Stop sync when signed out
				stopBackgroundSync();
				syncRunning = false;
			}
		});
	});

	/* Takes the state rather than reading `folder`: this runs inside the
	 * watchFolder effect, and reading the state the effect has just written made
	 * it run again for ever (effect_update_depth_exceeded, 25 September). */
	async function load(s: FolderState = untrack(() => folder)) {
		replicas = s.kind === 'ready' ? await listReplicas().catch(() => []) : [];
		syncRunning = isBackgroundSyncRunning();
	}
	$effect(() =>
		watchFolder((s) => {
			folder = s;
			void load(s);
			if (s.kind === 'ready') void loadCloud();
		})
	);

	async function add() {
		note = '';
		const out = await addReplica();
		note = out.ok ? `${out.name} added. Sync it to copy your files there.` : out.cancelled ? '' : out.says;
		await load();
	}

	async function sync(r: Replica) {
		busy = r.id;
		try {
			const res = await syncReplica(r.id);
			says = {
				...says,
				[r.id]:
					`Sent ${res.sent}, received ${res.received}, ${res.same} already in both.` +
					(res.damaged.length ? ` ${res.damaged.length} damaged — no longer match their names, so not copied: ${res.damaged.join(', ')}.` : '')
			};
			if (res.received) await refreshLedger();
		} catch (e) {
			says = { ...says, [r.id]: e instanceof Error ? e.message : String(e) };
		} finally {
			busy = null;
			await load();
		}
	}

	async function syncAll() {
		for (const r of replicas) if (r.state === 'ready') await sync(r);
	}

	const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');
	const TONE = { ready: 'good', asleep: 'needs-you', lost: 'bad' } as const;
	const WORD = { ready: 'Ready', asleep: 'Needs allowing', lost: 'Not yours' } as const;

	// Drawer state
	let selectedReplica = $state<Replica | null>(null);
	let drawerOpen = $state(false);

	function openDrawer(r: Replica) {
		selectedReplica = r;
		drawerOpen = true;
	}

	async function allowAndSync() {
		if (!selectedReplica) return;
		await allowReplica(selectedReplica.id);
		await load();
		await sync(selectedReplica);
	}

	async function stopUsing() {
		if (!selectedReplica) return;
		await removeReplica(selectedReplica.id);
		drawerOpen = false;
		await load();
	}
</script>

<svelte:head><title>Copy locations — Q</title></svelte:head>

<Page title="Backups" lead="Where your vault is kept. Everything is locked before it leaves, so nobody there can read it.">
	<BackupSteps onDone={() => void load()} />

	<details class="card preset-outlined-surface-200-800 p-4">
		<summary class="cursor-pointer font-bold min-h-11 flex items-center">More detail</summary>
		<div class="mt-4 flex flex-col gap-8">
	{#snippet actions()}
		{#if folder.kind === 'ready' && replicas.some((r) => r.state === 'ready')}
			<button type="button" class="btn preset-filled-primary-500" disabled={!!busy} onclick={() => void syncAll()}>Sync all</button>
		{/if}
	{/snippet}

	<Section title="Main folder">
		<FolderPanel />
	</Section>

	<Section title="Kept level automatically" description="Every copy location this browser may write to is synced every five minutes, and when you come back to Q.">
		<p class="text-sm">
			Nothing is asked and nothing interrupts. Only locked files travel — names that are hashes, and ciphertext — plus your continuity file, newest wins.
			A location that needs allowing again shows as asleep below until you tap Allow.
		</p>
		<p class="text-sm opacity-70">
			On a Mac, choosing your Dropbox, Google Drive or OneDrive folder as a copy location puts the vault in that cloud with no sign-in to Q's side.
		</p>
	</Section>

	<Section title="Cloud" description="Your vault carried by a cloud provider directly — works in Safari and on the iPhone. Only locked files leave.">
		{#if folder.kind !== 'ready'}
			<Empty icon="cloud" title="Open your vault first" description="The cloud keeps a copy of it." />
		{:else if !signedIn || !cloudChecked}
			<Empty icon="lock" title="Sign in to see your cloud" description="Your connections are locked in your vault, so Q needs your passkey to read them. They are still syncing wherever you are signed in." />
		{:else if google}
			<Item title="Google Drive" description={`Connected ${new Date(google.connectedAt).toLocaleDateString()} · a folder of its own, only files Q made`} meta={gState?.at ? `Last synced ${new Date(gState.at!).toLocaleTimeString()}${gState?.holdsAll ? ' · holds everything' : ''}` : 'Syncs every five minutes'}>
				{#snippet status()}
					<Status tone={gState?.error ? 'bad' : 'good'}>{gState?.error ? 'Needs attention' : 'On'}</Status>
				{/snippet}
			</Item>
			<div class="actions mt-2">
				<button type="button" class="btn btn-sm preset-filled-primary-500" disabled={cloudBusy} onclick={() => void syncNow()}>{cloudBusy ? 'Syncing…' : 'Sync now'}</button>
				{#if confirmingDisconnect}
					<button type="button" class="btn btn-sm preset-filled-error-500" disabled={cloudBusy} onclick={() => void disconnect()}>Disconnect Google Drive</button>
					<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => (confirmingDisconnect = false)}>Keep it</button>
				{:else}
					<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => (confirmingDisconnect = true)}>Disconnect…</button>
				{/if}
			</div>
		{:else}
			<p class="text-sm">Signing in to Google here opens a storage channel. It is never a way to sign in to Q, and Q can see only the files it puts there.</p>
			<div class="actions mt-2">
				<button type="button" class="btn preset-filled-primary-500" onclick={() => void connect()}>Connect Google Drive</button>
			</div>
		{/if}
		{#each CLOUDS.filter((c) => others[c.id]) as c (c.id)}
			{@const st = cloud.find((x) => x.kind === c.id)}
			<div class="mt-4">
				<Item title={c.name} description={`Connected ${new Date(others[c.id]!).toLocaleDateString()} · a folder of its own, only files Q made`} meta={st?.at ? `Last synced ${new Date(st.at).toLocaleTimeString()}${st.holdsAll ? ' · holds everything' : ''}` : 'Syncs every five minutes'}>
					{#snippet status()}
						<Status tone={st?.error ? 'bad' : 'good'}>{st?.error ? 'Needs attention' : 'On'}</Status>
					{/snippet}
				</Item>
				<div class="actions mt-2">
					<button type="button" class="btn btn-sm preset-outlined-surface-500" disabled={cloudBusy} onclick={() => void disconnectOther(c.id, c.name)}>Disconnect {c.name}</button>
				</div>
			</div>
		{/each}
		{#if cloudSays}<p class="text-sm mt-2" role="status" aria-live="polite">{cloudSays}</p>{/if}
	</Section>

	<Section title="Other places" description="Syncing copies what is missing both ways and never overwrites.">
		{#snippet actions()}
			{#if folder.kind === 'ready' && !folder.inBrowser}
				<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => void add()}>Add a location…</button>
			{/if}
		{/snippet}
		{#if folder.kind !== 'ready'}
			<Empty icon="nodes" title="Open your main folder first" description="Copy locations mirror it." />
		{:else if folder.inBrowser}
			<Empty icon="cloud" title="Not in this browser" description="Copy locations need a browser that can open folders on your disk — Chrome or Edge on a computer. Here, take readable copies out from the Files page." />
		{:else if !replicas.length}
			<Empty icon="cloud" title="No other places yet" description="Choose a folder on a USB drive, in Google Drive or iCloud Drive on this computer, or on a community node's share." />
		{:else}
			<!-- Table -->
			<div class="table-container">
				<table class="table table-hover">
					<thead>
						<tr>
							<th>Name</th>
							<th>Added</th>
							<th>Last Synced</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{#each replicas as r (r.id)}
							<tr onclick={() => openDrawer(r)} class="cursor-pointer hover:preset-tonal-primary">
								<td>{r.name}</td>
								<td>{when(r.added)}</td>
								<td>{when(r.lastSync)}</td>
								<td>
									<Status tone={TONE[r.state]}>{WORD[r.state]}</Status>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		{#if note}<p class="role-meta" aria-live="polite">{note}</p>{/if}
	</Section>
		</div>
	</details>
</Page>

<!-- Drawer for Replica Details -->
<Dialog open={drawerOpen} onOpenChange={(e) => (drawerOpen = e.open)}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-end">
			<Dialog.Content class="h-full w-full max-w-md card bg-surface-50-950 p-6 shadow-xl overflow-y-auto">
				<header class="flex justify-between items-center mb-6">
					<h2 class="h3">{selectedReplica?.name}</h2>
					<button type="button" class="btn btn-sm preset-tonal-surface" onclick={() => drawerOpen = false}>
						Close
					</button>
				</header>

				{#if selectedReplica}
					<dl class="space-y-4">
						<div>
							<dt class="text-sm opacity-60">Status</dt>
							<dd>
								<Status tone={TONE[selectedReplica.state]}>{WORD[selectedReplica.state]}</Status>
							</dd>
						</div>
						<div>
							<dt class="text-sm opacity-60">Added</dt>
							<dd>{when(selectedReplica.added)}</dd>
						</div>
						<div>
							<dt class="text-sm opacity-60">Last Synced</dt>
							<dd>{when(selectedReplica.lastSync)}</dd>
						</div>
						{#if says[selectedReplica.id]}
							<div>
								<dt class="text-sm opacity-60">Sync Result</dt>
								<dd class="role-meta">{says[selectedReplica.id]}</dd>
							</div>
						{/if}
						<div>
							<dt class="text-sm opacity-60">ID</dt>
							<dd class="role-token text-xs break-all">{selectedReplica.id}</dd>
						</div>
					</dl>

					<div class="mt-8 pt-6 border-t border-surface-200-800 space-y-2">
						{#if selectedReplica.state === 'asleep'}
							<button type="button" class="btn preset-filled-primary-500 w-full" onclick={() => void allowAndSync()}>
								Allow & Sync
							</button>
						{:else if selectedReplica.state === 'ready'}
							<button 
								type="button" 
								class="btn preset-filled-primary-500 w-full" 
								disabled={busy === selectedReplica.id}
								onclick={() => { if (selectedReplica) void sync(selectedReplica); }}
							>
								{busy === selectedReplica.id ? 'Syncing…' : 'Sync Now'}
							</button>
						{/if}
						<button type="button" class="btn preset-outlined-error-500 w-full" onclick={() => void stopUsing()}>
							Stop using this location
						</button>
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>

<NoteTouch bind:open={noting} title="note.title.sync" onfinish={(n) => n && (cloudSays += ' Noted on your passkey.')} />
