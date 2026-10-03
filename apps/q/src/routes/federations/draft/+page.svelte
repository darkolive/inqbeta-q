<script lang="ts">
	/*
	 * A federation, drafted (ADR-Q-007).
	 *
	 * Darren, 2026-09-28: "we should have the ability to have draft before it's
	 * published so that we can come back to and add to it before it's live."
	 *
	 * A draft is yours alone: nothing is signed by the federation, nothing is
	 * final, and it can be saved and reopened as often as you like. Founding is
	 * the one step that can't be undone, so it is its own button, it says what
	 * it will do, and the rule engine checks the result before anything is kept.
	 *
	 * /federations/draft          a new draft
	 * /federations/draft?id=…     carry on with one
	 */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Page, Section, Status, Empty } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import {
		CARETAKER_MONTHS,
		CONSENT_SUGGESTIONS,
		JOIN_POLICIES,
		PRINCIPLES,
		STRANDS,
		SUGGESTED_AGREEMENT,
		newDraft,
		stillNeeded,
		type ConsentBlock,
		type FederationDraft
	} from '@inqbeta/q-core/federations';
	import { draftFrom, foundFromDraft, saveDraft } from '$lib/federations';
	import { offersFederations } from '$lib/offers';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const wanted = $derived(page.url.searchParams.get('id'));

	/* The draft being edited, and the vault copy it came from (replaced on save). */
	let draft = $state<FederationDraft>(newDraft());
	let lastSaved = $state<string>('');
	let loaded = $state(false);
	let notFound = $state(false);

	const item = $derived(
		wanted && ledger?.state === 'ready' ? (ledger.found.find((f) => f.key === `draft:${wanted}`)?.item ?? null) : null
	);

	/* Open the draft once, when the folder has been read. Never again: the page
	 * then holds the working copy, and a later refresh must not overwrite what
	 * is being typed. */
	$effect(() => {
		if (loaded) return;
		if (!wanted) {
			loaded = true;
			lastSaved = JSON.stringify(draft);
			return;
		}
		if (ledger?.state !== 'ready') return;
		if (!item) {
			notFound = true;
			loaded = true;
			return;
		}
		void draftFrom(item).then((d) => {
			if (d) {
				draft = d;
				lastSaved = JSON.stringify(d);
			} else notFound = true;
			loaded = true;
		});
	});

	const changed = $derived(loaded && JSON.stringify(draft) !== lastSaved);
	const missing = $derived(stillNeeded(draft));

	let busy = $state<'saving' | 'founding' | null>(null);
	let said = $state<{ tone: 'good' | 'bad'; text: string; rules?: string[] } | null>(null);
	let confirming = $state(false);

	async function save(): Promise<boolean> {
		busy = 'saving';
		said = null;
		const out = await saveDraft(draft, item);
		busy = null;
		if (!out.ok) {
			said = { tone: 'bad', text: out.says };
			return false;
		}
		draft = out.draft;
		lastSaved = JSON.stringify(out.draft);
		said = { tone: 'good', text: 'Saved. It stays a draft until you found it.' };
		await refreshLedger();
		if (!wanted) await goto(`/federations/draft?id=${encodeURIComponent(out.draft.id)}`, { replaceState: true, keepFocus: true, noScroll: true });
		return true;
	}

	async function found() {
		if (!identity) return;
		busy = 'founding';
		said = null;
		const out = await foundFromDraft(identity, draft, item);
		busy = null;
		confirming = false;
		if (!out.ok) {
			said = { tone: 'bad', text: out.says, rules: 'rules' in out ? out.rules : undefined };
			return;
		}
		await refreshLedger();
		await goto('/federations');
	}

	const today = new Date().toISOString().slice(0, 10);

	/* Consent blocks — the federation's own, shown to a joiner one at a time. */
	const blocks = $derived(draft.consent ?? []);
	const unused = $derived(CONSENT_SUGGESTIONS.filter((b) => !blocks.some((x) => x.id === b.id)));
	const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'block';
	function setBlocks(next: ConsentBlock[]) {
		draft.consent = next;
	}
	function addBlock(b?: ConsentBlock) {
		let id = b?.id ?? 'our-rule';
		for (let n = 2; blocks.some((x) => x.id === id); n++) id = `${b?.id ?? 'our-rule'}-${n}`;
		setBlocks([...blocks, { id, title: b?.title ?? '', says: b?.says ?? '' }]);
	}
	function editBlock(i: number, change: Partial<ConsentBlock>) {
		setBlocks(blocks.map((b, j) => (j === i ? { ...b, ...change } : b)));
	}
	function moveBlock(i: number, by: number) {
		const next = [...blocks];
		const [b] = next.splice(i, 1);
		next.splice(Math.max(0, Math.min(next.length, i + by)), 0, b);
		setBlocks(next);
	}
	function titleChanged(i: number, title: string) {
		const b = blocks[i];
		/* A block written from scratch takes its short name from its title, until it is saved elsewhere. */
		const fresh = b.id.startsWith('our-rule');
		editBlock(i, fresh ? { title, id: blocks.some((x, j) => j !== i && x.id === slug(title)) ? b.id : slug(title) } : { title });
	}
</script>

<svelte:head><title>{draft.name.trim() || 'New federation'} — draft — Q</title></svelte:head>

<Page
	title={draft.name.trim() || 'New federation'}
	lead="A draft is yours alone. Save it as often as you like and come back to it; nothing is final until you found it."
>
	{#if !offersFederations()}
		<Empty icon="federations" title="This host doesn’t offer clubs" description="Founding a federation here is switched off. Its founder can turn Federations on in the host’s Services." />
		<a class="btn preset-tonal mt-4 min-h-11" href="/federations">Back to federations</a>
	{:else if !identity}
		<SignIn />
	{:else if !loaded}
		<p class="opacity-60">Opening the draft…</p>
	{:else if notFound}
		<Empty icon="federations" title="Draft not found" description="It may have been founded already, or it is in a folder that isn't open here." />
		<a class="btn preset-tonal mt-4" href="/federations">Back to federations</a>
	{:else}
		<div class="mb-6 flex flex-wrap items-center gap-3">
			<Status tone="waiting">Draft</Status>
			{#if changed}<Status tone="needs-you">Not saved yet</Status>{:else if item || wanted}<Status tone="good">Saved</Status>{/if}
		</div>

		<Section title="What it is" description="A name, and one sentence saying what it is for.">
			<div class="flex flex-col gap-4">
				<label class="label">
					<span class="label-text">Name</span>
					<input class="input" type="text" bind:value={draft.name} />
				</label>
				<label class="label">
					<span class="label-text">What it is for</span>
					<input class="input" type="text" bind:value={draft.purpose} />
				</label>
			</div>
		</Section>

		<Section title="What kind" description="This decides which blocks it starts with. It can grow into more later.">
			<div class="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="What kind of federation">
				{#each STRANDS as s (s.id)}
					<button
						type="button"
						role="radio"
						aria-checked={draft.strand === s.id}
						class="card p-4 text-left min-h-11 {draft.strand === s.id ? 'preset-filled-primary-500' : 'preset-outlined-surface-200-800'}"
						onclick={() => (draft.strand = s.id)}
					>
						<span class="block font-bold">{s.called}</span>
						<span class="block text-sm mt-1">{s.means}</span>
					</button>
				{/each}
			</div>
			{#if draft.strand === 'event'}
				<label class="label mt-4 max-w-xs">
					<span class="label-text">Last day</span>
					<input class="input" type="date" min={today} bind:value={draft.endsOn} />
				</label>
			{/if}
		</Section>

		<Section title="News for members" description="Will it send its members news: what’s new, things to try, asking what they think? If yes, members get a switch for it on their notifications card. If not, it never adds to their list.">
			<div class="flex flex-wrap gap-3" role="radiogroup" aria-label="Does it send members news">
				<button type="button" role="radio" aria-checked={!!draft.notifies} class="btn min-h-11 {draft.notifies ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}" onclick={() => (draft.notifies = true)}>Yes, it sends news</button>
				<button type="button" role="radio" aria-checked={!draft.notifies} class="btn min-h-11 {!draft.notifies ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}" onclick={() => (draft.notifies = false)}>No</button>
			</div>
		</Section>

		<Section title="The agreement" description="Every member signs this when they join. Keep it short and plain.">
			<textarea class="textarea" rows="4" bind:value={draft.agreement}></textarea>
			{#if draft.agreement.trim() !== SUGGESTED_AGREEMENT}
				<button type="button" class="btn btn-sm preset-tonal mt-2" onclick={() => (draft.agreement = SUGGESTED_AGREEMENT)}>
					Use the suggested words
				</button>
			{/if}
		</Section>

		<Section
			title="What members agree to"
			description="Besides the agreement, add anything a new member should know before joining. Each block is its own step when they join — one thing at a time, agreed on its own."
		>
			{#if blocks.length}
				<ol class="flex flex-col gap-3">
					{#each blocks as b, i (i)}
						<li class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
							<div class="flex items-center gap-2">
								<span class="font-bold">Step {i + 2}</span>
								<span class="ml-auto flex gap-2">
									<button type="button" class="btn btn-sm preset-tonal min-h-11" disabled={i === 0} onclick={() => moveBlock(i, -1)} aria-label="Move up">Up</button>
									<button type="button" class="btn btn-sm preset-tonal min-h-11" disabled={i === blocks.length - 1} onclick={() => moveBlock(i, 1)} aria-label="Move down">Down</button>
									<button type="button" class="btn btn-sm preset-tonal min-h-11" onclick={() => setBlocks(blocks.filter((_, j) => j !== i))}>Remove</button>
								</span>
							</div>
							<label class="label">
								<span class="label-text">Title</span>
								<input class="input" type="text" value={b.title} oninput={(e) => titleChanged(i, e.currentTarget.value)} />
							</label>
							<label class="label">
								<span class="label-text">What it means, in plain words</span>
								<textarea class="textarea" rows="3" value={b.says} oninput={(e) => editBlock(i, { says: e.currentTarget.value })}></textarea>
							</label>
						</li>
					{/each}
				</ol>
			{/if}
			<div class="flex flex-wrap gap-2 mt-3">
				{#each unused as u (u.id)}
					<button type="button" class="btn btn-sm preset-tonal min-h-11" onclick={() => addBlock(u)}>+ {u.title}</button>
				{/each}
				<button type="button" class="btn btn-sm preset-outlined-surface-500 min-h-11" onclick={() => addBlock()}>+ Write your own</button>
			</div>
			<p class="text-sm mt-3 opacity-80">
				A joiner always sees the agreement first and what can never change last. Your blocks come in between, in this order.
			</p>
		</Section>

		<Section title="How people join">
			<div class="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="How people join">
				{#each JOIN_POLICIES as p (p.id)}
					<button
						type="button"
						role="radio"
						aria-checked={draft.joinPolicy === p.id}
						class="card p-4 text-left min-h-11 {draft.joinPolicy === p.id ? 'preset-filled-primary-500' : 'preset-outlined-surface-200-800'}"
						onclick={() => (draft.joinPolicy = p.id)}
					>
						<span class="block font-bold">{p.called}</span>
						<span class="block text-sm mt-1">{p.means}</span>
					</button>
				{/each}
			</div>
		</Section>

		<Section
			title="You, as caretaker"
			description="You look after it for this long. Then the members renew you, or someone else takes over. It can never be permanent."
		>
			<label class="label max-w-xs">
				<span class="label-text">Months, {CARETAKER_MONTHS.least} to {CARETAKER_MONTHS.most}</span>
				<input class="input" type="number" min={CARETAKER_MONTHS.least} max={CARETAKER_MONTHS.most} step="1" bind:value={draft.caretakerMonths} />
			</label>
		</Section>

		<Section title="What can never change" description="Every federation carries these. No vote can remove them.">
			<ul class="list-disc pl-6 space-y-1">
				{#each PRINCIPLES as p (p.id)}<li>{p.says}</li>{/each}
			</ul>
		</Section>

		{#if said}
			<div class="card p-4 mb-4 {said.tone === 'good' ? 'preset-tonal-success' : 'preset-tonal-error'}" role="status">
				<p>{said.text}</p>
				{#if said.rules?.length}<p class="role-token text-xs mt-2">{said.rules.join(' · ')}</p>{/if}
			</div>
		{/if}

		<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-4">
			<div class="flex flex-wrap gap-3">
				<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy !== null || !changed} onclick={save}>
					{busy === 'saving' ? 'Saving…' : 'Save draft'}
				</button>
				<button
					type="button"
					class="btn preset-tonal min-h-11"
					disabled={busy !== null || missing.length > 0}
					onclick={() => (confirming = true)}
				>
					Found it…
				</button>
				<a class="btn preset-tonal-surface min-h-11" href="/federations">Back to federations</a>
			</div>

			{#if missing.length}
				<div>
					<p class="font-bold">Before it can be founded</p>
					<ul class="list-disc pl-6 text-sm mt-1">
						{#each missing as m, i (i)}<li>{m}</li>{/each}
					</ul>
				</div>
			{/if}

			{#if confirming}
				<div class="card preset-tonal-warning p-4" role="alertdialog" aria-label="Found this federation">
					<p class="font-bold">Founding is final.</p>
					<p class="mt-1 text-sm">
						{draft.name.trim()} gets its own key, signed into being by you and by itself. You become member one and its
						caretaker for {draft.caretakerMonths}
						{draft.caretakerMonths === 1 ? 'month' : 'months'}. Q’s rule engine checks all of this before anything is kept.
					</p>
					<div class="flex flex-wrap gap-3 mt-3">
						<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy !== null} onclick={found}>
							{busy === 'founding' ? 'Founding…' : 'Found it'}
						</button>
						<button type="button" class="btn preset-tonal min-h-11" onclick={() => (confirming = false)}>Not yet</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</Page>
