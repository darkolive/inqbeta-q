<script lang="ts">
	/*
	 * Back from Dropbox or OneDrive — the same three steps as Google Drive's
	 * return page: exchange the code at once, lock the token into the vault
	 * once signed in, then go to Backups. Opened as the small window, it just
	 * hands the code to the signed-in tab and closes.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Page } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder } from '@inqbeta/q-core/folder';
	import { CLOUDS, exchangeCloudCode, handCloudBack, saveCloudToken, type CloudId } from '$lib/cloud-channels';
	import { syncCloudNow } from '$lib/autosync';
	import SignIn from '$lib/components/SignIn.svelte';

	const cid = $derived(page.params.provider as CloudId);
	const known = $derived(CLOUDS.find((c) => c.id === cid));

	let identity = $state<Identity | null>(null);
	let ready = $state(false);
	let stage = $state<'exchanging' | 'waiting' | 'saving' | 'done' | 'failed'>('exchanging');
	let says = $state('Talking to it…');
	let started = false;
	let saved = false;
	let handedBack = $state(false);

	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchFolder((s) => (ready = s.kind === 'ready')));

	$effect(() => {
		if (started) return;
		started = true;
		if (!known) {
			stage = 'failed';
			says = 'Q doesn’t know that storage.';
			return;
		}
		if (handCloudBack(cid)) {
			handedBack = true;
			stage = 'done';
			says = 'Done — you can close this window. Q carries on in your other tab.';
			return;
		}
		void exchangeCloudCode(cid, page.url.searchParams).then((out) => {
			if (!out.ok) {
				stage = 'failed';
				says = out.says;
				return;
			}
			stage = 'waiting';
			says = `${known.name} said yes.`;
			history.replaceState(history.state, '', `/channels/${cid}`);
		});
	});

	$effect(() => {
		if (stage !== 'waiting' || !identity || !ready || saved) return;
		saved = true;
		stage = 'saving';
		says = 'Locking the connection into your vault…';
		void saveCloudToken(cid).then((out) => {
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

<Page title={known?.name ?? 'Storage'} lead="A place your vault is copied to. It carries locked files; it never signs you in to Q.">
	<p class={stage === 'failed' ? 'text-error-600-400' : ''} role="status" aria-live="polite">{says}</p>
	{#if stage === 'waiting' && !handedBack && (!identity || !ready)}
		<p class="mt-3 text-sm">Touch your passkey to finish — the connection is saved into your vault, locked to you.</p>
		{#if !identity}<div class="panel mt-3"><SignIn showOut={false} stay /></div>{/if}
	{/if}
	{#if stage === 'failed'}<p class="mt-3"><a class="anchor" href="/nodes">Back to Backups</a></p>{/if}
</Page>
