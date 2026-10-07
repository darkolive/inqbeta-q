<script lang="ts">
	/*
	 * Your vouchers (ADR-Q-044 step 5, 7 October 2026): beside Credits. The
	 * coin says what pays; the voucher says what you get. What you've bought,
	 * and what you sell, each opening its own page, where the next thing to
	 * do is at the top.
	 */
	import { Page, Section, Empty, Icon, Status } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { myVouchers, readVoucher, salesOf, type VoucherView } from '$lib/vouchers';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	const me = $derived(identity?.did ?? '');
	const people = $derived(peopleFrom(ledger, me));
	const all = $derived(me ? myVouchers(ledger, me) : []);
	const bought = $derived(all.filter((v) => v.as === 'bought' || v.as === 'given'));
	const selling = $derived(all.filter((v) => v.as === 'selling'));
	const nameOf = (did: string) => people.find((p) => p.did === did)?.name ?? 'someone';
	/*
	 * What you owe on what you sell: each copy sold and not yet redeemed is a
	 * promise still to keep, and the buyer's credits wait for it. Read from
	 * each voucher's page (its copies and redemptions) and your own sales.
	 */
	let views = $state<Record<string, VoucherView>>({});
	$effect(() => {
		for (const v of selling) if (!views[v.hash]) void readVoucher(v.hash).then((o) => o.ok && (views = { ...views, [v.hash]: o.view }));
	});
	const owed = $derived.by(() => {
		const by: Record<string, { open: number; credits: number }> = {};
		for (const v of selling) {
			const view = views[v.hash];
			if (!view) continue;
			const open = salesOf(view, ledger).filter((x) => ['taken', 'issued', 'received', 'redeemed', 'refund-due'].includes(x.sale.state));
			by[v.hash] = { open: open.length, credits: open.reduce((n, x) => n + x.sale.credits, 0) };
		}
		return by;
	});
	const owedAll = $derived(Object.values(owed).reduce((a, o) => ({ open: a.open + o.open, credits: a.credits + o.credits }), { open: 0, credits: 0 }));
	const PHASE: Record<string, { word: string; tone: 'good' | 'waiting' | 'plain' }> = {
		agreed: { word: 'Credits held', tone: 'waiting' },
		complete: { word: 'Settled', tone: 'good' },
		ended: { word: 'Cancelled', tone: 'plain' },
		held: { word: 'Given to you', tone: 'good' }
	};
</script>

<svelte:head><title>Vouchers — Q</title></svelte:head>

<Page title="Vouchers" lead="What you’ve bought, and what you sell. The coin says what pays; the voucher says what you get.">
	{#snippet actions()}
		{#if identity}<a href="/v/new" class="btn preset-filled-primary-500 min-h-11"><Icon name="plus" size={18} /> Sell a voucher</a>{/if}
	{/snippet}

	{#if !identity}
		<div class="panel"><SignIn stay /></div>
	{:else if !all.length}
		<Empty icon="ticket" title="No vouchers yet" description="Buy one from someone’s shop, or sell your own: a thing, a class, a copy of your work." />
	{:else}
		{#if bought.length}
			<Section title="Yours" description="Open one to sign for it, redeem it, or settle.">
				<ul class="flex flex-col gap-3 max-w-3xl">
					{#each bought as v (v.agreement)}
						<li>
							<a href="/v/{encodeURIComponent(v.hash)}" class="card preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal-surface p-4 flex flex-wrap items-center gap-3 min-h-11">
								<Icon name="ticket" size={22} />
								<span class="flex-1 min-w-40"><span class="block h5 break-words">{v.title}</span><span class="block text-sm">From {nameOf(v.with)}</span></span>
								<Status tone={PHASE[v.phase]?.tone ?? 'plain'}>{PHASE[v.phase]?.word ?? v.phase}</Status>
							</a>
						</li>
					{/each}
				</ul>
			</Section>
		{/if}
		{#if selling.length}
			<Section title="You sell" description="Open one to hand out copies, honour redemptions and settle.">
				<p class="text-sm max-w-3xl mb-3">{owedAll.open ? `You owe ${owedAll.open} sold ${owedAll.open === 1 ? 'voucher' : 'vouchers'} not yet redeemed. ${owedAll.credits} credits are held for you until they are: they’re a promise to keep, not money yet.` : 'Nothing owed: every voucher you’ve sold has been redeemed and settled.'}</p>
				<ul class="flex flex-col gap-3 max-w-3xl">
					{#each selling as v (v.agreement)}
						<li>
							<a href="/v/{encodeURIComponent(v.hash)}" class="card preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal-surface p-4 flex flex-wrap items-center gap-3 min-h-11">
								<Icon name="ticket" size={22} />
								<span class="flex-1 min-w-40"><span class="block h5 break-words">{v.title}</span>{#if owed[v.hash]?.open}<span class="block text-sm">{owed[v.hash].open} to deliver · {owed[v.hash].credits} credits held</span>{/if}</span>
								<Status tone={v.phase === 'agreeing' ? 'good' : 'plain'}>{v.phase === 'agreeing' ? 'In your shop' : 'Taken out'}</Status>
							</a>
						</li>
					{/each}
				</ul>
			</Section>
		{/if}
	{/if}
</Page>
