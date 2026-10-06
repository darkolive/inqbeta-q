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
	 * the sums: what holding a gigabyte for an hour really costs, and a price
	 * in credits for an hour and a day. One credit is one unit of the mint's
	 * currency (ADR-Q-042 §3), so the price is the only thing to choose.
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
	import { DEFAULT_CURRENCY, currencyFrom, currencyName, minorPerCredit, money } from '@inqbeta/q-core/currency';
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
	/* Kept storage (ADR-Q-030): offered only when the node keeps it, for its operators. */
	let storeTerms = $state<{ where: string; operators: string[] } | null>(null);

	let days = $state<FlowDay[] | null>(null);
	let says = $state('');
	/* The mint's currency: costs are typed and shown in it, and one credit is one unit of it. */
	let currency = $state(DEFAULT_CURRENCY);
	const unit = $derived(minorPerCredit(currency));
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
			const st = await fetch(`${storage}/store`).catch(() => null);
			storeTerms = st?.ok ? ((await st.json().catch(() => null)) as typeof storeTerms) : null;
			days = (((await r.json()) as { days?: FlowDay[] }).days ?? []).sort((a, b) => a.day.localeCompare(b.day));
			/* The public mint's currency, so this works on the live site too. */
			const m = await fetch('/api/mint', { cache: 'no-store' }).catch(() => null);
			currency = currencyFrom(m?.ok ? ((await m.json()) as { currency?: string }).currency : undefined);
		})();
	});

	let monthly = $state(5);
	let capacity = $state(20);
	let margin = $state(20);
	const flow = $derived(days ? flowOf(days) : null);
	const cost = $derived(flow ? costOf(flow, Math.max(0, Number(monthly) || 0) * unit, Math.max(0.001, Number(capacity) || 0)) : null);
	const price = $derived(cost ? priceOf(cost.perGBHourFull, unit, Math.max(0, Number(margin) || 0) / 100) : null);
	const GB = 1024 ** 3;
	/* Money in minor units, in the currency; tiny amounts keep their fractions of a penny. */
	const p = (minor: number | null, dp = 2) => (minor === null ? '—' : minor < unit ? `${(minor / unit).toFixed(dp + 2)} ${currency}` : money(minor, currency));
	/*
	 * Credits by default (Darren, 4 October): "So there is no misunderstanding
	 * that we're talking about money here. We're talking about value." Money
	 * only when asked: one credit is one unit of the currency.
	 */
	let inPounds = $state(false);
	const sig = (n: number) => (n === 0 ? '0' : n >= 1 ? n.toFixed(n < 10 ? 2 : 1) : n.toPrecision(3));
	const v = (pence: number | null, dp = 2) => (pence === null ? '—' : inPounds ? p(pence, dp) : `${sig(pence / unit)} credits`);
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
	/* Kept storage by the month (ADR-Q-030 §4): space set aside, paid as agreed. */
	let keepGb = $state(10);
	let keepMonths = $state(1);
	let keepCredits = $state(5);
	let keepHow = $state(10);
	const isOperator = $derived(!!identity && !!storeTerms?.operators.includes(identity.did));
	const keepTerms = $derived.by((): Terms | null => {
		if (!identity || !relay || !storeTerms) return null;
		const mode = mint?.mode ?? 'test';
		const gb = Math.trunc(Number(keepGb) || 0);
		const months = Math.trunc(Number(keepMonths) || 0);
		return {
			kind: 'job',
			a: identity.did,
			b: '',
			aGives: { thing: `${gb} GB kept at ${new URL(relay.url).host}: a full copy of your vault, sealed, for ${months} month${months === 1 ? '' : 's'}` },
			bGives: { credits: Math.trunc(Number(keepCredits) || 0), mode, ...(mint ? { mint: mint.mint } : {}) },
			service: { kind: 'store', store: relay.url, where: storeTerms.where, gb, months }
		};
	});
	const keepProblems = $derived(keepTerms ? [...problemsWithTerms(keepTerms), ...(Number.isInteger(Number(keepHow)) && Number(keepHow) >= 1 ? [] : ['Say how many can take it: a whole number, at least one.'])] : []);
	let keeping = $state(false);
	let keepSays = $state('');
	async function offerKeep() {
		if (!identity || !keepTerms || keepProblems.length) return;
		keeping = true;
		keepSays = '';
		const id = newAgreementId();
		const out = await takeStep(identity, ledger, id, { step: 'proposed', parent: null, terms: keepTerms, limit: Number(keepHow) }, peopleFrom(ledger, identity.did), mint);
		if (!out.ok) {
			keeping = false;
			return void (keepSays = out.says);
		}
		const put = await publishListing(out.signed, ledger);
		keeping = false;
		void goto(`/agreements/${encodeURIComponent(id)}?shop=1${put.ok ? '' : `&said=${encodeURIComponent(`Kept in your vault, but not in your shop yet: ${put.says}`)}`}`);
	}
	let copied = $state(false);

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
			<label class="label"><span class="label-text">What the node costs a month ({currency})</span><input class="input" type="number" min="0" step="0.01" bind:value={monthly} /></label>
			<label class="label"><span class="label-text">Space for the pass-through (GB)</span><input class="input" type="number" min="1" step="1" bind:value={capacity} /></label>
			<label class="label"><span class="label-text">Margin (%)</span><input class="input" type="number" min="0" step="5" bind:value={margin} /></label>
		</div>
		{#if cost && price}
			<label class="flex items-center gap-3 min-h-11 self-start">
				<input type="checkbox" class="checkbox" bind:checked={inPounds} />
				<span class="text-sm">Show as money ({currencyName(currency)}): one credit is one</span>
			</label>
		{/if}
		{#if cost && price}
			<dl class="grid gap-3 sm:grid-cols-2 max-w-2xl">
				<div class="card preset-tonal-surface p-3"><dt class="text-sm opacity-70">A GB held for an hour, at today’s use</dt><dd class="h4 tabular-nums">{enough ? v(cost.perGBHourNow) : 'Too little use to say yet'}</dd><dd class="text-xs opacity-70">High while hardly anyone uses it: the node costs the same either way.</dd></div>
				<div class="card preset-tonal-surface p-3"><dt class="text-sm opacity-70">A GB held for an hour, if the space were full</dt><dd class="h4 tabular-nums">{v(cost.perGBHourFull, 4)}</dd><dd class="text-xs opacity-70">The floor: below this, the node can’t pay for itself.</dd></div>
				<div class="card preset-tonal-primary p-3"><dt class="text-sm opacity-70">Suggested price, with your margin</dt><dd class="h4 tabular-nums">{v(price.perGBHourPence, 4)}</dd><dd class="text-xs opacity-70">for a GB held for an hour.</dd></div>
				<div class="card preset-tonal-secondary p-3"><dt class="text-sm opacity-70">A GB held for a day, at that price</dt><dd class="h4 tabular-nums">{v(price.perGBHourPence * 24)}</dd><dd class="text-xs opacity-70">The same price, for a day: one people can picture.</dd></div>
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
		{#if relay && identity}
			<details class="card preset-tonal-surface p-3 sm:p-4">
				<summary class="cursor-pointer min-h-11 flex items-center font-semibold">Offer kept storage, by the month</summary>
				<div class="flex flex-col gap-4 mt-3">
					<p class="text-sm">Space set aside on your node, holding a full copy of each person’s sealed vault, kept level each sync. Paid for as agreed, used or not. Each one taken is its own agreement.</p>
					{#if !storeTerms}
						<p class="text-sm card preset-tonal-warning p-3">Your node doesn’t keep storage yet. Add the line below to its settings, then restart the gate (see HETZNER.md).</p>
					{:else if !isOperator}
						<p class="text-sm card preset-tonal-warning p-3">Your node keeps storage, but not for you yet: it needs your id in its operators.</p>
					{/if}
					{#if !storeTerms || !isOperator}
						<div class="flex flex-wrap items-center gap-2">
							<code class="text-xs break-all card preset-tonal p-2 flex-1 min-w-0">GATE_OPERATORS={identity.did}</code>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => void navigator.clipboard.writeText(`GATE_OPERATORS=${identity!.did}`).then(() => (copied = true))}>{copied ? 'Copied' : 'Copy'}</button>
						</div>
					{:else}
						<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-3xl">
							<label class="label"><span class="label-text">Gigabytes</span><input class="input" type="number" min="1" step="1" bind:value={keepGb} /></label>
							<label class="label"><span class="label-text">Months</span><input class="input" type="number" min="1" max="12" step="1" bind:value={keepMonths} /></label>
							<label class="label"><span class="label-text">Credits for the term</span><input class="input" type="number" min="1" step="1" bind:value={keepCredits} /></label>
							<label class="label"><span class="label-text">How many can take it</span><input class="input" type="number" min="1" step="1" bind:value={keepHow} /></label>
						</div>
						{#if keepProblems.length}<ul class="text-sm text-error-600-400">{#each keepProblems as p, i (i)}<li>{p}</li>{/each}</ul>{/if}
						<div><button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={keeping || !keepTerms || !!keepProblems.length} onclick={() => void offerKeep()}>{keeping ? 'Checking…' : 'Put it in your shop'}</button></div>
						{#if keepSays}<p class="text-sm card preset-tonal-warning p-3" aria-live="polite">{keepSays}</p>{/if}
					{/if}
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
