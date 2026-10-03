<script lang="ts">
	/*
	 * Write an agreement (ADR-Q-025 §2, 3 October 2026): "I'll cut your grass
	 * in exchange for…" — in steps, one screen each, no blank page.
	 *
	 *   1 Who with   2 What you'll give   3 In exchange for
	 *   4 When and where (optional)   5 How you'll both know it's done (optional)
	 *   6 Read it back, as one sentence, and send
	 *
	 * The same steps make a counteroffer (?counter=<agreement>) and, after
	 * agreeing, a change to the agreement (a variation) — the people stay the
	 * same; the terms are yours to change. Nothing is sent until step 6, and
	 * the rule engine checks it before it's signed.
	 */
	import { Steps } from '@skeletonlabs/skeleton-svelte';
	import { Page, Icon } from '@inqbeta/q-ui';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { problemsWithTerms, valueText, type Terms, type Value } from '@inqbeta/q-core/agreements';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { agreementsFrom, creditsCommitted, creditsHeld, newAgreementId, takeStep } from '$lib/agreements';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	const me = $derived(identity?.did ?? '');
	const people = $derived(peopleFrom(ledger, me).filter((p) => p.inbox));

	/* Countering, or changing an agreement: the agreement it answers. */
	const counterId = $derived(page.url.searchParams.get('counter') ?? '');
	const answering = $derived(counterId ? agreementsFrom(ledger).find((a) => a.id === counterId) : undefined);
	const varying = $derived(answering?.standing.phase === 'agreed');

	type Kind = 'thing' | 'credits' | 'pounds';
	interface Side {
		kind: Kind;
		thing: string;
		credits: number;
		pounds: string;
	}
	const blank = (): Side => ({ kind: 'thing', thing: '', credits: 1, pounds: '' });

	let withDid = $state(page.url.searchParams.get('with') ?? '');
	let business = $state(false);
	let mine = $state<Side>(blank());
	let theirs = $state<Side>(blank());
	let when = $state('');
	let where = $state('');
	let doneWhen = $state('');
	let until = $state('');

	/* Filled in once from what's being answered. */
	const fromValue = (v: Value): Side => ('credits' in v ? { ...blank(), kind: 'credits', credits: v.credits } : 'pence' in v ? { ...blank(), kind: 'pounds', pounds: (v.pence / 100).toFixed(2) } : { ...blank(), thing: v.thing });
	let filled = false;
	$effect(() => {
		const t = answering?.standing.terms;
		if (filled || !t || !me) return;
		filled = true;
		withDid = t.a === me ? t.b : t.a;
		business = !!t.business;
		mine = fromValue(t.a === me ? t.aGives : t.bGives);
		theirs = fromValue(t.a === me ? t.bGives : t.aGives);
		when = t.when ?? '';
		where = t.where ?? '';
		doneWhen = t.doneWhen ?? '';
	});

	const them = $derived(people.find((p) => p.did === withDid) ?? peopleFrom(ledger, me).find((p) => p.did === withDid));
	const valueOf = (s: Side): Value =>
		s.kind === 'credits' ? { credits: Math.trunc(Number(s.credits) || 0), mode: 'test' } : s.kind === 'pounds' ? { pence: Math.round((Number(s.pounds) || 0) * 100) } : { thing: s.thing.trim() };

	const terms = $derived.by((): Terms | null => {
		if (!me || !withDid) return null;
		const base = answering?.standing.terms;
		const a = base?.a ?? me;
		const b = base?.b ?? withDid;
		const mv = valueOf(mine);
		const tv = valueOf(theirs);
		return {
			kind: base?.kind === 'treaty' ? 'treaty' : business ? 'job' : 'swap',
			a,
			b,
			aGives: a === me ? mv : tv,
			bGives: a === me ? tv : mv,
			...(when.trim() ? { when: when.trim() } : {}),
			...(where.trim() ? { where: where.trim() } : {}),
			...(doneWhen.trim() ? { doneWhen: doneWhen.trim() } : {}),
			...(business ? { business: true } : {})
		};
	});
	const problems = $derived(terms ? problemsWithTerms(terms) : []);
	const available = $derived(me ? creditsHeld(ledger, me, 'test') - creditsCommitted(ledger, me, 'test', counterId || undefined) : 0);
	const overPromising = $derived(mine.kind === 'credits' && Number(mine.credits) > available);

	const STEPS = [
		{ title: 'Who with', says: 'Someone from your address book.' },
		{ title: 'What you’ll give', says: 'Something you’ll do or give, some credits, or (for paid work) pounds.' },
		{ title: 'In exchange for', says: 'What you’ll get back. Not the same kind both ways: credits for credits is a gift.' },
		{ title: 'When and where', says: 'If it matters. You can leave these empty.' },
		{ title: 'When it’s done', says: 'How you’ll both know it’s finished, and how long the offer stays open. Both optional.' },
		{ title: 'Read it back', says: 'This is what will be sent. Nothing is binding until you both agree.' }
	];
	let step = $state(0);
	const sideReady = (s: Side) => (s.kind === 'thing' ? !!s.thing.trim() : s.kind === 'credits' ? Number(s.credits) >= 1 : Number(s.pounds) > 0);
	const canGoOn = $derived([!!withDid, sideReady(mine) && !overPromising, sideReady(theirs) && !(mine.kind !== 'thing' && mine.kind === theirs.kind), true, true, !problems.length][step]);

	let busy = $state(false);
	let says = $state('');
	async function send() {
		if (!identity || !terms) return;
		busy = true;
		says = '';
		const id = answering?.id ?? newAgreementId();
		const s = answering?.standing;
		const out = await takeStep(
			identity,
			ledger,
			id,
			{
				step: answering ? 'countered' : 'proposed',
				parent: answering ? ((s?.phase === 'agreeing' ? s.offerHash : s?.lastHash) ?? null) : null,
				terms,
				...(until ? { until: new Date(`${until}T23:59:59`).toISOString() } : {})
			},
			peopleFrom(ledger, me)
		);
		busy = false;
		if (!out.ok) says = out.says;
		else void goto(`/agreements/${encodeURIComponent(id)}${out.says ? `?said=${encodeURIComponent(out.says)}` : ''}`);
	}

	const title = $derived(varying ? 'Change the agreement' : answering ? 'Make a counteroffer' : 'Write an agreement');
</script>

<svelte:head><title>{title} — Q</title></svelte:head>

{#snippet valueInput(side: Side, label: string, allowPounds: boolean)}
	<div class="flex flex-col gap-4 max-w-xl">
		<div class="flex flex-wrap gap-2" role="group" aria-label={label}>
			{#each [{ k: 'thing', t: 'Something done or given', i: 'heart' }, { k: 'credits', t: 'Credits', i: 'wallet' }, ...(allowPounds ? [{ k: 'pounds', t: 'Pounds', i: 'balance' }] : [])] as o (o.k)}
				<button type="button" class="btn min-h-11 {side.kind === o.k ? 'preset-filled-primary-500' : 'preset-tonal'}" aria-pressed={side.kind === o.k} onclick={() => (side.kind = o.k as Kind)}>
					<Icon name={o.i as 'heart'} size={18} />{o.t}
				</button>
			{/each}
		</div>
		{#if side.kind === 'thing'}
			<label class="label"><span class="label-text">In your own words</span><input class="input" bind:value={side.thing} maxlength="200" /></label>
		{:else if side.kind === 'credits'}
			<label class="label"><span class="label-text">How many credits</span><input class="input max-w-40" type="number" min="1" step="1" bind:value={side.credits} /></label>
			<p class="text-sm text-surface-700-300">Test credits for now: no money is involved.</p>
		{:else}
			<label class="label"><span class="label-text">How many pounds</span><input class="input max-w-40" type="number" min="0.01" step="0.01" inputmode="decimal" bind:value={side.pounds} /></label>
			<p class="text-sm text-surface-700-300">Recorded for both of your accounts. Q never moves money.</p>
		{/if}
	</div>
{/snippet}

<Page {title} lead={answering ? 'Change what you like. The other person sees it as a new offer, and the last one stays in the record.' : 'In steps. Nothing is sent until the last one.'}>
	{#if !identity}
		<div class="panel"><SignIn /></div>
	{:else}
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6 flex flex-col gap-6 max-w-3xl">
			<Steps count={STEPS.length} {step} onStepChange={(d) => (canGoOn || d.step < step) && (step = d.step)}>
				<Steps.List class="mb-6">
					{#each STEPS as s, i (s.title)}
						<Steps.Item index={i}>
							<Steps.Trigger class="min-h-11">
								<Steps.Indicator>{i + 1}</Steps.Indicator>
								<span class="hidden md:inline">{s.title}</span>
							</Steps.Trigger>
							{#if i < STEPS.length - 1}<Steps.Separator />{/if}
						</Steps.Item>
					{/each}
				</Steps.List>

				<header class="mb-5">
					<h2 class="h3">{STEPS[step].title}</h2>
					<p class="opacity-70">{STEPS[step].says}</p>
				</header>

				<!-- 1. Who with -->
				<Steps.Content index={0}>
					{#if answering}
						<p class="card preset-tonal-surface p-4">With {them?.name ?? 'the same person'}. The people in an agreement don’t change.</p>
					{:else if !people.length}
						<p class="card preset-tonal-surface p-4">Nobody to agree with yet. Share your card with someone, and when they link up, you can write agreements together.</p>
					{:else}
						<ul class="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Who with">
							{#each people as p (p.did)}
								<li>
									<button type="button" role="radio" aria-checked={withDid === p.did} class="card w-full p-3 flex items-center gap-3 text-left min-h-11 {withDid === p.did ? 'preset-filled-primary-500' : 'preset-tonal-surface hover:preset-tonal-primary'}" onclick={() => (withDid = p.did)}>
										<span class="size-11 shrink-0 overflow-hidden rounded-full bg-surface-100-900 flex items-center justify-center">
											{#if p.picture}<img src={p.picture} alt="" class="size-full object-cover" />{:else}<span class="font-bold">{p.name.slice(0, 1)}</span>{/if}
										</span>
										<span class="font-bold">{p.name}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<label class="flex items-center gap-3 min-h-11 mt-5">
						<input type="checkbox" class="checkbox" bind:checked={business} />
						This is paid work: a job, recorded for both of our accounts
					</label>
				</Steps.Content>

				<!-- 2. What you'll give -->
				<Steps.Content index={1}>
					{@render valueInput(mine, 'What you’ll give', business)}
					{#if mine.kind === 'credits'}
						<p class="text-sm mt-3 {overPromising ? 'text-error-600-400 font-semibold' : 'text-surface-700-300'}">You have {available} test credits you can promise.</p>
					{/if}
				</Steps.Content>

				<!-- 3. In exchange for -->
				<Steps.Content index={2}>
					{@render valueInput(theirs, 'In exchange for', business)}
					{#if mine.kind !== 'thing' && mine.kind === theirs.kind}
						<p class="text-sm mt-3 text-error-600-400 font-semibold">Not the same kind both ways: choose something done or given for one side.</p>
					{/if}
				</Steps.Content>

				<!-- 4. When and where -->
				<Steps.Content index={3}>
					<div class="flex flex-col gap-4 max-w-xl">
						<label class="label"><span class="label-text">When</span><input class="input" bind:value={when} maxlength="120" /></label>
						<label class="label"><span class="label-text">Where</span><input class="input" bind:value={where} maxlength="200" /></label>
					</div>
				</Steps.Content>

				<!-- 5. Done when -->
				<Steps.Content index={4}>
					<div class="flex flex-col gap-4 max-w-xl">
						<label class="label"><span class="label-text">How you’ll both know it’s done</span><textarea class="textarea" rows="3" bind:value={doneWhen} maxlength="400"></textarea></label>
						<label class="label"><span class="label-text">The offer stays open until</span><input class="input max-w-52" type="date" bind:value={until} /></label>
					</div>
				</Steps.Content>

				<!-- 6. Read it back -->
				<Steps.Content index={5}>
					{#if terms}
						<div class="card preset-tonal-primary p-5 flex flex-col gap-2 max-w-2xl">
							<p class="h4 text-balance">You’ll give {valueText(valueOf(mine))}, and {them?.name ?? 'they'} will give {valueText(valueOf(theirs))}.</p>
							{#if terms.when || terms.where}<p>{[terms.when, terms.where].filter(Boolean).join(' · ')}</p>{/if}
							{#if terms.doneWhen}<p class="text-sm">Done when: {terms.doneWhen}</p>{/if}
							{#if until}<p class="text-sm">Open until {new Date(until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>{/if}
							<p class="text-sm opacity-80">{terms.business ? 'A job: pounds are recorded for both of your accounts.' : 'A personal swap.'}</p>
						</div>
						{#if problems.length}
							<ul class="mt-4 card preset-tonal-error p-4 list-disc ps-8">{#each problems as p (p)}<li>{p}</li>{/each}</ul>
						{/if}
						<p class="mt-4 text-sm text-surface-700-300">Signed by you, checked by the agreement rules, and sent sealed so only {them?.name ?? 'they'} can read it. This is a record of what you both say, not legal advice.</p>
					{/if}
				</Steps.Content>
			</Steps>

			<footer class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-200-800 pt-4">
				{#if step > 0}
					<button type="button" class="btn preset-tonal min-h-11" onclick={() => (step -= 1)}>Back</button>
				{:else}
					<a class="btn preset-tonal min-h-11" href={answering ? `/agreements/${encodeURIComponent(answering.id)}` : '/agreements'}>Not now</a>
				{/if}
				{#if step < STEPS.length - 1}
					<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!canGoOn} onclick={() => (step += 1)}>Next</button>
				{:else}
					<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy || !canGoOn} onclick={() => void send()}>
						<Icon name="share" size={18} />{busy ? 'Checking and sending…' : answering ? 'Send the counteroffer' : 'Send the offer'}
					</button>
				{/if}
			</footer>
			{#if says}<p class="text-sm card preset-tonal-error p-3" aria-live="polite">{says}</p>{/if}
		</div>
	{/if}
</Page>
