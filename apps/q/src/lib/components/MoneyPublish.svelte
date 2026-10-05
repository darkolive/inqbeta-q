<script lang="ts">
	/*
	 * Money on the console (ADR-Q-027 §7, 3 October 2026): test mode, then
	 * published — once, signed by the founder, for good.
	 *
	 * Darren: "When you're satisfied, you can then go from test mode to
	 * published. And it resets balances to zero. And you have to add bank
	 * account details. And you have to confirm, tick, your legal
	 * responsibility … And they sign it, and that produces a published ID. And
	 * that is then what becomes unchangeable."
	 */
	import { Icon, Status } from '@inqbeta/q-ui';
	import { sealWith } from '@inqbeta/q-core/seal';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import { MONEY_PUBLISHED_SCHEMA, RESPONSIBILITY, type CoinDesign, type MoneyPublication, type MoneyState } from '@inqbeta/q-core/money';

	let { identity, onChanged }: { identity: Identity; onChanged?: () => void } = $props();

	interface View {
		host: string | null;
		mint: string | null;
		says?: string;
		pencePerCredit: number;
		coinName?: string;
		coinDesign?: CoinDesign;
		bank: { set: boolean; ends: string };
		state: MoneyState;
	}
	let view = $state<View | null>(null);
	async function load() {
		const r = await fetch('/api/host/money', { cache: 'no-store' }).catch(() => null);
		view = r?.ok ? ((await r.json()) as View) : null;
	}
	$effect(() => void load());

	let ticked = $state(false);
	let sure = $state(false);
	let busy = $state(false);
	let says = $state<{ good: boolean; text: string } | null>(null);
	const pounds = (p: number) => `£${(p / 100).toFixed(2)}`;
	let copied = $state(false);
	async function copyMint() {
		if (!view?.mint) return;
		try {
			await navigator.clipboard.writeText(`GATE_MINTS=${view.mint}`);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch {
			copied = false;
		}
	}
	const ready = $derived(!!view?.host && !!view.mint && view.bank.set && ticked);

	async function publish() {
		if (!view?.host || !view.mint) return;
		busy = true;
		says = null;
		const content: MoneyPublication = {
			schema: MONEY_PUBLISHED_SCHEMA,
			source: 'inqbeta:q/host',
			host: view.host,
			mint: view.mint,
			pencePerCredit: view.pencePerCredit,
			...(view.coinName ? { coinName: view.coinName } : {}),
			...(view.coinDesign ? { coinDesign: view.coinDesign } : {}),
			bank: { ends: view.bank.ends },
			responsibility: RESPONSIBILITY,
			accepted: true,
			at: new Date().toISOString()
		};
		try {
			const publication = await sealWith(identity, content);
			const r = await fetch('/api/host/money', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publication }) });
			const out = (await r.json().catch(() => ({}))) as { ok?: boolean; says?: string; publishedId?: string };
			says = out.ok ? { good: true, text: `Published. Your published ID is ${out.publishedId}. Send static/host/services.json to your live site with your next release.` } : { good: false, text: out.says ?? `It said ${r.status}.` };
			if (out.ok) {
				await load();
				onChanged?.();
			}
		} catch (e) {
			says = { good: false, text: e instanceof Error ? e.message : String(e) };
		}
		busy = false;
		sure = false;
	}
</script>

<section class="card preset-outlined-surface-200-800 p-4 sm:p-5 flex flex-col gap-4 mt-6" aria-labelledby="money-mode">
	<div class="flex items-center gap-3">
		<h3 id="money-mode" class="h5 flex-1">Money: test mode, then published</h3>
		{#if view}<Status tone={view.state.mode === 'live' ? 'good' : 'needs-you'}>{view.state.mode === 'live' ? 'Published' : 'Test mode'}</Status>{/if}
	</div>

	{#if !view}
		<p class="opacity-60">Reading the money settings…</p>
	{:else if view.state.mode === 'live'}
		<p>Real money is live on this host. It can’t be changed back, or published again.</p>
		<dl class="grid gap-2 text-sm sm:grid-cols-2">
			<div><dt class="opacity-70">Published ID</dt><dd class="role-token text-xs break-all">{view.state.publishedId}</dd></div>
			<div><dt class="opacity-70">Published</dt><dd>{view.state.publication ? new Date(view.state.publication.at).toLocaleString('en-GB') : ''}</dd></div>
			<div><dt class="opacity-70">One credit</dt><dd>{pounds(view.state.publication?.pencePerCredit ?? 0)}</dd></div>
			<div><dt class="opacity-70">Payout account</dt><dd>ending {view.state.publication?.bank.ends}</dd></div>
		</dl>
	{:else}
		<p class="text-sm">In test mode everything works: minting, buying, agreements, shops, cashing out. No money moves. Try it all, or have an AI try it, then publish when you’re satisfied. Publishing starts real balances from zero, and can’t be undone.</p>
		<ol class="flex flex-col gap-3">
			<li class="flex items-start gap-3">
				<Status tone={view.mint ? 'good' : 'needs-you'}>{view.mint ? 'Ready' : 'Needed'}</Status>
				<span class="text-sm flex flex-col gap-2 min-w-0">
					<span><strong>The mint.</strong> {view.mint ? `Its key is made. One credit is ${pounds(view.pencePerCredit)} (Q_CREDIT_PENCE). ${view.coinName ? `Its coin is called “${view.coinName}” (Q_COIN_NAME), signed in when you publish.` : 'Its coin has no name yet: give it one as Q_COIN_NAME in Money.'}` : (view.says ?? 'Make the mint’s key in Money, above.')}</span>
					{#if view.mint}
						<!-- The node keeps only the ledgers of mints it's told about (GATE_MINTS): the line to give it. -->
						<span>Your node keeps its books once its <code>.env</code> has this line:</span>
						<code class="code break-all">GATE_MINTS={view.mint}</code>
						<button type="button" class="btn btn-sm preset-tonal min-h-11 self-start" onclick={() => void copyMint()}>{copied ? 'Copied' : 'Copy the line'}</button>
					{/if}
				</span>
			</li>
			<li class="flex items-start gap-3">
				<Status tone={view.bank.set ? 'good' : 'needs-you'}>{view.bank.set ? 'Ready' : 'Needed'}</Status>
				<span class="text-sm"><strong>Payout account.</strong> {view.bank.set ? `Set, ending ${view.bank.ends}. It stays on this computer.` : 'Set it in Payout account, above. It stays on this computer: never in git, never sent to Vercel.'}</span>
			</li>
			<li class="flex flex-col gap-2">
				<div class="card preset-tonal-surface p-3 text-sm">{RESPONSIBILITY}</div>
				<label class="flex items-center gap-3 min-h-11"><input type="checkbox" class="checkbox" bind:checked={ticked} /> I accept this responsibility</label>
			</li>
		</ol>
		{#if !sure}
			<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!ready || busy} onclick={() => (sure = true)}><Icon name="lock" size={18} /> Publish money…</button>
		{:else}
			<div class="card preset-tonal-warning p-4 flex flex-col gap-3" role="alertdialog" aria-label="Publish money">
				<p><strong>This can’t be undone.</strong> Real balances start from zero, and your signature goes in your host’s public record for every Q to see.</p>
				<div class="flex flex-wrap gap-3">
					<button type="button" class="btn preset-filled-error-500 min-h-11" disabled={busy} onclick={() => void publish()}>{busy ? 'Signing… touch your passkey' : 'Sign and publish'}</button>
					<button type="button" class="btn preset-tonal min-h-11" disabled={busy} onclick={() => (sure = false)}>Not yet</button>
				</div>
			</div>
		{/if}
	{/if}
	{#if says}<p class="text-sm card p-3 {says.good ? 'preset-tonal-success' : 'preset-tonal-error'}" aria-live="polite">{says.text}</p>{/if}
</section>
