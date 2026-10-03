<script lang="ts">
	/*
	 * Credits (ADR-Q-023, 2 October 2026). Replaces the old mock balance sheet.
	 *
	 * Your balance, added up from your own receipts; buying a pack in test
	 * mode, checked by the credit rules before it's kept; and every move, with
	 * what the rules said. Credits are for services beyond the free allowance,
	 * and are never cashed out for pounds.
	 */
	import CreditsStory from '$lib/components/CreditsStory.svelte';
	import { Page, Section, Status, Empty, Icon } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { balanceOf, movesOf, effectOn } from '@inqbeta/q-core/credits';
	import { buyTestPack, kindSays, TEST_PACKS, type Pack } from '$lib/credits';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const me = $derived(identity?.did ?? '');
	const testBalance = $derived(balanceOf(ledger?.receipts ?? [], me, 'test'));
	const liveBalance = $derived(balanceOf(ledger?.receipts ?? [], me, 'live'));
	const moves = $derived(movesOf(ledger?.receipts ?? [], me).reverse());

	let buying = $state('');
	let said = $state<{ tone: 'good' | 'bad'; text: string } | null>(null);
	async function buy(p: Pack) {
		if (!identity) return;
		buying = p.id;
		said = null;
		const out = await buyTestPack(identity, ledger, p);
		buying = '';
		if (out.ok) {
			said = { tone: 'good', text: `${p.credits} test credits added. The rules checked it, and the receipt is in your vault.` };
			await refreshLedger();
		} else said = { tone: 'bad', text: out.says };
	}
	const when = (at: string) => new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head><title>Credits — Q</title></svelte:head>

<Page title="Credits" lead="For using more than the free amount: bigger files, more often, calls through the switchboard. Added up from your own receipts.">
	<!-- How credits work, as pictures: the same story style as the rest of You. -->
	<CreditsStory />

	{#if !identity}
		<SignIn />
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 max-w-3xl">
			<div class="card preset-tonal-primary p-6 space-y-1">
				<p class="text-sm">Your credits</p>
				<p class="h2">{liveBalance}</p>
				<p class="text-sm opacity-80">Real credits. Buying them opens once payments are set up.</p>
			</div>
			<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-6 space-y-1">
				<p class="text-sm flex items-center gap-2">Test credits <Status tone="waiting">Test</Status></p>
				<p class="h2">{testBalance}</p>
				<p class="text-sm text-surface-700-300">For trying everything out. No money taken, and they never mix with real ones.</p>
			</div>
		</div>

		<Section title="Buy credits" description="Test mode: buying works end to end, but no money is taken.">
			<div class="flex flex-wrap gap-4">
				{#each TEST_PACKS as p (p.id)}
					<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-3 min-w-56">
						<p class="h4">{p.credits} credits</p>
						<p class="text-sm text-surface-700-300">{p.name} · Test, no money taken</p>
						<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!!buying} onclick={() => void buy(p)}>
							<Icon name="wallet" size={18} /> {buying === p.id ? 'Checking…' : 'Buy (test)'}
						</button>
					</div>
				{/each}
			</div>
			{#if said}
				<p class="mt-4"><Status tone={said.tone}>{said.tone === 'good' ? 'Done' : 'Not added'}</Status> {said.text}</p>
			{/if}
		</Section>

		<Section title="Every move" description="Each one signed, and checked by the credit rules when it was made.">
			{#if moves.length}
				<ul class="card preset-outlined-surface-200-800 bg-surface-50-950 divide-y divide-surface-200-800 overflow-hidden max-w-3xl">
					{#each moves as m (m.signature)}
						{@const n = effectOn(m.content, me)}
						<li class="flex items-center gap-4 p-4">
							<span class="flex-1 min-w-0">
								<span class="block font-semibold">{kindSays[m.content.kind]}{m.content.pack ? ` · ${m.content.pack.name}` : ''}</span>
								<span class="block text-sm text-surface-700-300">
									{when(m.content.at)}{m.content.checked ? ` · checked: ${m.content.checked.rules.length ? m.content.checked.rules.join(', ') : 'held'}` : ''}
								</span>
							</span>
							{#if m.content.mode === 'test'}<Status tone="waiting">Test</Status>{/if}
							<span class="h4 tabular-nums {n < 0 ? 'text-error-600-400' : 'text-success-600-400'}">{n > 0 ? '+' : ''}{n}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<Empty icon="wallet" title="No credits yet" description="Everyday use is free. Credits are only for using more than the free amount." />
			{/if}
		</Section>
	{/if}
</Page>
