<script lang="ts">
	/*
	 * Who you are, in the header, from anywhere.
	 *
	 * Four states:
	 *   signed out   press to sign in
	 *   resumable    a DID is remembered; press to carry on with your passkey
	 *   working      waiting for the passkey prompt
	 *   signed in    press to see who you are — and to leave
	 *
	 * The sign-out used to live only inside the panel on /keys, and a guard made
	 * /keys unreachable while signed in, so there was no way out of the app at
	 * all. Leaving belongs where you always are, which is the header.
	 */
	import { remembered, signOut as leave, unlock, watch, type Identity } from '@inqbeta/q-core/passkey';
	import { Avatar, Icon } from '@inqbeta/q-ui';
	import { fingerprint } from '$lib/fingerprint';

	let identity = $state<Identity | null>(null);
	let known = $state<string | null>(null);
	let working = $state(false);
	let says = $state('');
	let open = $state(false);
	let print = $state('');

	$effect(() => {
		known = remembered();
		return watch((id) => {
			identity = id;
			known = id?.did ?? remembered();
			if (!id) open = false;
			print = '';
			if (id) void fingerprint(id.publicKey).then((f) => (print = f));
		});
	});

	async function signIn() {
		says = '';
		working = true;
		const out = await unlock();
		working = false;
		if (!out.ok) says = out.says;
	}

	function press() {
		if (identity) open = !open;
		else void signIn();
	}

	function out() {
		open = false;
		leave();
		/* A full load, so nothing of the last person stays in the page (see SignIn). */
		location.replace('/');
	}

	const label = $derived(
		identity
			? 'You — press to see who you are, or to sign out'
			: working
				? 'Waiting for your passkey'
				: known
					? 'Touch to carry on with your passkey'
					: 'Sign in with your passkey'
	);
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') open = false;
	}}
/>

<div class="relative">
	<button
		type="button"
		aria-label={label}
		title={label}
		aria-haspopup={identity ? 'menu' : undefined}
		aria-expanded={identity ? open : undefined}
		disabled={working}
		onclick={press}
		class="relative inline-flex size-9 items-center justify-center rounded-full border transition-colors
			{identity
				? 'border-primary-500 overflow-hidden'
				: 'border-surface-300-700 text-surface-900-100 hover:border-primary-500 hover:text-primary-600-400'}
			{working ? 'animate-pulse' : ''}"
	>
		{#if identity}
			<Avatar did={identity.did} size={30} label="You" />
		{:else}
			<Icon name="fingerprint" size={18} />
		{/if}
		{#if !identity && known}
			<!-- Remembered, not unlocked -->
			<span class="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface-50-950 bg-primary-500"></span>
		{/if}
	</button>

	{#if identity && open}
		<!-- Closes on a press anywhere else. A backdrop rather than a document
		     listener, so it cannot outlive the menu. -->
		<button type="button" class="fixed inset-0 z-40 cursor-default" aria-label="Close" onclick={() => (open = false)}></button>

		<div
			role="menu"
			class="absolute right-0 top-11 z-50 w-72 card bg-surface-50-950 p-4 shadow-xl stack-tight"
		>
			<div class="flex items-center gap-3">
				<Avatar did={identity.did} size={40} label="You" />
				<div class="min-w-0">
					<p class="text-sm font-medium">Signed in with your passkey</p>
					<p class="text-xs opacity-60">Rebuilt from your passkey, stored nowhere.</p>
				</div>
			</div>

			<div class="field-list">
				<div class="field-row">
					<span class="field-label">Your DID</span>
					<span class="field-value role-token text-xs break-all">{identity.did}</span>
				</div>
				{#if print}
					<div class="field-row">
						<span class="field-label">Fingerprint</span>
						<span class="field-value role-token text-xs">{print}</span>
					</div>
				{/if}
			</div>

			<div class="actions">
				<a class="btn btn-sm preset-outlined-surface-500" href="/keys" onclick={() => (open = false)}>Your keys</a>
				<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={out}>Sign out</button>
			</div>

			<p class="hint">
				Signing out clears what was yours from this browser. Your folder stays where it is, and
				signing back in opens it again.
			</p>
		</div>
	{/if}

	{#if says}
		<p class="absolute right-0 top-11 z-50 w-64 card bg-surface-50-950 p-3 text-sm text-warning-700-300 shadow-xl" aria-live="polite">
			{says}
		</p>
	{/if}
</div>
