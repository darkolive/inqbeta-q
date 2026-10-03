<script lang="ts">
	/*
	 * Credits (ADR-Q-023, ADR-Q-027; 3 October 2026): your host's own credits.
	 *
	 * Minted when you buy them, destroyed when you cash out, and moved between
	 * people by agreements — so the mint's books always reconcile. In test mode
	 * everything works and no money moves; once the host is published, real
	 * money does, and balances start from zero.
	 */
	import CreditsStory from '$lib/components/CreditsStory.svelte';
	import { Page, Section, Status, Empty, Icon } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { movesOf, effectOn, balanceOf } from '@inqbeta/q-core/credits';
	import { kindSays } from '$lib/credits';
	import { creditsCommitted } from '$lib/agreements';
	import { readMint, buyCredits, cashOut, mintBalance, mintMoves, pounds, type MintView } from '$lib/money';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	const me = $derived(identity?.did ?? '');

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
	const moves = $derived(mintMoves(ledger, mint, me));
	const older = $derived(movesOf(ledger?.receipts ?? [], me).reverse());
	const live = $derived(mint?.mode === 'live');

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
	let outCredits = $state(1);
	async function cash() {
		if (!identity || !mint) return;
		const n = Math.trunc(Number(outCredits) || 0);
		busy = 'cash';
		said = null;
		const out = await cashOut(identity, mint, n);
		busy = '';
		said = out.ok ? { tone: 'good', text: `${n} credits cashed out and destroyed. ${live ? `${pounds(out.burned.content.pence ?? 0)} is on its way.` : `${pounds(out.burned.content.pence ?? 0)} would have been paid: test mode, no money moves.`}` } : { tone: 'bad', text: out.says };
		if (out.ok) await loadMint(true);
	}
	const when = (at: string) => new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head><title>Credits — Q</title></svelte:head>

<Page title="Credits" lead="Your host’s own credits: made when you buy them, destroyed when you cash out, passed between people by agreements.">
	<CreditsStory />

	{#if !identity}
		<SignIn />
	{:else if !mint}
		<p class="card preset-tonal-surface p-4 max-w-3xl">{mintSays || 'Reading the mint…'}</p>
	{:else}
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

		<div class="grid gap-4 sm:grid-cols-2 max-w-3xl">
			<div class="card preset-tonal-primary p-6 space-y-1">
				<p class="text-sm">Your credits</p>
				<p class="h2 tabular-nums">{mine.spendable}</p>
				<p class="text-sm opacity-80">
					{committed ? `${committed} promised in agreements. ` : ''}Worth {pounds(mine.spendable * mint.pencePerCredit)} if cashed out.
				</p>
			</div>
			<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-6 space-y-1">
				<p class="text-sm">One credit</p>
				<p class="h2">{pounds(mint.pencePerCredit)}</p>
				<p class="text-sm text-surface-700-300">What a credit costs, and what cashing one out pays. Set by your host.</p>
			</div>
		</div>
		{#if olderTest}
			<p class="text-sm text-surface-700-300 max-w-3xl">You also have {olderTest} earlier test credits, from before the mint. They stay in your history.</p>
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
				{#if canCashOut}
					<label class="label">
						<span class="label-text">How many credits (up to {canCashOut})</span>
						<input class="input max-w-40" type="number" min="1" max={canCashOut} step="1" bind:value={outCredits} />
					</label>
					<p>You’ll be paid <strong>{pounds(Math.max(0, Math.trunc(Number(outCredits) || 0)) * mint.pencePerCredit)}</strong>{live ? ', to the account you’ve told your host.' : '. Test mode: no money moves.'}</p>
					<button type="button" class="btn preset-filled-secondary-500 min-h-11 self-start" disabled={!!busy || !(outCredits >= 1 && outCredits <= canCashOut)} onclick={() => void cash()}>
						<Icon name="balance" size={18} />{busy === 'cash' ? 'Cashing out…' : 'Cash out'}
					</button>
				{:else}
					<p class="text-surface-700-300">Nothing to cash out yet{committed ? ': what you have is promised in agreements' : ''}.</p>
				{/if}
			</div>
			{#if said}
				<p class="mt-4 max-w-3xl"><Status tone={said.tone}>{said.tone === 'good' ? 'Done' : 'Not done'}</Status> {said.text}</p>
			{/if}
		</Section>

		<Section title="The mint’s books" description="Added up from the mint’s own receipts. Every credit is somewhere, and every credit is backed.">
			<div class="grid gap-4 sm:grid-cols-3 max-w-3xl">
				<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4"><p class="text-sm opacity-70">In circulation</p><p class="h3 tabular-nums">{mint.books.circulation}</p><p class="text-xs opacity-70">{mint.books.minted} made, {mint.books.destroyed} destroyed</p></div>
				<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4"><p class="text-sm opacity-70">Cash reserve</p><p class="h3 tabular-nums">{pounds(mint.books.cashReserve)}</p>{#if mint.books.capitalReserve}<p class="text-xs opacity-70">+ {pounds(mint.books.capitalReserve)} capital</p>{/if}</div>
				<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 flex flex-col gap-2"><p class="text-sm opacity-70">The books</p>
					<Status tone={mint.books.reconciled ? 'good' : 'bad'}>{mint.books.reconciled ? 'Reconcile' : 'Don’t reconcile'}</Status>
					<Status tone={mint.books.backed ? 'good' : 'bad'}>{mint.books.backed ? 'Fully backed' : 'Not backed'}</Status>
				</div>
			</div>
		</Section>

		<Section title="Every move" description="Each one signed, and checked by the rules when it was made.">
			{#if moves.length || older.length}
				<ul class="card preset-outlined-surface-200-800 bg-surface-50-950 divide-y divide-surface-200-800 overflow-hidden max-w-3xl">
					{#each moves as m (m.r.contentHash)}
						<li class="flex items-center gap-4 p-4">
							<span class="flex-1 min-w-0">
								<span class="block font-semibold">{m.r.content.kind === 'mint' ? 'Bought' : 'Cashed out'}{m.r.content.pence ? ` · ${pounds(m.r.content.pence)}` : ''}</span>
								<span class="block text-sm text-surface-700-300">{when(m.r.content.at)}{m.r.content.kind === 'burn' ? ' · destroyed' : ' · minted'}</span>
							</span>
							{#if m.r.content.mode === 'test'}<Status tone="waiting">Test</Status>{/if}
							<span class="h4 tabular-nums {m.n < 0 ? 'text-error-600-400' : 'text-success-600-400'}">{m.n > 0 ? '+' : ''}{m.n}</span>
						</li>
					{/each}
					{#each older as m (m.signature)}
						{@const n = effectOn(m.content, me)}
						<li class="flex items-center gap-4 p-4 opacity-80">
							<span class="flex-1 min-w-0">
								<span class="block font-semibold">{kindSays[m.content.kind]}{m.content.pack ? ` · ${m.content.pack.name}` : ''}</span>
								<span class="block text-sm text-surface-700-300">{when(m.content.at)} · before the mint</span>
							</span>
							{#if m.content.mode === 'test'}<Status tone="waiting">Test</Status>{/if}
							<span class="h4 tabular-nums">{n > 0 ? '+' : ''}{n}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<Empty icon="wallet" title="No credits yet" description="Everyday use is free. Buy some to try agreements, a shop, or cashing out." />
			{/if}
		</Section>
	{/if}
</Page>
