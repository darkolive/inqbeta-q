<script lang="ts">
	/*
	 * One agreement (ADR-Q-025): the card, what you can do now, and every step
	 * as a sentence from your side.
	 *
	 * What you can do depends only on where it stands:
	 *   agreeing, your answer   Agree · Counteroffer · Decline
	 *   agreeing, your offer    Withdraw
	 *   agreed                  Say it's done · Settle (all, or part) · Change the agreement
	 *   a settlement waiting    Confirm it (the other person signed) — or wait for them
	 * Each is checked by the agreement rules before it's signed.
	 */
	import { Page, Section, Icon, Status } from '@inqbeta/q-ui';
	import { page } from '$app/state';
	import SignIn from '$lib/components/SignIn.svelte';
	import AgreementCard from '$lib/components/AgreementCard.svelte';
	import AgreementTimeline from '$lib/components/AgreementTimeline.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { remainingOf, valueText, type Entry } from '@inqbeta/q-core/agreements';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import type { Names } from '$lib/receipt-read';
	import { agreementsFrom, takeStep, type StepInput } from '$lib/agreements';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const id = $derived(page.params.id ?? '');
	const me = $derived(identity?.did ?? '');
	const people = $derived(peopleFrom(ledger, me));
	const names = $derived<Names>({ me, nameOf: (d) => people.find((p) => p.did === d)?.name });
	const view = $derived(agreementsFrom(ledger).find((a) => a.id === id));
	const s = $derived(view?.standing);
	const themName = $derived.by(() => {
		const t = s?.terms;
		const d = t ? (t.a === me ? t.b : t.a) : '';
		return people.find((p) => p.did === d)?.name ?? 'they';
	});

	/* What's left to settle, ticked by default; numbers can be lowered to settle part. */
	const left = $derived(s ? remainingOf(s) : []);
	let picked = $state<Record<number, boolean>>({});
	let amounts = $state<Record<number, number>>({});
	$effect(() => {
		left.forEach((e, i) => {
			picked[i] ??= true;
			amounts[i] ??= 'credits' in e.value ? e.value.credits : 'pence' in e.value ? e.value.pence / 100 : 1;
		});
	});
	const settling = $derived<Entry[]>(
		left.flatMap((e, i) => {
			if (!picked[i]) return [];
			if ('credits' in e.value) return [{ ...e, value: { credits: Math.trunc(Number(amounts[i]) || 0), mode: e.value.mode } }];
			if ('pence' in e.value) return [{ ...e, value: { pence: Math.round((Number(amounts[i]) || 0) * 100) } }];
			return [e];
		})
	);
	let note = $state('');

	let busy = $state('');
	let says = $state(page.url.searchParams.get('said') ?? '');
	let good = $state(false);
	async function act(label: string, input: StepInput) {
		if (!identity) return;
		busy = label;
		says = '';
		const out = await takeStep(identity, ledger, id, input, people);
		busy = '';
		good = out.ok;
		says = out.ok ? (out.says ?? `Done: ${label.toLowerCase()}. ${out.sent ? `Sent to ${themName}.` : ''}`) : out.says;
		if (out.ok) note = '';
	}

	const who = (d: string) => (d === me ? 'you' : themName);
	const entryText = (e: Entry) => `${valueText(e.value)} from ${who(e.from)} to ${who(e.to)}`;
</script>

<svelte:head><title>Agreement — Q</title></svelte:head>

<Page title="Agreement" lead="Agree first, then settle up. Every step is signed by whoever took it, and kept by you both.">
	{#snippet actions()}
		<a href="/agreements" class="btn preset-tonal min-h-11"><Icon name="arrowLeft" size={16} /> All agreements</a>
	{/snippet}

	{#if !identity}
		<div class="panel"><SignIn /></div>
	{:else if !view || !s}
		<p class="card preset-tonal-surface p-4">This agreement isn’t in your vault, or hasn’t arrived yet.</p>
	{:else}
		<div class="grid gap-8 lg:grid-cols-5 items-start">
			<div class="lg:col-span-3 flex flex-col gap-6">
				<AgreementCard standing={s} {me} {people} />

				<!-- What you can do now. -->
				<section class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-5 flex flex-col gap-4" aria-labelledby="now">
					<h2 id="now" class="h5">Now</h2>

					{#if s.phase === 'agreeing' && s.waitingFor === me}
						<p>{themName} has offered this. Agreeing is the contract point: from then on, it’s binding on you both.</p>
						<div class="flex flex-wrap gap-3">
							<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!!busy} onclick={() => void act('Agreed', { step: 'agreed', parent: s.offerHash ?? null })}><Icon name="check" size={18} />{busy === 'Agreed' ? 'Checking…' : 'Agree'}</button>
							<a class="btn preset-tonal min-h-11" href="/agreements/new?counter={encodeURIComponent(id)}"><Icon name="repeat" size={18} /> Counteroffer</a>
							<button type="button" class="btn preset-tonal min-h-11" disabled={!!busy} onclick={() => void act('Declined', { step: 'declined', parent: s.offerHash ?? null })}>{busy === 'Declined' ? 'Checking…' : 'Decline'}</button>
						</div>
					{:else if s.phase === 'agreeing'}
						<p>Waiting for {themName} to answer: agree, counteroffer, or decline.</p>
						{#if s.offeredBy === me}
							<button type="button" class="btn preset-tonal min-h-11 self-start" disabled={!!busy} onclick={() => void act('Withdrawn', { step: 'withdrawn', parent: s.offerHash ?? null })}>{busy === 'Withdrawn' ? 'Checking…' : 'Withdraw my offer'}</button>
						{/if}
					{:else if s.phase === 'agreed' && s.pending}
						{#if s.pending.by === me}
							<p>You’ve settled: {s.pending.entries.map(entryText).join('; ')}. Waiting for {themName} to confirm.</p>
						{:else}
							<p>{themName} has settled: <strong>{s.pending.entries.map(entryText).join('; ')}</strong>. Confirm it if that’s right, and it counts for you both.</p>
							<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!busy} onclick={() => void act('Settlement confirmed', { step: 'settled', parent: s.pending!.hash, entries: s.pending!.entries })}><Icon name="check" size={18} />{busy ? 'Checking…' : 'Confirm the settlement'}</button>
						{/if}
					{:else if s.phase === 'agreed'}
						<p>Agreed by you both. When it’s done, settle up: the settlement is the accounting, and counts once you’ve both signed it.</p>
						<div class="flex flex-col gap-3">
							<label class="label"><span class="label-text">A note (optional)</span><input class="input" bind:value={note} maxlength="200" /></label>
							<button type="button" class="btn preset-tonal min-h-11 self-start" disabled={!!busy} onclick={() => void act('Said it’s done', { step: 'done', parent: s.lastHash ?? null, ...(note.trim() ? { note: note.trim() } : {}) })}><Icon name="check" size={18} />{busy === 'Said it’s done' ? 'Checking…' : 'Say it’s done'}</button>
						</div>
						{#if left.length}
							<fieldset class="card preset-tonal-surface p-4 flex flex-col gap-3">
								<legend class="font-bold px-1">Settle up</legend>
								{#each left as e, i (i)}
									<div class="flex flex-wrap items-center gap-3">
										<label class="flex items-center gap-3 min-h-11 flex-1 min-w-48">
											<input type="checkbox" class="checkbox" bind:checked={picked[i]} />
											<span>{entryText(e)}</span>
										</label>
										{#if 'credits' in e.value || 'pence' in e.value}
											<label class="label flex items-center gap-2">
												<span class="label-text">{'credits' in e.value ? 'Credits' : 'Pounds'}</span>
												<input class="input max-w-28" type="number" min={'credits' in e.value ? 1 : 0.01} step={'credits' in e.value ? 1 : 0.01} bind:value={amounts[i]} />
											</label>
										{/if}
									</div>
								{/each}
								<p class="text-sm text-surface-700-300">Lower a number to settle part now (a job in stages). {themName} confirms, and only then does it count.</p>
								<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!busy || !settling.length} onclick={() => void act('Settled', { step: 'settled', parent: s.lastHash ?? null, entries: settling })}><Icon name="balance" size={18} />{busy === 'Settled' ? 'Checking…' : 'Settle'}</button>
							</fieldset>
						{/if}
						<a class="btn preset-tonal min-h-11 self-start" href="/agreements/new?counter={encodeURIComponent(id)}"><Icon name="repeat" size={18} /> Change the agreement</a>
					{:else if s.phase === 'complete'}
						<p class="flex items-center gap-2"><Status tone="good">Settled</Status> Agreed, and settled by you both. It’s in both of your vaults.</p>
					{:else}
						<p>This agreement ended{s.ended === 'declined' ? ': it was declined' : s.ended === 'withdrawn' ? ': the offer was withdrawn' : ': the offer ran out'}. Nothing was settled.</p>
					{/if}

					{#if says}<p class="text-sm card p-3 {good ? 'preset-tonal-success' : 'preset-tonal-warning'}" aria-live="polite">{says}</p>{/if}
				</section>
			</div>

			<div class="lg:col-span-2">
				<Section title="What happened" description="Every step, signed by whoever took it. The magnifier opens its receipt.">
					<AgreementTimeline steps={view.steps} terms={s.terms} {me} {names} {ledger} />
				</Section>
			</div>
		</div>
	{/if}
</Page>
