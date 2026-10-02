<script lang="ts">
	/*
	 * Sign in to Q with your fingerprint, or make your passkey the first time.
	 * The identity is rebuilt from the passkey on every sign-in and held only
	 * for the life of this tab. `compact` is for the Q window.
	 */
	import NoteTouch from './NoteTouch.svelte';
	import { flushSync } from '$lib/autosync';
	import { goto } from '$app/navigation';
	import {
		KEY_PLACES,
		current,
		signOut,
		keyPlace,
		makePasskey,
		passkeysAvailable,
		unlock,
		watch,
		type Identity,
		type KeyPlace
	} from '@inqbeta/q-core/passkey';
	import { fingerprint } from '$lib/fingerprint';
	import { learnEnvelopeFrom } from '@inqbeta/q-core/ways-back-in';
	import RecoverWithCard from './RecoverWithCard.svelte';
	import { recovery } from '$lib/recovery.svelte';
	import { restoreVault, watchFolder } from '@inqbeta/q-core/folder';

	/* `stay`: sign in where you are rather than going to the Overview — for a page part-way through something. */
	let { compact = false, showOut = true, stay = false }: { compact?: boolean; showOut?: boolean; stay?: boolean } = $props();

	let identity = $state<Identity | null>(current());
	let print = $state('');
	let label = $state('');
	let says = $state('');
	let working = $state(false);
	let supported = $state(true);
	let firstDid = $state<string | null>(null);
	let sameAgain = $state<boolean | null>(null);
	let making = $state(false);
	/* ADR-Q-005 §6: a way-in passkey whose continuity file is not in this browser. */
	let needsBackup = $state(false);
	/* Which passkey opened it this time — so a way back in can be seen working. */
	let via = $state('');
	let backupInput = $state<HTMLInputElement | null>(null);
	/* Where the passkey is — asked first, remembered for next time. */
	let place = $state<KeyPlace>('device');
	$effect(() => {
		place = keyPlace();
	});
	const placeInfo = $derived(KEY_PLACES.find((p) => p.id === place));

	$effect(() => {
		supported = passkeysAvailable();
		return watch((id) => {
			identity = id;
			if (id && !firstDid) firstDid = id.did;
			print = '';
			if (id) void fingerprint(id.publicKey).then((f) => (print = f));
		});
	});

	/* The backup carries the continuity file: learn it, touch again, and open
	 * the vault from the same zip — one file chosen, nothing asked twice. */
	async function fromBackup(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		working = true;
		says = '';
		const learnt = await learnEnvelopeFrom(file);
		working = false;
		if (!learnt.ok) {
			says = learnt.says;
			return;
		}
		says = 'Found your continuity file. Touch the same passkey once more.';
		working = true;
		const out = await unlock(place);
		working = false;
		if (!out.ok) {
			says = out.says;
			return;
		}
		needsBackup = false;
		via = out.via ?? '';
		/* Wait for the vault to open for this DID, then bring the backup in. */
		await new Promise<void>((resolve) => {
			let stop = () => {};
			const t = setTimeout(() => {
				stop();
				resolve();
			}, 5000);
			stop = watchFolder((st) => {
				if (st.kind === 'ready') {
					clearTimeout(t);
					queueMicrotask(() => stop());
					resolve();
				}
			});
		});
		const restored = await restoreVault([file]);
		says = restored.ok ? '' : restored.says;
		if (typeof window !== 'undefined') goto('/');
	}

	async function run(fn: () => ReturnType<typeof unlock>) {
		says = '';
		working = true;
		const before = firstDid;
		const out = await fn();
		working = false;
		if (!out.ok) {
			says = out.says;
			needsBackup = !!out.needsEnvelope;
			return;
		}
		needsBackup = false;
		via = out.via ?? '';
		sameAgain = before ? out.identity.did === before : null;
		// After successful sign-in, redirect to dashboard
		if (out.ok && typeof window !== 'undefined' && !stay) {
			goto('/');
		}
	}

	/*
	 * Signing out offers to note where the vault is on the passkey first
	 * (ADR-Q-012) — asked in Q's own words (NoteTouch), then signs out either way.
	 */
	let noting = $state(false);
	/*
	 * First, carry everything out to your backups and wait for it (2 October
	 * 2026: a call made on the phone never reached the desktop, because
	 * signing out didn't wait for the copy). Then the note, then out.
	 */
	let saving = $state('');
	async function signOutHere() {
		saving = 'Saving to your backups…';
		const out = await flushSync();
		saving = out.says;
		if (!out.ok) await new Promise((r) => setTimeout(r, 2500));
		noting = true;
	}
	function leaveNow() {
		signOut();
		/*
		 * A full load of the home page, not goto('/'): storage is cleared above,
		 * but the page itself still held the last person — their bell, their
		 * announcements, their open line to the bellboy, their ledger. Loading
		 * afresh drops all of it, so the next person starts clean, with no
		 * "empty the cache" needed.
		 */
		location.replace('/');
	}
</script>

{#if recovery.active}
	<!-- Lost the passkey: the ritual stays on screen through the sign-in it causes. -->
	<RecoverWithCard />
{:else if !supported}
	<div class="panel-warn"><p>This browser does not do passkeys.</p></div>
{:else if !identity}
	<div class="stack-tight">
		<fieldset class="stack-tight">
			<legend class="text-sm text-surface-950-50">Where is your passkey?</legend>
			<div class="actions" role="radiogroup">
				{#each KEY_PLACES as p (p.id)}
					<label class="btn btn-sm {place === p.id ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'} cursor-pointer">
						<input type="radio" class="sr-only" name="key-place" value={p.id} bind:group={place} />
						{p.label}
					</label>
				{/each}
			</div>
			{#if placeInfo}<p class="hint">{placeInfo.says}</p>{/if}
		</fieldset>
		<div class="actions">
			<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void run(() => unlock(place))}>
				{working ? 'Waiting for your passkey…' : place === 'device' ? 'Sign in with my fingerprint' : place === 'phone' ? 'Sign in with my phone' : 'Sign in with my security key'}
			</button>
			{#if !making}
				<button type="button" class="btn preset-outlined-surface-500" onclick={() => (making = true)}>First time? Make a passkey</button>
			{/if}
		</div>
		<button type="button" class="btn btn-sm preset-tonal self-start" onclick={() => (recovery.active = true)}>Lost your passkey? Use your recovery card</button>
		{#if needsBackup}
			<div class="card preset-tonal-primary p-4 stack-tight" role="region" aria-label="Open with your backup">
				<p class="font-medium">This passkey is a way back into your vault</p>
				<p class="text-sm">It is not a new identity. Choose your latest backup — the zip that Back up now made — and you will be signed in as you, with your vault opened from it.</p>
				<div>
					<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => backupInput?.click()}>Choose your backup</button>
					<input bind:this={backupInput} type="file" class="sr-only" accept=".zip,application/zip" onchange={(e) => void fromBackup(e)} />
				</div>
			</div>
		{/if}
		{#if making}
			<div class="panel-quiet stack-tight">
				<label class="block">
					<span class="text-sm text-surface-900-100">A name for it in your keychain</span>
					<input class="input mt-1" bind:value={label} />
				</label>
				<p class="hint">
					{place === 'device'
						? 'Your device saves it in its keychain. Choose one that syncs to have the same identity on your other devices.'
						: place === 'phone'
							? 'Your browser shows a QR code; scan it with your phone to make the passkey there.'
							: 'Plug in or tap your security key when asked. It must support FIDO2 hmac-secret.'}
				</p>
				<div class="actions">
					<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void run(() => makePasskey(label, place))}>
						Make my passkey
					</button>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<div class="stack-tight">
		<div class="field-list">
			<div class="field-row">
				<span class="field-label">Your DID</span>
				<span class="field-value token-value">{identity.did}</span>
			</div>
			<div class="field-row">
				<span class="field-label">Fingerprint</span>
				<span class="field-value token-value">{print}</span>
			</div>
			{#if via && !compact}
				<div class="field-row">
					<span class="field-label">Opened with</span>
					<span class="field-value">{via}</span>
				</div>
			{/if}
			{#if sameAgain !== null && !compact}
				<div class="field-row">
					<span class="field-label">Signed in again</span>
					<span class="field-value">
						{sameAgain ? 'Same identity as before — rebuilt from your passkey, stored nowhere.' : 'A different identity: that was a different passkey.'}
					</span>
				</div>
			{/if}
		</div>
		{#if !compact}
			<div class="actions">
				<button type="button" class="btn preset-outlined-surface-500" disabled={working} onclick={() => void run(() => unlock(keyPlace()))}>Sign in again to check</button>
				{#if showOut}<button type="button" class="btn preset-outlined-surface-500" disabled={!!saving && !noting} onclick={() => void signOutHere()}>{saving && !noting ? 'Saving…' : 'Sign out'}</button>{/if}
				{#if saving}<p class="text-sm" aria-live="polite">{saving}</p>{/if}
			</div>
		{/if}
	</div>
{/if}
{#if says}
	<p class="mt-2 text-sm text-warning-700-300" aria-live="polite">{says}</p>
{/if}

<NoteTouch bind:open={noting} title="note.title.signout" onfinish={leaveNow} />
