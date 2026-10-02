<script lang="ts">
	/*
	 * Set up your host (ADR-Q-018). Only on your own computer: a fresh copy
	 * opens here, and the first passkey made founds the host.
	 *
	 * A copy arrives with the master's own host file. So when there is one and
	 * this computer hasn't been set up, the first question is which you are:
	 * someone setting up their own host, or that host's founder (proved with
	 * the founder's passkey, never just said).
	 */
	import { goto } from '$app/navigation';
	import { dev } from '$app/environment';
	import { Page, Icon } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import HostSteps from '$lib/components/HostSteps.svelte';
	import SignInBlock from '$lib/components/SignInBlock.svelte';
	import { claimHost, localHost, type LocalHost } from '$lib/host-setup';

	let identity = $state<Identity | null>(null);
	$effect(() => watch((id) => (identity = id)));

	let host = $state<LocalHost | null>(null);
	let asked = $state(false);
	$effect(() => {
		void localHost().then((h) => {
			host = h;
			asked = true;
		});
	});

	/* Came with a host file: 'own' sets up a new host, 'founder' claims this one. */
	let choice = $state<'own' | 'founder' | null>(null);
	let says = $state('');
	let busy = $state(false);
	async function claim() {
		if (!identity || !host?.file) return;
		busy = true;
		says = '';
		const out = await claimHost(identity, host.file.federation);
		busy = false;
		if (!out.ok) return void (says = out.says);
		await goto('/');
	}
	const needsChoice = $derived(!!host?.file?.holds && !host.mark);
</script>

<Page title="Set up your host" lead="A few cards, one question each. When you’re done, your host is founded and ready to go live.">
	{#if !dev}
		<p class="card preset-tonal-surface p-4">Setting up a host happens on your own computer, in your copy of Q. This live site is already set up.</p>
	{:else if !asked}
		<p class="opacity-70">Looking at this copy…</p>
	{:else if !host}
		<p class="card preset-tonal-error p-4">The set-up server didn’t answer. Is this copy running with <code>pnpm dev</code>?</p>
	{:else if host.mark}
		<div class="card preset-tonal-success p-4 flex items-start gap-3">
			<Icon name="check" class="mt-0.5 shrink-0" />
			<div>
				<p class="font-bold">This computer’s host is set up</p>
				<p class="text-sm">{host.file?.name ?? 'Your host'}, {host.mark.how === 'founded' ? 'founded here' : 'proved by its founder'} on {new Date(host.mark.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
			</div>
		</div>
		<a class="btn preset-filled-primary-500 min-h-11 self-start" href="/federations">Go to your host</a>
	{:else if needsChoice && choice === null}
		<p class="mb-4">This copy came with <strong>{host.file?.name}</strong>’s host file. Which are you?</p>
		<div class="grid gap-4 sm:grid-cols-2 max-w-3xl">
			<button type="button" class="card preset-outlined-surface-200-800 hover:preset-tonal p-5 text-left flex flex-col gap-2 min-h-11" onclick={() => (choice = 'own')}>
				<span class="font-bold flex items-center gap-2"><Icon name="plus" /> Set up my own host</span>
				<span class="text-sm opacity-80">Your own name, logo and agreement. {host.file?.name}’s file is replaced in your copy.</span>
			</button>
			<button type="button" class="card preset-outlined-surface-200-800 hover:preset-tonal p-5 text-left flex flex-col gap-2 min-h-11" onclick={() => (choice = 'founder')}>
				<span class="font-bold flex items-center gap-2"><Icon name="key" /> I’m {host.file?.name}’s founder</span>
				<span class="text-sm opacity-80">Prove it with the passkey that founded it. Nothing changes.</span>
			</button>
		</div>
	{:else if needsChoice && choice === 'founder'}
		<div class="flex flex-col gap-4 max-w-xl">
			{#if !identity}
				<SignInBlock stay title="Sign in as the founder" line={`Use the passkey that founded ${host.file?.name}.`} />
			{:else}
				<p>Touch your passkey to prove you founded <strong>{host.file?.name}</strong>.</p>
				<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy} onclick={() => void claim()}>{busy ? 'Checking…' : 'Prove it'}</button>
			{/if}
			<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => ((choice = null), (says = ''))}>Back</button>
			{#if says}<p class="text-sm card preset-tonal-error p-3" aria-live="polite">{says}</p>{/if}
		</div>
	{:else}
		<HostSteps onDone={() => void goto('/federations')} />
	{/if}
</Page>
