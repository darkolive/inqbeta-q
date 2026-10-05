<script lang="ts">
	/*
	 * A federation's home page as its snapshot (plan, 4 October 2026; ADR-Q-030
	 * §1, step 1). Three things, top to bottom:
	 *
	 *   1. The network it runs: its bellboy, directory and storage, asked live
	 *      through the node's front door (never stored).
	 *   2. Join: its storage offers, the cost shown, taken in one step. Taking
	 *      one makes it one of your places (kept, or pass-through by the hour).
	 *   (What backs its credits now has its own tab: Bank, FederationBank.)
	 *
	 * The offers are read from the shops of the people who run the node (its
	 * operators, as the gate's /store names them, and the host's founder).
	 * Every offer's signature is checked in this browser, as in any shop.
	 */
	import { goto } from '$app/navigation';
	import { Section, Status, Empty, Icon } from '@inqbeta/q-ui';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import { valueText } from '@inqbeta/q-core/agreements';
	import type { Ledger } from '$lib/ledger';
	import type { Home } from '$lib/home';
	import { peopleFrom } from '$lib/people';
	import { creditsCommitted, creditsHeld } from '$lib/agreements';
	import { readMint, pounds, type MintView } from '$lib/money';
	import { syncCloudNow } from '$lib/autosync';
	import { buy, readShop, type ShopListing, type ShopWindow } from '$lib/shop';
	import { storeHires } from '$lib/store';
	import { hiredPlaces } from '$lib/relay';
	import { reachThroughFrontDoor, type Reach } from '$lib/node-health';

	let { home, identity, ledger, name }: { home: Extract<Home, { ok: true }>; identity: Identity; ledger: Ledger | null; name: string } = $props();

	const gate = $derived(home.services.storage?.replace(/\/$/, '') ?? '');
	const me = $derived(identity.did);
	const people = $derived(peopleFrom(ledger, me));

	/* 1. The network it runs. */
	type Health = { postOffice: Reach; index: Reach; storage: Reach };
	let health = $state<Health | null>(null);
	let asking = $state(false);
	let askedAt = $state('');
	async function askHealth() {
		if (!gate) return;
		asking = true;
		health = await reachThroughFrontDoor(gate);
		asking = false;
		askedAt = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
	}
	$effect(() => {
		if (gate) void askHealth();
	});
	const parts = $derived(
		health
			? [
					{ icon: 'bellboy' as const, called: 'Bellboy', does: 'Tells you when something is waiting', r: health.postOffice },
					{ icon: 'directory' as const, called: 'Directory', does: 'Finds people, clubs and places', r: health.index },
					{ icon: 'storage-unit' as const, called: 'Storage', does: 'Holds things until they’re collected', r: health.storage }
				]
			: []
	);
	const allUp = $derived(!!health && parts.every((p) => p.r.is === 'reached'));

	/* 2. Join: the storage it offers. */
	let mint = $state<MintView | null>(null);
	$effect(() => void readMint().then((m) => (mint = m.view)));
	type Offer = { shop: ShopWindow; l: ShopListing };
	let offers = $state<Offer[] | null>(null);
	let offersSay = $state('');
	async function loadOffers() {
		if (!gate) return void (offers = []);
		const st = await fetch(`${gate}/store`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
		const ops = st?.ok ? (((await st.json().catch(() => null)) as { operators?: string[] } | null)?.operators ?? []) : [];
		const sellers = [...new Set([...ops, home.founder].filter((d): d is string => !!d))];
		const found: Offer[] = [];
		let problem = '';
		for (const s of sellers) {
			const out = await readShop(s);
			if (!out.ok) {
				problem = out.says;
				continue;
			}
			for (const l of out.shop.listings) {
				const k = l.offer.content.terms?.service?.kind;
				if (k === 'store' || k === 'pass-through') found.push({ shop: out.shop, l });
			}
		}
		offers = found;
		offersSay = found.length ? '' : problem;
	}
	$effect(() => void loadOffers());

	const mode = $derived(mint?.mode ?? 'test');
	const available = $derived(creditsHeld(ledger, me, mode, mint) - creditsCommitted(ledger, me, mode));
	const costOf = (l: ShopListing) => {
		const v = l.offer.content.terms?.bGives;
		return v && 'credits' in v ? v.credits : 0;
	};
	/* Already one of your places here? Then say so, rather than offer it again. */
	const keptHere = $derived(storeHires(ledger, me).filter((h) => h.service.store.replace(/\/$/, '') === gate));
	const hiredHere = $derived(hiredPlaces(ledger, me).filter((p) => p.url === gate));
	const joined = $derived(keptHere.length > 0 || hiredHere.length > 0);

	let busy = $state('');
	let says = $state('');
	async function join(o: Offer) {
		busy = o.l.offer.contentHash;
		says = '';
		const out = await buy(identity, ledger, o.shop, o.l, people, mint);
		busy = '';
		if (out.ok) {
			if (o.l.offer.content.terms?.service?.kind === 'store') void syncCloudNow('manual').catch(() => null);
			void goto(`/agreements/${encodeURIComponent(out.id)}${out.says ? `?said=${encodeURIComponent(out.says)}` : ''}`);
		} else {
			says = out.says;
			void loadOffers();
		}
	}

	/* 3. What backs its credits. */
</script>

<Section title="The network it runs" description="{name}’s own machines, asked just now. Nothing they hold is shown, only whether they answer.">
	{#if !gate}
		<Empty icon="nodes" title="No node yet" description="When {name} runs a node, how it is doing shows here." />
	{:else if !health}
		<p class="card preset-tonal-surface p-4" aria-live="polite">Asking the node…</p>
	{:else}
		<div class="flex flex-col gap-3 max-w-3xl">
			<p class="flex flex-wrap items-center gap-3">
				<Status tone={allUp ? 'good' : 'bad'}>{allUp ? 'All working' : 'Something isn’t answering'}</Status>
				<span class="text-sm text-surface-700-300">Checked at {askedAt}</span>
				<button type="button" class="btn btn-sm preset-tonal min-h-11" disabled={asking} onclick={() => void askHealth()}>
					<Icon name="repeat" size={16} />{asking ? 'Asking…' : 'Check again'}
				</button>
			</p>
			<ul class="grid gap-4 sm:grid-cols-3">
				{#each parts as p (p.called)}
					<li class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 flex flex-col gap-2">
						<span class="flex items-center gap-2 font-bold text-lg"><Icon name={p.icon} size={22} />{p.called}</span>
						<span class="text-sm">{p.does}</span>
						<Status tone={p.r.is === 'reached' ? 'good' : 'bad'}>{p.r.is === 'reached' ? 'Working' : 'Not answering'}</Status>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</Section>

<Section title="Join" description="Use {name} as a place for your copies. You see the cost first; one tap agrees it.">
	{#if joined}
		<div class="card preset-tonal-success p-4 flex flex-col gap-2 max-w-3xl">
			<p class="flex items-center gap-2 font-bold"><Icon name="check" size={20} /> {name} is one of your places.</p>
			{#each keptHere as h (h.agreement)}
				<p class="text-sm">It keeps a copy of your vault ({h.service.gb} GB) until {new Date(h.ends).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
				<a class="btn btn-sm preset-tonal min-h-11 self-start" href="/agreements/{encodeURIComponent(h.agreement)}">See the agreement</a>
			{/each}
			{#each hiredHere as p (p.hired)}
				<p class="text-sm">It holds files for you by the hour, when a cloud can’t take them.</p>
				<a class="btn btn-sm preset-tonal min-h-11 self-start" href="/agreements/{encodeURIComponent(p.hired ?? '')}">See the agreement</a>
			{/each}
			<a class="btn btn-sm preset-tonal min-h-11 self-start" href="/network">See all your places</a>
		</div>
	{:else if offers === null}
		<p class="card preset-tonal-surface p-4" aria-live="polite">Looking for what {name} offers…</p>
	{:else if !offers.length}
		<Empty icon="storage-unit" title="Nothing on offer just now" description={offersSay || `${name} isn’t offering storage at the moment. Come back another time.`} />
	{:else}
		<p class="text-sm text-surface-700-300 mb-3">You have {available} {mode === 'test' ? 'test ' : ''}credits to spend.</p>
		<ul class="grid gap-4 sm:grid-cols-2 max-w-3xl">
			{#each offers as o (o.l.offer.contentHash)}
				{@const t = o.l.offer.content.terms!}
				{@const short = costOf(o.l) > available}
				<li class="card preset-outlined-primary-500 bg-surface-50-950 p-4 sm:p-5 flex flex-col gap-3">
					{#if t.service?.kind === 'store'}
						<h3 class="h5">Keep a copy here</h3>
						<p class="text-lg font-semibold">{t.service.gb} GB for {t.service.months} month{t.service.months === 1 ? '' : 's'}: {valueText(t.bGives)}</p>
						<p class="text-sm">A full copy of your vault, sealed, kept level every time you sync.</p>
					{:else if t.service?.kind === 'pass-through'}
						<h3 class="h5">Hold files when a cloud can’t</h3>
						<p class="text-lg font-semibold">{t.service.perGBHour} credit{t.service.perGBHour === 1 ? '' : 's'} for a GB held an hour</p>
						<p class="text-sm">You pay only for what you use, never more than {valueText(t.bGives)}.{t.service.hours ? ` Takes new files ${t.service.hours} each day.` : ''}</p>
					{/if}
					<button type="button" class="btn preset-filled-primary-500 min-h-11 mt-auto" disabled={!o.l.left || short || !!busy} onclick={() => void join(o)}>
						<Icon name="plus" size={18} />{busy === o.l.offer.contentHash ? 'Agreeing…' : !o.l.left ? 'None left' : 'Join'}
					</button>
					{#if short && o.l.left}<p class="text-sm text-error-600-400">You need {costOf(o.l)} credits; you have {available}. <a class="anchor" href="/balance">Get credits</a></p>{/if}
				</li>
			{/each}
		</ul>
		{#if says}<p class="text-sm card preset-tonal-warning p-3 mt-3" aria-live="polite">{says}</p>{/if}
		<p class="text-sm text-surface-700-300 mt-3">Joining is an agreement, signed by you and checked by the rules. You can see it, and settle it, under Agreements.</p>
	{/if}
</Section>

<!-- The mint's books moved to the federation's Bank tab (5 October 2026). -->
