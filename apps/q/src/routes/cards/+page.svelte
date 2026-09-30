<script lang="ts">
	/*
	 * Cards — what you show, to whom, for what.
	 *
	 * A card names questions, never values. So this page is built round one
	 * thing: you pick what a card shows, and it tells you EXACTLY what a holder
	 * of it would see, before you make it. Nothing else walks your answers —
	 * `cardView` in q-core decides what leaves, and it is the only thing that
	 * does, which is why there is a test saying so.
	 */
	import { Page, Section, Item, Status, Empty, Avatar } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder, type FolderState } from '@inqbeta/q-core/folder';
	import { cardView, newestPerCard, type Card } from '@inqbeta/q-core/cards';
	import { asking, type AnswerSet } from '@inqbeta/q-core/questions';
	import type { VerifiedChannel } from '@inqbeta/q-core/channels';
	import { ABOUT_YOU } from '$lib/questions/about-you';
	import { YOUR_PROFILE } from '$lib/questions/your-profile';
	import { CARD_PRESETS, type CardPreset } from '$lib/questions/presets';
	import { answersFrom } from '$lib/answers';
	import { cardFrom, saveCard } from '$lib/cards';
	import { channelFrom } from '$lib/channels';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';

	let identity = $state<Identity | null>(null);
	let folder = $state<FolderState>({ kind: 'checking' });
	let ledger = $state<Ledger | null>(null);

	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchFolder((s) => (folder = s)));
	$effect(() => watchLedger((l) => (ledger = l)));

	let answers = $state<AnswerSet[]>([]);
	let cards = $state<Card[]>([]);
	let channels = $state<VerifiedChannel[]>([]);

	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found) : [];
		void Promise.all(found.filter((f) => f.kind === 'answers').map((f) => answersFrom(f.item)))
			.then((l) => (answers = l.filter((a): a is AnswerSet => !!a)));
		void Promise.all(found.filter((f) => f.kind === 'card').map((f) => cardFrom(f.item)))
			.then((l) => (cards = newestPerCard(l.filter((c): c is Card => !!c))));
		void Promise.all(found.filter((f) => f.kind === 'channel').map((f) => channelFrom(f.item)))
			.then((l) => (channels = l.filter((c): c is VerifiedChannel => !!c)));
	});

	/* Every question Q knows how to word, across every set it declares. */
	const SETS = [ABOUT_YOU, YOUR_PROFILE];
	const wording = new Map(SETS.flatMap((s) => s.questions.map((q) => [q.id, asking(q)] as const)));

	/* Every question this person has actually answered, with its wording. */
	const answerable = $derived.by(() => {
		const seen = new Map<string, string>();
		for (const set of answers) {
			if (set.did !== identity?.did) continue;
			for (const id of Object.keys(set.answers)) seen.set(id, wording.get(id) ?? id);
		}
		return [...seen].map(([id, label]) => ({ id, label }));
	});

	/*
	 * A preset only fills the selection — it decides nothing. What gets saved is
	 * whatever is ticked when the button is pressed. Questions the preset names
	 * but nobody has answered are left out rather than added as blanks.
	 */
	function start(p: CardPreset) {
		const have = new Set(answerable.map((a) => a.id));
		name = p.name;
		shows = p.shows.filter((id) => have.has(id));
		picked = p.channels ? channels.map((c) => c.id) : [];
		making = true;
	}

	let name = $state('');
	let shows = $state<string[]>([]);
	let picked = $state<string[]>([]);
	let saving = $state(false);
	let says = $state('');
	let making = $state(false);

	function toggle(list: string[], id: string): string[] {
		return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
	}

	/* What a holder would see — worked out the same way it will be for real. */
	const preview = $derived.by(() => {
		if (!identity || (!shows.length && !picked.length)) return null;
		const draft: Card = {
			source: 'inqbeta:card/1',
			did: identity.did,
			id: 'draft',
			name: name.trim() || 'Untitled',
			shows: [...shows].sort(),
			channels: [...picked].sort(),
			at: new Date().toISOString()
		};
		return cardView(draft, answers);
	});

	async function make() {
		const id = identity;
		if (!id) return;
		says = '';
		saving = true;
		const out = await saveCard(id, name, shows, picked);
		saving = false;
		if (!out.ok) {
			says = out.says;
			return;
		}
		name = '';
		shows = [];
		picked = [];
		making = false;
		await refreshLedger();
	}

	/* Shown in the head of the card rather than in the list below it. */
	const HEADLINE = ['q:person/called', 'q:person/role', 'q:org/name', 'q:person/about'];

	function cardValue(view: ReturnType<typeof cardView>, question: string): string | null {
		const found = view.shown.find((s) => s.question === question);
		return found ? show(found.value) : null;
	}

	function show(value: unknown): string {
		if (Array.isArray(value)) return value.join(', ');
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		return String(value);
	}

	const isLink = (v: unknown) => typeof v === 'string' && /^https?:\/\//.test(v);

	function label(id: string): string {
		return wording.get(id) ?? answerable.find((a) => a.id === id)?.label ?? id;
	}
</script>

<svelte:head><title>Cards — Q</title></svelte:head>

<Page
	title="Cards"
	lead="A card names questions, never answers. So it keeps telling the truth as your answers change — and it shows exactly what you chose and nothing beside it."
>
	{#if !identity}
		<div class="panel"><SignIn /></div>
	{:else if folder.kind !== 'ready'}
		<Empty icon="files" title="No folder yet" description="Cards are written into your folder, locked to your passkey.">
			<a class="btn preset-filled-primary-500" href="/data">Choose a folder</a>
		</Empty>
	{:else if !answerable.length}
		<Empty
			icon="info"
			title="Nothing to show yet"
			description="A card is a selection of things you have said. Answer Your profile and they become the things a business card can show."
		>
			<a class="btn preset-filled-primary-500" href="/questions">Answer some questions</a>
		</Empty>
	{:else}
		<Section title="Your cards" description="Business, friends, a way to be contacted — each one shows only what you put on it.">
			{#snippet actions()}
				{#if !making}
					<button type="button" class="btn preset-filled-primary-500" onclick={() => (making = true)}>Make a card</button>
				{/if}
			{/snippet}

			{#if !cards.length && !making}
				<Empty icon="card" title="No cards yet" description="Start from a Business or Friends card, or pick what goes on one yourself.">
					<div class="flex flex-wrap gap-2 justify-center">
						{#each CARD_PRESETS as p (p.id)}
							<button type="button" title={p.says} class="btn btn-sm preset-outlined-surface-500" onclick={() => start(p)}>
								{p.name}
							</button>
						{/each}
					</div>
				</Empty>
			{/if}

			<div class="grid gap-4 md:grid-cols-2">
				{#each cards as card (card.id)}
					{@const view = cardView(card, answers)}
					<!--
						Drawn as the thing it is, not as a row in a list. The point of a
						card is how you are presented, and you cannot judge that from a
						table of field names.
					-->
					<article class="card preset-outlined-surface-300-700 p-5 stack-tight">
						<header class="flex items-start gap-4">
							<Avatar did={card.did} size={56} label="Your emblem" />
							<div class="min-w-0 flex-1">
								<h3 class="h4 truncate">{cardValue(view, 'q:person/called') ?? card.name}</h3>
								{#if cardValue(view, 'q:person/role')}
									<p class="text-sm opacity-80 truncate">{cardValue(view, 'q:person/role')}</p>
								{/if}
								{#if cardValue(view, 'q:org/name')}
									<p class="text-sm opacity-60 truncate">{cardValue(view, 'q:org/name')}</p>
								{/if}
							</div>
							<Status tone="good">{card.name}</Status>
						</header>

						{#if cardValue(view, 'q:person/about')}
							<p class="text-sm">{cardValue(view, 'q:person/about')}</p>
						{/if}

						<div class="field-list">
							{#each view.shown.filter((s) => !HEADLINE.includes(s.question)) as s (s.question)}
								<div class="field-row">
									<span class="field-label">{label(s.question)}</span>
									<span class="field-value">
										{#if isLink(s.value)}
											<a class="anchor" href={String(s.value)} target="_blank" rel="noreferrer noopener">{String(s.value)}</a>
										{:else}
											{show(s.value)}
										{/if}
									</span>
								</div>
							{/each}
							{#if view.channels.length}
								<div class="field-row">
									<span class="field-label">Reach you by</span>
									<span class="field-value role-token text-xs">{view.channels.join(', ')}</span>
								</div>
							{/if}
							{#each view.missing as m (m)}
								<div class="field-row">
									<span class="field-label">{label(m)}</span>
									<span class="field-value opacity-60">Not answered — shown as nothing</span>
								</div>
							{/each}
						</div>

						<p class="hint">
							{view.withheld === 0
								? 'Everything you have answered is on this card.'
								: `${view.withheld} other ${view.withheld === 1 ? 'answer is' : 'answers are'} held back. A holder of this card cannot see which.`}
						</p>
					</article>
				{/each}
			</div>
		</Section>

		{#if making}
			<Section title="Make a card" description="Pick what it shows. The preview below is worked out exactly the way it will be for real.">
				<div class="panel stack">
					<div class="stack-tight">
						<p class="text-sm font-medium">Start from one of these, or build your own</p>
						<div class="flex flex-wrap gap-2">
							{#each CARD_PRESETS as p (p.id)}
								<button type="button" title={p.says} class="btn btn-sm preset-outlined-surface-500" onclick={() => start(p)}>
									{p.name}
								</button>
							{/each}
						</div>
						<p class="hint">
							A preset only fills in the ticks below. Change anything you like — what gets saved
							is what is ticked when you press the button.
						</p>
					</div>

					<label class="block">
						<span class="text-sm text-surface-900-100">What do you call this card?</span>
						<input class="input mt-1" bind:value={name} placeholder="Business" />
					</label>

					<div class="stack-tight">
						<p class="text-sm font-medium">What it shows</p>
						<div class="flex flex-wrap gap-2">
							{#each answerable as a (a.id)}
								<button
									type="button"
									aria-pressed={shows.includes(a.id)}
									class="btn btn-sm {shows.includes(a.id) ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
									onclick={() => (shows = toggle(shows, a.id))}
								>
									{a.label}
								</button>
							{/each}
						</div>
					</div>

					{#if channels.length}
						<div class="stack-tight">
							<p class="text-sm font-medium">Ways to be reached, for this purpose</p>
							<div class="flex flex-wrap gap-2">
								{#each channels as c (c.id)}
									<button
										type="button"
										aria-pressed={picked.includes(c.id)}
										class="btn btn-sm {picked.includes(c.id) ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
										onclick={() => (picked = toggle(picked, c.id))}
									>
										{c.kind === 'email' ? 'Email' : 'Phone'} · {c.id.slice(0, 8)}
									</button>
								{/each}
							</div>
							<p class="hint">The card carries the channel's id. Opening it still needs the channel itself.</p>
						</div>
					{/if}

					{#if preview}
						<div class="panel-quiet stack-tight">
							<p class="text-sm font-medium">What a holder of this card would see</p>
							<div class="field-list">
								{#each preview.shown as s (s.question)}
									<div class="field-row">
										<span class="field-label">{label(s.question)}</span>
										<span class="field-value">{show(s.value)}</span>
									</div>
								{/each}
								{#if !preview.shown.length}
									<p class="text-sm opacity-70">Nothing yet — pick something above.</p>
								{/if}
							</div>
							<p class="hint">
								{preview.withheld === 0
									? 'This card shows everything you have answered.'
									: `${preview.withheld} other ${preview.withheld === 1 ? 'answer stays' : 'answers stay'} off it. A holder cannot see which, or that there are any.`}
							</p>
						</div>
					{/if}

					<div class="actions">
						<button
							type="button"
							class="btn preset-filled-primary-500"
							disabled={saving || !name.trim() || (!shows.length && !picked.length)}
							onclick={() => void make()}
						>
							{saving ? 'Writing…' : 'Make this card'}
						</button>
						<button type="button" class="btn preset-outlined-surface-500" onclick={() => (making = false)}>Not now</button>
					</div>

					{#if says}<p class="text-sm text-warning-700-300" aria-live="polite">{says}</p>{/if}
				</div>
			</Section>
		{/if}

		<Section title="Giving a card to someone" description="Not built yet, and deliberately.">
			<p class="text-sm">
				A card is a definition — what you show, for what. Giving it to a named person has an
				audience, and an audience means a signed delegation scoped to this card and revocable on
				its own. That machinery exists and is tested; wiring it up is the next piece, kept
				separate so that what is here is finished.
			</p>
		</Section>
	{/if}
</Page>
