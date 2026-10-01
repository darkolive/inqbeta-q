<script lang="ts">
	/*
	 * Keeping your vault safe, in steps (1 October 2026). After your card, the
	 * second core power: Darren, "syncing your Google Drive, all of those
	 * things … once those are done, everything else can function really well
	 * with little intervention."
	 *
	 * Four steps, one thing each:
	 *   1. Here          — where your vault lives now, and choosing a folder if
	 *                      this computer has none yet
	 *   2. Google Drive  — one button; your vault is copied there, locked
	 *   3. Another copy  — a folder that syncs (iCloud, Dropbox, OneDrive), or
	 *                      a backup file you keep yourself
	 *   4. Safe          — where it is, in plain words, and that Q keeps them
	 *                      level by itself every five minutes
	 *
	 * Every step can be skipped except the first. Nothing here is new under
	 * the hood: it's the copy locations, Google Drive channel and "Back up now"
	 * Q already had, put in an order a person can follow.
	 */
	import { Steps } from '@skeletonlabs/skeleton-svelte';
	import { Icon, Status } from '@inqbeta/q-ui';
	import { untrack } from 'svelte';
	import { watchFolder, chooseFolder, wakeFolder, folderSupported, folderOwner, backupNow, lastBackup, type FolderState } from '@inqbeta/q-core/folder';
	import { addReplica, listReplicas, syncReplica, type Replica } from '@inqbeta/q-core/replicas';
	import { current } from '@inqbeta/q-core/passkey';
	import { connectGoogle, googleChannel, watchGoogleReturn } from '$lib/google-channel';
	import { syncCloudNow, watchCloud, type CloudState } from '$lib/autosync';
	import { refreshLedger } from '$lib/ledger';

	let { startAt = 0, onDone, onCancel }: { startAt?: number; onDone: () => void; onCancel?: () => void } = $props();

	let step = $state(untrack(() => startAt));
	let says = $state('');
	let busy = $state(false);

	/* ---- 1. Here ---- */
	let folder = $state<FolderState>({ kind: 'checking' });
	$effect(() => watchFolder((f) => (folder = f)));
	const ready = $derived(folder.kind === 'ready');
	async function choose() {
		says = '';
		const out = folder.kind === 'asleep' ? await wakeFolder() : await chooseFolder();
		if (!out.ok && !out.cancelled) says = out.says;
		await refreshLedger();
	}

	/* ---- 2. Google Drive ---- */
	let google = $state<{ connectedAt: string } | null>(null);
	let cloud = $state<CloudState[]>([]);
	$effect(() => watchCloud((c) => (cloud = c)));
	async function loadGoogle() {
		const did = folderOwner();
		google = did && current() ? await googleChannel(did).catch(() => null) : null;
	}
	$effect(() => {
		if (ready) void loadGoogle();
	});
	$effect(() =>
		watchGoogleReturn(async (out) => {
			if (!out.ok) return void (says = out.says);
			await loadGoogle();
			await copyToGoogle();
		})
	);
	let googleWaiting = $state(false);
	async function connect() {
		says = '';
		const out = await connectGoogle();
		if (!out.ok) says = out.says;
		else googleWaiting = true;
	}
	async function copyToGoogle() {
		busy = true;
		googleWaiting = false;
		const out = await syncCloudNow();
		busy = false;
		if (out[0]?.error) says = out[0].error;
		await refreshLedger();
	}
	const g = $derived(cloud[0]);

	/* ---- 3. Another copy ---- */
	let replicas = $state<Replica[]>([]);
	const loadReplicas = async () => (replicas = ready ? await listReplicas().catch(() => []) : []);
	$effect(() => {
		if (ready) void loadReplicas();
	});
	async function addFolder() {
		says = '';
		const out = await addReplica();
		if (!out.ok) {
			if (!out.cancelled) says = out.says;
			return;
		}
		await loadReplicas();
		const r = replicas.find((x) => x.name === out.name);
		if (r) {
			busy = true;
			await syncReplica(r.id).catch((e) => (says = e instanceof Error ? e.message : String(e)));
			busy = false;
			await loadReplicas();
		}
	}
	let downloaded = $state(untrack(() => lastBackup()));
	async function download() {
		says = '';
		busy = true;
		const out = await backupNow();
		busy = false;
		if (out.ok) downloaded = Date.now();
		else if (!out.cancelled) says = out.says;
	}

	/* ---- 4. Safe: where it is, in words ---- */
	const places = $derived([
		...(ready ? [{ name: folder.kind === 'ready' && folder.inBrowser ? 'This browser' : `Your ${folder.kind === 'ready' ? folder.name : ''} folder`, why: 'Where you work. Fast, but a browser can clear it.', off: false }] : []),
		...(google ? [{ name: 'Google Drive', why: g?.holdsAll ? 'Holds every file. Kept level every five minutes.' : 'Connected. Kept level every five minutes.', off: true }] : []),
		...replicas.map((r) => ({ name: r.name, why: r.state === 'ready' ? 'Kept level every five minutes while Q is open.' : 'Needs allowing again: open Backups.', off: true })),
		...(downloaded ? [{ name: 'A backup file', why: `Saved ${new Date(downloaded).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. Keep it somewhere safe.`, off: true }] : [])
	]);
	const away = $derived(places.filter((p) => p.off).length);

	const STEPS = [
		{ title: 'Here', says: 'Where your vault lives on this device.' },
		{ title: 'Google Drive', says: 'A copy in your Google Drive. Locked, so Google can’t read it.' },
		{ title: 'Another copy', says: 'Two places are safer than one. This is optional.' },
		{ title: 'Safe', says: 'Where your vault is kept.' }
	];
	const canGoOn = $derived(step !== 0 || ready);
	/* Already kept somewhere else: open on where it is, not on step one. */
	let jumped = false;
	$effect(() => {
		if (!jumped && step === 0 && ready && (google || replicas.length)) {
			jumped = true;
			step = 3;
		}
	});
</script>

<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6 flex flex-col gap-6">
	<Steps count={STEPS.length} {step} onStepChange={(d) => (canGoOn || d.step < step) && (step = d.step)}>
		<Steps.List class="mb-6">
			{#each STEPS as s, i (s.title)}
				<Steps.Item index={i}>
					<Steps.Trigger class="min-h-11">
						<Steps.Indicator>{i + 1}</Steps.Indicator>
						<span class="hidden sm:inline">{s.title}</span>
					</Steps.Trigger>
					{#if i < STEPS.length - 1}<Steps.Separator />{/if}
				</Steps.Item>
			{/each}
		</Steps.List>

		<header class="mb-5">
			<h2 class="h3">{STEPS[step].title}</h2>
			<p class="opacity-70">{STEPS[step].says}</p>
		</header>

		<!-- 1. Here -->
		<Steps.Content index={0}>
			<div class="flex flex-col gap-4 max-w-xl">
				{#if folder.kind === 'ready'}
					<div class="card preset-tonal-success p-4 flex items-start gap-3">
						<Icon name="check" class="mt-0.5 shrink-0" />
						<div>
							<p class="font-bold">{folder.inBrowser ? 'Kept in this browser' : `In your ${folder.name} folder`}</p>
							<p class="text-sm">{folder.inBrowser ? 'Fast to work with. A browser can clear its storage, so the next steps put copies somewhere else.' : 'On this computer, locked to your passkey. The next steps put copies somewhere else.'}</p>
						</div>
					</div>
				{:else if folder.kind === 'asleep'}
					<p>Your <strong>{folder.name}</strong> folder needs allowing again. Your browser asks this after a restart.</p>
					<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" onclick={() => void choose()}>Allow my folder</button>
				{:else if folderSupported()}
					<p>Choose or make a folder on this computer: “Q” in Documents, say. Everything in it is locked to your passkey.</p>
					<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" onclick={() => void choose()}><Icon name="files" size={16} /> Choose a folder</button>
				{:else}
					<p class="opacity-70">Getting this browser ready…</p>
				{/if}
			</div>
		</Steps.Content>

		<!-- 2. Google Drive -->
		<Steps.Content index={1}>
			<div class="flex flex-col gap-4 max-w-xl">
				{#if google}
					<div class="card preset-tonal-success p-4 flex items-start gap-3">
						<Icon name="check" class="mt-0.5 shrink-0" />
						<div>
							<p class="font-bold">Google Drive is connected</p>
							<p class="text-sm">
								{#if busy}Copying your vault…{:else if g?.holdsAll}It holds every file. Q keeps it level every five minutes.{:else if g}Copied. Q keeps it level every five minutes.{:else}Q keeps it level every five minutes.{/if}
							</p>
						</div>
					</div>
					{#if !busy && !g?.holdsAll}<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => void copyToGoogle()}>Copy now</button>{/if}
				{:else}
					<p>Q puts a folder called <strong>Q vault</strong> in your Google Drive and copies your vault into it. Everything is locked first, and Q can only see what it made.</p>
					<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!ready || googleWaiting} onclick={() => void connect()}>
						<Icon name="cloud" size={16} /> {googleWaiting ? 'Finish in the Google window…' : 'Connect Google Drive'}
					</button>
					<p class="text-sm opacity-60">Don’t use Google Drive? Press Next.</p>
				{/if}
			</div>
		</Steps.Content>

		<!-- 3. Another copy -->
		<Steps.Content index={2}>
			<div class="grid gap-4 sm:grid-cols-2 max-w-2xl">
				{#if folderSupported()}
					<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
						<p class="font-bold flex items-center gap-2"><Icon name="files" /> A folder that syncs</p>
						<p class="text-sm opacity-80">Your iCloud Drive, Dropbox or OneDrive folder, or a USB stick. Q copies to it every five minutes while it’s open.</p>
						{#if replicas.length}<p class="text-sm"><Status tone="good">{replicas.map((r) => r.name).join(', ')}</Status></p>{/if}
						<button type="button" class="btn preset-tonal min-h-11 self-start mt-auto" disabled={busy} onclick={() => void addFolder()}>{replicas.length ? 'Add another folder' : 'Choose a folder'}</button>
					</div>
				{/if}
				<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
					<p class="font-bold flex items-center gap-2"><Icon name="download" /> A backup file</p>
					<p class="text-sm opacity-80">One file of your whole vault, locked. On a phone, “Save to Files” puts it in iCloud.</p>
					{#if downloaded}<p class="text-sm"><Status tone="good">Saved {new Date(downloaded).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</Status></p>{/if}
					<button type="button" class="btn preset-tonal min-h-11 self-start mt-auto" disabled={busy || !ready} onclick={() => void download()}>{busy ? 'Making it…' : 'Save a backup file'}</button>
				</div>
			</div>
		</Steps.Content>

		<!-- 4. Safe -->
		<Steps.Content index={3}>
			<div class="flex flex-col gap-4 max-w-xl">
				<ul class="flex flex-col gap-2">
					{#each places as p (p.name)}
						<li class="card preset-tonal-surface p-3 flex items-start gap-3">
							<Icon name="check" class="mt-0.5 shrink-0 text-success-600-400" />
							<div>
								<p class="font-bold">{p.name}</p>
								<p class="text-sm opacity-80">{p.why}</p>
							</div>
						</li>
					{/each}
				</ul>
				{#if away === 0}
					<p class="card preset-tonal-warning p-3 text-sm">Everything is on this device only. If it’s lost or the browser is cleared, so is your vault. Go back and add Google Drive or a backup file.</p>
				{:else}
					<p class="text-sm">Kept in {away + (ready ? 1 : 0)} places. Q copies changes by itself every five minutes while it’s open; you don’t need to do anything.</p>
				{/if}
			</div>
		</Steps.Content>
	</Steps>

	<footer class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-200-800 pt-4">
		<div>
			{#if step > 0}
				<button type="button" class="btn preset-tonal min-h-11" onclick={() => (step -= 1)}>Back</button>
			{:else if onCancel}
				<button type="button" class="btn preset-tonal min-h-11" onclick={onCancel}>Not now</button>
			{/if}
		</div>
		{#if step < STEPS.length - 1}
			<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!canGoOn || busy} onclick={() => (step += 1)}>Next</button>
		{:else}
			<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={onDone}>Done</button>
		{/if}
	</footer>
	{#if step === 0 && !ready}<p class="text-sm opacity-70 -mt-3">Choose a folder, and Next wakes up.</p>{/if}
	{#if says}<p class="text-sm card preset-tonal-error p-3" aria-live="polite">{says}</p>{/if}
</div>
