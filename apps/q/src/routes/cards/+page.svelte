<script lang="ts">
	/*
	 * You and your cards (1 October 2026).
	 *
	 * Darren: "I don't like the way you've got the cards concept quite answering
	 * questions. I think we just need templates or create a new card … your
	 * profile, your cover image … and you get to choose what is shown on those
	 * address cards and what is just for you."
	 *
	 * So: ONE PROFILE, filled in like a form, each detail shown on cards or just
	 * for you. CARDS FROM TEMPLATES — Basic, Friends, Business, Contact — each
	 * a selection over the profile, previewed as the person holding it will see
	 * it. Underneath nothing changed: a card names details, never copies them,
	 * and cardView in q-core is the one thing that decides what leaves — now
	 * including "just for you", which no card can override.
	 */
	import { Page, Section, Empty, Icon } from '@inqbeta/q-ui';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import CardBuilder from '$lib/components/CardBuilder.svelte';
	import ShareCard from '$lib/components/ShareCard.svelte';
	import SignIn from '$lib/components/SignIn.svelte';
	import CardFace from '$lib/components/CardFace.svelte';
	import ProfileEditor from '$lib/components/ProfileEditor.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder, type FolderState } from '@inqbeta/q-core/folder';
	import { cardView, newestPerCard, type Card } from '@inqbeta/q-core/cards';
	import type { AnswerSet } from '@inqbeta/q-core/questions';
	import type { VerifiedChannel } from '@inqbeta/q-core/channels';
	import { CARD_PRESETS, type CardPreset } from '$lib/questions/presets';
	import { answersFrom } from '$lib/answers';
	import { cardFrom, saveCard, type KindCard, type CardKind } from '$lib/cards';
	import { channelFrom } from '$lib/channels';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';
	import { LABEL, profileNow, justForMe, asText, allDetails, ownDetails, withLabels, nameFrom } from '$lib/profile';
	import MembershipCard from '$lib/components/MembershipCard.svelte';
	import { recordFrom, isMembershipRecord, isFederationRecord, type MembershipRecord, type FederationRecord } from '$lib/federations';
	import { standingAt } from '@inqbeta/q-core/membership';
	import NotificationsCard from '$lib/components/NotificationsCard.svelte';
	import { readHome } from '$lib/home';

	let identity = $state<Identity | null>(null);
	let folder = $state<FolderState>({ kind: 'checking' });
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchFolder((s) => (folder = s)));
	$effect(() => watchLedger((l) => (ledger = l)));

	let answers = $state<AnswerSet[]>([]);
	let cards = $state<KindCard[]>([]);
	let channels = $state<VerifiedChannel[]>([]);
	let loaded = $state(false);
	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found) : [];
		void Promise.all(found.filter((f) => f.kind === 'answers').map((f) => answersFrom(f.item))).then((l) => {
			answers = l.filter((a): a is AnswerSet => !!a);
			loaded = ledger?.state === 'ready';
		});
		void Promise.all(found.filter((f) => f.kind === 'card').map((f) => cardFrom(f.item))).then((l) => (cards = newestPerCard(l.filter((c): c is KindCard => !!c)) as KindCard[]));
		void Promise.all(found.filter((f) => f.kind === 'channel').map((f) => channelFrom(f.item))).then((l) => (channels = l.filter((c): c is VerifiedChannel => !!c)));
	});

	/* Memberships (ADR-Q-015 §5): yours, and the federations you look after. */
	let memberships = $state<MembershipRecord[]>([]);
	let looking = $state<FederationRecord[]>([]);
	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found) : [];
		void Promise.all(found.filter((f) => f.kind === 'membership').map((f) => recordFrom(f.item))).then((l) => (memberships = l.filter(isMembershipRecord)));
		void Promise.all(found.filter((f) => f.kind === 'federation').map((f) => recordFrom(f.item))).then((l) => (looking = l.filter(isFederationRecord)));
	});
	/* Which federations can reach you: today, Q's home federation, if you're in it. */
	let home = $state<{ did: string; name: string } | null>(null);
	$effect(() => {
		void readHome().then((h) => (home = h.ok ? { did: h.federation, name: h.name } : null));
	});
	const reaching = $derived(
		home && [...memberships.map((m) => m.joining.federation), ...looking.map((f) => f.founding.federation)].includes(home.did) ? [home] : []
	);
	const fedHref = (did: string) => `/federations/one?id=${encodeURIComponent(did)}`;

	/* Your profile, now: every detail, as only you see it. */
	const now = $derived(identity ? profileNow(answers, identity.did) : {});
	const mine = $derived(justForMe(now));
	const own = $derived(ownDetails(now));
	const details = $derived(allDetails(own));
	const hasProfile = $derived(!!now['q:person/called']);
	const fullFace = $derived(withLabels(Object.fromEntries(details.map((d) => [d.id, asText(now[d.id])]).filter(([, v]) => v)), own));
	/* What may leave at all: filled in, and not just for you. */
	const allowed = $derived(Object.fromEntries(details.filter((d) => now[d.id] !== undefined && !mine.includes(d.id)).map((d) => [d.id, asText(now[d.id])])));

	/* ---- Tabs, remembered in the address so the bell can link straight to one ---- */
	const TABS = ['profile', 'personal', 'business', 'own', 'memberships', 'notifications'] as const;
	type Tab = (typeof TABS)[number];
	const tab = $derived<Tab>(TABS.includes(page.url.searchParams.get('tab') as Tab) ? (page.url.searchParams.get('tab') as Tab) : 'profile');
	function openTab(t: string) {
		const url = new URL(page.url);
		url.searchParams.set('tab', t);
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}
	let editing = $state(false);

	/* A card's face: exactly what cardView lets out, drawn. */
	function faceOf(card: Card) {
		const view = cardView(card, answers);
		return { details: withLabels(Object.fromEntries(view.shown.map((s) => [s.question, asText(s.value)])), own), view };
	}
	const ofKind = (k: CardKind) => cards.filter((c) => c.kind === k);

	/* ---- Sharing (ADR-Q-015): tick what this person gets, then send a signed link ---- */
	let sharing = $state<{ key: string; name: string; details: Record<string, string>; ticked?: string[] } | null>(null);
	function shareCard(card: Card) {
		const d = Object.fromEntries(Object.entries(faceOf(card).details).filter(([k]) => k !== 'q:card/labels'));
		sharing = { key: card.id, name: card.name, details: d };
	}
	function shareProfile() {
		/* From your whole profile: your name and picture start ticked, the rest is up to you. */
		const d = { ...allowed };
		delete d['q:person/first'];
		delete d['q:person/last'];
		sharing = { key: 'profile', name: nameFrom(d) || 'My card', details: d, ticked: ['q:person/called', 'q:person/picture', 'q:person/cover'] };
	}

	/* ---- Making a card ---- */
	let step = $state<'none' | 'edit' | 'build'>('none');
	let editKind = $state<CardKind>('personal');
	let name = $state('');
	let shows = $state<string[]>([]);
	let picked = $state<string[]>([]);
	let saving = $state(false);
	let says = $state('');

	/* What a card could show: details you've filled in and haven't kept for yourself. */
	const shareable = $derived(details.filter((d) => now[d.id] !== undefined && !mine.includes(d.id) && d.id !== 'q:person/first' && d.id !== 'q:person/last'));
	const kept = $derived(details.filter((d) => now[d.id] !== undefined && mine.includes(d.id)));

	function start(p: CardPreset | null) {
		editKind = p?.id === 'business' ? 'business' : 'personal';
		sharing = null;
		const ok = new Set(shareable.map((d) => d.id));
		name = p?.name ?? '';
		shows = p ? p.shows.filter((id) => ok.has(id)) : [];
		picked = p?.channels ? channels.map((c) => c.id) : [];
		step = 'edit';
	}
	const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

	const draft = $derived.by(() => {
		if (!identity) return null;
		const card: Card = { source: 'inqbeta:card/1', did: identity.did, id: 'draft', name: name.trim() || 'New card', shows: [...shows], channels: [...picked], at: new Date().toISOString() };
		return faceOf(card);
	});

	async function make() {
		if (!identity) return;
		says = '';
		saving = true;
		const out = await saveCard(identity, name, shows.filter((id) => !mine.includes(id)), picked, editKind);
		saving = false;
		if (!out.ok) return void (says = out.says);
		step = 'none';
		await refreshLedger();
	}
</script>

<svelte:head><title>You and your cards — Q</title></svelte:head>

<Page title="You and your cards" lead="Your profile is everything about you. A card shows only what you choose, to the people you give it to.">
	{#if !identity}
		<div class="panel"><SignIn /></div>
	{:else if folder.kind !== 'ready'}
		<Empty icon="files" title="No folder yet" description="Your profile and cards are kept in your folder, locked to your passkey.">
			<a class="btn preset-filled-primary-500" href="/data">Choose a folder</a>
		</Empty>
	{:else if !loaded}
		<p class="opacity-60">Reading your folder…</p>
	{:else}
		{#snippet shareHere(key: string)}
			{#if sharing?.key === key}
				<div class="mt-4">
					<ShareCard did={identity!.did} name={sharing.name} details={sharing.details} {own} ticked={sharing.ticked} onDone={() => (sharing = null)} />
				</div>
			{/if}
		{/snippet}

		{#snippet cardList(list: KindCard[])}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each list as card (card.id)}
					{@const f = faceOf(card)}
					<div class="flex flex-col gap-2">
						<CardFace details={f.details} did={card.did} badge={card.name} missing={f.view.missing.map((id) => LABEL[id] ?? id)} />
						<button type="button" class="btn preset-tonal min-h-11" onclick={() => shareCard(card)}><Icon name="share" size={16} /> Share with someone</button>
					</div>
				{/each}
			</div>
			{#each list as card (card.id)}{@render shareHere(card.id)}{/each}
		{/snippet}

		{#snippet editForm()}
			<div class="grid gap-6 lg:grid-cols-[1fr_22rem] mb-6">
				<div class="flex flex-col gap-5">
					<label class="label">
						<span class="label-text">What do you call this card?</span>
						<input class="input" bind:value={name} />
					</label>
					<div class="flex flex-col gap-2">
						<span class="font-bold">What it shows</span>
						<div class="flex flex-wrap gap-2">
							{#each shareable as d (d.id)}
								<button type="button" aria-pressed={shows.includes(d.id)} class="btn btn-sm min-h-11 {shows.includes(d.id) ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}" onclick={() => (shows = toggle(shows, d.id))}>{d.label}</button>
							{/each}
						</div>
						{#if kept.length}
							<p class="text-xs opacity-60">Just for you, so never on a card: {kept.map((d) => d.label).join(', ')}.</p>
						{/if}
					</div>
					{#if channels.length}
						<div class="flex flex-col gap-2">
							<span class="font-bold">Ways to reach you</span>
							<div class="flex flex-wrap gap-2">
								{#each channels as c (c.id)}
									<button type="button" aria-pressed={picked.includes(c.id)} class="btn btn-sm min-h-11 {picked.includes(c.id) ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}" onclick={() => (picked = toggle(picked, c.id))}>{c.kind === 'email' ? 'Email' : 'Phone'}</button>
								{/each}
							</div>
						</div>
					{/if}
					<div class="flex flex-wrap gap-3">
						<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={saving || !name.trim() || (!shows.length && !picked.length)} onclick={() => void make()}>{saving ? 'Making…' : 'Make this card'}</button>
						<button type="button" class="btn preset-tonal min-h-11" onclick={() => (step = 'none')}>Not now</button>
					</div>
					{#if says}<p class="text-sm text-warning-700-300" aria-live="polite">{says}</p>{/if}
				</div>
				{#if draft}
					<aside class="flex flex-col gap-2 lg:sticky lg:top-4 self-start">
						<p class="text-sm opacity-70">What the person you give it to will see.</p>
						<CardFace details={draft.details} did={identity!.did} badge={name.trim() || 'New card'} />
					</aside>
				{/if}
			</div>
		{/snippet}

		{#snippet kindTab(kind: CardKind, preset: CardPreset)}
			{@const list = ofKind(kind)}
			{#if step === 'edit' && editKind === kind}
				{@render editForm()}
			{:else if list.length}
				<div class="flex justify-end mb-4">
					<button type="button" class="btn preset-tonal min-h-11" onclick={() => start(preset)}>Another {preset.name} card</button>
				</div>
				{@render cardList(list)}
			{:else}
				<Empty icon="card" title="No {preset.name} card yet" description={preset.says}>
					<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => start(preset)}>Make my {preset.name} card</button>
				</Empty>
			{/if}
		{/snippet}

		<Tabs value={tab} onValueChange={(d) => openTab(d.value)}>
			<Tabs.List class="mb-6 flex-wrap">
				<Tabs.Trigger value="profile" class="min-h-11">Your profile</Tabs.Trigger>
				<Tabs.Trigger value="personal" class="min-h-11">Personal</Tabs.Trigger>
				<Tabs.Trigger value="business" class="min-h-11">Business</Tabs.Trigger>
				<Tabs.Trigger value="own" class="min-h-11">Built by you</Tabs.Trigger>
				<Tabs.Trigger value="memberships" class="min-h-11">Memberships</Tabs.Trigger>
				<Tabs.Trigger value="notifications" class="min-h-11">Notifications</Tabs.Trigger>
				<Tabs.Indicator />
			</Tabs.List>

			<!-- Your profile: the whole of you, as only you see it. -->
			<Tabs.Content value="profile">
				<Section title="Your profile" description={hasProfile && !editing ? 'The whole of you, including anything kept just for you. Nobody else sees this — other people only see what you share.' : 'Fill in what you like. Each detail is shown on cards or kept just for you. Add your own at the bottom.'}>
					{#if editing || !hasProfile}
						<ProfileEditor
							identity={identity}
							{now}
							onSaved={async () => {
								editing = false;
								await refreshLedger();
							}}
							onCancel={hasProfile ? () => (editing = false) : undefined}
						/>
					{:else}
						<div class="grid gap-4 sm:grid-cols-[minmax(0,26rem)_auto] items-start">
							<CardFace details={fullFace} did={identity.did} badge="Your profile" />
							<div class="flex flex-col gap-3">
								<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={shareProfile}><Icon name="share" size={16} /> Share with someone</button>
								<button type="button" class="btn preset-tonal min-h-11" onclick={() => (editing = true)}>Edit my profile</button>
								{#if mine.length}
									<p class="text-sm opacity-70">Just for you: {mine.map((id) => LABEL[id] ?? own.find((o) => o.id === id)?.label ?? id).join(', ')}.</p>
								{:else}
									<p class="text-sm opacity-70">Nothing is kept just for you, so anything here can be shared.</p>
								{/if}
							</div>
						</div>
						{@render shareHere('profile')}
					{/if}
				</Section>
			</Tabs.Content>

			<Tabs.Content value="personal">
				{#if hasProfile}{@render kindTab('personal', CARD_PRESETS.find((p) => p.id === 'personal')!)}
				{:else}{@render needProfile()}{/if}
			</Tabs.Content>

			<Tabs.Content value="business">
				{#if hasProfile}{@render kindTab('business', CARD_PRESETS.find((p) => p.id === 'business')!)}
				{:else}{@render needProfile()}{/if}
			</Tabs.Content>

			<!-- Built by you: cards made row by row from building blocks. -->
			<Tabs.Content value="own">
				{#if !hasProfile}{@render needProfile()}
				{:else if step === 'build'}
					<CardBuilder
						identity={identity}
						{now}
						onMade={async () => {
							step = 'none';
							await refreshLedger();
						}}
						onCancel={() => (step = 'none')}
					/>
				{:else}
					{@const list = ofKind('own')}
					<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
						<p class="opacity-70">A card for anything: a club, a team, a hobby. Start with one row and add more.</p>
						<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => { sharing = null; step = 'build'; }}><Icon name="plus" size={16} /> Build a card</button>
					</div>
					{#if list.length}{@render cardList(list)}
					{:else}<Empty icon="card" title="Nothing built yet" description="Pick details you already have, or add something new: words, a date, a number, a picture." />{/if}
				{/if}
			</Tabs.Content>

			<Tabs.Content value="memberships">
				{#if memberships.length || looking.length}
					<p class="mb-4 opacity-70">Your place in each federation: since when, your standing, what they hold on you and what they can’t have.</p>
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each looking as f (f.founding.federation)}
							<MembershipCard
								name={f.founding.name}
								purpose={f.manifest.constitution.purpose}
								since={f.founding.at}
								endsOn={f.manifest.constitution.endsOn}
								standing={{ is: 'member' }}
								caretaker
								caretakerUntil={new Date(f.caretakerUntil * 1000).toISOString()}
								knownAs="name"
								did={identity.did}
								kept={mine.map((id) => LABEL[id] ?? id)}
								href={fedHref(f.founding.federation)}
							/>
						{/each}
						{#each memberships as m (m.joining.federation)}
							<MembershipCard
								name={m.founding.name}
								purpose={m.manifest.constitution.purpose}
								since={m.joining.at}
								endsOn={m.manifest.constitution.endsOn}
								standing={standingAt(m)}
								knownAs={m.joining.knownAs ?? 'anonymous'}
								card={m.card ?? null}
								did={identity.did}
								kept={mine.map((id) => LABEL[id] ?? id)}
								href={fedHref(m.joining.federation)}
							/>
						{/each}
					</div>
				{:else}
					<Empty icon="federations" title="No memberships yet" description="When you join a federation, its membership card appears here.">
						<a class="btn preset-filled-primary-500 min-h-11" href="/federations">See federations</a>
					</Empty>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="notifications">
				<p class="mb-4 opacity-70">Choose, for each, whether it rings the bell, waits quietly, or doesn’t come at all.</p>
				<NotificationsCard federations={reaching} />
			</Tabs.Content>
		</Tabs>

		{#snippet needProfile()}
			<Empty icon="card" title="Your profile comes first" description="Every card is made from your profile, so fill that in first.">
				<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => openTab('profile')}>Fill in my profile</button>
			</Empty>
		{/snippet}
	{/if}
</Page>
