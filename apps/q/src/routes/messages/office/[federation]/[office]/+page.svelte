<script lang="ts">
	/*
	 * A conversation with an office (ADR-Q-037; ADR-Q-038, 6 October 2026),
	 * shown as the federation: its logo and name, and the office. Darren: "if
	 * you ask the officer, treasurer, for example, a question, then whoever is
	 * in that role receives that question and responds in the capacity of that
	 * role … any messages you see relating to a federation would appear as the
	 * federation and the officer responding."
	 *
	 * Writing goes to whoever holds the office now. Out of their hours, it says
	 * so before you send, and your message waits for them.
	 */
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { Empty, Icon } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { askOffice } from '$lib/messages';
	import { officeConversation, officeHoldersNow, federationLook } from '$lib/office-post';
	import { officeName } from '$lib/role.svelte';
	import { markRead } from '$lib/announcements';
	import { hoursInWords, inHours, type OfficeAddress } from '@inqbeta/q-core/offices';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const federation = $derived(decodeURIComponent(page.params.federation ?? ''));
	const office = $derived(decodeURIComponent(page.params.office ?? ''));
	const called = $derived(officeName(office));
	const thread = $derived(identity ? officeConversation(ledger?.receipts ?? [], identity.did, federation, office) : []);
	const theirName = $derived(thread.map((m) => m.content.fromOffice?.name).find(Boolean));

	let look = $state<{ name: string; logo?: string } | null>(null);
	$effect(() => void federationLook(federation, theirName).then((l) => (look = l)));
	let holders = $state<OfficeAddress[] | null>(null);
	$effect(() => void officeHoldersNow(federation, office).then((h) => (holders = h)));
	/* Out of hours when nobody holding it is in their hours just now. */
	const outOfHours = $derived(!!holders?.length && holders.every((h) => !inHours(h.hours)));

	$effect(() => {
		const theirs = thread.filter((m) => m.did !== identity?.did).map((m) => m.contentHash);
		if (theirs.length) markRead(...theirs);
	});
	let list = $state<HTMLElement | null>(null);
	$effect(() => {
		void thread.length;
		void tick().then(() => list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }));
	});

	let text = $state('');
	let busy = $state(false);
	let said = $state<{ good: boolean; text: string } | null>(null);
	async function send() {
		if (!holders?.length) return;
		busy = true;
		said = null;
		const out = await askOffice(holders, { federation, office }, text);
		busy = false;
		if (!out.ok) return void (said = { good: false, text: out.says });
		text = '';
		said = outOfHours ? { good: true, text: `Left for the ${called.toLowerCase()}. It’s waiting for them.` } : null;
		await refreshLedger();
	}
	const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>

<svelte:head><title>{called} · {look?.name ?? 'Federation'} — Q</title></svelte:head>

{#if !identity}
	<div class="panel"><SignIn /></div>
{:else if ledger?.state !== 'ready'}
	<p class="opacity-60">Opening…</p>
{:else}
	<div class="flex flex-col gap-4">
		<!-- The federation, and the office: never the face of whoever holds it. -->
		<header class="card preset-outlined-surface-200-800 bg-surface-50-950 p-3 flex items-center gap-3">
			<a href="/messages" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="All messages"><Icon name="arrowLeft" /></a>
			<span class="size-12 shrink-0 overflow-hidden rounded-full bg-surface-100-900 flex items-center justify-center">
				{#if look?.logo}<img src={look.logo} alt="" class="size-full object-contain" />{:else}<Icon name="federations" />{/if}
			</span>
			<span class="flex-1 min-w-0">
				<span class="block font-bold">{called} · {look?.name ?? 'A federation'}</span>
				<span class="block text-xs opacity-60">Answered by whoever holds the office, for {look?.name ?? 'the federation'}</span>
			</span>
		</header>

		<div bind:this={list} class="h-[55dvh] min-h-80 overflow-y-auto flex flex-col gap-3 px-1" aria-live="polite">
			{#if !thread.length}
				<Empty icon="message" title="Nothing yet" description="Write to the {called.toLowerCase()} below. Whoever holds the office will see it." />
			{:else}
				{#each thread as m (m.signature)}
					{@const mine = m.did === identity.did}
					<div class="flex flex-col gap-1 max-w-[85%] {mine ? 'self-end items-end' : 'self-start items-start'}">
						<span class="text-xs opacity-60">{mine ? 'You' : `${called} · ${look?.name ?? m.content.fromOffice?.name ?? ''}`} · {time(m.content.at)}</span>
						<p class="card px-4 py-2 whitespace-pre-line {mine ? 'preset-filled-primary-500' : 'preset-filled-surface-200-800'}">{m.content.text}</p>
					</div>
				{/each}
			{/if}
		</div>

		{#if holders === null}
			<p class="opacity-60 text-sm">Finding who holds the office…</p>
		{:else if !holders.length}
			<p class="card preset-tonal p-4">Nobody holds the office just now. Ask {look?.name ?? 'the federation'}’s caretaker instead.</p>
		{:else}
			{#if outOfHours}
				<!-- Out of hours: said before you send, and your message waits (Darren: "you can always automatically leave a message"). -->
				<p class="card preset-tonal-warning p-3 text-sm" role="status">Out of hours. The {called.toLowerCase()}’s hours are {hoursInWords(holders[0].hours!)}. Leave your message: it’ll be waiting for them.</p>
			{/if}
			<div class="flex flex-col gap-2">
				<p class="text-xs opacity-70">This goes to the office’s records: whoever holds the office, now or later, can read it.</p>
				<label class="label"><span class="label-text">{outOfHours ? 'Leave a message' : `Write to the ${called.toLowerCase()}`}</span><textarea class="textarea" rows="3" bind:value={text}></textarea></label>
				<button type="button" class="btn preset-filled-primary-500 min-h-11 self-end" disabled={busy || !text.trim()} onclick={() => void send()}>{busy ? 'Sending…' : outOfHours ? 'Leave it' : 'Send'}</button>
				{#if said}<p class="text-sm card p-2 {said.good ? 'preset-tonal-success' : 'preset-tonal-error'}" aria-live="polite">{said.text}</p>{/if}
			</div>
		{/if}
	</div>
{/if}
