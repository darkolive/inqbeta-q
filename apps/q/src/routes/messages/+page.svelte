<script lang="ts">
	/*
	 * Messages (2 October 2026): one line per person you're writing with, the
	 * newest first. A conversation only opens with someone you're linked with —
	 * there's a receipt between you already — so there's no "new message to
	 * anyone" box: you start from a person.
	 *
	 * Built around its story (3 October 2026, StoryGuide): new to messages,
	 * the story comes first; once you're writing, your conversations do, new
	 * ones on top, and the story folds into one line. On a wide screen the
	 * people you could write to sit beside your conversations.
	 */
	import { Page, Empty, Icon } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import MessageStory from '$lib/components/MessageStory.svelte';
	import StoryGuide from '$lib/components/StoryGuide.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { readIds } from '$lib/announcements';
	import { MESSAGE_SCHEMA } from '@inqbeta/q-core/inbox';
	import { isOfficeBusiness } from '$lib/messages';
	import { officeOfMine, officeHref, federationLook, type OfficeRef } from '$lib/office-post';
	import { officeName } from '$lib/role.svelte';
	import type { Signed } from '$lib/messages';
	import Composer from '$lib/components/message/Composer.svelte';
	import { refreshLedger } from '$lib/ledger';

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
			if (m?.content?.schema !== MESSAGE_SCHEMA || (m.content.kind !== 'message' && m.content.kind !== 'voicemail') || isOfficeBusiness(m, me) || officeOfMine(m, me)) continue;
			const them = m.did === me ? m.content.to : m.did;
			const t = by.get(them) ?? { last: m, unread: 0 };
			if (m.content.at > t.last.content.at) t.last = m;
			if (m.did !== me && !seen.has(m.contentHash)) t.unread++;
			by.set(them, t);
		}
		return [...by.entries()]
			.map(([did, t]) => ({ did, ...t, person: people.find((p) => p.did === did) }))
			/* Anything not yet read first, then the newest. */
			.sort((a, b) => Number(!!b.unread) - Number(!!a.unread) || b.last.content.at.localeCompare(a.last.content.at));
	});
	/* Conversations with an office (ADR-Q-038): shown as the federation and the office, never the holder's face. */
	const officeTalks = $derived.by(() => {
		const me = identity?.did ?? '';
		const by = new Map<string, { ref: OfficeRef; last: Signed; unread: number }>();
		for (const r of ledger?.receipts ?? []) {
			const m = r.json as Signed | undefined;
			if (m?.content?.schema !== MESSAGE_SCHEMA || m.content.kind !== 'message') continue;
			const ref = officeOfMine(m, me);
			if (!ref) continue;
			const key = `${ref.federation}|${ref.office}`;
			const t = by.get(key) ?? { ref, last: m, unread: 0 };
			if (m.content.at > t.last.content.at) t.last = m;
			if (ref.name && !t.ref.name) t.ref = ref;
			if (m.did !== me && !seen.has(m.contentHash)) t.unread++;
			by.set(key, t);
		}
		return [...by.values()].sort((a, b) => b.last.content.at.localeCompare(a.last.content.at));
	});
	let looks = $state<Record<string, { name: string; logo?: string }>>({});
	$effect(() => {
		for (const t of officeTalks) if (!looks[t.ref.federation]) void federationLook(t.ref.federation, t.ref.name).then((l) => (looks = { ...looks, [t.ref.federation]: l }));
	});
	const ready = $derived(ledger?.state === 'ready' || ledger?.state === 'no-folder');
	const unread = $derived(threads.reduce((n, t) => n + t.unread, 0));
	const notYet = $derived(people.filter((p) => p.inbox && !threads.some((t) => t.did === p.did)));
	/* What the last message was, in a few words: its text, or what it carried. */
	const gist = (m: Signed) => {
		if (m.content.kind === 'voicemail') return 'Voice message';
		if (m.content.text) return m.content.text;
		const as = m.content.attachments ?? [];
		const pics = as.filter((a) => a.kind === 'picture').length;
		if (pics) return pics === 1 ? 'A picture' : `${pics} pictures`;
		const a = as[0];
		return a?.kind === 'file' ? a.name ?? 'A file' : a?.kind === 'link' ? 'A link' : a?.kind === 'place' ? 'A place' : a?.kind === 'card' ? 'A card' : m.content.audio ? 'Voice note' : '';
	};
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
	<!-- How a message gets there, as pictures: first for someone new, one line once they're writing. -->
	<StoryGuide title="How a message gets there" ready={!identity || ready} empty={!identity || !threads.length}>
		<MessageStory />
	</StoryGuide>

	{#if !identity}
		<div class="panel"><SignIn /></div>
	{:else if !threads.length && !notYet.length && !officeTalks.length}
		<Empty icon="message" title="No one to write to yet" description="Share your card with someone. When you've linked up, you can write to each other here.">
			<a class="btn preset-filled-primary-500 min-h-11" href="/cards"><Icon name="share" size={16} /> Share my card</a>
		</Empty>
	{:else}
		<div class="grid gap-8 lg:grid-cols-3 items-start">
			<div class="lg:col-span-2 flex flex-col gap-8">
			<!-- The message comes first; who it's for comes after (Darren, 4 October 2026). -->
			<Composer {identity} {ledger} {people} onSent={() => void refreshLedger()} />
			<section class="flex flex-col gap-3" aria-labelledby="conversations">
				<h2 id="conversations" class="h4 flex items-center gap-3">
					Conversations
					{#if unread}<span class="badge preset-filled-primary-500">{unread} new</span>{/if}
				</h2>
				{#if officeTalks.length}
					<ul class="card preset-outlined-surface-200-800 bg-surface-50-950 divide-y divide-surface-200-800 overflow-hidden" aria-label="Offices you've written to">
						{#each officeTalks as t (`${t.ref.federation}|${t.ref.office}`)}
							{@const look = looks[t.ref.federation]}
							<li class={t.unread ? 'border-s-4 border-primary-500' : ''}>
								<a href={officeHref(t.ref)} class="flex items-center gap-4 p-4 hover:bg-surface-100-900 min-h-11">
									{@render face({ name: look?.name ?? t.ref.name ?? '?', picture: look?.logo })}
									<span class="flex-1 min-w-0">
										<span class="block {t.unread ? 'font-bold' : ''}">{officeName(t.ref.office)} · {look?.name ?? t.ref.name ?? 'A federation'}</span>
										<span class="text-sm opacity-70 truncate block">{t.last.did === identity.did ? 'You: ' : ''}{gist(t.last)}</span>
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
				{#if threads.length}
					<ul class="card preset-outlined-surface-200-800 bg-surface-50-950 divide-y divide-surface-200-800 overflow-hidden">
						{#each threads as t (t.did)}
							<li class={t.unread ? 'border-s-4 border-primary-500' : ''}>
								<a href="/messages/{encodeURIComponent(t.did)}" class="flex items-center gap-4 p-4 hover:bg-surface-100-900 min-h-11">
									{@render face(t.person)}
									<span class="flex-1 min-w-0">
										<span class="block {t.unread ? 'font-bold' : ''}">{t.person?.name ?? 'Someone'}</span>
										<span class="flex items-center gap-1 text-sm opacity-70 truncate">
											{#if t.last.content.kind === 'voicemail'}<Icon name="mic" size={14} />{/if}
											{t.last.did === identity.did ? 'You: ' : ''}{gist(t.last)}
										</span>
									</span>
									<span class="flex flex-col items-end gap-1 shrink-0">
										<span class="text-xs opacity-60">{when(t.last.content.at)}</span>
										{#if t.unread}<span class="badge-icon preset-filled-primary-500 text-xs">{t.unread}</span>{/if}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else if !officeTalks.length}
					<p class="card preset-tonal-surface p-4">No conversations yet. Write your first message above.</p>
				{/if}
			</section>
			</div>

			<aside class="flex flex-col gap-6">
				{#if notYet.length}
					<section class="flex flex-col gap-3" aria-labelledby="write-to">
						<h2 id="write-to" class="h4">Write to someone</h2>
						<ul class="card preset-outlined-surface-200-800 bg-surface-50-950 divide-y divide-surface-200-800 overflow-hidden">
							{#each notYet as p (p.did)}
								<li>
									<a href="/messages/{encodeURIComponent(p.did)}" class="flex items-center gap-3 p-3 min-h-11 hover:preset-tonal-primary">
										{@render face(p)}
										<span class="flex-1 font-bold">{p.name}</span>
										<Icon name="message" size={18} class="text-primary-700-300" />
									</a>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
				<a href="/communication" class="card preset-tonal-primary p-4 flex items-start gap-3 hover:preset-filled-primary-500">
					<Icon name="lock" size={22} class="shrink-0 mt-0.5" />
					<span class="flex flex-col gap-1">
						<span class="font-bold">Only the two of you can read them</span>
						<span class="text-sm">Locked before they leave your computer. See how.</span>
					</span>
				</a>
			</aside>
		</div>
	{/if}
</Page>
