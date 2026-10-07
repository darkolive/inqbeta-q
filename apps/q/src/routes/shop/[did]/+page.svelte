<script lang="ts">
	/*
	 * A shop (ADR-Q-026, 3 October 2026): someone's standing offers, the way a
	 * stall shows what's on it. inqbeta.com/shop/<their id>, shared any way
	 * they like. Each offer says what you get, what it costs and how many are
	 * left; Buy makes it your own agreement with them, agreed there and then,
	 * and you settle up as with any agreement. Every offer's signature is
	 * checked in your browser; the storage only holds them and counts the stock.
	 */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Page, Section, Empty, Icon, Status } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import ShareLink from '$lib/components/ShareLink.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { valueText } from '@inqbeta/q-core/agreements';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { creditsCommitted, creditsHeld } from '$lib/agreements';
	import { readMint, type MintView } from '$lib/money';
	import { syncCloudNow } from '$lib/autosync';
	import { buy, readShop, shopLink, type ShopListing, type ShopWindow } from '$lib/shop';
	import { voucherIn } from '$lib/vouchers';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	let mint = $state<MintView | null>(null);
	$effect(() => void readMint().then((m) => (mint = m.view)));

	const seller = $derived(page.params.did ?? '');
	const me = $derived(identity?.did ?? '');
	const mine = $derived(!!me && me === seller);
	const people = $derived(peopleFrom(ledger, me));

	let shop = $state<ShopWindow | null>(null);
	let loading = $state(true);
	let problem = $state('');
	async function load() {
		loading = true;
		const out = await readShop(seller);
		loading = false;
		if (out.ok) {
			shop = out.shop;
			problem = '';
		} else problem = out.says;
	}
	$effect(() => {
		if (seller) void load();
	});

	const name = $derived(mine ? 'Your shop' : `${people.find((p) => p.did === seller)?.name ?? shop?.about.name ?? 'Someone'}’s shop`);
	const mode = $derived(mint?.mode ?? 'test');
	const available = $derived(me ? creditsHeld(ledger, me, mode, mint) - creditsCommitted(ledger, me, mode) : 0);
	const costOf = (l: ShopListing) => {
		const v = l.offer.content.terms?.bGives;
		return v && 'credits' in v ? v.credits : 0;
	};

	let busy = $state('');
	let says = $state('');
	async function purchase(l: ShopListing) {
		if (!identity || !shop) return;
		busy = l.offer.contentHash;
		says = '';
		const out = await buy(identity, ledger, shop, l, people, mint);
		busy = '';
		/* Kept storage: start copying the vault there straight away. */
		if (out.ok && l.offer.content.terms?.service?.kind === 'store') void syncCloudNow('manual').catch(() => null);
		if (out.ok) void goto(`/agreements/${encodeURIComponent(out.id)}${out.says ? `?said=${encodeURIComponent(out.says)}` : ''}`);
		else {
			says = out.says;
			void load();
		}
	}
</script>

<svelte:head><title>{name} — Q</title></svelte:head>

<Page title={name} lead={mine ? 'What anyone can buy from you, until it’s gone. Each sale is its own agreement.' : 'Buy anything here, and it’s agreed straight away. Then you settle up, as with any agreement.'}>
	{#snippet actions()}
		{#if mine}
			<a href="/agreements/new?with=shop" class="btn preset-filled-primary-500 min-h-11"><Icon name="plus" size={18} /> Add something</a>
			<a href="/v/new" class="btn preset-tonal min-h-11"><Icon name="plus" size={18} /> Sell a voucher</a>
		{/if}
	{/snippet}

	{#if !identity}
		<div class="panel"><SignIn stay /></div>
	{:else if loading && !shop}
		<p class="card preset-tonal-surface p-4" aria-live="polite">Opening the shop…</p>
	{:else if problem}
		<p class="card preset-tonal-warning p-4">{problem}</p>
	{:else if shop && !shop.listings.length}
		<Empty icon="wallet" title={mine ? 'Nothing in your shop yet' : 'Nothing in this shop just now'} description={mine ? 'Write an offer and choose “My shop: anyone can buy it”.' : 'Come back another time.'}>
			{#if mine}<a href="/agreements/new?with=shop" class="btn preset-filled-primary-500 min-h-11"><Icon name="plus" size={18} /> Add something</a>{/if}
		</Empty>
	{:else if shop}
		{#if mine}
			<ShareLink link={shopLink(me)} label="Your shop’s link" subject="My shop on Q" message="Here’s my shop on Q. Have a look, and buy anything you like." note="Anyone with the link can see your shop." />
		{:else}
			<p class="text-sm text-surface-700-300">You have {available} {mode === 'test' ? 'test ' : ''}credits to spend.</p>
		{/if}
		<Section title="On offer" description="What you get, what it costs, and how many are left.">
			<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each shop.listings as l (l.offer.contentHash)}
					{@const t = l.offer.content.terms!}
					{@const short = costOf(l) > available}
					<li class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-5 flex flex-col gap-3">
						<header class="flex items-start justify-between gap-3">
							<h3 class="h5 break-words">{valueText(t.aGives)}</h3>
							<Status tone={l.left ? 'good' : 'plain'}>{l.left ? `${l.left} left` : 'Sold out'}</Status>
						</header>
						{#if t.service?.kind === 'store'}
							<p class="text-lg font-semibold">{t.service.gb} GB kept for {t.service.months} month{t.service.months === 1 ? '' : 's'}: {valueText(t.bGives)}</p>
							<p class="text-sm">A full copy of your vault, sealed, kept level each sync. The space is yours from the moment you take it.</p>
						{:else if t.service?.kind === 'pass-through'}
							<p class="text-lg font-semibold">{t.service.perGBHour} credit{t.service.perGBHour === 1 ? '' : 's'} for a GB held an hour</p>
							<p class="text-sm">Paid for what you use, from the receipts you both hold; never more than {valueText(t.bGives)}.{t.service.hours ? ` Takes new files ${t.service.hours} each day.` : ''}</p>
						{:else}
							<p class="text-lg font-semibold">{valueText(t.bGives)}</p>
						{/if}
						{#if t.when || t.where}<p class="text-sm">{[t.when, t.where].filter(Boolean).join(' · ')}</p>{/if}
						{#if t.doneWhen}<p class="text-sm opacity-80">Done when: {t.doneWhen}</p>{/if}
						{#if l.offer.content.until}<p class="text-sm opacity-80">On offer until {new Date(l.offer.content.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</p>{/if}
						{#if voucherIn(l)}
							<a class="anchor text-sm min-h-11 inline-flex items-center" href="/v/{encodeURIComponent(voucherIn(l)!)}">See the voucher: its terms, and its code</a>
						{/if}
						{#if mine}
							<a class="btn preset-tonal min-h-11 mt-auto" href="/agreements/{encodeURIComponent(l.offer.content.agreement)}">See sales</a>
						{:else}
							<button type="button" class="btn preset-filled-primary-500 min-h-11 mt-auto" disabled={!l.left || short || !!busy} onclick={() => void purchase(l)}>
								<Icon name="wallet" size={18} />{busy === l.offer.contentHash ? 'Checking…' : !l.left ? 'Sold out' : t.service?.kind === 'store' ? 'Take it' : t.service ? 'Hire' : 'Buy'}
							</button>
							{#if short && l.left}<p class="text-sm text-error-600-400">You need {costOf(l)} credits{t.service ? ' set aside' : ''}; you have {available}.</p>{/if}
						{/if}
					</li>
				{/each}
			</ul>
		</Section>
		{#if says}<p class="text-sm card preset-tonal-warning p-3" aria-live="polite">{says}</p>{/if}
		<p class="text-sm text-surface-700-300">Buying is signed by you and checked by the agreement rules. It’s a record of what you both agree, not legal advice.</p>
	{/if}
</Page>
