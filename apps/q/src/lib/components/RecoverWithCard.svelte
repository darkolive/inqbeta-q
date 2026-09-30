<script lang="ts">
	/*
	 * Lost your passkey? The recovery ritual — ADR-Q-005 step 5, and the
	 * incubator's catastrophic-recovery charter §3:
	 *
	 *   Find → Unlock → Sign → Reconnect
	 *
	 * One step on screen at a time. Pausing is always allowed and never costs
	 * anything. The first word is never "restore", "reset" or "verify your
	 * identity" — you are not proving yourself to anyone; you are unlocking
	 * what you already hold.
	 */
	import { goto } from '$app/navigation';
	import { envelopesHere, type Envelope } from '@inqbeta/q-core/continuity';
	import { envelopeFromBackup, recoverWithCard } from '@inqbeta/q-core/ways-back-in';
	import { restoreVault, watchFolder } from '@inqbeta/q-core/folder';
	import { endRecovery, recovery, type RecoveryStep as Step } from '$lib/recovery.svelte';

	const STEPS: { id: Step; says: string }[] = [
		{ id: 'find', says: 'Find' },
		{ id: 'unlock', says: 'Unlock' },
		{ id: 'sign', says: 'Sign' },
		{ id: 'reconnect', says: 'Reconnect' }
	];

	let known = $state<Envelope[]>([]);
	let card = $state('');
	let working = $state(false);
	let says = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		void envelopesHere().then((e) => (known = e)).catch(() => (known = []));
	});

	const short = (did: string) => `…${did.slice(-8)}`;

	function pause() {
		const wasIn = !!recovery.recovered;
		endRecovery();
		if (wasIn) goto('/');
	}

	async function chooseBackup(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		working = true;
		says = '';
		const got = await envelopeFromBackup(file);
		working = false;
		if (!got.ok) {
			says = got.says;
			return;
		}
		if (!got.envelope.wraps.some((w) => w.kind === 'recovery')) {
			says = 'That backup was made before you had a recovery card. Choose a newer one.';
			return;
		}
		recovery.envelope = got.envelope;
		recovery.backup = file;
		recovery.step = 'unlock';
	}

	function useKnown(e: Envelope) {
		if (!e.wraps.some((w) => w.kind === 'recovery')) {
			says = 'This browser remembers that identity, but no recovery card had been made for it yet.';
			return;
		}
		recovery.envelope = e;
		recovery.step = 'unlock';
	}

	async function unlock() {
		if (!recovery.envelope) return;
		working = true;
		says = '';
		const out = await recoverWithCard(recovery.envelope, card);
		working = false;
		if (!out.ok) {
			says = out.says;
			return;
		}
		card = '';
		recovery.recovered = out.recovered;
		recovery.step = 'sign';
		/* Signed in now: carry on under Keys, where the ritual stays on screen. */
		goto('/keys');
	}

	async function addDevice() {
		if (!recovery.recovered) return;
		working = true;
		says = '';
		const out = await recovery.recovered.addThisDevice('Q — this device');
		working = false;
		if (!out.ok) {
			says = out.cancelled ? '' : out.says;
			return;
		}
		recovery.added = true;
	}

	function vaultReady(): Promise<void> {
		return new Promise((resolve) => {
			let stop = () => {};
			const t = setTimeout(() => {
				stop();
				resolve();
			}, 5000);
			stop = watchFolder((s) => {
				if (s.kind === 'ready') {
					clearTimeout(t);
					queueMicrotask(() => stop());
					resolve();
				}
			});
		});
	}

	async function reconnect(file: File | null) {
		if (!file) return finish();
		working = true;
		says = '';
		await vaultReady();
		const out = await restoreVault([file]);
		working = false;
		if (!out.ok) {
			says = out.says;
			return;
		}
		finish();
	}

	async function pickAndReconnect(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (file) await reconnect(file);
	}

	function finish() {
		endRecovery();
		goto('/');
	}
</script>

<div class="card preset-tonal p-4 stack-tight" role="region" aria-label="Use your recovery card">
	<ol class="flex gap-3 text-xs" aria-label="Steps">
		{#each STEPS as s (s.id)}
			<li class={s.id === recovery.step ? 'font-semibold' : 'opacity-50'} aria-current={s.id === recovery.step ? 'step' : undefined}>{s.says}</li>
		{/each}
	</ol>

	{#if recovery.step === 'find'}
		<p class="font-medium">Find your continuity file</p>
		<p class="text-sm opacity-80">It is inside every backup made since you created your recovery card. Have your card to hand too.</p>
		{#each known as e (e.did)}
			<button type="button" class="btn preset-outlined-surface-500 justify-start" onclick={() => useKnown(e)}>
				Use the one this browser remembers — {short(e.did)}
			</button>
		{/each}
		<div>
			<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => fileInput?.click()}>Choose your latest backup</button>
			<input bind:this={fileInput} type="file" class="sr-only" accept=".zip,application/zip" onchange={(e) => void chooseBackup(e)} />
		</div>
	{:else if recovery.step === 'unlock'}
		<p class="font-medium">Unlock with your recovery card</p>
		<p class="text-sm opacity-80">Type all eleven groups. Spaces, dashes and capitals do not matter. Take your time.</p>
		<textarea class="textarea font-mono uppercase" rows="3" autocomplete="off" spellcheck="false" bind:value={card} aria-label="Recovery card"></textarea>
		<div class="actions">
			<button type="button" class="btn preset-filled-primary-500" disabled={working || card.replace(/[\s-]/g, '').length < 50} onclick={() => void unlock()}>
				{working ? 'Unlocking…' : 'Unlock'}
			</button>
		</div>
	{:else if recovery.step === 'sign' && recovery.recovered}
		<p class="font-medium">You are signing as yourself again — {short(recovery.recovered.identity.did)}</p>
		<p class="text-sm opacity-80">
			The same identity as before: the same DID, the same sealed keys. So that next time is one touch, add a passkey on this device as a way back in.
		</p>
		{#if recovery.added}
			<p class="text-sm">This device's passkey is now a way back in.</p>
		{/if}
		<div class="actions">
			{#if !recovery.added}
				<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void addDevice()}>{working ? 'Waiting for your passkey…' : 'Add this device'}</button>
			{/if}
			<button type="button" class={recovery.added ? 'btn preset-filled-primary-500' : 'btn preset-outlined-surface-500'} disabled={working} onclick={() => (recovery.step = 'reconnect')}>
				{recovery.added ? 'Next' : 'Not now'}
			</button>
		</div>
	{:else if recovery.step === 'reconnect'}
		<p class="font-medium">Reconnect your vault</p>
		{#if recovery.backup}
			<p class="text-sm opacity-80">Open your vault from the backup you chose — {recovery.backup.name}. It is checked file by file.</p>
			<div class="actions">
				<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void reconnect(recovery.backup)}>{working ? 'Opening…' : 'Open my vault'}</button>
				<button type="button" class="btn preset-outlined-surface-500" disabled={working} onclick={finish}>Later</button>
			</div>
		{:else}
			<p class="text-sm opacity-80">Choose a backup to open your vault here, or do it later from the Overview.</p>
			<div class="actions">
				<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => fileInput?.click()}>Choose a backup</button>
				<input bind:this={fileInput} type="file" class="sr-only" accept=".zip,application/zip" onchange={(e) => void pickAndReconnect(e)} />
				<button type="button" class="btn preset-outlined-surface-500" disabled={working} onclick={finish}>Later</button>
			</div>
		{/if}
	{/if}

	{#if says}<p class="text-sm text-warning-700-300" role="status" aria-live="polite">{says}</p>{/if}

	<button type="button" class="btn btn-sm preset-outlined-surface-500 self-start" disabled={working} onclick={pause}>Pause — nothing is lost</button>
</div>
