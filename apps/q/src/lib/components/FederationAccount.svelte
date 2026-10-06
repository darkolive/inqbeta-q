<script lang="ts">
	/*
	 * The federation's own account, in role (ADR-Q-038 §8; 6 October 2026, C4).
	 * Darren: "if I click on role on that page and I'm then working in the
	 * capacity of that federation, then the only reason I'm going to be able to
	 * cash out is because I have either treasurer powers or something that the
	 * organisation allows my role to do … that may require evidence of decision
	 * … but it gets signed by the person with the role who has the power to
	 * action … without needing multiple screens."
	 *
	 * The same page, the federation's money: what it holds, the banking card
	 * it's paid into (the caretaker signs it with the federation's key), the
	 * decisions minuted for spending (the secretary or chair), and its cash-outs:
	 * one money office holder asks, a second reads and signs, and only then
	 * does the bank pay. Shown only in role.
	 */
	import { Section, Status, Empty } from '@inqbeta/q-ui';
	import { signerFor, type Identity } from '@inqbeta/q-core/passkey';
	import { openFederationKey } from '@inqbeta/q-core/membership';
	import { officeKind, officeMay } from '@inqbeta/q-core/offices';
	import type { Acting } from '@inqbeta/q-core/inrole';
	import { askSecond, signSecond, COSIGN_WHY, type Cosigned } from '@inqbeta/q-core/cosign';
	import { minuteDecision, DECISION_HOW, type DecisionHow } from '@inqbeta/q-core/decisions';
	import { makeBankingCard, detailsProblem } from '@inqbeta/q-core/treaties';
	import type { FederationAccount } from '@inqbeta/q-core/federation-money';
	import { creditsWorth } from '@inqbeta/q-core/currency';
	import type { FederationRecord } from '$lib/federations';

	let { identity, acting, record, name }: { identity: Identity; acting: Acting; record: FederationRecord | null; name: string } = $props();

	const CASH_OUT = '/fed/money/cash-out';
	const mayMoney = $derived(officeMay(acting.office, CASH_OUT));
	const mayMinute = $derived(officeMay(acting.office, '/fed/minutes'));
	const called = $derived(officeKind(acting.office)?.called ?? acting.office);

	let account = $state<FederationAccount | null>(null);
	let currency = $state('GBP');
	let loaded = $state(false);
	async function refresh() {
		const r = await fetch('/api/mint').catch(() => null);
		const j = r?.ok ? ((await r.json().catch(() => null)) as { federation?: FederationAccount; currency?: string } | null) : null;
		account = j?.federation ?? null;
		currency = j?.currency ?? 'GBP';
		loaded = true;
	}
	$effect(() => void refresh());

	let busy = $state('');
	let said = $state<{ good: boolean; text: string } | null>(null);
	async function send(what: string, body: Record<string, unknown>, after?: () => void) {
		busy = what;
		said = null;
		try {
			const r = await fetch('/api/mint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			const out = (await r.json().catch(() => ({}))) as { ok?: boolean; says?: string };
			said = r.ok && out.ok ? { good: true, text: out.says ?? 'Done.' } : { good: false, text: out.says ?? `The bank said ${r.status}.` };
			if (r.ok && out.ok) {
				after?.();
				await refresh();
			}
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
		}
		busy = '';
	}

	/* The banking card: the caretaker signs it with the federation's key. */
	let cardName = $state('');
	let sortCode = $state('');
	let accountNo = $state('');
	const cardSays = $derived(cardName || sortCode || accountNo ? detailsProblem({ name: cardName, sortCode, account: accountNo }) : null);
	async function signCard() {
		if (!record) return;
		busy = 'card';
		try {
			const key = await openFederationKey(record.sealedKey, identity);
			const card = await makeBankingCard(key, { name: cardName, sortCode, account: accountNo }, { currency, replaces: account?.card?.hash ?? null });
			await send('card', { fedcard: card }, () => ((cardName = ''), (sortCode = ''), (accountNo = '')));
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
			busy = '';
		}
	}

	/* A decision, minuted in role. */
	let decSays = $state('');
	let decHow = $state<DecisionHow>('meeting');
	let decOn = $state(new Date().toISOString().slice(0, 10));
	let decUpTo = $state<number | null>(null);
	async function minute() {
		busy = 'minute';
		try {
			const d = await minuteDecision(identity, acting, { says: decSays, how: decHow, decidedOn: decOn, ...(decUpTo ? { upTo: decUpTo } : {}) });
			await send('minute', { fedminute: d }, () => ((decSays = ''), (decUpTo = null)));
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
			busy = '';
		}
	}

	/* A cash-out for the federation: one holder asks, a second signs. */
	let outCredits = $state<number | null>(null);
	let outDecision = $state('');
	let outSays = $state('');
	async function ask() {
		if (!account?.card || !outCredits) return;
		busy = 'ask';
		try {
			const c = await askSecond(signerFor(identity), acting, { cmd: CASH_OUT, action: { credits: outCredits, to: account.card.hash, decision: outDecision }, says: outSays });
			await send('ask', { fedask: c }, () => ((outCredits = null), (outSays = '')));
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
			busy = '';
		}
	}
	async function agree(c: Cosigned) {
		busy = c.at;
		try {
			await send(c.at, { fedagree: await signSecond(c, signerFor(identity), acting) });
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
			busy = '';
		}
	}
	const firstOf = (c: Cosigned) => c.signatures.find((s) => s.by === 'first');
	const onDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	const decisionsLeft = $derived((account?.decisions ?? []).filter((d) => d.receipt.content.how === 'rule' || (d.receipt.content.upTo ?? 0) > d.spent));
</script>

<section class="card preset-outlined-primary-500 bg-surface-50-950 p-5 flex flex-col gap-5 mb-8" aria-labelledby="fed-account-title">
	<div class="flex flex-wrap items-center gap-3">
		<h3 id="fed-account-title" class="h4 flex-1">{name}’s own account</h3>
		<Status tone="plain">As {called}</Status>
	</div>
	<p class="text-sm">You’re acting for the federation. Its money moves only with two office holders’ signatures, and a recorded decision that allows it.</p>

	{#if !loaded}
		<p class="opacity-60">Reading the books…</p>
	{:else if !account}
		<Empty icon="wallet" title="No bank here yet" description="This host’s money isn’t set up, so the federation has no account to show." />
	{:else}
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="card preset-tonal p-4">
				<p class="text-sm opacity-70">It holds</p>
				<p class="h3">{account.holds} credits</p>
				<p class="text-sm">{creditsWorth(account.holds, currency)} · {account.spendable} free to move</p>
			</div>
			<div class="card preset-tonal p-4">
				<p class="text-sm opacity-70">Paid into</p>
				{#if account.card}
					<p class="h4">The account ending {account.card.ends}</p>
					<p class="text-sm">Signed by the federation’s key. Payments go only here.</p>
				{:else}
					<p class="font-bold">No banking card yet</p>
					<p class="text-sm">{record ? 'Sign one below: nothing can be paid out until you do.' : 'The caretaker signs it with the federation’s key.'}</p>
				{/if}
			</div>
		</div>

		{#if record && acting.office === 'caretaker'}
			<details class="card preset-outlined-surface-200-800 p-4" open={!account.card}>
				<summary class="font-bold cursor-pointer min-h-11 flex items-center">{account.card ? 'Change the banking card' : 'Sign the federation’s banking card'}</summary>
				<div class="flex flex-col gap-3 mt-3">
					<p class="text-sm">Only the last four digits and a fingerprint are kept. A change is a new card naming the old one, never a message.</p>
					<label class="label"><span class="label-text">Name on the account</span><input class="input" autocomplete="off" bind:value={cardName} /></label>
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="label"><span class="label-text">Sort code</span><input class="input font-mono" inputmode="numeric" autocomplete="off" bind:value={sortCode} /></label>
						<label class="label"><span class="label-text">Account number</span><input class="input font-mono" inputmode="numeric" autocomplete="off" bind:value={accountNo} /></label>
					</div>
					{#if cardSays}<p class="text-sm card preset-tonal-warning p-3">{cardSays}</p>{/if}
					<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!busy || !cardName || !!cardSays} onclick={() => void signCard()}>{busy === 'card' ? 'Signing… touch your passkey' : 'Sign with the federation’s key'}</button>
				</div>
			</details>
		{/if}

		<Section title="Decisions" description="What the federation agreed it may spend, minuted by its secretary or chair.">
			{#if !account.decisions.length}
				<p class="text-sm opacity-70">None minuted yet. A cash-out needs one.</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each account.decisions as d (d.hash)}
						<li class="card preset-outlined-surface-200-800 p-3 text-sm flex flex-col gap-1">
							<span class="font-bold">{d.receipt.content.says}</span>
							<span>{DECISION_HOW.find((h) => h.id === d.receipt.content.how)?.called}, {onDay(d.receipt.content.decidedOn)}{d.receipt.content.upTo ? ` · up to ${d.receipt.content.upTo} credits, ${d.spent} spent` : ''}</span>
						</li>
					{/each}
				</ul>
			{/if}
			{#if mayMinute}
				<details class="card preset-outlined-surface-200-800 p-4 mt-3">
					<summary class="font-bold cursor-pointer min-h-11 flex items-center">Minute a decision</summary>
					<div class="flex flex-col gap-3 mt-3">
						<label class="label"><span class="label-text">What was decided</span><textarea class="textarea" rows="2" bind:value={decSays}></textarea></label>
						<div class="grid gap-3 sm:grid-cols-3">
							<label class="label"><span class="label-text">How</span>
								<select class="select" bind:value={decHow}>{#each DECISION_HOW as h (h.id)}<option value={h.id}>{h.called}</option>{/each}</select>
							</label>
							<label class="label"><span class="label-text">On</span><input class="input" type="date" bind:value={decOn} /></label>
							<label class="label"><span class="label-text">Up to (credits)</span><input class="input" type="number" min="1" inputmode="numeric" bind:value={decUpTo} /></label>
						</div>
						<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!busy || !decSays.trim()} onclick={() => void minute()}>{busy === 'minute' ? 'Signing…' : 'Sign the minute'}</button>
					</div>
				</details>
			{/if}
		</Section>

		<Section title="Cash-outs" description="One money office holder asks; a second reads it and signs. Then the bank pays the federation’s account.">
			{#if account.waiting.length}
				<ul class="flex flex-col gap-2 mb-4">
					{#each account.waiting as w (w.hash)}
						{@const first = firstOf(w.cosigned)}
						<li class="card preset-tonal-warning p-4 flex flex-col gap-2 text-sm">
							<span class="font-bold">{w.cosigned.says}</span>
							<span>{w.credits} credits ({creditsWorth(w.credits, currency)}) · asked by the {first?.office} · {onDay(w.cosigned.at)}</span>
							<ul class="list-disc ps-5">{#each w.cosigned.why as y (y)}<li>{COSIGN_WHY[y]}</li>{/each}</ul>
							{#if mayMoney && first?.did !== identity.did}
								<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!busy} onclick={() => void agree(w.cosigned)}>{busy === w.cosigned.at ? 'Signing… touch your passkey' : 'I’ve read it: sign as second'}</button>
							{:else if first?.did === identity.did}
								<span class="opacity-80">Waiting for another office holder with the money mandate to sign.</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if mayMoney}
				{#if !account.card}
					<p class="text-sm">Set the banking card first.</p>
				{:else if !decisionsLeft.length}
					<p class="text-sm">Minute a decision that allows it first.</p>
				{:else}
					<details class="card preset-outlined-surface-200-800 p-4">
						<summary class="font-bold cursor-pointer min-h-11 flex items-center">Cash out for the federation</summary>
						<div class="flex flex-col gap-3 mt-3">
							<div class="grid gap-3 sm:grid-cols-2">
								<label class="label"><span class="label-text">Credits</span><input class="input" type="number" min="1" max={account.spendable} inputmode="numeric" bind:value={outCredits} /></label>
								<label class="label"><span class="label-text">The decision that allows it</span>
									<select class="select" bind:value={outDecision}>
										<option value="" disabled>Choose…</option>
										{#each decisionsLeft as d (d.hash)}<option value={d.hash}>{d.receipt.content.says}{d.receipt.content.upTo ? ` (${d.receipt.content.upTo - d.spent} left)` : ''}</option>{/each}
									</select>
								</label>
							</div>
							<label class="label"><span class="label-text">What it’s for, for the second signer to read</span><input class="input" bind:value={outSays} /></label>
							<p class="text-sm">Paid into the account ending {account.card.ends}.{outCredits ? ` ${creditsWorth(outCredits, currency)}.` : ''}</p>
							<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!busy || !outCredits || !outDecision || !outSays.trim()} onclick={() => void ask()}>{busy === 'ask' ? 'Signing… touch your passkey' : 'Sign and ask a second holder'}</button>
						</div>
					</details>
				{/if}
			{/if}
			{#if account.done.length}
				<ul class="flex flex-col gap-1 mt-4 text-sm">
					{#each account.done as d (d.hash)}<li><span class="font-bold">Paid</span> · {d.credits} credits · {d.cosigned.says} · {onDay(d.at)}</li>{/each}
				</ul>
			{/if}
		</Section>
	{/if}
	{#if said}<p class="card p-3 text-sm {said.good ? 'preset-tonal-success' : 'preset-tonal-error'}" aria-live="polite">{said.text}</p>{/if}
</section>
