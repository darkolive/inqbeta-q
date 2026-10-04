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
	import { threadWith } from '$lib/messages';
	import Composer from '$lib/components/message/Composer.svelte';
	import AttachmentView from '$lib/components/message/AttachmentView.svelte';
	import { lengthOf } from '$lib/voicemail';
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

	const people = $derived(peopleFrom(ledger, identity?.did ?? ''));
	const isKnown = (did?: string) => !!did && (did === identity?.did || people.some((p) => p.did === did));
	const nameOf = (did: string) => people.find((p) => p.did === did)?.name.split(' ')[0] ?? 'someone';
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
	<div class="flex flex-col gap-4">
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
		<div bind:this={list} class="h-[55dvh] min-h-80 overflow-y-auto flex flex-col gap-3 px-1" data-thread aria-live="polite">
			{#if !thread.length}
				<p class="m-auto opacity-60 text-center">Say hello to {person.name.split(' ')[0]}.</p>
			{/if}
			{#each thread as m (m.signature)}
				{@const mine = m.did === identity.did}
				<div class="max-w-[80%] {mine ? 'self-end' : 'self-start'}">
					{#if m.content.kind === 'voicemail' && m.content.audio}
						<!-- A voice message (ADR-Q-022), left after a call wasn't answered. -->
						<div class="card px-4 py-3 space-y-2 {mine ? 'preset-filled-primary-500' : 'preset-filled-surface-200-800'}">
							<p class="flex items-center gap-2 text-sm font-semibold"><Icon name="mic" size={16} /> Voice message · {lengthOf(m.content.seconds ?? 0)}</p>
							<audio controls preload="none" src={m.content.audio} class="max-w-full"></audio>
						</div>
					{:else}
						{@const pics = (m.content.attachments ?? []).filter((a) => a.kind === 'picture')}
						{@const rest = (m.content.attachments ?? []).filter((a) => a.kind !== 'picture')}
						<div class="flex flex-col gap-2 {mine ? 'items-end' : 'items-start'}">
							{#if pics.length}
								<!-- Pictures as a grid (Skeleton's image layouts): one big, or two to a row. -->
								<div class="grid gap-1 w-72 max-w-full {pics.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}">
									{#each pics as a (a.sha256)}<AttachmentView {a} compact={pics.length > 1} {mine} />{/each}
								</div>
							{/if}
							{#if m.content.text}
								<p class="card px-4 py-2 whitespace-pre-line {mine ? 'preset-filled-primary-500' : 'preset-filled-surface-200-800'}">{m.content.text}</p>
							{/if}
							{#if m.content.audio}
								<div class="card px-4 py-3 space-y-2 {mine ? 'preset-filled-primary-500' : 'preset-filled-surface-200-800'}">
									<p class="flex items-center gap-2 text-sm font-semibold"><Icon name="mic" size={16} /> Voice note · {lengthOf(m.content.seconds ?? 0)}</p>
									<audio controls preload="none" src={m.content.audio} class="max-w-full"></audio>
								</div>
							{/if}
							{#each rest as a, i (i)}
								<div class="w-80 max-w-full"><AttachmentView {a} {mine} known={isKnown(a.did)} /></div>
							{/each}
							{#if mine && m.content.alsoTo?.length}<p class="text-xs opacity-60">Also sent to {m.content.alsoTo.map(nameOf).join(', ')}</p>{/if}
						</div>
					{/if}
					<p class="text-xs opacity-50 mt-1 {mine ? 'text-right' : ''}">{time(m.content.at)}</p>
				</div>
			{/each}
		</div>

		<!-- Write: the same message card as everywhere, with the person already chosen. -->
		<Composer {identity} {ledger} {people} to={person} onSent={() => void refreshLedger()} />
		{#if !person.inbox}<p class="text-sm opacity-70">Their card came from an older Q, so there's nowhere to write to them yet. Ask them to share their card again.</p>{/if}
	</div>
{/if}
