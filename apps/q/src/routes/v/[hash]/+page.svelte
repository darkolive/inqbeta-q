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
	import { readVoucher, voucherLink, type VoucherView } from '$lib/vouchers';

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

	const me = $derived(identity?.did ?? '');
	const people = $derived(peopleFrom(ledger, me));
	const mine = $derived(!!view && view.voucher.content.issuer === me);
	const issuerName = $derived(view ? (people.find((p) => p.did === view!.voucher.content.issuer)?.name ?? view.shop?.about.name ?? '') : '');
	const price = $derived(view?.voucher.content.price.paid ? view.voucher.content.price.credits : 0);
	const mode = $derived(mint?.mode ?? 'test');
	const available = $derived(me ? creditsHeld(ledger, me, mode, mint) - creditsCommitted(ledger, me, mode) : 0);
	const sameMint = $derived(!!view && !!mint && view.voucher.content.price.paid && view.voucher.content.price.mint === mint.mint);

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

<svelte:head><title>{view ? `${view.voucher.content.title} — a voucher` : 'A voucher'} — Q</title></svelte:head>

<Page title="A voucher" lead="What you see is what you get: signed by whoever made it, and unchanged since.">
	{#if loading && !view}
		<p class="card preset-tonal-surface p-4" aria-live="polite">Opening the voucher…</p>
	{:else if problem}
		<p class="card preset-tonal-warning p-4">{problem}</p>
	{:else if view}
		<p class="card preset-tonal-success p-3 text-sm flex items-center gap-2"><Icon name="check" size={18} />Real: signed by its issuer, and unchanged since.</p>
		<VoucherCard voucher={view.voucher} link={voucherLink(hash, page.url.origin)} left={view.listing?.left ?? null} {issuerName} />

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
		<p class="text-sm text-surface-700-300">Buying is signed by you and checked by the agreement rules. It’s a record of what you both agree, not legal advice.</p>
	{/if}
</Page>
