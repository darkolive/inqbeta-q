<script lang="ts">
	/*
	 * Give vouchers: a grant (ADR-Q-044 §7, step 6; 8 October 2026). Darren:
	 * "If a grant was a voucher and in the voucher you put a condition in a
	 * type … this voucher can be swapped for storage, it can be swapped for
	 * office space … Solves so many problems and simplifies it."
	 *
	 * What it's worth, what it can be used for, who may honour it, who it's
	 * for, and when it ends. Your credits stay in your account, held behind
	 * each copy you hand out; the provider who honours one is paid from them,
	 * and whatever's unspent comes back when it ends. The people you give it
	 * to hold a voucher, never credits.
	 */
	import { goto } from '$app/navigation';
	import { Page, Section } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { voucherProblem } from '@inqbeta/q-core/vouchers';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { readMint, type MintView } from '$lib/money';
	import { makeGrant, type VoucherDraft } from '$lib/vouchers';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	let mint = $state<MintView | null>(null);
	$effect(() => void readMint().then((m) => (mint = m.view)));
	const people = $derived(identity ? peopleFrom(ledger, identity.did) : []);

	let title = $state('');
	let words = $state('');
	let worth = $state<number | null>(null);
	let uses = $state('');
	let providers = $state<string[]>([]);
	let programme = $state('');
	let ends = $state('');
	let howMany = $state<number | null>(null);

	const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
	const draft = $derived<VoucherDraft | null>(
		mint && worth && ends
			? {
					title: title.trim(),
					words: words.trim(),
					pictures: [],
					medium: 'service',
					kind: 'consumable',
					of: howMany && howMany > 0 ? howMany : null,
					price: { paid: false, from: 'credits', worth, mint: mint.mint, currency: mint.currency },
					moves: 'bound',
					realm: { kinds: lines(uses), accepted: providers },
					ends: { at: new Date(`${ends}T23:59:59Z`).toISOString(), then: 'return' },
					eligibleUnder: programme.trim()
				}
			: null
	);
	const says = $derived(
		!mint ? 'Q can’t find your bank just now.' : !worth ? 'Say what each one is worth, in credits.' : !lines(uses).length ? 'Say what it can be used for: one thing per line.' : !programme.trim() ? 'Say who it’s for: the name of your programme.' : !ends ? 'Say when it ends: unspent credits come back to you then.' : draft ? voucherProblem(draft) : null
	);

	let busy = $state(false);
	let problem = $state('');
	async function make() {
		if (!identity || !draft) return;
		busy = true;
		problem = '';
		const out = await makeGrant(identity, draft);
		busy = false;
		if (out.ok) void goto(`/v/${encodeURIComponent(out.hash)}`);
		else problem = out.says;
	}
</script>

<svelte:head><title>Give vouchers — Q</title></svelte:head>

<Page title="Give vouchers" lead="A grant, as a voucher. Your credits stay with you, held behind each one you hand out. Whoever honours one is paid from them; what’s unspent comes back when it ends.">
	{#if !identity}
		<div class="panel"><SignIn stay /></div>
	{:else}
		<Section title="What it is">
			<div class="flex flex-col gap-4 max-w-xl">
				<label class="label"><span class="label-text">What it’s called</span><input class="input" bind:value={title} /></label>
				<label class="label"><span class="label-text">Say more: what it’s for, and anything to know</span><textarea class="textarea" rows="3" bind:value={words}></textarea></label>
				<label class="label"><span class="label-text">Each one is worth (credits{mint ? `, ${mint.mode === 'test' ? 'test ' : ''}${mint.currency}` : ''})</span><input class="input" type="number" min="1" inputmode="numeric" bind:value={worth} /></label>
				<label class="label"><span class="label-text">How many you’ll give (or leave empty)</span><input class="input" type="number" min="1" inputmode="numeric" bind:value={howMany} /></label>
			</div>
		</Section>

		<Section title="What it can be used for" description="It can be swapped for any of these, with a provider you accept, and nothing else. It can’t be cashed out or passed on.">
			<div class="flex flex-col gap-4 max-w-xl">
				<label class="label"><span class="label-text">One thing per line: training, storage, office space…</span><textarea class="textarea" rows="3" bind:value={uses}></textarea></label>
				<fieldset class="flex flex-col gap-2">
					<legend class="label-text mb-1">Who may honour it</legend>
					{#if !people.length}
						<p class="text-sm">Link up with the providers first: they come from your address book.</p>
					{:else}
						{#each people as p (p.did)}
							<label class="flex items-center gap-3 min-h-11 card preset-outlined-surface-200-800 p-3">
								<input class="checkbox" type="checkbox" value={p.did} bind:group={providers} />
								<span>{p.name}</span>
							</label>
						{/each}
					{/if}
				</fieldset>
			</div>
		</Section>

		<Section title="Who it’s for, and for how long">
			<div class="flex flex-col gap-4 max-w-xl">
				<label class="label"><span class="label-text">Your programme’s name: it’s all the voucher says about why someone got it</span><input class="input" bind:value={programme} /></label>
				<label class="label"><span class="label-text">Ends on: what’s unspent comes back to you then</span><input class="input" type="date" bind:value={ends} /></label>
			</div>
		</Section>

		{#if says}<p class="card preset-tonal-warning p-3 text-sm max-w-xl">{says}</p>{/if}
		{#if problem}<p class="card preset-tonal-error p-3 text-sm max-w-xl" aria-live="polite">{problem}</p>{/if}
		<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy || !!says} onclick={() => void make()}>{busy ? 'Signing…' : 'Sign the grant'}</button>
		<p class="text-sm text-surface-700-300 max-w-xl">Handing one out is your word that the person qualifies under your programme. Nothing about why is recorded. It isn’t legal or charity advice.</p>
	{/if}
</Page>
