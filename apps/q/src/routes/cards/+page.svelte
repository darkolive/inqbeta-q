<script lang="ts">
	/*
	 * You and your cards.
	 *
	 * Rebuilt 1 October 2026 after Darren tried the long profile form: "way too
	 * much … I want to go into personal card and have the very basic form
	 * first, and then the next stage … my identity … my contact details …
	 * then businesses."
	 *
	 * So there is no profile form any more. Your profile is built by making
	 * your Personal card, in four short steps (PersonalSteps). Business cards
	 * come from the work you added; anything else is a card you build. One
	 * thing on screen at a time, a clear next step, nothing to scroll past.
	 *
	 * Underneath nothing changed: a card names details, never copies them, and
	 * cardView in q-core is the one thing that decides what leaves.
	 */
	import { Empty, Icon, Page } from '@inqbeta/q-ui';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import SignIn from '$lib/components/SignIn.svelte';
	import CardFace from '$lib/components/CardFace.svelte';
	import PersonalSteps from '$lib/components/PersonalSteps.svelte';
	import ChooseShown from '$lib/components/ChooseShown.svelte';
	import CardBuilder from '$lib/components/CardBuilder.svelte';
	import ShareCard from '$lib/components/ShareCard.svelte';
	import MembershipCard from '$lib/components/MembershipCard.svelte';
	import NotificationsCard from '$lib/components/NotificationsCard.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder, type FolderState } from '@inqbeta/q-core/folder';
	import { cardView, newestPerCard, type Card } from '@inqbeta/q-core/cards';
	import type { AnswerSet } from '@inqbeta/q-core/questions';
	import { standingAt } from '@inqbeta/q-core/membership';
	import { answersFrom } from '$lib/answers';
	import { cardFrom, saveCard, type KindCard } from '$lib/cards';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';
	import { LABEL, profileNow, justForMe, asText, ownDetails, withLabels, businessesFrom, BIZ_PARTS, type Business } from '$lib/profile';
	import { recordFrom, isMembershipRecord, isFederationRecord, type MembershipRecord, type FederationRecord } from '$lib/federations';
	import { readHome } from '$lib/home';

	let identity = $state<Identity | null>(null);
	let folder = $state<FolderState>({ kind: 'checking' });
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchFolder((s) => (folder = s)));
	$effect(() => watchLedger((l) => (ledger = l)));

	let answers = $state<AnswerSet[]>([]);
	let cards = $state<KindCard[]>([]);
	let loaded = $state(false);
	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found) : [];
		void Promise.all(found.filter((f) => f.kind === 'answers').map((f) => answersFrom(f.item))).then((l) => {
			answers = l.filter((a): a is AnswerSet => !!a);
			loaded = ledger?.state === 'ready';
		});
		void Promise.all(found.filter((f) => f.kind === 'card').map((f) => cardFrom(f.item))).then((l) => (cards = newestPerCard(l.filter((c): c is KindCard => !!c)) as KindCard[]));
	});

	/* Memberships (ADR-Q-015 §5): yours, and the federations you look after. */
	let memberships = $state<MembershipRecord[]>([]);
	let looking = $state<FederationRecord[]>([]);
	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found) : [];
		void Promise.all(found.filter((f) => f.kind === 'membership').map((f) => recordFrom(f.item))).then((l) => (memberships = l.filter(isMembershipRecord)));
		void Promise.all(found.filter((f) => f.kind === 'federation').map((f) => recordFrom(f.item))).then((l) => (looking = l.filter(isFederationRecord)));
	});
	let home = $state<{ did: string; name: string } | null>(null);
	$effect(() => {
		void readHome().then((h) => (home = h.ok ? { did: h.federation, name: h.name } : null));
	});
	const reaching = $derived(
		home && [...memberships.map((m) => m.joining.federation), ...looking.map((f) => f.founding.federation)].includes(home.did) ? [home] : []
	);
	const fedHref = (did: string) => `/federations/one?id=${encodeURIComponent(did)}`;

	/* Your profile, now. */
	const now = $derived(identity ? profileNow(answers, identity.did) : {});
	const mine = $derived(justForMe(now));
	const own = $derived(ownDetails(now));
	const businesses = $derived(businessesFrom(now, own));

	/* ---- Tabs, kept in the address so the bell can open one ---- */
	const TABS = ['personal', 'business', 'own', 'memberships', 'notifications'] as const;
	type Tab = (typeof TABS)[number];
	const asked = $derived(page.url.searchParams.get('tab') as Tab);
	const tab = $derived<Tab>(TABS.includes(asked) ? asked : 'personal');
	function openTab(t: string) {
		const url = new URL(page.url);
		url.searchParams.set('tab', t);
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	/* A card's face: exactly what cardView lets out. */
	function faceOf(card: Card) {
		const view = cardView(card, answers);
		return withLabels(Object.fromEntries(view.shown.map((s) => [s.question, asText(s.value)])), own);
	}

	/* ---- Personal ---- */
	const personal = $derived(cards.find((c) => c.kind === 'personal' && c.name === 'Personal') ?? cards.find((c) => c.kind === 'personal'));
	let stepping = $state<number | null>(null);

	/* ---- Business: one card per business ---- */
	const bizCard = (b: Business) => cards.find((c) => c.kind === 'business' && c.shows.includes(`q:biz/${b.slug}/name`));
	let choosing = $state<{ biz: Business; shows: string[] } | null>(null);
	let bizSays = $state('');
	let bizBusy = $state(false);
	function chooseFor(b: Business) {
		const had = bizCard(b);
		sharing = null;
		choosing = {
			biz: b,
			shows: had ? [...had.shows] : ['q:person/cover', 'q:person/picture', 'q:person/called', ...BIZ_PARTS.map((p) => `q:biz/${b.slug}/${p.part}`)]
		};
	}
	const bizOptions = (b: Business) => [
		{ id: 'q:person/cover', label: 'Cover image' },
		{ id: 'q:person/picture', label: 'Your photo' },
		{ id: 'q:person/called', label: 'Your name' },
		...BIZ_PARTS.map((p) => ({ id: `q:biz/${b.slug}/${p.part}`, label: p.label }))
	];
	const nowText = $derived(Object.fromEntries(Object.entries(now).map(([k, v]) => [k, asText(v)])));
	async function makeBizCard() {
		if (!identity || !choosing) return;
		bizBusy = true;
		bizSays = '';
		const out = await saveCard(identity, choosing.biz.name, [...new Set([`q:biz/${choosing.biz.slug}/name`, ...choosing.shows])].filter((id) => nowText[id] && !mine.includes(id)), [], 'business');
		bizBusy = false;
		if (!out.ok) return void (bizSays = out.says);
		choosing = null;
		await refreshLedger();
	}

	/* ---- Your own cards ---- */
	let building = $state(false);

	/* ---- Sharing: tick what this person gets, then send a signed link ---- */
	let sharing = $state<{ key: string; name: string; details: Record<string, string> } | null>(null);
	function share(card: Card) {
		const d = Object.fromEntries(Object.entries(faceOf(card)).filter(([k]) => k !== 'q:card/labels'));
		sharing = sharing?.key === card.id ? null : { key: card.id, name: card.name, details: d };
	}
</script>

<svelte:head><title>You and your cards — Q</title></svelte:head>

{#snippet oneCard(card: KindCard, extra?: Snippet)}
	<div class="flex flex-col gap-3 max-w-md">
		<CardFace details={faceOf(card)} did={card.did} badge={card.name} />
		<div class="flex flex-wrap gap-3">
			<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => share(card)}><Icon name="share" size={16} /> Share with someone</button>
			{@render extra?.()}
		</div>
	</div>
	{#if sharing?.key === card.id}
		<div class="mt-4">
			<ShareCard did={card.did} name={sharing.name} details={sharing.details} {own} onDone={() => (sharing = null)} />
		</div>
	{/if}
{/snippet}

<Page title="You and your cards" lead="Make your Personal card first. Everything else grows from it.">
	{#if !identity}
		<div class="panel"><SignIn /></div>
	{:else if folder.kind !== 'ready'}
		<Empty icon="files" title="No folder yet" description="Your cards are kept in your folder, locked to your passkey.">
			<a class="btn preset-filled-primary-500" href="/data">Choose a folder</a>
		</Empty>
	{:else if !loaded}
		<p class="opacity-60">Reading your folder…</p>
	{:else}
		<Tabs value={tab} onValueChange={(d) => openTab(d.value)}>
			<Tabs.List class="mb-6 flex-wrap">
				<Tabs.Trigger value="personal" class="min-h-11">Personal</Tabs.Trigger>
				<Tabs.Trigger value="business" class="min-h-11">Business</Tabs.Trigger>
				<Tabs.Trigger value="own" class="min-h-11">Your own</Tabs.Trigger>
				<Tabs.Trigger value="memberships" class="min-h-11">Memberships</Tabs.Trigger>
				<Tabs.Trigger value="notifications" class="min-h-11">Notifications</Tabs.Trigger>
				<Tabs.Indicator />
			</Tabs.List>

			<!-- Personal: four short steps, then your card. -->
			<Tabs.Content value="personal">
				{#if stepping !== null}
					<PersonalSteps
						{identity}
						{now}
						shown={personal?.shows ?? []}
						startAt={stepping ?? 0}
						onDone={async () => {
							stepping = null;
							await refreshLedger();
						}}
						onCancel={() => (stepping = null)}
					/>
				{:else if personal}
					{#snippet change()}
						<button type="button" class="btn preset-tonal min-h-11" onclick={() => { sharing = null; stepping = 0; }}>Change my details</button>
					{/snippet}
					{@render oneCard(personal, change)}
				{:else}
					<Empty icon="card" title="Make your Personal card" description="Four short steps: you, how to reach you, your work, then what people see.">
						<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => (stepping = 0)}>Start</button>
					</Empty>
				{/if}
			</Tabs.Content>

			<!-- Business: one card for each business you added. -->
			<Tabs.Content value="business">
				{#if choosing}
					<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6 flex flex-col gap-5">
						<header>
							<h2 class="h3">{choosing.biz.name}</h2>
							<p class="opacity-70">Switch on what people see.</p>
						</header>
						<ChooseShown did={identity.did} badge={choosing.biz.name} options={bizOptions(choosing.biz)} values={nowText} {own} bind:shows={choosing.shows} />
						<footer class="flex flex-wrap justify-between gap-3 border-t border-surface-200-800 pt-4">
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (choosing = null)}>Not now</button>
							<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={bizBusy || !choosing.shows.length} onclick={() => void makeBizCard()}>{bizBusy ? 'Making…' : 'Make this card'}</button>
						</footer>
						{#if bizSays}<p class="text-sm card preset-tonal-error p-3">{bizSays}</p>{/if}
					</div>
				{:else if !businesses.length}
					<Empty icon="card" title="No work added yet" description="Add a business, and its card is made here.">
						<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => { openTab('personal'); stepping = 2; }}>Add my work</button>
					</Empty>
				{:else}
					<div class="flex flex-col gap-8">
						{#each businesses as b (b.slug)}
							{@const card = bizCard(b)}
							{#if card}
								{#snippet edit()}
									<button type="button" class="btn preset-tonal min-h-11" onclick={() => chooseFor(b)}>Change what it shows</button>
								{/snippet}
								{@render oneCard(card, edit)}
							{:else}
								<div class="card preset-tonal-surface p-4 flex flex-wrap items-center justify-between gap-3 max-w-md">
									<span class="font-bold">{b.name}</span>
									<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => chooseFor(b)}>Make its card</button>
								</div>
							{/if}
						{/each}
						<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => { openTab('personal'); stepping = 2; }}><Icon name="plus" size={16} /> Add a business</button>
					</div>
				{/if}
			</Tabs.Content>

			<!-- Your own: a card for anything, built row by row. -->
			<Tabs.Content value="own">
				{#if building}
					<CardBuilder
						{identity}
						{now}
						onMade={async () => {
							building = false;
							await refreshLedger();
						}}
						onCancel={() => (building = false)}
					/>
				{:else}
					{@const list = cards.filter((c) => c.kind === 'own')}
					{#if list.length}
						<div class="flex flex-col gap-8">
							{#each list as card (card.id)}{@render oneCard(card)}{/each}
							<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => { sharing = null; building = true; }}><Icon name="plus" size={16} /> Build another</button>
						</div>
					{:else}
						<Empty icon="card" title="A card for anything" description="A club, a team, a hobby. Pick details you already have, or add something new.">
							<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!now['q:person/called']} onclick={() => (building = true)}>Build a card</button>
						</Empty>
						{#if !now['q:person/called']}<p class="text-sm opacity-70 text-center">Make your Personal card first.</p>{/if}
					{/if}
				{/if}
			</Tabs.Content>

			<Tabs.Content value="memberships">
				{#if memberships.length || looking.length}
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
					<Empty icon="federations" title="No memberships yet" description="When you join a federation, its card appears here.">
						<a class="btn preset-filled-primary-500 min-h-11" href="/federations">See federations</a>
					</Empty>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="notifications">
				<NotificationsCard federations={reaching} />
			</Tabs.Content>
		</Tabs>
	{/if}
</Page>
