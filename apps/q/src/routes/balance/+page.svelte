<script lang="ts">
	/*
	 * Credits, home (5 October 2026, ADR-Q-035): the coins you hold. Each
	 * coin is a bank's promissory note — a federation's — and opening one
	 * gives its statement (/balance/<mint>): what you hold, every move and its
	 * receipt, buying and cashing out, and the bank's books.
	 *
	 * For now Q reads one bank: your host's. The list is a list so that the
	 * coin console (credits-home-brief) has somewhere to grow.
	 */
	import CreditsStory from '$lib/components/CreditsStory.svelte';
	import Coin from '$lib/components/display/Coin.svelte';
	import CashOutBattery from '$lib/components/display/CashOutBattery.svelte';
	import { Page, Section, Icon } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { balanceOf } from '@inqbeta/q-core/credits';
	import { creditsCommitted } from '$lib/agreements';
	import { readMint, mintBalance, pounds, type MintView } from '$lib/money';
	import { readHome, type Home } from '$lib/home';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	const me = $derived(identity?.did ?? '');

	let mint = $state<MintView | null>(null);
	let mintSays = $state('');
	let home = $state<Home | null>(null);
	$effect(() => {
		void readMint().then((m) => {
			mint = m.view;
			mintSays = m.says ?? '';
		});
		void readHome().then((h) => (home = h));
	});
	const bank = $derived(home?.ok ? home : null);
	const notSetUp = $derived(/isn’t set up|no host set up/.test(mintSays));

	/* The coins you hold: your host's, for now. */
	const coins = $derived.by(() => {
		if (!mint) return [];
		const held = mintBalance(ledger, mint, me).spendable;
		const committed = creditsCommitted(ledger, me, mint.mode);
		return [{ mint, name: mint.name || (bank ? `${bank.name} credit` : 'Credits'), of: bank?.name ?? 'your host', held, committed, worth: held * mint.pencePerCredit }];
	});
	const olderTest = $derived(balanceOf(ledger?.receipts ?? [], me, 'test'));
</script>

<svelte:head><title>Credits — Q</title></svelte:head>

<Page title="Credits" lead="The coins you hold. Each is a federation’s own note, backed by what its bank holds; open one for its statement.">
	{#if !identity}
		<SignIn />
	{:else if !mint && !mintSays}
		<p class="card preset-tonal-surface p-4 max-w-3xl" aria-live="polite">Reading the mint…</p>
	{:else if !mint}
		<div class="card preset-tonal-warning p-5 max-w-3xl flex flex-col gap-2" role="status">
			<p class="h4">{notSetUp ? 'Credits aren’t switched on here yet' : 'Credits can’t be shown just now'}</p>
			<p>{notSetUp ? 'Your host hasn’t set up its own coin yet. When it does, you can buy it, spend it in agreements and shops, and cash it out.' : mintSays}</p>
			{#if notSetUp}<p class="text-sm opacity-80">For the host: {mintSays}</p>{/if}
		</div>
	{:else}
		<Section title="Your coins" description="Open a coin for its statement.">
			<ul class="flex flex-col gap-3 max-w-3xl">
				{#each coins as c (c.mint.mint)}
					<li>
						<a href="/balance/{encodeURIComponent(c.mint.mint)}" class="card preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal-surface p-4 flex flex-wrap items-center gap-4">
							<Coin mint={c.mint.mint} size="sm" name={c.name} design={c.mint.design} />
							<span class="flex-1 min-w-40">
								<span class="block h4">{c.name}</span>
								<span class="block text-sm text-surface-700-300">A coin of {c.of}{c.mint.mode === 'live' ? '' : ' · test'}</span>
							</span>
							<span class="text-right">
								<span class="block h3 tabular-nums">{c.held}</span>
								<span class="block text-sm text-surface-700-300">{pounds(c.worth)} face value</span>
							</span>
							<CashOutBattery held={c.held} committed={c.committed} pencePerCredit={c.mint.pencePerCredit} compact />
							<Icon name="expand" size={18} class="opacity-60" />
						</a>
					</li>
				{/each}
			</ul>
			{#if olderTest}
				<p class="text-sm text-surface-700-300 max-w-3xl">You also have {olderTest} earlier test credits, from before the mint. They stay in your history.</p>
			{/if}
		</Section>
	{/if}

	<Section title="How credits work" description="Six pictures. Play them, or step through.">
		<CreditsStory />
	</Section>
</Page>
