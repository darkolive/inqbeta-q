<script lang="ts">
	/*
	 * Back from Google.
	 *
	 * 1. Exchange the code AT ONCE — it expires in minutes and needs no passkey.
	 * 2. Once you are signed in with the vault open (the redirect reloaded the
	 *    page, so the passkey may need one touch), lock the token into the vault.
	 * 3. Go back to Copy locations; the first sync runs there in the
	 *    background rather than holding this page.
	 *
	 * Every step says what it is doing, and every failure says why — this page
	 * used to sit on "Connecting…" when something threw.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Page } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder } from '@inqbeta/q-core/folder';
	import { exchangeGoogleCode, handBackToOpener, saveGoogleToken } from '$lib/google-channel';
	import { syncCloudNow } from '$lib/autosync';
	import SignIn from '$lib/components/SignIn.svelte';

	let identity = $state<Identity | null>(null);
	let ready = $state(false);
	let stage = $state<'exchanging' | 'waiting' | 'saving' | 'done' | 'failed'>('exchanging');
	let says = $state('Talking to Google…');
	let exchanged = false;
	let saved = false;

	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchFolder((s) => (ready = s.kind === 'ready')));

	/* Opened as the small window from Copy locations? Hand the code to the
	 * signed-in tab and close — that tab does the rest and stays signed in. */
	let handedBack = $state(false);

	$effect(() => {
		if (exchanged) return;
		exchanged = true;
		if (handBackToOpener()) {
			handedBack = true;
			stage = 'done';
			says = 'Done — you can close this window. Q carries on in your other tab.';
			return;
		}
		void exchangeGoogleCode(page.url.searchParams).then((out) => {
			if (!out.ok) {
				stage = 'failed';
				says = out.says;
				return;
			}
			stage = 'waiting';
			says = 'Google Drive said yes.';
			/* Take the code out of the address bar, so a reload cannot replay it. */
			history.replaceState(history.state, '', '/channels/google');
		});
	});

	$effect(() => {
		if (stage !== 'waiting' || !identity || !ready || saved) return;
		saved = true;
		stage = 'saving';
		says = 'Locking the connection into your vault…';
		void saveGoogleToken().then((out) => {
			if (!out.ok) {
				stage = 'failed';
				says = out.says;
				return;
			}
			stage = 'done';
			says = 'Connected. The first copy is running in the background.';
			void syncCloudNow().catch(() => {});
			setTimeout(() => goto('/nodes'), 800);
		});
	});
</script>

<Page title="Google Drive" lead="A storage channel: it carries locked files. It never signs you in to Q.">
	<p class={stage === 'failed' ? 'text-error-600-400' : ''} role="status" aria-live="polite">{says}</p>
	{#if stage === 'waiting' && !handedBack && (!identity || !ready)}
		<p class="mt-3 text-sm">Touch your passkey to finish — the connection is saved into your vault, locked to you.</p>
		{#if !identity}<div class="panel mt-3"><SignIn showOut={false} stay /></div>{/if}
	{/if}
	{#if stage === 'failed'}<p class="mt-3"><a class="anchor" href="/nodes">Back to Copy locations</a></p>{/if}
</Page>
