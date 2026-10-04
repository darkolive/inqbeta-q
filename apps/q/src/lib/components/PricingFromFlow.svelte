<script lang="ts">
	/*
	 * From the flow to a price (ADR-Q-028 §5a), on the host's console.
	 *
	 * Darren: "Once we've got the data on how it flows and how much space is
	 * being used … then we can calculate what the credit cost is. And then once
	 * we've got the credit cost, we can set a price for minting."
	 *
	 * Reads the node's daily pass-through totals (nothing about whose), asks
	 * what the node costs a month and how much space its relay has, and shows
	 * the sums: what holding a gigabyte for an hour really costs, a price in
	 * credits, and what a credit would be worth if a gigabyte held for a day
	 * cost one. It suggests; the host decides (Q_CREDIT_PENCE, in Money).
	 *
	 * Then, "people could hire by the hour": the host can put the pass-through
	 * in their shop at a price per GB-hour. Each hire is its own agreement;
	 * the hirer's Q uses it alongside their own host's, and they settle from
	 * the custody receipts both sides hold (ADR-Q-028 §5).
	 */
	import { Status } from '@inqbeta/q-ui';
	import { costOf, flowOf, priceOf, type FlowDay } from '@inqbeta/q-core/pricing';
	import { readHome } from '$lib/home';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { problemsWithTerms, type Terms } from '@inqbeta/q-core/agreements';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { newAgreementId, takeStep } from '$lib/agreements';
	import { readMint, type MintView } from '$lib/money';
	import { publishListing } from '$lib/shop';
	import { goto } from '$app/navigation';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	let mint = $state<MintView | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	$effect(() => void readMint().then((m) => (mint = m.view)));
	/* The relay's own terms: its name (as it signs receipts) and its open hours. */
	let relay = $state<{ url: string; where: string; hours?: string } | null>(null);

	let days = $state<FlowDay[] | null>(null);
	let says = $state('');
	let pencePerCredit = $state(0);
	$effect(() => {
		void (async () => {
			const h = await readHome().catch(() => null);
			const storage = h?.ok ? h.services.storage : undefined;
			if (!storage) return void (says = 'This host has no storage node yet, so there’s no flow to measure.');
			const r = await fetch(`${storage}/relay/stats`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
			if (!r?.ok) return void (says = r?.status === 404 ? 'Your node doesn’t offer a pass-through yet (it needs GATE_SEED).' : 'Your node didn’t answer just now.');
			const t = (await (await fetch(`${storage}/relay`).catch(() => null))?.json().catch(() => null)) as { where?: string; hours?: { from: number; to: number } | null } | null;
			const hh = (n: number) => `${String(n).padStart(2, '0')}:00`;
			if (t?.where) relay = { url: storage.replace(/\/$/, ''), where: t.where, ...(t.hours ? { hours: `${hh(t.hours.from)}–${hh(t.hours.to)} UTC` } : {}) };
			days = (((await r.json()) as { days?: FlowDay[] }).days ?? []).sort((a, b) => a.day.localeCompare(b.day));
			const m = await fetch('/api/host/money', { cache: 'no-store' }).catch(() => null);
			pencePerCredit = m?.ok ? Number(((await m.json()) as { pencePerCredit?: number }).pencePerCredit ?? 0) : 0;
		})();
	});

	let monthly = $state(5);
	let capacity = $state(20);
	let margin = $state(20);
	const flow = $derived(days ? flowOf(days) : null);
	const cost = $derived(flow ? costOf(flow, Math.max(0, Number(monthly) || 0) * 100, Math.max(0.001, Number(capacity) || 0)) : null);
	const price = $derived(cost ? priceOf(cost.perGBHourFull, pencePerCredit, Math.max(0, Number(margin) || 0) / 100) : null);
	const GB = 1024 ** 3;
	const p = (pence: number | null, dp = 2) => (pence === null ? '—' : pence < 100 ? `${pence.toFixed(dp)}p` : `£${(pence / 100).toFixed(2)}`);
	const mb = (b: number) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
	/* Less than a hundredth of a GB-hour is too little to say anything honest about today's cost. */
	const enough = $derived(!!flow && flow.byteHours / GB >= 0.01);

	/* Offer it in your shop: the rate starts at the suggestion, rounded up to three figures. */
	const up3 = (n: number) => (n > 0 ? Number(n.toPrecision(3)) + (Number(n.toPrecision(3)) < n ? 10 ** (Math.floor(Math.log10(n)) - 2) : 0) : 1);
	let rate = $state<number | null>(null);
	let most = $state(50);
	let hirers = $state(10);
	$effect(() => {
		if (rate === null && price) rate = price.creditsPerGBHour ? up3(price.creditsPerGBHour) : 1;
	});
	const hire = $derived.by((): Terms | null => {
		if (!identity || !relay || !rate) return null;
		const mode = mint?.mode ?? 'test';
		return {
			kind: 'job',
			a: identity.did,
			b: '',
			aGives: { thing: `Pass-through at ${new URL(relay.url).host}: your files held until your cloud has them${relay.hours ? `, taking new ones ${relay.hours}` : ''}` },
			bGives: { credits: Math.trunc(Number(most) || 0), mode, ...(mint ? { mint: mint.mint } : {}) },
			service: { kind: 'pass-through', relay: relay.url, where: relay.where, perGBHour: Number(rate), ...(relay.hours ? { hours: relay.hours } : {}) }
		};
	});
	const hireProblems = $derived(hire ? [...problemsWithTerms(hire), ...(Number.isInteger(Number(hirers)) && Number(hirers) >= 1 ? [] : ['Say how many can hire it: a whole number, at least one.'])] : []);
	let offering = $state(false);
	let offerSays = $state('');
	async function offer() {
		if (!identity || !hire || hireProblems.length) return;
		offering = true;
		offerSays = '';
		const id = newAgreementId();
		const out = await takeStep(identity, ledger, id, { step: 'proposed', parent: null, terms: hire, limit: Number(hirers) }, peopleFrom(ledger, identity.did), mint);
		if (!out.ok) {
			offering = false;
			return void (offerSays = out.says);
		}
		const put = await publishListing(out.signed, ledger);
		offering = false;
		void goto(`/agreements/${encodeURIComponent(id)}?shop=1${put.ok ? '' : `&said=${encodeURIComponent(`Kept in your vault, but not in your shop yet: ${put.says}`)}`}`);
	}
</script>

<div class="card preset-outlined-surface-200-800 p-4 sm:p-5 flex flex-col gap-4">
	<div class="flex flex-wrap items-center gap-3">
		<p class="font-bold flex-1">From the flow to a price</p>
		<Status tone="waiting">Suggests, doesn’t decide</Status>
	</div>
	{#if says}
		<p class="text-sm">{says}</p>
	{:else if !flow}
		<p class="text-sm opacity-70">Reading your node’s totals…</p>
	{:else}
		<p class="text-sm">
			Over {flow.days === 1 ? 'one day' : `${flow.days} days`}, your node passed through <strong>{flow.files} files</strong> ({mb(flow.bytesIn)}), holding them {flow.meanHours ? `about ${flow.meanHours < 1 ? `${Math.round(flow.meanHours * 60)} minutes` : `${flow.meanHours.toFixed(1)} hours`}` : 'no time'} on average{flow.timedOut ? `; ${flow.timedOut} timed out waiting for a cloud` : ''}. Totals only: nothing about whose.
		</p>
		<div class="grid gap-4 sm:grid-cols-3 max-w-2xl">
			<label class="label"><span class="label-text">What the node costs a month (£)</span><input class="input" type="number" min="0" step="0.01" bind:value={monthly} /></label>
			<label class="label"><span class="label-text">Space for the pass-through (GB)</span><input class="input" type="number" min="1" step="1" bind:value={capacity} /></label>
			<label class="label"><span class="label-text">Margin (%)</span><input class="input" type="number" min="0" step="5" bind:value={margin} /></label>
		</div>
		{#if cost && price}
			<dl class="grid gap-3 sm:grid-cols-2 max-w-2xl">
				<div class="card preset-tonal-surface p-3"><dt class="text-sm opacity-70">A GB held for an hour, at today’s use</dt><dd class="h4 tabular-nums">{enough ? p(cost.perGBHourNow) : 'Too little use to say yet'}</dd><dd class="text-xs opacity-70">High while hardly anyone uses it: the node costs the same either way.</dd></div>
				<div class="card preset-tonal-surface p-3"><dt class="text-sm opacity-70">A GB held for an hour, if the space were full</dt><dd class="h4 tabular-nums">{p(cost.perGBHourFull, 4)}</dd><dd class="text-xs opacity-70">The floor: below this, the node can’t pay for itself.</dd></div>
				<div class="card preset-tonal-primary p-3"><dt class="text-sm opacity-70">Suggested price, with your margin</dt><dd class="h4 tabular-nums">{price.creditsPerGBHour === null ? p(price.perGBHourPence, 4) : `${price.creditsPerGBHour.toFixed(price.creditsPerGBHour < 1 ? 3 : 1)} credits`}</dd><dd class="text-xs opacity-70">for a GB held for an hour{pencePerCredit ? `, at ${p(pencePerCredit, 0)} a credit` : ''}.</dd></div>
				<div class="card preset-tonal-secondary p-3"><dt class="text-sm opacity-70">If a GB held for a day cost one credit</dt><dd class="h4 tabular-nums">{p(price.pencePerCreditForGBDay)}</dd><dd class="text-xs opacity-70">a credit would be worth this: a price for minting people can picture. Set it as Q_CREDIT_PENCE in Money.</dd></div>
			</dl>
		{/if}
		{#if relay && identity}
			<details class="card preset-tonal-surface p-3 sm:p-4">
				<summary class="cursor-pointer min-h-11 flex items-center font-semibold">Offer it in your shop, by the hour</summary>
				<div class="flex flex-col gap-4 mt-3">
					<p class="text-sm">People hire your pass-through from your shop. Their Q uses it alongside their own host’s{relay.hours ? `, handing it new files ${relay.hours}` : ''}, and they pay for what they used, worked out from the receipts you both hold. Each hire is its own agreement.</p>
					<div class="grid gap-4 sm:grid-cols-3 max-w-2xl">
						<label class="label"><span class="label-text">Credits for a GB held an hour</span><input class="input" type="number" min="0.001" step="0.001" bind:value={rate} /></label>
						<label class="label"><span class="label-text">Most a hirer pays (credits)</span><input class="input" type="number" min="1" step="1" bind:value={most} /></label>
						<label class="label"><span class="label-text">How many can hire it</span><input class="input" type="number" min="1" step="1" bind:value={hirers} /></label>
					</div>
					{#if hireProblems.length}<ul class="text-sm text-error-600-400">{#each hireProblems as p, i (i)}<li>{p}</li>{/each}</ul>{/if}
					<div><button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={offering || !hire || !!hireProblems.length} onclick={() => void offer()}>{offering ? 'Checking…' : 'Put it in your shop'}</button></div>
					{#if offerSays}<p class="text-sm card preset-tonal-warning p-3" aria-live="polite">{offerSays}</p>{/if}
				</div>
			</details>
		{/if}
		{#if days && days.length}
			<details class="text-sm">
				<summary class="cursor-pointer min-h-11 flex items-center font-semibold">The days</summary>
				<ul class="flex flex-col gap-1 mt-2">
					{#each days as d (d.day)}<li class="tabular-nums">{d.day}: {d.in.items} in ({mb(d.in.bytes)}), {d.arrived.items} arrived, {d.timedOut.items} timed out, {((d.arrived.byteHours + d.timedOut.byteHours) / GB).toFixed(4)} GB-hours</li>{/each}
				</ul>
			</details>
		{/if}
	{/if}
</div>
