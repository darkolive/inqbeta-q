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
	 *   in your shop            the shop's link · what's sold · Take it out of my shop
	 *   sold, not yet paid      Cancel: sold out (the seller, before any settling)
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
	import { agreementsFrom, needsMe, takeStep, type StepInput } from '$lib/agreements';
	import { isOpenOffer, isStandingOffer, stockLeft } from '@inqbeta/q-core/agreements';
	import { shopLink, tellShop } from '$lib/shop';
	import { makeOfferLink } from '$lib/offerlink';
	import ShareLink from '$lib/components/ShareLink.svelte';
	import { readMint, type MintView } from '$lib/money';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const id = $derived(page.params.id ?? '');
	let mint = $state<MintView | null>(null);
	$effect(() => void readMint().then((m) => (mint = m.view)));
	const me = $derived(identity?.did ?? '');
	const people = $derived(peopleFrom(ledger, me));
	const names = $derived<Names>({ me, nameOf: (d) => people.find((p) => p.did === d)?.name });
	const all = $derived(agreementsFrom(ledger));
	const view = $derived(all.find((a) => a.id === id));
	const s = $derived(view?.standing);
	/* A shop offer: every sale of it you hold, and how many are left. */
	const sales = $derived(s?.limit && !s.takenFrom ? all.filter((a) => a.standing.takenFrom?.hash === s.offerHash) : []);
	const leftInShop = $derived(s ? stockLeft(s, sales.map((a) => a.standing)) : 0);
	const sellerOf = (d: string) => (d === me ? 'your' : `${people.find((p) => p.did === d)?.name ?? 'their'}’s`);
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
			if ('credits' in e.value) return [{ ...e, value: { ...e.value, credits: Math.trunc(Number(amounts[i]) || 0) } }];
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
		const out = await takeStep(identity, ledger, id, input, people, mint);
		busy = '';
		good = out.ok;
		says = out.ok ? (out.says ?? `Done: ${label.toLowerCase()}. ${out.sent ? `Sent to ${themName}.` : ''}`) : out.says;
		if (out.ok) note = '';
		/* The shop holds the stock: tell it when a listing comes out or a sale is cancelled. */
		if (out.ok && (input.step === 'withdrawn' || input.step === 'declined') && s?.limit && s.terms?.a === me) {
			const told = await tellShop(me, out.signed);
			if (!told.ok) says = `${says} The shop didn’t hear just now: ${told.says}`;
		}
	}

	/* Your open offer: a link to send it with (ADR-Q-026). Made when asked, or straight away after writing it. */
	let link = $state('');
	let linkSays = $state('');
	let making = $state(false);
	async function makeLink() {
		if (!view) return;
		making = true;
		linkSays = '';
		const out = await makeOfferLink(view.steps[0], ledger);
		making = false;
		if (out.ok) link = out.link;
		else linkSays = out.says;
	}
	let autoLinked = false;
	$effect(() => {
		if (!autoLinked && page.url.searchParams.get('share') && view && s && isOpenOffer(s) && s.offeredBy === me) {
			autoLinked = true;
			void makeLink();
		}
	});

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

					{#if isStandingOffer(s) && s.offeredBy === me}
						<p>It’s in your shop. {sales.length ? `${sales.length} sold that you know of, ` : ''}<strong>{leftInShop} left</strong>. Each sale is its own agreement, agreed the moment someone buys.</p>
						<ShareLink link={shopLink(me)} label="Your shop’s link" subject="My shop on Q" message="Here’s my shop on Q. Have a look, and buy anything you like." note="Anyone with the link can see your shop." />
						{#if sales.length}
							<ul class="flex flex-col gap-2">
								{#each sales as a (a.id)}
									<li><a class="anchor" href="/agreements/{encodeURIComponent(a.id)}">Sold to {people.find((p) => p.did === a.standing.terms?.b)?.name ?? 'someone'}</a> · {a.standing.ended === 'sold-out' ? 'cancelled' : a.standing.phase === 'complete' ? 'paid' : 'not paid yet'}</li>
								{/each}
							</ul>
						{/if}
						<button type="button" class="btn preset-tonal min-h-11 self-start" disabled={!!busy} onclick={() => void act('Taken out of your shop', { step: 'withdrawn', parent: s.offerHash ?? null })}>{busy ? 'Checking…' : 'Take it out of my shop'}</button>
					{:else if isStandingOffer(s)}
						<p>This is in {sellerOf(s.offeredBy ?? '')} shop.</p>
						<a class="btn preset-filled-primary-500 min-h-11 self-start" href="/shop/{encodeURIComponent(s.offeredBy ?? '')}"><Icon name="wallet" size={18} /> Go to the shop</a>
					{:else if isOpenOffer(s) && s.offeredBy === me}
						<p>Your offer is open. Send the link any way you like: the first person to open it can accept, counteroffer or decline, and your bell rings when they do.</p>
						{#if link}
							<ShareLink {link} label="Your offer’s link" subject="An offer for you" message="I’ve made you an offer on Q. Open it to see it, and accept, counteroffer or decline." note="It opens for one person: whoever opens it first." />
						{:else}
							<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={making} onclick={() => void makeLink()}><Icon name="share" size={18} />{making ? 'Making the link…' : 'Make a link to send'}</button>
						{/if}
						{#if linkSays}<p class="text-sm card preset-tonal-warning p-3">{linkSays}</p>{/if}
						<button type="button" class="btn preset-tonal min-h-11 self-start" disabled={!!busy} onclick={() => void act('Withdrawn', { step: 'withdrawn', parent: s.offerHash ?? null })}>{busy === 'Withdrawn' ? 'Checking…' : 'Withdraw my offer'}</button>
					{:else if s.phase === 'agreeing' && needsMe(s, me)}
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
						{#if s.takenFrom && s.terms?.a === me && !s.settled.length}
							<p class="text-sm">Can’t sell it after all? You can cancel this sale until it’s paid, and it goes back in your shop.</p>
							<button type="button" class="btn preset-tonal min-h-11 self-start" disabled={!!busy} onclick={() => void act('Cancelled: sold out', { step: 'declined', parent: s.lastHash ?? null, note: 'Sold out' })}>{busy === 'Cancelled: sold out' ? 'Checking…' : 'Cancel: sold out'}</button>
						{/if}
					{:else if s.phase === 'complete'}
						<p class="flex items-center gap-2"><Status tone="good">Settled</Status> Agreed, and settled by you both. It’s in both of your vaults.</p>
					{:else}
						<p>This agreement ended{s.ended === 'sold-out' ? ': the seller cancelled it as sold out' : s.ended === 'declined' ? ': it was declined' : s.ended === 'withdrawn' ? (s.limit && !s.takenFrom ? ': it was taken out of the shop' : ': the offer was withdrawn') : ': the offer ran out'}. Nothing was settled.</p>
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
