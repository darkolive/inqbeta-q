<script lang="ts">
	/*
	 * An offer someone shared with you by link (ADR-Q-026, 3 October 2026):
	 * inqbeta.com/offer/<id>#<key>. It waits locked in the storage; the key is
	 * in the #fragment, so only this browser can open it, and the first person
	 * to open it keeps it.
	 *
	 * Signed in: the offer is opened, kept in your vault, and you're linked up
	 * with whoever made it; then it opens as an agreement, where you can
	 * accept, counteroffer or decline. Signed out: nothing of theirs is shown,
	 * just that someone has made you an offer, and the sign-in.
	 */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { Icon } from '@inqbeta/q-ui';
	import SignInBlock from '$lib/components/SignInBlock.svelte';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { openOfferDrop, takeOfferIn } from '$lib/offerlink';

	let identity = $state<Identity | null>(null);
	let answered = $state(false);
	let ledger = $state<Ledger | null>(null);
	$effect(() =>
		watch((id) => {
			identity = id;
			answered = true;
		})
	);
	$effect(() => watchLedger((l) => (ledger = l)));
	const id = $derived(page.params.id ?? '');
	/* Read once: the key is never sent anywhere. */
	const key = typeof location === 'undefined' ? '' : location.hash;

	let says = $state('');
	let started = false;
	$effect(() => {
		if (!identity || started) return;
		started = true;
		void (async () => {
			const opened = await openOfferDrop(id, key);
			if (!opened.ok) {
				says = opened.says;
				return;
			}
			try {
				const agreement = await takeOfferIn(opened, ledger);
				void goto(`/agreements/${encodeURIComponent(agreement)}`, { replaceState: true });
			} catch (e) {
				says = e instanceof Error ? e.message : 'The offer couldn’t be kept.';
			}
		})();
	});
</script>

<svelte:head><title>An offer for you — Q</title></svelte:head>

{#if answered && identity}
	<div class="py-12 flex flex-col items-center gap-4 text-center">
		{#if says}
			<p class="card preset-tonal-warning p-4 max-w-lg">{says}</p>
			<a href="/agreements" class="btn preset-tonal min-h-11"><Icon name="documents" size={18} /> Your agreements</a>
		{:else}
			<p class="h4">Opening the offer…</p>
			<p class="text-surface-700-300">Checking it, keeping it in your vault, and linking you up with whoever made it.</p>
		{/if}
	</div>
{:else if answered}
	<!-- Signed out: who it's from stays hidden until you sign in. -->
	<div class="py-8">
		<SignInBlock title="Someone has made you an offer" line="Sign in to see it. It opens only for you: once you’ve opened it, nobody else can." stay />
	</div>
{/if}
