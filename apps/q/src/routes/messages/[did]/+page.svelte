<script lang="ts">
	/*
	 * A conversation with one person you're linked with (2 October 2026). Their
	 * card at the top with Call; the messages both of you signed, oldest first;
	 * one box to write in. It only opens for someone there's already a receipt
	 * with — the link-up — so there's always someone known on the other end.
	 */
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { Empty, Icon } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { sendTo, threadWith } from '$lib/messages';
	import { markRead } from '$lib/announcements';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const them = $derived(decodeURIComponent(page.params.did ?? ''));
	const person = $derived(peopleFrom(ledger, identity?.did ?? '').find((p) => p.did === them));
	const thread = $derived(identity ? threadWith(ledger?.receipts ?? [], identity.did, them) : []);

	/* Reading it marks their messages read. */
	$effect(() => {
		const theirs = thread.filter((m) => m.did === them).map((m) => m.contentHash);
		if (theirs.length) markRead(...theirs);
	});

	let list = $state<HTMLElement | null>(null);
	$effect(() => {
		void thread.length;
		void tick().then(() => list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }));
	});

	let text = $state('');
	let sending = $state(false);
	let says = $state('');
	async function send() {
		if (!person || !text.trim()) return;
		sending = true;
		says = '';
		const out = await sendTo(person, { kind: 'message', text: text.trim() });
		sending = false;
		if (!out.ok) return void (says = out.says);
		text = '';
		await refreshLedger();
	}
	const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
</script>

<svelte:head><title>{person?.name ?? 'Messages'} — Q</title></svelte:head>

{#if !identity}
	<div class="panel"><SignIn /></div>
{:else if ledger?.state !== 'ready'}
	<p class="opacity-60">Opening…</p>
{:else if !person}
	<Empty icon="message" title="You’re not linked with them" description="A conversation opens once you’ve linked up through a card.">
		<a class="btn preset-tonal min-h-11" href="/messages">Back to messages</a>
	</Empty>
{:else}
	<div class="flex flex-col gap-4 h-[calc(100dvh-12rem)] min-h-96">
		<!-- Who: their face, name, and Call. -->
		<header class="card preset-outlined-surface-200-800 bg-surface-50-950 p-3 flex items-center gap-3">
			<a href="/messages" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="All messages"><Icon name="arrowLeft" /></a>
			<span class="size-12 shrink-0 overflow-hidden rounded-full bg-surface-100-900 flex items-center justify-center">
				{#if person.picture}<img src={person.picture} alt="" class="size-full object-cover" />{:else}<span class="font-bold opacity-70">{person.name.slice(0, 1)}</span>{/if}
			</span>
			<span class="flex-1 min-w-0">
				<span class="block font-bold">{person.name}</span>
				<span class="block text-xs opacity-60">Sealed for {person.name.split(' ')[0]} only</span>
			</span>
			<a class="btn preset-tonal min-h-11" href="/call?with={encodeURIComponent(person.did)}"><Icon name="video" size={18} /> Call</a>
		</header>

		<!-- The conversation. -->
		<div bind:this={list} class="flex-1 overflow-y-auto flex flex-col gap-2 px-1" aria-live="polite">
			{#if !thread.length}
				<p class="m-auto opacity-60 text-center">Say hello to {person.name.split(' ')[0]}.</p>
			{/if}
			{#each thread as m (m.signature)}
				{@const mine = m.did === identity.did}
				<div class="max-w-[80%] {mine ? 'self-end' : 'self-start'}">
					<p class="card px-4 py-2 whitespace-pre-line {mine ? 'preset-filled-primary-500' : 'preset-tonal-surface'}">{m.content.text}</p>
					<p class="text-xs opacity-50 mt-1 {mine ? 'text-right' : ''}">{time(m.content.at)}</p>
				</div>
			{/each}
		</div>

		<!-- Write. Enter sends; Shift+Enter is a new line. -->
		<form class="flex items-end gap-2" onsubmit={(e) => { e.preventDefault(); void send(); }}>
			<textarea
				class="textarea flex-1"
				rows="2"
				bind:value={text}
 aria-label="Write to {person.name.split(' ')[0]}"
				aria-label="Your message"
				onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
			></textarea>
			<button type="submit" class="btn preset-filled-primary-500 min-h-11" disabled={sending || !text.trim() || !person.inbox}>{sending ? 'Sending…' : 'Send'}</button>
		</form>
		{#if !person.inbox}<p class="text-sm opacity-70">Their card came from an older Q, so there's nowhere to write to them yet. Ask them to share their card again.</p>{/if}
		{#if says}<p class="text-sm card preset-tonal-error p-3">{says}</p>{/if}
	</div>
{/if}
