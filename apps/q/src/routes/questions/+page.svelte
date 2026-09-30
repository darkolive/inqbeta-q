<script lang="ts">
	/*
	 * What you have been asked, and what you said.
	 *
	 * This page is the model made visible: the questions, their address, your
	 * answers, what each answer is for, and the triples they come to. Nothing
	 * here is a view over a database — the triples ARE the answers, read back
	 * out of your own folder.
	 */
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder, type FolderState } from '@inqbeta/q-core/folder';
	import {
		USES,
		asking,
		dgraphPredicates,
		setAddress,
		triples,
		type AnswerSet,
		type Use
	} from '@inqbeta/q-core/questions';
	import { ABOUT_YOU } from '$lib/questions/about-you';
	import { YOUR_PROFILE } from '$lib/questions/your-profile';
	import { answeringOf, answersFrom, saveAnswers } from '$lib/answers';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';

	let identity = $state<Identity | null>(null);
	let folder = $state<FolderState>({ kind: 'checking' });
	let ledger = $state<Ledger | null>(null);

	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchFolder((s) => (folder = s)));
	$effect(() => watchLedger((l) => (ledger = l)));

	/*
	 * Q declares two sets. A club or a research group would declare its own the
	 * same way — nothing about these is privileged, and the page does not know
	 * which is which.
	 */
	const SETS = [ABOUT_YOU, YOUR_PROFILE];
	let chosen = $state(0);
	const set = $derived(SETS[chosen]);

	function choose(i: number) {
		chosen = i;
		editing = false;
		wroteTo = null;
		says = [];
		uses = {};
	}

	let address = $state<{ address: string; cid: string } | null>(null);
	$effect(() => {
		void setAddress(set).then((a) => (address = a));
	});

	/* Every answer set in the folder, and the newest answering of THIS one. */
	let all = $state<AnswerSet[]>([]);
	let answered = $state<AnswerSet | null>(null);

	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found).filter((f) => f.kind === 'answers') : [];
		void Promise.all(found.map((f) => answersFrom(f.item)))
			.then((list) => list.filter((a): a is AnswerSet => !!a))
			.then(async (list) => {
				all = list;
				const mine = await answeringOf(set, list);
				answered = mine;
				/* Switching sets must not leave the last set's answers in the form. */
				if (!editing) values = mine ? fromAnswers(mine) : {};
			});
	});

	function fromAnswers(a: AnswerSet): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (const [id, ans] of Object.entries(a.answers)) out[id] = ans.value;
		return out;
	}

	let values = $state<Record<string, unknown>>({});
	let uses = $state<Record<string, Use[]>>({});
	let saving = $state(false);
	let says = $state<string[]>([]);
	let editing = $state(false);
	let wroteTo = $state<string | null>(null);

	const showForm = $derived(!answered || editing);

	function toggleUse(id: string, use: Use) {
		const now = uses[id] ?? [];
		uses = { ...uses, [id]: now.includes(use) ? now.filter((u) => u !== use) : [...now, use] };
	}

	async function save() {
		const id = identity;
		if (!id) return;
		says = [];
		saving = true;
		const out = await saveAnswers(id, set, values, uses);
		saving = false;
		if (!out.ok) {
			says = out.says;
			return;
		}
		wroteTo = out.storedAs;
		editing = false;
		await refreshLedger();
	}

	const asTriples = $derived(answered ? triples(answered) : []);
	const predicates = $derived(dgraphPredicates(set));
</script>

<svelte:head><title>Questions — Q</title></svelte:head>

<Page
	title="Questions"
	lead="Schema is a set of questions. Your answers are the content. The question is the predicate, you are the subject — so what you say here is already a graph."
>
	{#if !identity}
		<div class="panel"><SignIn /></div>
	{:else}
		{#if SETS.length > 1}
			<div class="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Question sets">
				{#each SETS as s, i (s.id)}
					<button
						type="button"
						role="tab"
						aria-selected={chosen === i}
						class="btn btn-sm {chosen === i ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
						onclick={() => choose(i)}
					>
						{s.title['en-GB']}
					</button>
				{/each}
			</div>
		{/if}

		<Section title={set.title['en-GB']} description="Asked by Q. A club or a research group declares its own the same way — nothing about this set is privileged.">
			{#if address}
				<div class="panel-quiet stack-tight">
					<p class="text-sm opacity-70">
						These exact words are named by their own hash. Your answers cite it, so a reader
						can always fetch the questions that produced them — even after the wording moves on.
					</p>
					<p class="role-token text-xs break-all">{address.address}</p>
					<p class="role-token text-xs break-all opacity-60">{address.cid}</p>
				</div>
			{/if}

			{#if folder.kind !== 'ready'}
				<Empty
					icon="files"
					title="No folder yet"
					description="Answers are written into your folder, locked to your passkey. Choose one on the Files page first — it will also show you where it put it."
				>
					<a class="btn preset-filled-primary-500" href="/data">Choose a folder</a>
				</Empty>
			{:else if showForm}
				<div class="stack mt-4">
					{#each set.questions as q (q.id)}
						<div class="panel stack-tight">
							<label class="block">
								<span class="font-medium">{asking(q)}</span>
								{#if q.optional}<span class="text-xs opacity-60"> — optional</span>{/if}
								{#if q.help?.['en-GB']}<span class="block hint">{q.help['en-GB']}</span>{/if}

								{#if q.answer === 'text' || q.answer === 'did' || q.answer === 'link'}
									<input
										class="input mt-2"
										type={q.answer === 'link' ? 'url' : 'text'}
										inputmode={q.answer === 'link' ? 'url' : undefined}
										value={String(values[q.id] ?? '')}
										oninput={(e) => (values = { ...values, [q.id]: e.currentTarget.value })}
									/>
								{:else if q.answer === 'longtext'}
									<textarea class="textarea mt-2" rows="3" value={String(values[q.id] ?? '')} oninput={(e) => (values = { ...values, [q.id]: e.currentTarget.value })}></textarea>
								{:else if q.answer === 'date'}
									<input class="input mt-2" type="date" value={String(values[q.id] ?? '')} oninput={(e) => (values = { ...values, [q.id]: e.currentTarget.value })} />
								{:else if q.answer === 'number'}
									<input class="input mt-2" type="number" value={String(values[q.id] ?? '')} oninput={(e) => (values = { ...values, [q.id]: e.currentTarget.value })} />
								{:else if q.answer === 'boolean'}
									<span class="mt-2 flex gap-2">
										<button type="button" class="btn btn-sm {values[q.id] === true ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}" onclick={() => (values = { ...values, [q.id]: true })}>Yes</button>
										<button type="button" class="btn btn-sm {values[q.id] === false ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}" onclick={() => (values = { ...values, [q.id]: false })}>No</button>
									</span>
								{:else if q.answer === 'choice'}
									<span class="mt-2 flex flex-wrap gap-2">
										{#each q.choices ?? [] as c (c.id)}
											<button type="button" class="btn btn-sm {values[q.id] === c.id ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}" onclick={() => (values = { ...values, [q.id]: c.id })}>
												{c.label['en-GB']}
											</button>
										{/each}
									</span>
								{/if}
							</label>

							<div class="stack-tight">
								<p class="hint">Answering is <strong>given</strong>, and that is all it is. Anything more is a separate thing to say:</p>
								<div class="flex flex-wrap gap-2">
									{#each USES.filter((u) => u.id !== 'given') as u (u.id)}
										<button
											type="button"
											title={u.says}
											aria-pressed={(uses[q.id] ?? []).includes(u.id)}
											class="btn btn-sm {(uses[q.id] ?? []).includes(u.id) ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
											onclick={() => toggleUse(q.id, u.id)}
										>
											{u.label}
										</button>
									{/each}
								</div>
							</div>
						</div>
					{/each}

					<div class="actions">
						<button type="button" class="btn preset-filled-primary-500" disabled={saving} onclick={() => void save()}>
							{saving ? 'Writing…' : answered ? 'Answer again' : 'Save my answers'}
						</button>
						{#if answered}
							<button type="button" class="btn preset-outlined-surface-500" onclick={() => (editing = false)}>Leave it as it was</button>
						{/if}
					</div>

					{#if says.length}
						<div class="panel-warn stack-tight" aria-live="polite">
							{#each says as s}<p class="text-sm">{s}</p>{/each}
						</div>
					{/if}
				</div>
			{:else if answered}
				<div class="stack mt-4">
					{#if wroteTo}
						<div class="panel-quiet stack-tight">
							<p class="text-sm">
								Written into <strong>{folder.kind === 'ready' ? folder.name : 'your folder'}</strong>, as:
							</p>
							<p class="role-token text-xs break-all">{wroteTo}</p>
							<p class="hint">
								The name is the file's own hash. The folder is flat — “answers” is a label
								sealed inside the lock, not a directory — so nothing on disk says what any
								file is. That is the point of it.
							</p>
						</div>
					{/if}
					{#each set.questions as q (q.id)}
						{@const a = answered.answers[q.id]}
						<Item icon="info" title={asking(q)} subtitle={a ? String(a.value) : 'Not answered'}>
							{#snippet status()}
								<Status tone={a ? 'good' : 'plain'}>{a ? a.uses.join(', ') : 'unanswered'}</Status>
							{/snippet}
						</Item>
					{/each}
					<div class="actions">
						<button type="button" class="btn preset-outlined-surface-500" onclick={() => (editing = true)}>Answer again</button>
					</div>
					<p class="hint">
						Answering again writes a new receipt. The one before keeps its own signature and
						its own time — what you said before is still what you said.
					</p>
				</div>
			{/if}
		</Section>

		{#if answered}
			<Section title="As a graph" description="Not a view over a database. These are the answers, read back out of your folder.">
				<div class="table-container">
					<table class="table">
						<thead>
							<tr><th>Subject</th><th>Predicate</th><th>Object</th><th>For</th></tr>
						</thead>
						<tbody>
							{#each asTriples as t (t.predicate)}
								<tr>
									<td class="role-token text-xs">{t.subject.slice(0, 16)}…</td>
									<td class="role-token text-xs">{t.predicate}</td>
									<td>{String(t.object)}</td>
									<td class="text-xs opacity-70">{t.uses.join(', ')}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Section>
		{/if}

		<Section title="The Dgraph schema these questions imply" description="Generated from the questions, not written in a source file. A federation adds a question without anyone editing code.">
			<pre class="pre text-xs overflow-x-auto">{Object.entries(predicates).map(([k, v]) => `${k}: ${v} .`).join('\n')}</pre>
		</Section>
	{/if}
</Page>
