<script lang="ts">
	/*
	 * A coin, checked (5 October 2026, ADR-Q-035): the same check wherever it's
	 * asked for — the page a coin's QR code opens (/verify/<mint>) and the
	 * drawer behind "Scan to check" on your statement. Two questions kept
	 * apart, as on DoStudy's verify page: did this house really mint it, and
	 * does the house hold up? Then who stands behind it.
	 *
	 * The figures are the mint's own, asked for just now (/api/mint) and added
	 * up from its receipts; nothing about you is sent or kept.
	 */
	import { Section, Status } from '@inqbeta/q-ui';
	import Coin from './display/Coin.svelte';
	import MintBooks from './display/MintBooks.svelte';
	import Reconciled from './display/Reconciled.svelte';
	import { readMint, pounds, type MintView } from '$lib/money';
	import { readHome, type Home } from '$lib/home';

	let { mint: asked }: { mint: string } = $props();
	let mint = $state<MintView | null>(null);
	let says = $state('');
	let home = $state<Home | null>(null);
	let checkedAt = $state<Date | null>(null);
	$effect(() => {
		void readMint(true).then((m) => {
			mint = m.view;
			says = m.says ?? '';
			checkedAt = new Date();
		});
		void readHome().then((h) => (home = h));
	});
	const bank = $derived(home?.ok ? home : null);
	const ours = $derived(!!mint && mint.mint === asked);
	const short = (d: string) => (d.length > 24 ? `${d.slice(0, 14)}…${d.slice(-6)}` : d);
</script>

	<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 max-w-3xl flex flex-wrap items-center gap-5">
		<Coin mint={asked} size="lg" name={mint?.name || bank?.name} design={ours ? mint?.design : undefined} />
		<div class="flex-1 min-w-56 flex flex-col gap-2">
			<p class="text-sm opacity-70">This coin says it was minted by</p>
			<p class="role-token break-all" title={asked}>{short(asked)}</p>
			{#if !mint && !says}
				<p aria-live="polite">Asking the mint…</p>
			{:else if !mint}
				<p><Status tone="bad">Can’t check</Status> {says}</p>
			{:else if ours}
				<p><Status tone="good">Minted here</Status> A coin of {bank?.name ?? 'this house'}, made by its own mint.</p>
				<p>{#if mint.mode === 'live'}<Status tone="good">Live</Status> Real money{mint.publishedId ? `, published as ${mint.publishedId.slice(0, 12)}…` : ''}.{:else}<Status tone="needs-you">Test</Status> A test coin: no money behind it moves yet.{/if}</p>
			{:else}
				<p><Status tone="bad">Not from here</Status> This house’s mint is {short(mint.mint)}, not the one on the coin. Check it with the house that made it.</p>
			{/if}
		</div>
	</div>

	{#if mint && ours}
		<Section title="Does the house hold up?" description="Its reserves and its books, added up by the mint from its own receipts{checkedAt ? `, at ${checkedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}.">
			<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 max-w-3xl">
				<Reconciled last={mint.lastReconciled} movesSince={mint.movesSince} nameOf={(d) => (d === bank?.founder ? `${bank.name}’s treasurer` : undefined)} />
			</div>
			<MintBooks {mint} />
			<p class="text-sm max-w-3xl">One coin is worth <strong>{pounds(mint.pencePerCredit)}</strong>: what it costs to buy, and what cashing it out pays.</p>
		</Section>

		{#if bank}
			<Section title="Who stands behind it" description="The federation whose bank this is.">
				<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 max-w-3xl flex flex-col gap-2">
					<p class="h4">{bank.name}</p>
					{#if bank.purpose}<p>{bank.purpose}</p>{/if}
					<dl class="grid gap-3 sm:grid-cols-2 text-sm mt-2">
						<div><dt class="opacity-70">Federation</dt><dd class="role-token break-all" title={bank.federation}>{short(bank.federation)}</dd></div>
						<div><dt class="opacity-70">Founded by</dt><dd class="role-token break-all" title={bank.founder}>{short(bank.founder)}</dd></div>
					</dl>
					<!-- Visit it, and join if you'd like to take part. -->
					<a class="btn preset-filled-primary-500 min-h-11 self-start mt-2" href={bank.joinHref}>Visit {bank.name}</a>
				</div>
			</Section>
		{/if}
	{/if}
