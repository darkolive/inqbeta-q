<script lang="ts">
	/*
	 * A voucher's own page (ADR-Q-044 step 4): where its QR code leads. Open to
	 * anyone, signed in or not: what you get, the terms, and whether it's real
	 * (signed by its issuer, unchanged since). If it's on sale, Buy is the
	 * shop's own: the credits are held by agreement until it's redeemed.
	 */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Page, Icon } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import SignIn from '$lib/components/SignIn.svelte';
	import VoucherCard from '$lib/components/display/VoucherCard.svelte';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { creditsCommitted, creditsHeld } from '$lib/agreements';
	import { readMint, type MintView } from '$lib/money';
	import { buy } from '$lib/shop';
	import { askToRedeem, giveTo, handOut, honour, readVoucher, release, salesOf, signFor, voucherLink, waitingForMe, type SaleView, type VoucherView } from '$lib/vouchers';
	import { Section, Status } from '@inqbeta/q-ui';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	let mint = $state<MintView | null>(null);
	$effect(() => void readMint().then((m) => (mint = m.view)));

	const hash = $derived(decodeURIComponent(page.params.hash ?? ''));
	let view = $state<VoucherView | null>(null);
	let problem = $state('');
	let loading = $state(true);
	async function load() {
		loading = true;
		const out = await readVoucher(hash);
		loading = false;
		if (out.ok) {
			view = out.view;
			problem = '';
		} else problem = out.says;
	}
	$effect(() => {
		if (hash) void load();
	});
	/* A step the other side took may be in the bank's ledger before it reaches your inbox: once your vault has loaded, look. */
	$effect(() => {
		const l = ledger;
		if (l?.loadedAt) void import('$lib/catch-up').then((m) => m.catchUpFromMint(l));
	});

	const me = $derived(identity?.did ?? '');
	const people = $derived(peopleFrom(ledger, me));
	const mine = $derived(!!view && view.voucher.content.issuer === me);
	const issuerName = $derived(view ? (people.find((p) => p.did === view!.voucher.content.issuer)?.name ?? view.shop?.about.name ?? '') : '');
	const price = $derived(view?.voucher.content.price.paid ? view.voucher.content.price.credits : 0);
	const mode = $derived(mint?.mode ?? 'test');
	const available = $derived(me ? creditsHeld(ledger, me, mode, mint) - creditsCommitted(ledger, me, mode) : 0);
	const sameMint = $derived(!!view && !!mint && view.voucher.content.price.paid && view.voucher.content.price.mint === mint.mint);

	/* Step 5: handing out, signing for, redeeming, releasing. */
	const sales = $derived(view ? salesOf(view, ledger) : []);
	const myCopies = $derived(view ? view.edition.holdings.filter((h) => h.holder === me) : []);
	const toSignFor = $derived(view && me ? waitingForMe(view, me) : []);
	const nameOf = (did: string) => people.find((p) => p.did === did)?.name ?? 'Someone';
	let acting = $state('');
	let actSays = $state<{ good: boolean; text: string } | null>(null);
	async function act(key: string, run: () => Promise<{ ok: boolean; says: string }>) {
		acting = key;
		actSays = null;
		const out = await run();
		acting = '';
		actSays = { good: out.ok, text: out.says };
		if (out.ok) await load();
	}
	const saleFor = (n: number) => sales.find((x) => x.sale.holding?.number === n) ?? null;
	const releaseWaiting = (x: SaleView) => x.agreement.standing.pending?.by === me;
	/* Giving it on: to people in your address book, not yourself or its issuer. */
	const givable = $derived(people.filter((p) => p.did !== me && p.did !== view?.voucher.content.issuer));
	let giveTo_ = $state<Record<number, string>>({});

	/* One thing to do next, at the top: Darren found the steps clunky spread down the page (7 October 2026). */
	type Next = { says: string; button: string; key: string; run: () => Promise<{ ok: boolean; says: string }> };
	const next = $derived.by<Next | null>(() => {
		if (!identity || !view) return null;
		const id = identity;
		const v = view;
		const c = toSignFor[0];
		if (c) return { says: `Copy ${c.number} has been handed to you.`, button: 'Sign for it', key: `sign-${c.number}`, run: () => signFor(id, v, c) };
		if (mine) {
			const asked = sales.find((x) => x.sale.holding?.asked);
			if (asked) return { says: `${nameOf(asked.sale.buyer)} says they have it.`, button: 'Honour it: sign the redemption', key: `hon-${asked.agreement.id}`, run: () => honour(id, v, asked.sale.holding!.asked!) };
			const toSettle = sales.find((x) => x.sale.state === 'redeemed' && !releaseWaiting(x));
			if (toSettle) return { says: `${nameOf(toSettle.sale.buyer)}’s copy is redeemed.`, button: toSettle.agreement.standing.pending ? 'Confirm the settlement' : 'Settle: release the credits', key: `rel-${toSettle.agreement.id}`, run: () => release(id, ledger, people, mint, toSettle) };
			const toHand = sales.find((x) => x.sale.state === 'taken');
			if (toHand) return { says: `${nameOf(toHand.sale.buyer)} bought one.`, button: 'Hand out their copy', key: `out-${toHand.agreement.id}`, run: () => handOut(id, v, toHand) };
			return null;
		}
		for (const h of myCopies) {
			const sv = saleFor(h.number);
			if (sv?.sale.state === 'redeemed' && !releaseWaiting(sv)) return { says: `Copy ${h.number} is redeemed.`, button: sv.agreement.standing.pending ? 'Confirm the settlement' : 'Settle: release the credits held', key: `rel-${h.number}`, run: () => release(id, ledger, people, mint, sv) };
		}
		const held = myCopies.find((h) => !h.redeemed && !h.asked && !v.passing[h.number]);
		if (held) return { says: `You hold copy ${held.number}. When you have what it promises:`, button: 'I have it: redeem', key: `ask-${held.number}`, run: () => askToRedeem(id, v, held) };
		return null;
	});
	const STEPS: { state: string; called: string }[] = [
		{ state: 'taken', called: 'Bought' },
		{ state: 'issued', called: 'Handed out' },
		{ state: 'received', called: 'Signed for' },
		{ state: 'redeemed', called: 'Redeemed' },
		{ state: 'released', called: 'Paid' }
	];
	const stepAt = (state: string) => STEPS.findIndex((x) => x.state === state);

	let busy = $state(false);
	let says = $state('');
	async function purchase() {
		if (!identity || !view?.listing || !view.shop) return;
		busy = true;
		says = '';
		const out = await buy(identity, ledger, view.shop, view.listing, people, mint);
		busy = false;
		if (out.ok) void goto(`/agreements/${encodeURIComponent(out.id)}${out.says ? `?said=${encodeURIComponent(out.says)}` : ''}`);
		else {
			says = out.says;
			void load();
		}
	}
</script>

{#snippet progress(state: string)}
	{#if stepAt(state) >= 0}
		<ol class="flex flex-wrap gap-x-3 gap-y-1 text-sm" aria-label="Where this sale is">
			{#each STEPS as st, i (st.state)}
				<li class={i <= stepAt(state) ? 'font-bold' : 'opacity-60'} aria-current={i === stepAt(state) ? 'step' : undefined}>{i <= stepAt(state) ? '✓ ' : ''}{st.called}</li>
			{/each}
		</ol>
	{/if}
{/snippet}

<svelte:head><title>{view ? `${view.voucher.content.title} — a voucher` : 'A voucher'} — Q</title></svelte:head>

<Page title="A voucher" lead="What you see is what you get: signed by whoever made it, and unchanged since.">
	{#if loading && !view}
		<p class="card preset-tonal-surface p-4" aria-live="polite">Opening the voucher…</p>
	{:else if problem}
		<p class="card preset-tonal-warning p-4">{problem}</p>
	{:else if view}
		<p class="card preset-tonal-success p-3 text-sm flex items-center gap-2"><Icon name="check" size={18} />Real: signed by its issuer, and unchanged since.</p>
		{#if next}
			<div class="card preset-tonal-warning p-4 flex flex-col gap-3" aria-live="polite">
				<p class="h5">Next: {next.says}</p>
				<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!acting} onclick={() => void act(next!.key, next!.run)}>{acting === next.key ? 'Signing…' : next.button}</button>
			</div>
		{/if}
		<VoucherCard voucher={view.voucher} link={voucherLink(hash, page.url.origin)} left={view.listing?.left ?? null} {issuerName} pictureBase={view.pictureBase} />

		{#if view.listing}
			{#if mine}
				<a class="btn preset-tonal min-h-11 self-start" href="/agreements/{encodeURIComponent(view.listing.offer.content.agreement)}">See sales</a>
			{:else if !identity}
				<div class="panel flex flex-col gap-3"><p>Sign in to buy it.</p><SignIn stay /></div>
			{:else}
				<div class="flex flex-col gap-2">
					{#if !sameMint}
						<p class="text-sm card preset-tonal-warning p-3">It’s priced in another bank’s credits. Buying across banks comes with treaties.</p>
					{:else}
						<p class="text-sm">You have {available} {mode === 'test' ? 'test ' : ''}credits to spend. {price} will be held until it’s redeemed.</p>
					{/if}
					<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy || !view.listing.left || !sameMint || price > available} onclick={() => void purchase()}>
						<Icon name="wallet" size={18} />{busy ? 'Checking…' : !view.listing.left ? 'Sold out' : `Buy for ${price} credits`}
					</button>
					{#if sameMint && price > available && view.listing.left}<p class="text-sm text-error-600-400">You need {price} credits; you have {available}.</p>{/if}
				</div>
			{/if}
		{:else if view.voucher.content.price.paid}
			<p class="text-sm">It isn’t on sale just now.</p>
		{/if}
		{#if says}<p class="text-sm card preset-tonal-warning p-3" aria-live="polite">{says}</p>{/if}

		{#if identity && (toSignFor.length || myCopies.length)}
			<Section title="Yours" description="The copies you hold: sign for them, then redeem them when you get what they promise.">
				<ul class="flex flex-col gap-3">
					{#each toSignFor as c (c.number)}
						<li class="card preset-tonal-warning p-4 flex flex-col gap-2">
							<p>Copy {c.number} has been handed to you. Sign to say you have it.</p>
							<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!acting} onclick={() => void act(`sign-${c.number}`, () => signFor(identity!, view!, c))}>{acting === `sign-${c.number}` ? 'Signing…' : 'Sign for it'}</button>
						</li>
					{/each}
					{#each myCopies as h (h.number)}
						{@const sv = saleFor(h.number)}
						<li class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-2">
							<div class="flex flex-wrap items-center gap-3">
								<span class="font-bold flex-1">Copy {h.number}{view.edition.of ? ` of ${view.edition.of}` : ''}</span>
								<Status tone={h.redeemed ? 'plain' : h.asked ? 'waiting' : 'good'}>{h.redeemed ? 'Redeemed' : h.asked ? 'Asked to redeem' : 'Held'}</Status>
							</div>
							{#if sv}{@render progress(sv.sale.state)}<p class="text-sm">{sv.sale.says}</p>{/if}
							{#if view.passing[h.number]}
								<p class="text-sm">Given to {nameOf(view.passing[h.number].holder)}. It’s theirs once they sign for it.</p>
							{:else if !h.redeemed && !h.asked && !mine}
								<p class="text-sm">When you’ve got what it promises, redeem it. The credits held for it are released to the issuer only then.</p>
								<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!acting} onclick={() => void act(`ask-${h.number}`, () => askToRedeem(identity!, view!, h))}>{acting === `ask-${h.number}` ? 'Signing…' : 'I have it: redeem'}</button>
								{#if view.voucher.content.moves !== 'bound'}
									<details class="card preset-outlined-surface-200-800 p-3">
										<summary class="cursor-pointer min-h-11 flex items-center text-sm font-bold">Give it to someone</summary>
										<div class="flex flex-col gap-3 mt-2">
											{#if !givable.length}
												<p class="text-sm">Link up with someone first: you can give it to people in your address book.</p>
											{:else}
												<label class="label"><span class="label-text">To</span>
													<select class="select" bind:value={giveTo_[h.number]}>
														<option value="">Choose someone…</option>
														{#each givable as p (p.did)}<option value={p.did}>{p.name}</option>{/each}
													</select>
												</label>
												<button type="button" class="btn preset-tonal min-h-11 self-start" disabled={!!acting || !giveTo_[h.number]} onclick={() => void act(`give-${h.number}`, () => giveTo(identity!, view!, h, givable.find((p) => p.did === giveTo_[h.number])!))}>{acting === `give-${h.number}` ? 'Signing…' : 'Sign it over'}</button>
											{/if}
										</div>
									</details>
								{/if}
							{:else if h.asked}
								<p class="text-sm">Waiting for {issuerName || 'the issuer'} to sign too.</p>
							{:else if sv?.sale.state === 'redeemed'}
								{#if releaseWaiting(sv)}<p class="text-sm">You’ve signed the settlement. It waits for the other side.</p>
								{:else}<button type="button" class="btn preset-tonal min-h-11 self-start" disabled={!!acting} onclick={() => void act(`rel-${h.number}`, () => release(identity!, ledger, people, mint, sv))}>{acting === `rel-${h.number}` ? 'Signing…' : sv.agreement.standing.pending ? 'Confirm the settlement' : 'Settle: release the credits held'}</button>{/if}
							{/if}
						</li>
					{/each}
				</ul>
			</Section>
		{/if}

		{#if mine && sales.length}
			<Section title="Sales" description="Each one holds the buyer’s credits until it’s redeemed. Hand out their copy, honour it when they have it, then settle.">
				<ul class="flex flex-col gap-3">
					{#each sales as x (x.agreement.id)}
						{@const h = x.sale.holding}
						<li class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-2">
							<div class="flex flex-wrap items-center gap-3">
								<span class="font-bold flex-1">{nameOf(x.sale.buyer)}{h ? ` · copy ${h.number}` : ''}</span>
								<Status tone={x.sale.state === 'released' ? 'good' : x.sale.state === 'cancelled' ? 'plain' : x.sale.state === 'refund-due' ? 'needs-you' : 'waiting'}>{x.sale.credits} credits</Status>
							</div>
							{@render progress(x.sale.state)}
							<p class="text-sm">{x.sale.says}</p>
							{#if x.sale.state === 'taken'}
								<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!acting} onclick={() => void act(`out-${x.agreement.id}`, () => handOut(identity!, view!, x))}>{acting === `out-${x.agreement.id}` ? 'Signing…' : 'Hand out their copy'}</button>
							{:else if h?.asked}
								<p class="text-sm">{nameOf(x.sale.buyer)} says they have it. Sign if they do.</p>
								<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!acting} onclick={() => void act(`hon-${x.agreement.id}`, () => honour(identity!, view!, h.asked!))}>{acting === `hon-${x.agreement.id}` ? 'Signing…' : 'Honour it: sign the redemption'}</button>
							{:else if x.sale.state === 'redeemed'}
								{#if releaseWaiting(x)}<p class="text-sm">You’ve signed the settlement. It waits for {nameOf(x.sale.buyer)}.</p>
								{:else}<button type="button" class="btn preset-tonal min-h-11 self-start" disabled={!!acting} onclick={() => void act(`rel-${x.agreement.id}`, () => release(identity!, ledger, people, mint, x))}>{acting === `rel-${x.agreement.id}` ? 'Signing…' : x.agreement.standing.pending ? 'Confirm the settlement' : 'Settle: release the credits'}</button>{/if}
							{:else if x.sale.state === 'refund-due'}
								<a class="btn preset-tonal min-h-11 self-start" href="/agreements/{encodeURIComponent(x.agreement.id)}">Cancel the sale, so nothing moves</a>
							{/if}
						</li>
					{/each}
				</ul>
			</Section>
		{/if}
		{#if actSays}<p class="card p-3 text-sm {actSays.good ? 'preset-tonal-success' : 'preset-tonal-error'}" aria-live="polite">{actSays.text}</p>{/if}
		<p class="text-sm text-surface-700-300">Buying is signed by you and checked by the agreement rules. It’s a record of what you both agree, not legal advice.</p>
	{/if}
</Page>
