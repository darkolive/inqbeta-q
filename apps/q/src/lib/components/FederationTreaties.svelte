<script lang="ts">
	/*
	 * Treaties, in role (ADR-Q-042; 7 October 2026, E5). One federation
	 * proposes; a money office holder of the other reads it and signs; both
	 * banks file it. Each side signs twice: the federation's key (opened by
	 * whoever holds it) and the office holder in role.
	 *
	 * While a treaty is in force, its partner's providers are accepted for
	 * this federation's vouchers (ADR-Q-044 §5). Trading and settling under it
	 * come with the money moving; nothing here moves money.
	 */
	import { page } from '$app/state';
	import { Section, Status, Empty, type Tone } from '@inqbeta/q-ui';
	import { signerFor, type Identity } from '@inqbeta/q-core/passkey';
	import { openFederationKey } from '@inqbeta/q-core/membership';
	import { officeKind, officeMay } from '@inqbeta/q-core/offices';
	import type { Acting } from '@inqbeta/q-core/inrole';
	import { agreeTreaty, giveNotice, proposeTreaty, PERIODS, RATE_SOURCES, NOTICE_DAYS, type RateSource, type Side, type Treaty, type TreatyState } from '@inqbeta/q-core/treaties';
	import type { TreatyOnFile } from '@inqbeta/q-core/federation-money';
	import { readDirectory, type Entry } from '$lib/registry';
	import type { FederationRecord } from '$lib/federations';

	let { identity, acting, record, federation, name }: { identity: Identity; acting: Acting; record: FederationRecord | null; federation: string; name: string } = $props();

	const MONEY = '/fed/money';
	const mayMoney = $derived(officeMay(acting.office, MONEY));
	const called = $derived(officeKind(acting.office)?.called ?? acting.office);
	const TONE: Record<TreatyState, Tone> = { proposed: 'waiting', 'in-force': 'good', suspended: 'bad', ending: 'needs-you', ended: 'plain' };
	const WORD: Record<TreatyState, string> = { proposed: 'Proposed', 'in-force': 'In force', suspended: 'Suspended', ending: 'Ending', ended: 'Ended' };
	const EVERY: Record<number, string> = { 1: 'every day', 3: 'every 3 days', 7: 'every week', 30: 'every 30 days' };

	let treaties = $state<TreatyOnFile[]>([]);
	let loaded = $state(false);
	let none = $state('');
	async function refresh() {
		const r = await fetch('/api/treaties').catch(() => null);
		const j = r ? ((await r.json().catch(() => null)) as { ok?: boolean; treaties?: TreatyOnFile[]; says?: string } | null) : null;
		treaties = j?.treaties ?? [];
		none = j?.ok ? '' : (j?.says ?? 'The bank didn’t answer.');
		loaded = true;
	}
	$effect(() => void refresh());

	let busy = $state('');
	let said = $state<{ good: boolean; text: string; link?: string } | null>(null);
	async function post(what: string, body: Record<string, unknown>) {
		busy = what;
		said = null;
		try {
			const r = await fetch('/api/treaties', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			const out = (await r.json().catch(() => ({}))) as { ok?: boolean; says?: string; link?: string };
			said = r.ok && out.ok ? { good: true, text: out.says ?? 'Done.', link: out.link } : { good: false, text: out.says ?? `The bank said ${r.status}.` };
			if (r.ok && out.ok) await refresh();
			return r.ok && out.ok;
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
			return false;
		} finally {
			busy = '';
		}
	}
	/* The federation's key: only someone it's sealed to (the caretaker) can open it. */
	async function fedKey() {
		if (!record) throw new Error('Only someone holding the federation’s key signs for it: the caretaker.');
		return signerFor(await openFederationKey(record.sealedKey, identity));
	}

	/* ---- Proposing ---- */
	let directory = $state<Entry[]>([]);
	$effect(() => {
		void readDirectory().then((d) => (directory = d.filter((e) => e.card.federation !== federation)));
	});
	let partnerDid = $state('');
	let partner = $state<{ side: Side; site: string } | null>(null);
	let partnerSays = $state('');
	$effect(() => {
		const did = partnerDid;
		partner = null;
		partnerSays = '';
		if (!did) return;
		void fetch(`/api/treaties?partner=${encodeURIComponent(did)}`)
			.then((r) => r.json())
			.then((j: { ok?: boolean; side?: Side; site?: string; says?: string }) => {
				if (did !== partnerDid) return;
				if (j.ok && j.side && j.site) partner = { side: j.side, site: j.site };
				else partnerSays = j.says ?? 'Its bank didn’t answer.';
			})
			.catch(() => (partnerSays = 'Its bank didn’t answer.'));
	});
	let ours = $state<Side | null>(null);
	$effect(() => {
		void fetch('/api/mint')
			.then((r) => r.json())
			.then((m: { mint?: string; currency?: string; mode?: 'test' | 'live'; federation?: { card?: { hash: string } | null } }) => {
				ours = m.mint && m.currency && m.mode && m.federation?.card ? { federation, name: '', mint: m.mint, currency: m.currency, mode: m.mode, bankingCard: m.federation.card.hash } : null;
			})
			.catch(() => (ours = null));
	});
	let ethics = $state('');
	let offered = $state('');
	let sought = $state('');
	let cap = $state<number | null>(500);
	let period = $state<(typeof PERIODS)[number]>(30);
	let excludes = $state('');
	let until = $state('');
	let source = $state<RateSource>('boe');
	const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
	const sameCurrency = $derived(!!partner && !!ours && partner.side.currency === ours.currency);
	const proposeSays = $derived(!ours ? 'Set the federation’s banking card first: a treaty names it.' : partner && ours && partner.side.mode !== ours.mode ? 'Test and live never mix: a test bank treats only with test banks.' : !lines(ethics).length && !lines(offered).length && !lines(sought).length ? 'Say why: what you share, or what each brings and looks for.' : '');

	async function propose() {
		if (!partner || !ours || !cap) return;
		busy = 'propose';
		try {
			const t = await proposeTreaty(await fedKey(), signerFor(identity), acting.office, {
				a: { ...ours, name },
				b: partner.side,
				purpose: { ethics: lines(ethics), offered: lines(offered), sought: lines(sought) },
				rate: sameCurrency ? { kind: 'par' } : { kind: 'source', source },
				cap: { credits: cap },
				period,
				excludes: lines(excludes),
				until: until ? new Date(`${until}T23:59:59Z`).toISOString() : null
			});
			if (await post('propose', { propose: t, acting })) {
				ethics = offered = sought = excludes = until = '';
				partnerDid = '';
			}
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
			busy = '';
		}
	}

	/* ---- A proposal sent to us ---- */
	const askedHash = $derived(page.url.searchParams.get('treaty') ?? '');
	const askedFrom = $derived(page.url.searchParams.get('from') ?? '');
	let incoming = $state<TreatyOnFile | null>(null);
	let incomingSays = $state('');
	$effect(() => {
		const h = askedHash;
		const f = askedFrom;
		incoming = null;
		incomingSays = '';
		if (!h || !f) return;
		void fetch(`/api/treaties?from=${encodeURIComponent(f)}&hash=${encodeURIComponent(h)}`)
			.then((r) => r.json())
			.then((j: { ok?: boolean; treaty?: TreatyOnFile; says?: string }) => {
				if (j.ok && j.treaty && j.treaty.treaty.b.federation === federation) incoming = j.treaty;
				else incomingSays = j.says ?? 'That proposal isn’t for this federation.';
			})
			.catch(() => (incomingSays = 'The proposing host didn’t answer.'));
	});
	const alreadyHere = $derived(!!incoming && treaties.some((t) => t.hash === incoming!.hash && t.inForceSince));
	async function agree(t: Treaty) {
		busy = 'agree';
		try {
			const signed = await agreeTreaty(t, await fedKey(), signerFor(identity), acting.office);
			await post('agree', { agree: signed, acting, from: askedFrom });
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
			busy = '';
		}
	}

	/* ---- Notice ---- */
	let noticeWhy = $state<Record<string, string>>({});
	async function notice(t: TreatyOnFile) {
		busy = `notice-${t.hash}`;
		try {
			const n = await giveNotice(t.treaty, t.side, await fedKey(), noticeWhy[t.hash] ?? '');
			await post(`notice-${t.hash}`, { notice: n });
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
			busy = '';
		}
	}
	async function linkAgain(t: TreatyOnFile) {
		const j = (await fetch(`/api/treaties?partner=${encodeURIComponent(t.partner.federation)}`).then((r) => r.json()).catch(() => null)) as { site?: string } | null;
		if (!j?.site) return void (said = { good: false, text: `${t.partner.name}’s host didn’t answer.` });
		said = { good: true, text: `Send ${t.partner.name} this link.`, link: `${j.site}/federations/one?id=${encodeURIComponent(t.partner.federation)}&tab=bank&treaty=${encodeURIComponent(t.hash)}&from=${encodeURIComponent(page.url.origin)}` };
	}
	let copied = $state(false);
	async function copy(s: string) {
		await navigator.clipboard.writeText(s).catch(() => null);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	const onDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	const rateWords = (t: Treaty) => (t.rate.kind === 'par' ? 'Par: a credit for a credit' : `At ${RATE_SOURCES.find((s) => t.rate.kind === 'source' && s.id === t.rate.source)?.called ?? 'a published rate'} on the day`);
</script>

{#snippet terms(t: Treaty)}
	<dl class="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr] text-sm">
		{#if t.purpose.ethics.length}<dt class="font-bold">Shared</dt><dd>{t.purpose.ethics.join('; ')}</dd>{/if}
		{#if t.purpose.offered.length}<dt class="font-bold">Brings</dt><dd>{t.purpose.offered.join('; ')}</dd>{/if}
		{#if t.purpose.sought.length}<dt class="font-bold">Looks for</dt><dd>{t.purpose.sought.join('; ')}</dd>{/if}
		<dt class="font-bold">Rate</dt><dd>{rateWords(t)}</dd>
		<dt class="font-bold">Most held</dt><dd>{t.cap.credits} of each other’s credits between settlements</dd>
		<dt class="font-bold">Settles</dt><dd>{EVERY[t.period]}</dd>
		{#if t.excludes.length}<dt class="font-bold">Not for</dt><dd>{t.excludes.join('; ')}</dd>{/if}
		<dt class="font-bold">Until</dt><dd>{t.until ? onDay(t.until) : `Open-ended: either side ends it on ${NOTICE_DAYS} days’ notice`}</dd>
		<dt class="font-bold">Test or live</dt><dd>{t.a.mode === 'test' ? 'Test: no money moves' : 'Live'}</dd>
	</dl>
{/snippet}

<section class="card preset-outlined-primary-500 bg-surface-50-950 p-5 flex flex-col gap-5 mb-8" aria-labelledby="fed-treaties-title">
	<div class="flex flex-wrap items-center gap-3">
		<h3 id="fed-treaties-title" class="h4 flex-1">Treaties</h3>
		<Status tone="plain">As {called}</Status>
	</div>
	<p class="text-sm">A treaty lets two federations take each other’s credits, up to a limit, and settle what’s owed on a set day. Each side signs twice: with the federation’s key, and by a money office holder.</p>

	{#if incoming}
		<div class="card preset-tonal-warning p-4 flex flex-col gap-3" aria-live="polite">
			<p class="h5">{incoming.treaty.a.name} proposes a treaty</p>
			{@render terms(incoming.treaty)}
			{#if alreadyHere}
				<p class="text-sm">You’ve agreed it. It’s in force below.</p>
			{:else if !mayMoney}
				<p class="text-sm">A money office holder signs this: the treasurer or the caretaker.</p>
			{:else}
				<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!busy} onclick={() => void agree(incoming!.treaty)}>{busy === 'agree' ? 'Signing… touch your passkey' : 'Agree, and sign for the federation'}</button>
			{/if}
		</div>
	{:else if incomingSays}
		<p class="card preset-tonal-error p-3 text-sm">{incomingSays}</p>
	{/if}

	{#if !loaded}
		<p class="opacity-60">Reading the books…</p>
	{:else if none}
		<Empty icon="wallet" title="No bank here yet" description={none} />
	{:else}
		{#if !treaties.length}
			<p class="text-sm opacity-70">No treaties yet.</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each treaties as t (t.hash)}
					<li class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
						<div class="flex flex-wrap items-center gap-3">
							<span class="h5 flex-1">With {t.partner.name}</span>
							<Status tone={TONE[t.standing.state]}>{WORD[t.standing.state]}</Status>
						</div>
						<p class="text-sm">{t.standing.says}</p>
						{#each t.standing.warnings as w (w)}<p class="text-sm card preset-tonal-warning p-2">{w}</p>{/each}
						<details>
							<summary class="cursor-pointer min-h-11 flex items-center text-sm font-bold">The terms</summary>
							{@render terms(t.treaty)}
						</details>
						{#if t.standing.state === 'proposed' && t.side === 'a' && mayMoney}
							<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => void linkAgain(t)}>Get the link to send again</button>
						{/if}
						{#if (t.standing.state === 'in-force' || t.standing.state === 'suspended') && record && mayMoney}
							<details class="card preset-outlined-surface-200-800 p-3">
								<summary class="cursor-pointer min-h-11 flex items-center text-sm font-bold">Give notice to end it</summary>
								<div class="flex flex-col gap-3 mt-2">
									<p class="text-sm">It ends {NOTICE_DAYS} days after you sign, with a final settlement that day. What’s held stays valid until then.</p>
									<label class="label"><span class="label-text">Why, for {t.partner.name} to read</span><input class="input" bind:value={noticeWhy[t.hash]} /></label>
									<button type="button" class="btn preset-filled-error-500 min-h-11 self-start" disabled={!!busy || !noticeWhy[t.hash]?.trim()} onclick={() => void notice(t)}>{busy === `notice-${t.hash}` ? 'Signing…' : 'Sign the notice'}</button>
								</div>
							</details>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if mayMoney}
			<Section title="Propose a treaty" description="With a federation registered with Incubator. Its money office holder reads it and signs.">
				{#if !record}
					<p class="text-sm">The caretaker proposes: it’s signed with the federation’s key, which is theirs to open.</p>
				{:else}
					<div class="flex flex-col gap-3">
						<label class="label"><span class="label-text">With</span>
							<select class="select" bind:value={partnerDid}>
								<option value="">Choose a federation…</option>
								{#each directory as e (e.card.federation)}<option value={e.card.federation}>{e.card.name}</option>{/each}
							</select>
						</label>
						{#if partnerSays}<p class="text-sm card preset-tonal-warning p-3">{partnerSays}</p>{/if}
						{#if partner}
							<p class="text-sm">{partner.side.name} · {partner.side.currency} · {partner.side.mode === 'test' ? 'test' : 'live'}</p>
							<label class="label"><span class="label-text">What you share (one per line)</span><textarea class="textarea" rows="2" bind:value={ethics}></textarea></label>
							<div class="grid gap-3 sm:grid-cols-2">
								<label class="label"><span class="label-text">What you bring</span><textarea class="textarea" rows="2" bind:value={offered}></textarea></label>
								<label class="label"><span class="label-text">What you look for</span><textarea class="textarea" rows="2" bind:value={sought}></textarea></label>
							</div>
							<div class="grid gap-3 sm:grid-cols-3">
								<label class="label"><span class="label-text">Most held (credits)</span><input class="input" type="number" min="1" inputmode="numeric" bind:value={cap} /></label>
								<label class="label"><span class="label-text">Settle</span>
									<select class="select" bind:value={period}>{#each PERIODS as p (p)}<option value={p}>{EVERY[p]}</option>{/each}</select>
								</label>
								<label class="label"><span class="label-text">Until (or leave empty)</span><input class="input" type="date" bind:value={until} /></label>
							</div>
							{#if !sameCurrency}
								<label class="label"><span class="label-text">Rate, across two currencies</span>
									<select class="select" bind:value={source}>{#each RATE_SOURCES as s (s.id)}<option value={s.id}>{s.called}</option>{/each}</select>
								</label>
							{:else}
								<p class="text-sm">One currency: a credit for a credit.</p>
							{/if}
							<label class="label"><span class="label-text">Not for (one per line, or leave empty)</span><textarea class="textarea" rows="2" bind:value={excludes}></textarea></label>
							{#if proposeSays}<p class="text-sm card preset-tonal-warning p-3">{proposeSays}</p>{/if}
							<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!busy || !!proposeSays || !cap} onclick={() => void propose()}>{busy === 'propose' ? 'Signing… touch your passkey' : 'Sign and propose'}</button>
						{/if}
					</div>
				{/if}
			</Section>
		{/if}
	{/if}

	{#if said}
		<div class="card p-3 text-sm flex flex-col gap-2 {said.good ? 'preset-tonal-success' : 'preset-tonal-error'}" aria-live="polite">
			<p>{said.text}</p>
			{#if said.link}
				<p class="font-mono text-xs break-all">{said.link}</p>
				<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => void copy(said!.link!)}>{copied ? 'Copied' : 'Copy the link'}</button>
			{/if}
		</div>
	{/if}
</section>
