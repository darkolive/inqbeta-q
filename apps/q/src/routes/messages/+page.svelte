<script lang="ts">
	/*
	 * Messages (2 October 2026): one line per person you're writing with, the
	 * newest first. A conversation only opens with someone you're linked with —
	 * there's a receipt between you already — so there's no "new message to
	 * anyone" box: you start from a person.
	 */
	import { Page, Empty, Icon } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import MessageStory from '$lib/components/MessageStory.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { readIds } from '$lib/announcements';
	import { MESSAGE_SCHEMA } from '@inqbeta/q-core/inbox';
	import type { Signed } from '$lib/messages';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	let seen = $state(readIds());
	$effect(() => {
		const f = () => (seen = readIds());
		window.addEventListener('q-read', f);
		return () => window.removeEventListener('q-read', f);
	});

	const people = $derived(peopleFrom(ledger, identity?.did ?? ''));
	/* The last message with each person, and how many of theirs you haven't read. */
	const threads = $derived.by(() => {
		const me = identity?.did ?? '';
		const by = new Map<string, { last: Signed; unread: number }>();
		for (const r of ledger?.receipts ?? []) {
			const m = r.json as Signed | undefined;
			if (m?.content?.schema !== MESSAGE_SCHEMA || (m.content.kind !== 'message' && m.content.kind !== 'voicemail')) continue;
			const them = m.did === me ? m.content.to : m.did;
			const t = by.get(them) ?? { last: m, unread: 0 };
			if (m.content.at > t.last.content.at) t.last = m;
			if (m.did !== me && !seen.has(m.contentHash)) t.unread++;
			by.set(them, t);
		}
		return [...by.entries()]
			.map(([did, t]) => ({ did, ...t, person: people.find((p) => p.did === did) }))
			.sort((a, b) => b.last.content.at.localeCompare(a.last.content.at));
	});
	const notYet = $derived(people.filter((p) => p.inbox && !threads.some((t) => t.did === p.did)));
	const when = (iso: string) => {
		const d = new Date(iso);
		return Date.now() - d.getTime() < 86400000 ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
	};
</script>

<svelte:head><title>Messages — Q</title></svelte:head>

{#snippet face(p: { name: string; picture?: string } | undefined)}
	<span class="size-12 shrink-0 overflow-hidden rounded-full bg-surface-100-900 flex items-center justify-center">
		{#if p?.picture}<img src={p.picture} alt="" class="size-full object-cover" />{:else}<span class="font-bold opacity-70">{(p?.name ?? '?').slice(0, 1)}</span>{/if}
	</span>
{/snippet}

<Page title="Messages" lead="Sealed so only the person you write to can read them. Both of you keep a signed copy.">
	<!-- How a message gets there, as pictures: the same story style as the home and Federations pages. -->
	<MessageStory />

	{#if !identity}
		<div class="panel"><SignIn /></div>
	{:else}
		{#if threads.length}
			<ul class="card preset-outlined-surface-200-800 bg-surface-50-950 divide-y divide-surface-200-800 overflow-hidden">
				{#each threads as t (t.did)}
					<li>
						<a href="/messages/{encodeURIComponent(t.did)}" class="flex items-center gap-4 p-4 hover:bg-surface-100-900 min-h-11">
							{@render face(t.person)}
							<span class="flex-1 min-w-0">
								<span class="block {t.unread ? 'font-bold' : ''}">{t.person?.name ?? 'Someone'}</span>
								<span class="block text-sm opacity-70 truncate">{t.last.did === identity.did ? 'You: ' : ''}{t.last.content.kind === 'voicemail' ? 'Voice message' : t.last.content.text}</span>
							</span>
							<span class="flex flex-col items-end gap-1 shrink-0">
								<span class="text-xs opacity-60">{when(t.last.content.at)}</span>
								{#if t.unread}<span class="badge-icon preset-filled-primary-500 text-xs">{t.unread}</span>{/if}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}

		{#if notYet.length}
			<section class="flex flex-col gap-3">
				<h2 class="h5">Write to someone</h2>
				<div class="flex flex-wrap gap-3">
					{#each notYet as p (p.did)}
						<a href="/messages/{encodeURIComponent(p.did)}" class="card preset-tonal-surface p-3 flex items-center gap-3 min-h-11 hover:preset-tonal-primary">
							{@render face(p)}
							<span class="font-bold">{p.name}</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if !threads.length && !notYet.length}
			<Empty icon="message" title="No one to write to yet" description="Share your card with someone. When you've linked up, you can write to each other here.">
				<a class="btn preset-filled-primary-500 min-h-11" href="/cards"><Icon name="share" size={16} /> Share my card</a>
			</Empty>
		{/if}
	{/if}
</Page>
