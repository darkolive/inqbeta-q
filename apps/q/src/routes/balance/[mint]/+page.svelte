<script lang="ts">
	/*
	 * Credits (ADR-Q-023, ADR-Q-027; 3 October 2026): your host's own credits.
	 *
	 * Minted when you buy them, destroyed when you cash out, and moved between
	 * people by agreements — so the mint's books always reconcile. In test mode
	 * everything works and no money moves; once the host is published, real
	 * money does, and balances start from zero.
	 *
	 * Your statement with the federation's bank (5 October 2026, ADR-Q-035):
	 * the federation behind the mint is a bank in the old sense — a holding
	 * house that issues its own notes — and this page is your statement with
	 * it: who it's between, every move with its signed receipt behind a
	 * magnifier, and a way to ask the federation about anything you find.
	 */
	import Coin from '$lib/components/display/Coin.svelte';
	import CoinDrawer from '$lib/components/CoinDrawer.svelte';
	import CreditFlowDisplay from '$lib/components/display/CreditFlowDisplay.svelte';
	import CashOutBattery from '$lib/components/display/CashOutBattery.svelte';
	import { provideLevel, Section, Status, Empty, Icon } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { balanceOf } from '@inqbeta/q-core/credits';
	import { creditsCommitted, creditFlow, committedFlow } from '$lib/agreements';
	import { page } from '$app/state';
	import ReceiptDrawer from '$lib/components/ReceiptDrawer.svelte';
	import { readHome, type Home } from '$lib/home';
	import { peopleFrom } from '$lib/people';
	import type { Names } from '$lib/receipt-read';
	import type { ReceiptEntry } from '$lib/receipts';
	import { readMint, buyCredits, cashOut, mintBalance, pounds, reconcile, payoutAccountOf, type MintView } from '$lib/money';
	import Reconciled from '$lib/components/display/Reconciled.svelte';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	const me = $derived(identity?.did ?? '');
	/* This page is one coin's statement; its sections are the second level, under the coin's name. */
	provideLevel(2);
	const asked = $derived(decodeURIComponent(page.params.mint ?? ''));

	/* Who the statement is between: you, and the federation whose bank this is. */
	let home = $state<Home | null>(null);
	$effect(() => void readHome().then((h) => (home = h)));
	const bank = $derived(home?.ok ? home : null);
	/* The coin's own name, as its bank named it; until it has one, the house's name. */
	const coinName = $derived(mint?.name || (bank ? `${bank.name} credit` : 'Credits'));
	const ours = $derived(!!mint && mint.mint === asked);
	const people = $derived(peopleFrom(ledger, me));
	const names = $derived<Names>({ me, nameOf: (d) => (d === bank?.founder ? `${bank.name}’s founder` : people.find((p) => p.did === d)?.name) });
	const linked = $derived(!!bank && people.some((p) => p.did === bank.founder));
	const short = (d: string) => (d.length > 24 ? `${d.slice(0, 14)}…${d.slice(-6)}` : d);

	/* A move's receipt, opened in the drawer: the same read-only card as everywhere. */
	const receiptOf = (hash: string) => ledger?.receipts.find((r) => (r.json as { contentHash?: string } | undefined)?.contentHash === hash) ?? null;
	let opened = $state<ReceiptEntry | null>(null);
	let drawerOpen = $state(false);
	let coinOpen = $state(false);
	function view(r: ReceiptEntry) {
		opened = r;
		drawerOpen = true;
	}

	let mint = $state<MintView | null>(null);
	let mintSays = $state('');
	async function loadMint(fresh = false) {
		const m = await readMint(fresh);
		mint = m.view;
		mintSays = m.says ?? '';
	}
	$effect(() => void loadMint());

	const mine = $derived(mintBalance(ledger, mint, me));
	const committed = $derived(mint ? creditsCommitted(ledger, me, mint.mode) : 0);
	const canCashOut = $derived(Math.max(0, mine.spendable - committed));
	const olderTest = $derived(balanceOf(ledger?.receipts ?? [], me, 'test'));
	const flow = $derived(creditFlow(ledger, mint, me));
	const commits = $derived(mint ? committedFlow(ledger, me, mint.mode) : []);
	const live = $derived(mint?.mode === 'live');
	const notSetUp = $derived(/isn’t set up|no host set up/.test(mintSays));

	const PACKS = [10, 50, 100];
	let busy = $state('');
	let said = $state<{ tone: 'good' | 'bad'; text: string } | null>(null);
	async function buy(n: number) {
		if (!identity || !mint) return;
		busy = `buy-${n}`;
		said = null;
		const out = await buyCredits(identity, mint, n);
		busy = '';
		said = out.ok ? { tone: 'good', text: `${n} credits minted to you${live ? '' : ': test mode, no money taken'}. The receipt is in your vault.` } : { tone: 'bad', text: out.says };
		if (out.ok) await loadMint(true);
	}
	/* The treasurer asks the bank to add up and sign its books. */
	async function reconcileNow() {
		if (!identity || !mint) return;
		busy = 'reconcile';
		said = null;
		const out = await reconcile(identity, mint);
		busy = '';
		said = out.ok ? { tone: 'good', text: `Reconciled: the bank signed its books (${out.reconciliation.content.covers.count} receipts).` } : { tone: 'bad', text: out.says };
		if (out.ok) await loadMint(true);
	}
	/* Your cashing-out account: cashing out pays only to it, as a standing order. */
	const account = $derived(payoutAccountOf(ledger, me));

	let outCredits = $state(1);
	async function cash() {
		if (!identity || !mint) return;
		const n = Math.trunc(Number(outCredits) || 0);
		busy = 'cash';
		said = null;
		const out = await cashOut(identity, mint, n, ledger);
		busy = '';
		said = out.ok ? { tone: 'good', text: `${n} credits cashed out and destroyed. ${live ? `${pounds(out.burned.content.pence ?? 0)} is on its way.` : `${pounds(out.burned.content.pence ?? 0)} would have been paid: test mode, no money moves.`}` } : { tone: 'bad', text: out.says };
		if (out.ok) await loadMint(true);
	}
	const when = (at: string) => new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head><title>{coinName} — Credits — Q</title></svelte:head>

<div class="stack">
	<!-- Where you are: Credits, then this coin. -->
	<nav aria-label="Breadcrumb">
		<ol class="flex flex-wrap items-center gap-2 text-sm">
			<li><a class="anchor" href="/balance">Credits</a></li>
			<li aria-hidden="true" class="opacity-50">›</li>
			<li aria-current="page" class="font-semibold">{coinName}</li>
		</ol>
	</nav>

	{#if !identity}
		<SignIn />
	{:else if !mint && !mintSays}
		<p class="card preset-tonal-surface p-4 max-w-3xl" aria-live="polite">Reading the mint…</p>
	{:else if !mint}
		<!-- Said first and plainly (3 October 2026: the reason sat unnoticed under the pictures). -->
		<div class="card preset-tonal-warning p-5 max-w-3xl flex flex-col gap-2" role="status">
			<p class="h4">{notSetUp ? 'Credits aren’t switched on here yet' : 'Credits can’t be shown just now'}</p>
			<p>{notSetUp ? 'Your host hasn’t set up its own credits yet. When it does, you can buy them, spend them in agreements and shops, and cash them out, all on this page.' : mintSays}</p>
			{#if notSetUp}<p class="text-sm opacity-80">For the host: {mintSays}</p>{/if}
		</div>
	{:else if !ours}
		<div class="card preset-tonal-warning p-5 max-w-3xl flex flex-col gap-2" role="status">
			<p class="h4">This coin isn’t from this house</p>
			<p>Q can show a statement for this house’s own coin so far. <a class="anchor" href="/balance">Back to your credits</a>.</p>
		</div>
	{:else}
		<!-- The coin: its name, its banking details, and its check. -->
		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 max-w-3xl flex flex-col sm:flex-row gap-5">
			<!-- the coin: scan it, or tap it, to check it was minted here and how the house stands -->
			<div class="flex flex-col items-center gap-2 shrink-0">
				<Coin mint={mint.mint} name={coinName} design={mint.design} />
				<button type="button" class="btn btn-sm preset-tonal-secondary" onclick={() => (coinOpen = true)}>Scan to check</button>
			</div>
			<div class="flex-1 min-w-0 flex flex-col gap-4">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 class="h3">{coinName}</h1>
					<p class="text-sm opacity-70">{bank ? `A coin of ${bank.name}` : 'Your host’s coin'}{live ? '' : ' · test'}</p>
				</div>
				{#if bank}
					<a class="btn preset-tonal-primary min-h-11" href="/messages/{encodeURIComponent(bank.founder)}" title={linked ? undefined : 'You’re not linked with them yet: their page says how.'}>
						<Icon name="message" size={18} /> Ask {bank.name}
					</a>
				{/if}
			</div>
			<dl class="grid gap-3 sm:grid-cols-3 text-sm">
				<div><dt class="opacity-70">You</dt><dd class="role-token break-all" title={me}>{short(me)}</dd></div>
				{#if bank}<div><dt class="opacity-70">{bank.name}</dt><dd class="role-token break-all" title={bank.federation}>{short(bank.federation)}</dd></div>{/if}
				<div><dt class="opacity-70">Its bank</dt><dd class="role-token break-all" title={mint.mint}>{short(mint.mint)}</dd></div>
			</dl>
			<!-- When the bank last signed its books: green today, red at a month. -->
			<div class="flex flex-wrap items-start justify-between gap-3">
				<Reconciled last={mint.lastReconciled} movesSince={mint.movesSince} nameOf={(d) => (d === bank?.founder ? `${bank.name}’s treasurer` : names.nameOf(d))} />
				{#if bank && me === bank.founder}
					<button type="button" class="btn btn-sm preset-tonal-primary" disabled={!!busy} onclick={() => void reconcileNow()}>{busy === 'reconcile' ? 'Reconciling…' : 'Reconcile now'}</button>
				{/if}
			</div>
			</div>
		</div>

		<!-- Test or live, said first. -->
		{#if live}
			<div class="card preset-tonal-success p-4 flex flex-wrap items-center gap-3 max-w-3xl">
				<Status tone="good">Live</Status>
				<span class="flex-1">Real money. Published by the host, who is responsible for it.</span>
				<span class="text-xs role-token">Published ID {mint.publishedId?.slice(0, 12)}…</span>
			</div>
		{:else}
			<div class="card preset-tonal-warning p-4 flex flex-wrap items-center gap-3 max-w-3xl">
				<Status tone="needs-you">Test mode</Status>
				<span class="flex-1">Everything works, and no money moves. Buy, trade, cash out: try it all.</span>
			</div>
		{/if}

		<!-- Your credits, what one is worth, and what yours are worth: one row. -->
		<div class="grid gap-4 sm:grid-cols-3 max-w-3xl">
			<div class="card preset-tonal-primary p-6 space-y-1">
				<p class="text-sm">Your credits</p>
				<p class="h2 tabular-nums">{mine.spendable}</p>
				<p class="text-sm opacity-80">{committed ? `${committed} committed to agreements.` : 'None committed to agreements.'}</p>
			</div>
			<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-6 space-y-1">
				<p class="text-sm">One credit</p>
				<p class="h2">{pounds(mint.pencePerCredit)}</p>
				<p class="text-sm text-surface-700-300">What a credit costs, and what cashing one out pays. Set by your host.</p>
			</div>
			<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-6 space-y-1">
				<p class="text-sm">Face value</p>
				<p class="h2 tabular-nums">{pounds(mine.spendable * mint.pencePerCredit)}</p>
				<p class="text-sm text-surface-700-300">Your credits at one credit’s price.</p>
			</div>
		</div>
		{#if olderTest}
			<p class="text-sm text-surface-700-300 max-w-3xl">You also have {olderTest} earlier test credits, from before the mint. They stay in your history.</p>
		{/if}

		{#if flow.length || committed}
			<Section title="Your credits in and out" description="Credits received and credits spent, two totals that only ever go up. The amber band is what’s committed to agreements, on top of what’s spent; keep it away from the green. Tap Received, Spent or Committed for its receipts.">
				<div class="max-w-3xl">
					<CreditFlowDisplay {flow} {commits} {committed} has={(h) => !!receiptOf(h)} onOpen={(h) => { const r = receiptOf(h); if (r) view(r); }} />
				</div>
			</Section>
		{/if}

		<Section title="Buy credits" description={live ? 'Paid in pounds. The credits are minted to you when the payment is confirmed.' : 'Test mode: buying works end to end, and no money is taken.'}>
			<div class="flex flex-wrap gap-4">
				{#each PACKS as n (n)}
					<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-3 min-w-48">
						<p class="h4">{n} credits</p>
						<p class="text-sm text-surface-700-300">{pounds(n * mint.pencePerCredit)}{live ? '' : ' · test, nothing taken'}</p>
						<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!!busy} onclick={() => void buy(n)}>
							<Icon name="wallet" size={18} />{busy === `buy-${n}` ? 'Minting…' : 'Buy'}
						</button>
					</div>
				{/each}
			</div>
		</Section>

		<Section title="Cash out" description="Credits back into pounds. Cashing out destroys the credits, so the books always balance.">
			<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-4 max-w-xl">
				<CashOutBattery held={mine.spendable} {committed} pencePerCredit={mint.pencePerCredit} />
				{#if account}
					<p class="text-sm">Paid by standing order to your account ending <strong>{account.content.ends}</strong>, set {new Date(account.content.at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}. <a class="anchor" href="/settings#cashing-out">Change it in Settings</a>.</p>
				{:else}
					<p class="text-sm"><Status tone="needs-you">Needed</Status> Cashing out pays only to your own account, as a standing order. <a class="anchor" href="/settings#cashing-out">Set it in Settings</a> first.</p>
				{/if}
				{#if canCashOut && account}
					<label class="label">
						<span class="label-text">How many credits (up to {canCashOut})</span>
						<input class="input max-w-40" type="number" min="1" max={canCashOut} step="1" bind:value={outCredits} />
					</label>
					<p>You’ll be paid <strong>{pounds(Math.max(0, Math.trunc(Number(outCredits) || 0)) * mint.pencePerCredit)}</strong>{live ? `, on today’s standing order to the account ending ${account.content.ends}.` : '. Test mode: no money moves.'}</p>
					<button type="button" class="btn preset-filled-secondary-500 min-h-11 self-start" disabled={!!busy || !(outCredits >= 1 && outCredits <= canCashOut)} onclick={() => void cash()}>
						<Icon name="balance" size={18} />{busy === 'cash' ? 'Cashing out…' : 'Cash out'}
					</button>
				{/if}
			</div>
			{#if said}
				<p class="mt-4 max-w-3xl"><Status tone={said.tone}>{said.tone === 'good' ? 'Done' : 'Not done'}</Status> {said.text}</p>
			{/if}
		</Section>

	{/if}

	<ReceiptDrawer receipt={opened} {names} bind:open={drawerOpen} />
	{#if mint}<CoinDrawer mint={mint.mint} bind:open={coinOpen} />{/if}

</div>
