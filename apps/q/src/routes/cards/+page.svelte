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
	import { Page, Section, Empty } from '@inqbeta/q-ui';
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
	import { cardFrom, saveCard } from '$lib/cards';
	import { channelFrom } from '$lib/channels';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';
	import { DETAILS, LABEL, profileNow, justForMe, asText } from '$lib/profile';
	import MembershipCard from '$lib/components/MembershipCard.svelte';
	import ShareLink from '$lib/components/ShareLink.svelte';
	import { makeCardLink } from '$lib/cardlink';
	import { bellConfig } from '$lib/bellboy';
	import { recordFrom, isMembershipRecord, isFederationRecord, type MembershipRecord, type FederationRecord } from '$lib/federations';
	import { standingAt } from '@inqbeta/q-core/membership';

	let identity = $state<Identity | null>(null);
	let folder = $state<FolderState>({ kind: 'checking' });
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchFolder((s) => (folder = s)));
	$effect(() => watchLedger((l) => (ledger = l)));

	let answers = $state<AnswerSet[]>([]);
	let cards = $state<Card[]>([]);
	let channels = $state<VerifiedChannel[]>([]);
	let loaded = $state(false);
	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found) : [];
		void Promise.all(found.filter((f) => f.kind === 'answers').map((f) => answersFrom(f.item))).then((l) => {
			answers = l.filter((a): a is AnswerSet => !!a);
			loaded = ledger?.state === 'ready';
		});
		void Promise.all(found.filter((f) => f.kind === 'card').map((f) => cardFrom(f.item))).then((l) => (cards = newestPerCard(l.filter((c): c is Card => !!c))));
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
	const fedHref = (did: string) => `/federations/one?id=${encodeURIComponent(did)}`;

	/* Your profile, now: every detail, as only you see it. */
	const now = $derived(identity ? profileNow(answers, identity.did) : {});
	const mine = $derived(justForMe(now));
	const hasProfile = $derived(!!now['q:person/called']);
	const fullFace = $derived(Object.fromEntries(DETAILS.map((d) => [d.id, asText(now[d.id])]).filter(([, v]) => v)));
	let editing = $state(false);

	/* A card's face: exactly what cardView lets out, drawn. */
	function faceOf(card: Card) {
		const view = cardView(card, answers);
		return { details: Object.fromEntries(view.shown.map((s) => [s.question, asText(s.value)])), view };
	}

	/* ---- Sharing a card (ADR-Q-015): a signed link, by email, WhatsApp, copy or QR ---- */
	let sharing = $state<{ card: Card; link: string } | null>(null);
	let shareSays = $state('');
	async function share(card: Card) {
		shareSays = '';
		try {
			sharing = { card, link: await makeCardLink(card.name, faceOf(card).details, bellConfig()?.inbox) };
		} catch (e) {
			shareSays = e instanceof Error ? e.message : 'The link couldn’t be made.';
		}
	}

	/* ---- Making a card ---- */
	let step = $state<'none' | 'template' | 'edit'>('none');
	let name = $state('');
	let shows = $state<string[]>([]);
	let picked = $state<string[]>([]);
	let saving = $state(false);
	let says = $state('');

	/* What a card could show: details you've filled in and haven't kept for yourself. */
	const shareable = $derived(DETAILS.filter((d) => now[d.id] !== undefined && !mine.includes(d.id)));
	const kept = $derived(DETAILS.filter((d) => now[d.id] !== undefined && mine.includes(d.id)));

	function start(p: CardPreset | null) {
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
		const out = await saveCard(identity, name, shows.filter((id) => !mine.includes(id)), picked);
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
		<Section title="Your profile" description={hasProfile && !editing ? 'The whole of you, including anything kept just for you. Nobody else sees this page — other people only ever see a card you make.' : 'Fill in what you like. Each detail is either shown on cards or kept just for you.'}>
			{#if editing || !hasProfile}
				<ProfileEditor
					{identity}
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
						<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => (editing = true)}>Edit my profile</button>
						<button type="button" class="btn preset-tonal min-h-11" onclick={() => start(CARD_PRESETS.find((p) => p.id === 'personal')!)}>Show it to people: make a card</button>
						{#if mine.length}
							<p class="text-sm opacity-70">Just for you: {mine.map((id) => LABEL[id] ?? id).join(', ')}.</p>
						{:else}
							<p class="text-sm opacity-70">Nothing is kept just for you, so a card can show any of it.</p>
						{/if}
					</div>
				</div>
			{/if}
		</Section>

		{#if hasProfile}
			<Section title="Your cards" description="Each card shows only what you put on it. Change your profile and every card follows.">
				{#snippet actions()}
					{#if step === 'none'}
						<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => (step = 'template')}>New card</button>
					{/if}
				{/snippet}

				{#if step === 'template'}
					<p class="mb-3">Start from one of these. You can change anything before it's made.</p>
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
						{#each CARD_PRESETS.filter((p) => p.id === 'personal' || p.id === 'business') as p (p.id)}
							<button type="button" class="card preset-outlined-surface-200-800 hover:preset-tonal p-4 text-left min-h-11" onclick={() => start(p)}>
								<span class="h5 block">{p.name}</span>
								<span class="text-sm opacity-70">{p.says}</span>
							</button>
						{/each}
					</div>
					<button type="button" class="btn preset-tonal min-h-11" onclick={() => (step = 'none')}>Not now</button>
				{:else if step === 'edit' && draft}
					<div class="grid gap-6 lg:grid-cols-[1fr_22rem] mb-6">
						<div class="flex flex-col gap-5">
							<label class="label">
								<span class="label-text">What do you call this card?</span>
								<input class="input" bind:value={name} placeholder="Basic" />
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
						<aside class="flex flex-col gap-2 lg:sticky lg:top-4 self-start">
							<p class="text-sm opacity-70">What the person you give it to will see.</p>
							<CardFace details={draft.details} did={identity.did} badge={name.trim() || 'New card'} />
							<p class="text-xs opacity-60">
								{draft.view.withheld === 0 ? 'Everything you’ve filled in is on this card.' : `${draft.view.withheld} other ${draft.view.withheld === 1 ? 'detail stays' : 'details stay'} off it. They can’t see which.`}
							</p>
						</aside>
					</div>
				{/if}

				{#if cards.length}
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each cards as card (card.id)}
							{@const f = faceOf(card)}
							<div class="flex flex-col gap-2">
								<CardFace details={f.details} did={card.did} badge={card.name} missing={f.view.missing.map((id) => LABEL[id] ?? id)} />
								<button type="button" class="btn preset-tonal min-h-11" onclick={() => void share(card)}>Share this card</button>
							</div>
						{/each}
					</div>
					{#if sharing}
						<div class="mt-6">
							<ShareLink
								link={sharing.link}
								label="Your {sharing.card.name} card"
								note="Send it any way you like. When they open it and link up, you’ll hear the bell."
								subject="My card"
								message="Here’s my card — open it to link up with me."
							/>
							<button type="button" class="btn preset-tonal min-h-11 mt-3" onclick={() => (sharing = null)}>Done</button>
						</div>
					{/if}
					{#if shareSays}<p class="text-sm text-warning-700-300 mt-3">{shareSays}</p>{/if}
				{:else if step === 'none'}
					<Empty icon="card" title="No cards yet" description="Two kinds: Personal, for the people in your life, and Business, for work.">
						<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => start(CARD_PRESETS.find((p) => p.id === 'personal')!)}>Make a Personal card</button>
					</Empty>
				{/if}
			</Section>

			{#if memberships.length || looking.length}
				<Section title="Your memberships" description="Your place in each federation: since when, your standing, what they hold on you and what they can’t have.">
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
				</Section>
			{/if}

			<Section title="Giving a card to someone" description="Next.">
				<p class="text-sm">Handing a card to a person is a signed permission, scoped to that card, that you can take back on its own. It is built and tested underneath, and comes next.</p>
			</Section>
		{/if}
	{/if}
</Page>
