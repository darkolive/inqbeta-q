<script lang="ts">
	/*
	 * Choose, allow, change or stop using your Q folder.
	 * The rules are in folder.ts; this only says where things stand.
	 */
	import {
		chooseFolder,
		forgetFolder,
		listItems,
		revealFolder,
		suggestFolderName,
		wakeFolder,
		watchFolder,
		vaultSyncs,
		setVaultSyncs,
		watchBackup,
		type FolderState
	} from '@inqbeta/q-core/folder';
	import { current } from '@inqbeta/q-core/passkey';
	import { WHERE_NOT_TO_KEEP, WHERE_TO_KEEP, riskOf, type Keeping } from '@inqbeta/q-core/keeping';
	import { listReplicas } from '@inqbeta/q-core/replicas';
	import { Heading } from '@inqbeta/q-ui';
	import VaultTransfer from './VaultTransfer.svelte';

	let folder = $state<FolderState>({ kind: 'checking' });
	let says = $state('');
	let working = $state(false);
	let count = $state<number | null>(null);
	
	// Get suggested folder name based on current identity
	const suggestedName = $derived(() => {
		const identity = current();
		return identity ? suggestFolderName(identity.did) : 'Incubator - Master';
	});

	/* Copy locations other than this one. A second copy changes the answer, so
	 * the risk cannot be worked out without knowing. */
	let copies = $state(0);

	$effect(() =>
		watchFolder((s) => {
			folder = s;
			count = null;
			if (s.kind === 'ready') {
				void listItems().then((l) => (count = l.length));
				void listReplicas().then((r) => (copies = r.length));
			}
		})
	);

	const where = $derived<Keeping>(
		folder.kind === 'ready' ? (folder.inBrowser ? 'browser' : 'disk') : folder.kind === 'unsupported' ? 'browser' : 'none'
	);
	let synced = $state(false);
	$effect(() => {
		synced = vaultSyncs();
	});

	function saySynced(yes: boolean) {
		synced = yes;
		setVaultSyncs(yes);
	}

	let backedUpAt = $state(0);
	$effect(() => watchBackup((t) => (backedUpAt = t)));

	const risk = $derived(riskOf({ where, copies, synced, backedUpAt: backedUpAt || null }));

	async function act(fn: () => Promise<{ ok: boolean; says?: string }>) {
		says = '';
		working = true;
		const out = await fn();
		working = false;
		if (!out.ok && out.says) says = out.says;
	}
</script>

<div class="panel stack">
	<div class="block-head">
		<Heading role="section-title">Your Q folder</Heading>
		<p class="text-surface-900-100">
			A folder on this computer for everything you work with — receipts, notes, images, anything.
			What you save goes into it locked to your passkey — open the folder on your desktop and
			nothing in it can be read. The Data tab shows what is there.
		</p>
	</div>

	<!--
		Said first, and in the weight it deserves. This used to be a hint at the
		bottom of the panel, in the middle of a sentence about adding the page to
		the Dock, and somebody lost a folder to it.
	-->
	{#if folder.kind !== 'checking' && folder.kind !== 'no-identity'}
		<div
			class="card p-4 {risk.level === 'danger'
				? 'preset-filled-error-500'
				: risk.level === 'warn'
					? 'preset-tonal-warning'
					: 'preset-tonal-success'}"
			role={risk.level === 'danger' ? 'alert' : 'status'}
		>
			<p class="font-medium">{risk.says}</p>
			{#if risk.fix}<p class="text-sm mt-1">{risk.fix}</p>{/if}
		</div>
	{/if}

	{#if folder.kind === 'checking'}
		<p class="hint">Looking…</p>
	{:else if folder.kind === 'unsupported'}
		<div class="panel-note">
			<p>
				This browser cannot use a folder yet — Chrome and Edge on a computer can. Everything still
				works here; files download as before.
			</p>
		</div>
	{:else if folder.kind === 'no-identity'}
		<p class="text-surface-900-100">Sign in with your passkey first. The folder is kept for that passkey.</p>
	{:else if folder.kind === 'none'}
		<div class="panel-note mb-4">
			<p>No folder found for your identity. You can:</p>
			<ul class="list-disc list-inside mt-2 space-y-1 text-sm">
				<li>Choose an existing folder manually, or</li>
				<li>Create a new folder with the suggested name below</li>
			</ul>
		</div>
		<div class="actions">
			<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void act(chooseFolder)}>
				Choose a folder
			</button>
		</div>
		<div class="mt-4 p-3 card preset-tonal">
			<p class="text-sm"><strong>Suggested folder name:</strong></p>
			<p class="font-mono text-primary-700-300 mt-1">{suggestedName()}</p>
			<div class="hint mt-2 stack-tight">
				<p>
					The window opens in Documents. Make a new folder there, or go anywhere you like —
					a browser will never be able to tell this page where it is, so pick somewhere you
					would think to look.
				</p>
				<p><strong>Good places:</strong></p>
				<ul class="list-disc list-inside">
					{#each WHERE_TO_KEEP as place (place.name)}
						<li><strong>{place.name}</strong> — {place.why}</li>
					{/each}
				</ul>
				<p><strong>Not:</strong></p>
				<ul class="list-disc list-inside">
					{#each WHERE_NOT_TO_KEEP as place (place.name)}
						<li><strong>{place.name}</strong> — {place.why}</li>
					{/each}
				</ul>
			</div>
		</div>
	{:else if folder.kind === 'asleep'}
		<p class="text-surface-900-100">
			Your folder, <strong>{folder.name}</strong>, is remembered. The browser needs you to allow it
			again.
		</p>
		<div class="actions">
			<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void act(wakeFolder)}>
				Allow {folder.name}
			</button>
			<button type="button" class="btn preset-outlined-surface-500" disabled={working} onclick={() => void act(chooseFolder)}>
				Choose a different one
			</button>
		</div>
		<p class="hint">If Chrome offers “Allow on every visit”, choosing it skips this step next time.</p>
	{:else if folder.kind === 'lost'}
		<div class="panel-warn"><p>{folder.says}</p></div>
		<div class="actions">
			<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void act(chooseFolder)}>
				Choose a folder
			</button>
			<button type="button" class="btn preset-outlined-surface-500" onclick={() => void forgetFolder()}>
				Forget it
			</button>
		</div>
	{:else if folder.kind === 'ready'}
		<div class="field-list">
			<div class="field-row">
				<span class="field-label">Kept</span>
				<span class="field-value">
					{folder.inBrowser ? 'Inside this browser — not a folder on your disk' : 'In a folder on this computer'}
				</span>
			</div>
			<div class="field-row">
				<span class="field-label">{folder.inBrowser ? 'Called' : 'Folder'}</span>
				<span class="field-value">{folder.name}</span>
			</div>
			<div class="field-row">
				<span class="field-label">In it</span>
				<span class="field-value">
					{count === null ? '…' : `${count} file${count === 1 ? '' : 's'}`}
				</span>
			</div>
		</div>
		{#if !folder.inBrowser}
			<div class="panel-quiet stack-tight">
				<p class="text-sm">
					Does <strong>{folder.name}</strong> sync somewhere — iCloud Drive, Dropbox, OneDrive?
				</p>
				<div class="flex gap-2">
					<button
						type="button"
						aria-pressed={synced}
						class="btn btn-sm {synced ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
						onclick={() => saySynced(true)}>Yes, it syncs</button
					>
					<button
						type="button"
						aria-pressed={!synced}
						class="btn btn-sm {!synced ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
						onclick={() => saySynced(false)}>No, only here</button
					>
				</div>
				<p class="hint">
					Q cannot tell. A browser hands over a folder's name and nothing else — no path, no
					clue whether anything is watching it. You can see your own Finder; this page cannot.
				</p>
			</div>

			<div class="actions">
				<button type="button" class="btn preset-outlined-surface-500" disabled={working} onclick={() => void act(revealFolder)}>
					Show me where it is
				</button>
			</div>
			<p class="hint">
				A browser never tells a page where a folder is — that is the point of it. So this opens
				your computer's own file window already standing in the folder, and your computer shows
				you the path. Nothing you do in that window changes anything here; close it when you have
				seen enough.
			</p>
		{/if}
		{#if folder.inBrowser}
			<!-- Saved here as you work; one button takes it out. -->
			<VaultTransfer />
		{:else}
		<div class="actions">
			<button type="button" class="btn preset-outlined-surface-500" disabled={working} onclick={() => void act(chooseFolder)}>
				Change folder
			</button>
			<button type="button" class="btn preset-outlined-surface-500" onclick={() => void forgetFolder()}>
				Stop using it
			</button>
		</div>
		<p class="hint">
			Stopping leaves the folder and everything in it where it is, still locked. A file called
			dostudy.json in it says which passkey it belongs to — leave that one be.
		</p>
		{/if}
	{/if}

	{#if says}
		<p class="text-sm text-warning-700-300" aria-live="polite">{says}</p>
	{/if}
</div>
