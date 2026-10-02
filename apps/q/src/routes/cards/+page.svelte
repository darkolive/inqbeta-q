<script lang="ts">
	/*
	 * You and your cards.
	 *
	 * 2 October 2026 (Darren): not lots of cards — "I think we focus purely on
	 * your personal card … when you click on personal, it shows your personal
	 * card and you select which ones go on the card. When you select business,
	 * it shows your business card."
	 *
	 * So each tab IS a card: the switches beside it decide what people see,
	 * and it's kept as you go (LiveCard). Your details are filled in by the
	 * Personal card's steps (PersonalSteps): you, contact, home, social, work.
	 * Underneath nothing changed: a card names details, never copies them, and
	 * cardView in q-core decides what leaves.
	 */
	import { Empty, Icon, Page } from '@inqbeta/q-ui';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import SignIn from '$lib/components/SignIn.svelte';
	import PersonalSteps from '$lib/components/PersonalSteps.svelte';
	import LiveCard from '$lib/components/LiveCard.svelte';
	import MembershipCard from '$lib/components/MembershipCard.svelte';
	import NotificationsCard from '$lib/components/NotificationsCard.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder, type FolderState } from '@inqbeta/q-core/folder';
	import { newestPerCard } from '@inqbeta/q-core/cards';
	import type { AnswerSet } from '@inqbeta/q-core/questions';
	import { standingAt } from '@inqbeta/q-core/membership';
	import { answersFrom } from '$lib/answers';
	import { cardFrom, type KindCard } from '$lib/cards';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';
	import { LABEL, profileNow, justForMe, asText, ownDetails, businessesFrom, BIZ_PARTS, PERSONAL_OPTIONS, type Business } from '$lib/profile';
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

	/* Memberships: yours, and the federations you look after. */
	let memberships = $state<MembershipRecord[]>([]);
	let looking = $state<FederationRecord[]>([]);
	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found) : [];
		void Promise.all(found.filter((f) => f.kind === 'membership').map((f) => recordFrom(f.item))).then((l) => (memberships = l.filter(isMembershipRecord)));
		void Promise.all(found.filter((f) => f.kind === 'federation').map((f) => recordFrom(f.item))).then((l) => (looking = l.filter(isFederationRecord)));
	});
	/*
	 * Federations that send news, for the notifications card: only those whose
	 * manifest says so (notifies), and Q's home federation, which announces
	 * through its storage unit. One that never notifies isn't listed.
	 */
	let homeDid = $state('');
	$effect(() => void readHome().then((h) => (homeDid = h.ok ? h.federation : '')));
	const federations = $derived(
		[
			...looking.map((f) => ({ did: f.founding.federation, name: f.founding.name, notifies: !!f.manifest.constitution.notifies })),
			...memberships.map((m) => ({ did: m.joining.federation, name: m.founding.name, notifies: !!m.manifest.constitution.notifies }))
		]
			.filter((f) => f.notifies || f.did === homeDid)
			.filter((f, i, all) => all.findIndex((x) => x.did === f.did) === i)
	);
	const fedHref = (did: string) => `/federations/one?id=${encodeURIComponent(did)}`;

	/* Your profile, now. */
	const now = $derived(identity ? profileNow(answers, identity.did) : {});
	const mine = $derived(justForMe(now));
	const own = $derived(ownDetails(now));
	const businesses = $derived(businessesFrom(now, own));
	const values = $derived(Object.fromEntries(Object.entries(now).map(([k, v]) => [k, asText(v)])));

	/* ---- Tabs, kept in the address so the bell can open one ---- */
	const TABS = ['personal', 'business', 'memberships', 'notifications'] as const;
	type Tab = (typeof TABS)[number];
	const asked = $derived(page.url.searchParams.get('tab') as Tab);
	const tab = $derived<Tab>(TABS.includes(asked) ? asked : 'personal');
	function openTab(t: string) {
		const url = new URL(page.url);
		url.searchParams.set('tab', t);
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	/* ---- Personal ---- */
	const personal = $derived(cards.find((c) => c.kind === 'personal' && c.name === 'Personal') ?? cards.find((c) => c.kind === 'personal'));
	let stepping = $state<number | null>(null);
	const WORK_STEP = 4;

	/* ---- Business: one card per business ---- */
	const bizCard = (b: Business) => cards.find((c) => c.kind === 'business' && c.shows.includes(`q:biz/${b.slug}/name`));
	const bizOptions = (b: Business) => [
		{ id: 'q:person/cover', label: 'Cover image' },
		{ id: 'q:person/picture', label: 'Your photo' },
		{ id: 'q:person/called', label: 'Your name' },
		...BIZ_PARTS.filter((p) => p.part !== 'name').map((p) => ({ id: `q:biz/${b.slug}/${p.part}`, label: p.label }))
	];
	const bizDefault = (b: Business) => ['q:person/cover', 'q:person/picture', 'q:person/called', ...BIZ_PARTS.map((p) => `q:biz/${b.slug}/${p.part}`)];
</script>

<svelte:head><title>You and your cards — Q</title></svelte:head>

<Page title="You and your cards" lead="One card for you, one for each place you work. You choose what each one shows.">
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
				<Tabs.Trigger value="memberships" class="min-h-11">Memberships</Tabs.Trigger>
				<Tabs.Trigger value="notifications" class="min-h-11">Notifications</Tabs.Trigger>
				<Tabs.Indicator />
			</Tabs.List>

			<!-- Personal: your card, with its switches. -->
			<Tabs.Content value="personal">
				{#if stepping !== null}
					<PersonalSteps
						{identity}
						{now}
						shown={personal?.shows ?? []}
						startAt={stepping}
						onDone={async () => {
							stepping = null;
							await refreshLedger();
						}}
						onCancel={() => (stepping = null)}
					/>
				{:else if personal}
					{#key personal.id}
						<LiveCard {identity} name="Personal" kind="personal" options={PERSONAL_OPTIONS} {values} {own} shown={personal.shows}>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (stepping = 0)}>Change my details</button>
						</LiveCard>
					{/key}
				{:else}
					<Empty icon="card" title="Make your Personal card" description="A few short steps: you, how to reach you, your home, your socials, your work. Then you choose what people see.">
						<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => (stepping = 0)}>Start</button>
					</Empty>
				{/if}
			</Tabs.Content>

			<!-- Business: a card for each business. -->
			<Tabs.Content value="business">
				{#if !businesses.length}
					<Empty icon="card" title="No work added yet" description="Add where you work or what you run, and its card appears here.">
						<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => { openTab('personal'); stepping = WORK_STEP; }}>Add my work</button>
					</Empty>
				{:else}
					<div class="flex flex-col gap-8">
						{#each businesses as b (b.slug)}
							{@const card = bizCard(b)}
							{#key card?.id ?? b.slug}
								<LiveCard
									{identity}
									name={b.name}
									kind="business"
									options={bizOptions(b)}
									{values}
									{own}
									shown={card?.shows ?? bizDefault(b)}
									always={[`q:biz/${b.slug}/name`]}
								>
									<button type="button" class="btn preset-tonal min-h-11" onclick={() => { openTab('personal'); stepping = WORK_STEP; }}>Change its details</button>
								</LiveCard>
							{/key}
						{/each}
						<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => { openTab('personal'); stepping = WORK_STEP; }}><Icon name="plus" size={16} /> Add a business</button>
					</div>
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
				<NotificationsCard {federations} />
			</Tabs.Content>
		</Tabs>
	{/if}
</Page>
