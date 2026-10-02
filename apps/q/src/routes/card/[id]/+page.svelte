<script lang="ts">
	/*
	 * A card someone shared with you by a short link (2 October 2026):
	 * inqbeta.com/card/<id>#<key>. The card waits, locked, in the storage
	 * unit; the key is in the #fragment, so only this browser can open it.
	 *
	 * Signed in, it opens in a drawer over your Overview — the way the bell's
	 * drawer opens a receipt (Darren: "that would look lovely in the drawer, a
	 * card opening like that"). Not signed in, nothing of theirs is shown:
	 * "someone wants to connect", and the sign-in. Opening claims it, so only
	 * the first person to open it (and whoever made it) ever can.
	 */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import CardArrived from '$lib/components/CardArrived.svelte';
	import SomeoneWants from '$lib/components/SomeoneWants.svelte';
	import { openCardDrop } from '$lib/cardlink';

	let identity = $state<Identity | null>(null);
	let answered = $state(false);
	$effect(() =>
		watch((id) => {
			identity = id;
			answered = true;
		})
	);
	const id = $derived(page.params.id ?? '');
	/* Read once: the key is never sent anywhere, and stays out of history. */
	const key = typeof location === 'undefined' ? '' : location.hash;
	const open = () => openCardDrop(id, key);
	let drawer = $state(true);
</script>

<svelte:head><title>A card for you — Q</title></svelte:head>

{#if answered && identity}
	<Dialog open={drawer} onOpenChange={(e) => { if (!e.open) { drawer = false; void goto('/'); } }}>
		<Portal>
			<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
			<Dialog.Positioner class="fixed inset-0 z-50 flex justify-end">
				<Dialog.Content class="h-full w-full max-w-lg card bg-surface-50-950 p-6 shadow-xl overflow-y-auto">
					<header class="flex items-center justify-between mb-6">
						<span class="badge preset-filled-primary-500">A card for you</span>
						<button type="button" class="btn btn-sm preset-tonal-surface min-h-11" onclick={() => { drawer = false; void goto('/'); }}>Close</button>
					</header>
					<CardArrived {open} />
				</Dialog.Content>
			</Dialog.Positioner>
		</Portal>
	</Dialog>
{:else if answered}
	<!-- Signed out: who it's from stays hidden until you sign in. -->
	<SomeoneWants />
{/if}
