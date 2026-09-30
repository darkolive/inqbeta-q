<script lang="ts">
	/*
	 * Where your work is kept.
	 *
	 * WHAT THIS PAGE USED TO BE. Storage used, compute hours, four peers with
	 * latencies, three token balances. Every one of those numbers was a literal
	 * in the source. It rendered beautifully and said nothing, and a page that
	 * invents its own figures is worse than no page, because a person acts on it.
	 *
	 * WHAT IT IS NOW. Places a person has actually written down, and what Q can
	 * honestly say about each. Three rules from q-core do the talking, and none
	 * of them are re-worded here:
	 *
	 *   howSafe()        — ways to survive, not copies. Two folders in one
	 *                      Dropbox are one way, and three on this laptop are a
	 *                      danger however many there are.
	 *   standingOfPlace() — checked, stale, or told. A drive in a drawer can
	 *                      only ever be told, and never gets the same tick as a
	 *                      bucket that answered.
	 *   confirmation()    — written AND read back, or it is not confirmed.
	 *
	 * The numbers are gone rather than replaced. Storage used, compute and
	 * tokens are not things Q can measure today, and a zero would be as
	 * dishonest as the invented five hundred.
	 */
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import {
		canHoldTheOnlyCopy,
		confirmation,
		situationOf,
		warningFor,
		type Confirmation,
		type PlaceRecord,
		type Proof
	} from '@inqbeta/q-core/places';
	import { howSafe, standingOfPlace, type Place } from '@inqbeta/q-core/lifecycle';
	import { folderState } from '@inqbeta/q-core/folder';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import type { Found } from '$lib/features/registry';
	import { newestPerKey } from '$lib/features/dostudy';
	import { addPlace, openFolderAsPlace, placeFrom, placesFrom, provePlace } from '$lib/places';
	import { waysStanding, type WaysStanding } from '@inqbeta/q-core/continuity';
	import { currentEnvelope } from '@inqbeta/q-core/ways-back-in';
	import { watchEngine, type EngineState } from '$lib/actions/engine';

	/* The one definition of what a check is — taken from Found rather than
	 * written out again, because restating a type is how it drifts from the
	 * one actually carried. svelte-check caught exactly that here. */
	type Checked = NonNullable<Found['checked']>;

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	let places = $state<PlaceRecord[]>([]);
	let busy = $state<string | null>(null);
	let said = $state<{ id: string; says: string; fix: string; tone: 'good' | 'bad' | 'waiting' } | null>(null);

	$effect(() => watch((id) => (identity = id)));

	/* The rule engine — woken at sign-in (lib/actions/engine.ts). Said plainly:
	 * whether it is ready, which Cedar, how long waking took, what is loaded. */
	let engine = $state<EngineState>({ state: 'asleep', actions: {} });
	$effect(() => watchEngine((s) => (engine = s)));
	const ENGINE_WORD: Record<EngineState['state'], string> = {
		asleep: 'Asleep',
		waking: 'Waking',
		ready: 'Ready',
		failed: 'Stopped'
	};
	const engineTone = (s: EngineState['state']) =>
		s === 'ready' ? 'good' : s === 'failed' ? 'bad' : 'waiting';
	$effect(() => watchLedger((l) => (ledger = l)));

	/* ADR-Q-005 step 7. Copies keep your data; ways back in keep YOU. Ten
	 * perfect copies sealed to a passkey you have lost are ten locked boxes —
	 * so this is said first, above the places, when it is the weak part. */
	let ways = $state<WaysStanding | null>(null);
	$effect(() => {
		if (!identity) return;
		void ledger;
		void currentEnvelope(identity)
			.then((e) => (ways = waysStanding(e)))
			.catch(() => (ways = waysStanding(null)));
	});

	/* Whether the receipt each place came out of holds up. Checked once by the
	 * ledger, carried here, never re-derived — and never used to hide one. */
	let checks = $state<Record<string, Checked>>({});

	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found) : [];
		const mine = found.filter((f) => f.kind === 'place');
		void Promise.all(
			mine.map(async (f) => ({ place: await placeFrom(f.item), checked: f.checked }))
		).then((l) => {
			/* Narrowed by building the kept list rather than by a predicate.
			 * A hand-written `x is …` has to restate the type, and restating it
			 * is how it drifts from the one the ledger actually carries — which
			 * is exactly what svelte-check caught on 20 September. */
			const kept: { place: PlaceRecord; checked?: Checked }[] = [];
			for (const x of l) if (x.place) kept.push({ place: x.place, checked: x.checked });

			places = placesFrom(kept.map((x) => x.place));
			checks = Object.fromEntries(
				kept.flatMap((x) => (x.checked ? [[x.place.id, x.checked] as const] : []))
			);
		});
	});

	/* lifecycle.ts speaks in tiers; places.ts speaks in kinds. One map, here,
	 * rather than a second vocabulary in q-core that would drift from the first. */
	const TIER = { cache: 'here', folder: 'here', synced: 'synced', bucket: 'cold', drive: 'archive' } as const;

	const asPlaces = $derived<Place[]>(
		places.map((p) => ({
			id: p.id,
			name: p.called,
			tier: TIER[p.kind],
			fate: p.fate,
			lastChecked: p.proved && p.seen ? Date.parse(p.seen) : null
		}))
	);

	const safety = $derived(howSafe(asPlaces));

	/* What Q could add without being told anything, and has not already got. */
	const offered = $derived.by(() => {
		const open = openFolderAsPlace();
		if (!open) return null;
		return places.some((p) => p.called === open.called && p.kind === open.kind) ? null : open;
	});

	let adding = $state(false);
	let newName = $state('');
	let newKind = $state<PlaceRecord['kind']>('drive');

	async function add(place: { called: string; kind: PlaceRecord['kind'] }) {
		if (!identity || !place.called.trim()) return;
		busy = 'adding';
		said = null;
		const out = await addPlace(identity, { ...place, called: place.called.trim() });
		busy = null;
		if (!out.ok) {
			said = { id: 'adding', says: out.says, fix: '', tone: 'bad' };
			return;
		}
		adding = false;
		newName = '';
		said = { id: out.place.id, says: out.told.says, fix: out.told.fix, tone: toneOf(out.told.state) };
	}

	async function prove(place: PlaceRecord) {
		if (!identity) return;
		busy = place.id;
		said = null;
		const out = await provePlace(identity, place);
		busy = null;
		if (!out.ok) {
			said = { id: place.id, says: out.says, fix: '', tone: 'bad' };
			return;
		}
		said = {
			id: place.id,
			says: out.told.says + (out.leftBehind ? ` A test file was left behind — this place will not let Q remove things.` : ''),
			fix: out.told.fix,
			tone: out.told.state === 'confirmed' ? 'good' : out.told.state === 'untried' ? 'waiting' : 'bad'
		};
	}

	const canProve = (p: PlaceRecord) =>
		(p.kind === 'folder' || p.kind === 'synced') && folderState().kind === 'ready';

	/* What was written down last time, put back into the shape confirmation()
	 * judges. A place recorded as proved was proved by a real round trip —
	 * provePlace() is the only thing that sets it. */
	const provenOf = (p: PlaceRecord): Proof =>
		p.proved
			? { tried: true, wrote: true, readBack: true, matched: true, at: Date.parse(p.seen ?? p.at) }
			: { tried: false };

	const WORD: Record<Confirmation, string> = {
		confirmed: 'Confirmed',
		damaged: 'Damaged',
		refused: 'Refused',
		untried: 'Not tried',
		cannot: 'Cannot be kept'
	};

	const toneOf = (state: Confirmation) =>
		state === 'confirmed' ? 'good' : state === 'untried' ? 'waiting' : 'bad';

	const KIND_WORDS: Record<PlaceRecord['kind'], string> = {
		cache: 'Inside this browser',
		folder: 'A folder on this computer',
		synced: 'A folder that syncs',
		bucket: 'A bucket',
		drive: 'A drive you unplug'
	};
</script>

<svelte:head><title>Where your work is kept — Q</title></svelte:head>

<Page title="Where your work is kept" lead="Every place you have named, and what can honestly be said about each.">
	{#if !identity}
		<SignIn />
	{:else}
		{#if ways}
			<Section title="Ways back in" description="Copies keep your data. These keep you — the key every copy is locked to.">
				<div class="panel">
					<Status tone={ways.level === 'fine' ? 'good' : ways.level === 'warn' ? 'waiting' : 'bad'}>
						{ways.level === 'fine' ? 'Covered' : ways.level === 'warn' ? 'One fate' : 'One way in'}
					</Status>
					<p class="mt-3 text-lg">{ways.says}</p>
					{#if ways.fix}<p class="mt-1 text-sm"><a class="anchor" href="/keys">{ways.fix}</a></p>{/if}
				</div>
			</Section>
		{/if}

		<Section title="Rule engine" description="Checks every action against what it must, may and cannot do — here, on this device, offline.">
			<div class="panel">
				<Status tone={engineTone(engine.state)}>{ENGINE_WORD[engine.state]}</Status>
				{#if engine.state === 'ready'}
					<p class="mt-3 text-lg">
						Cedar {engine.version}, woken in {engine.tookMs} ms, with {Object.keys(engine.actions).length}
						{Object.keys(engine.actions).length === 1 ? 'action' : 'actions'} loaded: {Object.keys(engine.actions).join(', ')}.
					</p>
				{:else if engine.state === 'waking'}
					<p class="mt-3 text-lg">Starting. The first time on this device it is downloaded once, then kept here.</p>
				{:else if engine.state === 'failed'}
					<p class="mt-3 text-lg">{engine.problem}</p>
				{:else}
					<p class="mt-3 text-lg">It wakes when you sign in.</p>
				{/if}
			</div>
		</Section>

		{#if !places.length}
			<Empty
				icon="network"
				title="No places yet"
				description="A place is anywhere your work is kept — a folder, a bucket, a drive in a drawer. Name one and Q writes something there and reads it back, so you know it works before you rely on it."
			/>
		{/if}

		<Section title="Add a place" description="Q proves what it can reach, and records what it cannot.">
			{#if offered}
				<Item
					title={offered.called}
					subtitle={KIND_WORDS[offered.kind]}
					description="Q already has this open. Adding it writes something there and reads it back."
				>
					{#snippet actions()}
						<button class="btn btn-sm preset-filled" disabled={busy === 'adding'} onclick={() => add(offered)}>
							{busy === 'adding' ? 'Trying…' : 'Add it'}
						</button>
					{/snippet}
				</Item>
			{/if}

			{#if adding}
				<div class="card preset-outlined-surface-200-800 bg-surface-50-950 mt-3 flex flex-col gap-3 p-4">
					<label class="label">
						<span class="label-text">What do you call it?</span>
						<input class="input" bind:value={newName} placeholder="Flash drive 2026" />
					</label>
					<label class="label">
						<span class="label-text">What kind of place is it?</span>
						<select class="select" bind:value={newKind}>
							<option value="drive">A drive you unplug</option>
							<option value="bucket">A bucket, or a federation's</option>
							<option value="synced">A folder that syncs</option>
							<option value="folder">A folder on this computer</option>
						</select>
					</label>
					<p class="text-sm text-surface-700-300">
						Q can only write to and read back from the folder it has open. Anything else is recorded as
						named but not tried, which is the honest state.
					</p>
					<div class="flex gap-2">
						<button class="btn btn-sm preset-filled" disabled={!newName.trim() || busy === 'adding'} onclick={() => add({ called: newName, kind: newKind })}>
							{busy === 'adding' ? 'Saving…' : 'Add it'}
						</button>
						<button class="btn btn-sm preset-tonal" onclick={() => (adding = false)}>Never mind</button>
					</div>
				</div>
			{:else}
				<button class="btn btn-sm preset-tonal mt-3" onclick={() => (adding = true)}>Somewhere else…</button>
			{/if}

			{#if said?.id === 'adding'}
				<p class="text-error-600-400 mt-3 text-sm">{said.says}</p>
			{/if}
		</Section>
	{/if}

	{#if identity && places.length}
		<div class="card p-5 mb-6">
			<Status tone={safety.level === 'fine' ? 'good' : safety.level === 'warn' ? 'waiting' : 'bad'}>
				{safety.level === 'fine' ? 'Safe' : safety.level === 'warn' ? 'Thin' : 'At risk'}
			</Status>
			<p class="mt-3 text-lg">{safety.says}</p>
			{#if safety.fix}
				<p class="mt-1 text-sm text-surface-700-300">{safety.fix}</p>
			{/if}
		</div>

		<Section title="Places" description="The newest thing known about each.">
			<div class="space-y-3">
				{#each places as place (place.id)}
					{@const standing = standingOfPlace(asPlaces.find((p) => p.id === place.id)!)}
					{@const told = confirmation(place.kind, provenOf(place), place.called)}
					{@const where = situationOf(place.kind, place.kind === 'drive' ? 'unknown' : 'here', place.called)}
					<Item
						title={place.called}
						subtitle={KIND_WORDS[place.kind]}
						description={told.says}
						meta={standing.says}
					>
						{#snippet status()}
							<Status tone={toneOf(told.state)}>{WORD[told.state]}</Status>
						{/snippet}

						{#snippet actions()}
							{#if canProve(place)}
								<button class="btn btn-sm preset-tonal" disabled={busy === place.id} onclick={() => prove(place)}>
									{busy === place.id ? 'Trying…' : 'Try it'}
								</button>
							{/if}
						{/snippet}

						{#if !where.expected}<p class="text-sm text-error-600-400">{where.says}</p>{/if}
						{#if warningFor(place.kind)}<p class="text-sm">{warningFor(place.kind)}</p>{/if}
						{#if !canHoldTheOnlyCopy(place.kind)}
							<p class="text-sm text-error-600-400">This cannot be the only place.</p>
						{/if}
						{#if told.fix}<p class="text-sm text-surface-700-300">{told.fix}</p>{/if}

						{@const check = checks[place.id]}
						{#if check?.whose === 'broken'}
							<p class="text-error-600-400 text-sm">
								The receipt this came from does not hold up. {check.says}
							</p>
						{:else if check?.whose === 'theirs'}
							<p class="text-sm text-surface-700-300">Somebody else wrote this. {check.says}</p>
						{:else if check?.whose === 'unsigned'}
							<p class="text-sm text-surface-700-300">{check.says}</p>
						{/if}

						{#if said?.id === place.id}
							<div class="border-surface-200-800 mt-1 border-t pt-3">
								<Status tone={said.tone}>
									{said.tone === 'good' ? 'It works' : said.tone === 'bad' ? 'It does not' : 'Nothing to try'}
								</Status>
								<p class="mt-2 text-sm">{said.says}</p>
								{#if said.fix}<p class="mt-1 text-sm text-surface-700-300">{said.fix}</p>{/if}
							</div>
						{/if}
					</Item>
				{/each}
			</div>
		</Section>

		<Section title="What Q cannot tell you yet">
			<Item
				title="How much is stored, and what it costs"
				description="Nothing here measures a bucket's size or a bill. This page showed invented figures for both until 20 September; they are gone rather than replaced, because a zero would be as untrue as the number that was there."
			/>
			<Item
				title="Whether a bucket or a drive really answered"
				description="Only the folder Q has open can be written to and read back from a browser tab. A bucket needs its own round trip over the wire; a drive needs plugging in. Until then they say “not tried”, which is the honest state."
			/>
		</Section>
	{/if}
</Page>
