<script lang="ts">
	/*
	 * One agreement (ADR-Q-025): the card, what you can do now, and every step
	 * as a sentence from your side — drawn by the exchange set (ADR-Q-029).
	 * What you can do is decided in one place, q-core's agreementNow; this page
	 * draws it, and adds the panels only an agreement has (settling up, its
	 * links). What you can do depends only on where it stands:
	 *   agreeing, your answer   Agree · Counteroffer · Decline
	 *   agreeing, your offer    Withdraw
	 *   agreed                  Say it's done · Settle (all, or part) · Change the agreement
	 *   a settlement waiting    Confirm it (the other person signed) — or wait for them
	 *   in your shop            the shop's link · what's sold · Take it out of my shop
	 *   sold, not yet paid      Cancel: sold out (the seller, before any settling)
	 * Each is checked by the agreement rules before it's signed.
	 */
	import { Page, Section, Icon, Status } from '@inqbeta/q-ui';
	import { page } from '$app/state';
	import SignIn from '$lib/components/SignIn.svelte';
	import AgreementCard from '$lib/components/AgreementCard.svelte';
	import AgreementTimeline from '$lib/components/AgreementTimeline.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { remainingOf, valueText, type Entry } from '@inqbeta/q-core/agreements';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import type { Names } from '$lib/receipt-read';
	import { agreementsFrom, takeStep, type StepInput } from '$lib/agreements';
	import { agreementNow, isOpenOffer, stockLeft, type NowAction } from '@inqbeta/q-core/agreements';
	import ExchangeNow from '$lib/components/exchange/ExchangeNow.svelte';
	import { shopLink, tellShop } from '$lib/shop';
	import { makeOfferLink } from '$lib/offerlink';
	import ShareLink from '$lib/components/ShareLink.svelte';
	import { readMint, type MintView } from '$lib/money';
	import { hireDue } from '@inqbeta/q-core/agreements';
	import { usageOf } from '@inqbeta/q-core/custody';
	import { custodyAt } from '$lib/relay';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const id = $derived(page.params.id ?? '');
	let mint = $state<MintView | null>(null);
	$effect(() => void readMint().then((m) => (mint = m.view)));
	const me = $derived(identity?.did ?? '');
	const people = $derived(peopleFrom(ledger, me));
	const names = $derived<Names>({ me, nameOf: (d) => people.find((p) => p.did === d)?.name });
	const all = $derived(agreementsFrom(ledger));
	const view = $derived(all.find((a) => a.id === id));
	const s = $derived(view?.standing);
	/* A shop offer: every sale of it you hold, and how many are left. */
	const sales = $derived(s?.limit && !s.takenFrom ? all.filter((a) => a.standing.takenFrom?.hash === s.offerHash) : []);
	const leftInShop = $derived(s ? stockLeft(s, sales.map((a) => a.standing)) : 0);
	const sellerOf = (d: string) => (d === me ? 'your' : `${people.find((p) => p.did === d)?.name ?? 'their'}’s`);
	const themName = $derived.by(() => {
		const t = s?.terms;
		const d = t ? (t.a === me ? t.b : t.a) : '';
		return people.find((p) => p.did === d)?.name ?? 'they';
	});

	/* What's left to settle, ticked by default; numbers can be lowered to settle part. */
	const left = $derived(s ? remainingOf(s) : []);
	let picked = $state<Record<number, boolean>>({});
	let amounts = $state<Record<number, number>>({});
	$effect(() => {
		left.forEach((e, i) => {
			picked[i] ??= true;
			amounts[i] ??= 'credits' in e.value ? e.value.credits : 'pence' in e.value ? e.value.pence / 100 : 1;
		});
	});
	const settling = $derived<Entry[]>(
		left.flatMap((e, i) => {
			if (!picked[i]) return [];
			if ('credits' in e.value) return [{ ...e, value: { ...e.value, credits: Math.trunc(Number(amounts[i]) || 0) } }];
			if ('pence' in e.value) return [{ ...e, value: { pence: Math.round((Number(amounts[i]) || 0) * 100) } }];
			return [e];
		})
	);

	let busy = $state('');
	const said = page.url.searchParams.get('said');
	let result = $state<{ good: boolean; text: string } | null>(said ? { good: false, text: said } : null);
	const now = $derived(s ? agreementNow(s, me, id, (d) => people.find((p) => p.did === d)?.name ?? 'they') : null);
	async function act(key: string, label: string, input: StepInput, tell = false) {
		if (!identity) return;
		busy = key;
		result = null;
		const out = await takeStep(identity, ledger, id, input, people, mint);
		busy = '';
		let text = out.ok ? (out.says ?? `Done: ${label.toLowerCase()}. ${out.sent ? `Sent to ${themName}.` : ''}`) : out.says;
		/* The shop holds the stock: tell it when a listing comes out or a sale is cancelled. */
		if (out.ok && tell) {
			const told = await tellShop(me, out.signed);
			if (!told.ok) text = `${text} The shop didn’t hear just now: ${told.says}`;
		}
		result = { good: out.ok, text };
	}
	const onAct = (a: NowAction, note: string) => a.step && void act(a.id, a.label, { ...a.step, ...(note ? { note } : {}) }, a.tellShop);

	/* Your open offer: a link to send it with (ADR-Q-026). Made when asked, or straight away after writing it. */
	let link = $state('');
	let linkSays = $state('');
	let making = $state(false);
	async function makeLink() {
		if (!view) return;
		making = true;
		linkSays = '';
		const out = await makeOfferLink(view.steps[0], ledger);
		making = false;
		if (out.ok) link = out.link;
		else linkSays = out.says;
	}
	let autoLinked = false;
	$effect(() => {
		if (!autoLinked && page.url.searchParams.get('share') && view && s && isOpenOffer(s) && s.offeredBy === me) {
			autoLinked = true;
			void makeLink();
		}
	});

	/* A hire (ADR-Q-028 §5): what it held for you since you hired it, from your custody receipts, and what that comes to. */
	let tick = $state(0);
	$effect(() => {
		const t = setInterval(() => tick++, 60_000);
		return () => clearInterval(t);
	});
	const hiredAt = $derived(Date.parse(view?.steps.find((r) => r.content.step === 'taken')?.content.at ?? '') || 0);
	const use = $derived.by(() => {
		void tick;
		const sv = s?.terms?.service;
		if (!sv || !s || s.terms?.b !== me) return null;
		/* Hired the same pass-through again later? What it held from then on is that hire's. */
		const takenAt = (v: (typeof all)[number]) => Date.parse(v.steps.find((r) => r.content.step === 'taken')?.content.at ?? '') || 0;
		const nextAt = Math.min(Infinity, ...all.filter((a) => a.id !== id && a.standing.terms?.service?.where === sv.where && a.standing.terms.b === me && takenAt(a) > hiredAt).map(takenAt));
		const receipts = custodyAt(sv.where).filter((r) => r.content.kind !== 'held' || (Date.parse(r.content.at) >= hiredAt && Date.parse(r.content.at) < nextAt));
		return usageOf(receipts, sv.where);
	});
	const due = $derived(s ? hireDue(s, use?.byteHours ?? 0) : null);
	const gbHours = (b: number) => (b > 0 && b / 1024 ** 3 < 0.0001 ? 'under 0.0001' : (b / 1024 ** 3).toFixed(b / 1024 ** 3 < 0.01 ? 4 : 2));

	const who = (d: string) => (d === me ? 'you' : themName);
	const entryText = (e: Entry) => `${valueText(e.value)} from ${who(e.from)} to ${who(e.to)}`;
</script>

<svelte:head><title>Agreement — Q</title></svelte:head>

<Page title="Agreement" lead="Agree first, then settle up. Every step is signed by whoever took it, and kept by you both.">
	{#snippet actions()}
		<a href="/agreements" class="btn preset-tonal min-h-11"><Icon name="arrowLeft" size={16} /> All agreements</a>
	{/snippet}

	{#if !identity}
		<div class="panel"><SignIn /></div>
	{:else if !view || !s}
		<p class="card preset-tonal-surface p-4">This agreement isn’t in your vault, or hasn’t arrived yet.</p>
	{:else}
		<div class="grid grid-cols-1 gap-8 lg:grid-cols-5 items-start">
			<div class="lg:col-span-3 flex flex-col gap-6 min-w-0">
				<AgreementCard standing={s} {me} {people} />

				<!-- What you can do now: decided by agreementNow, drawn by the exchange set. -->
				{#if now}
					<ExchangeNow {now} {busy} {result} {onAct}>
						{#snippet panel()}
							{#if now.panel === 'shop'}
								<p><strong>{leftInShop} left</strong>{sales.length ? `, ${sales.length} sold that you know of` : ''}.</p>
								<ShareLink link={shopLink(me)} label="Your shop’s link" subject="My shop on Q" message="Here’s my shop on Q. Have a look, and buy anything you like." note="Anyone with the link can see your shop." />
								{#if sales.length}
									<ul class="flex flex-col gap-2">
										{#each sales as a (a.id)}
											<li><a class="anchor" href="/agreements/{encodeURIComponent(a.id)}">Sold to {people.find((p) => p.did === a.standing.terms?.b)?.name ?? 'someone'}</a> · {a.standing.ended === 'sold-out' ? 'cancelled' : a.standing.phase === 'complete' ? 'paid' : 'not paid yet'}</li>
										{/each}
									</ul>
								{/if}
							{:else if now.panel === 'link'}
								{#if link}
									<ShareLink {link} label="Your offer’s link" subject="An offer for you" message="I’ve made you an offer on Q. Open it to see it, and accept, counteroffer or decline." note="It opens for one person: whoever opens it first." />
								{:else}
									<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={making} onclick={() => void makeLink()}><Icon name="share" size={18} />{making ? 'Making the link…' : 'Make a link to send'}</button>
								{/if}
								{#if linkSays}<p class="text-sm card preset-tonal-warning p-3">{linkSays}</p>{/if}
							{:else if now.panel === 'hire' && s.terms?.service && due}
								{@const sv = s.terms.service}
								<div class="card preset-tonal-surface p-4 flex flex-col gap-3">
									<p class="font-bold">{s.terms.b === me ? 'Your use so far' : 'Paid so far'}</p>
									<dl class="grid gap-3 sm:grid-cols-3">
										{#if use}
											<div><dt class="text-sm opacity-70">Held for you</dt><dd class="h5 tabular-nums">{use.byteHours > 0 ? `${gbHours(use.byteHours)} GB-hours` : 'Nothing yet'}</dd><dd class="text-xs opacity-70">{use.items ? `${use.items} file${use.items === 1 ? '' : 's'}${use.open ? `, ${use.open} still held` : ''}` : 'Only used when your cloud can’t take something'}</dd></div>
											<div><dt class="text-sm opacity-70">At {sv.perGBHour} a GB-hour</dt><dd class="h5 tabular-nums">{due.owed} credit{due.owed === 1 ? '' : 's'}</dd><dd class="text-xs opacity-70">rounded up; at most {due.most}</dd></div>
										{/if}
										<div><dt class="text-sm opacity-70">Settled</dt><dd class="h5 tabular-nums">{due.paid} of at most {due.most}</dd></div>
									</dl>
									{#if s.terms.b === me}
										{#if due.due}
											<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!busy} onclick={() => void act('settle-use', 'Settled', { step: 'settled', parent: s.lastHash ?? null, entries: due.entries, note: `${gbHours(use?.byteHours ?? 0)} GB-hours at ${sv.perGBHour} a GB-hour` })}><Icon name="balance" size={18} />{busy === 'settle-use' ? 'Checking…' : `Settle ${due.due} credit${due.due === 1 ? '' : 's'} for the use so far`}</button>
											<p class="text-sm text-surface-700-300">{themName} confirms, and only then does it count.</p>
										{:else}
											<p class="text-sm">{s.pending ? 'Waiting for the last settlement to be confirmed.' : 'Nothing more to settle yet.'}</p>
										{/if}
									{:else}
										<p class="text-sm text-surface-700-300">{themName} settles for what your pass-through held, worked out from the receipts it signed. The note on each settlement says the GB-hours.</p>
									{/if}
								</div>
							{:else if now.panel === 'settle' && left.length}
								<fieldset class="card preset-tonal-surface p-4 flex flex-col gap-3">
									<legend class="font-bold px-1">Settle up</legend>
									{#each left as e, i (i)}
										<div class="flex flex-wrap items-center gap-3">
											<label class="flex items-center gap-3 min-h-11 flex-1 min-w-48">
												<input type="checkbox" class="checkbox" bind:checked={picked[i]} />
												<span>{entryText(e)}</span>
											</label>
											{#if 'credits' in e.value || 'pence' in e.value}
												<label class="label flex items-center gap-2">
													<span class="label-text">{'credits' in e.value ? 'Credits' : 'Pounds'}</span>
													<input class="input max-w-28" type="number" min={'credits' in e.value ? 1 : 0.01} step={'credits' in e.value ? 1 : 0.01} bind:value={amounts[i]} />
												</label>
											{/if}
										</div>
									{/each}
									<p class="text-sm text-surface-700-300">Lower a number to settle part now (a job in stages). {themName} confirms, and only then does it count.</p>
									<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!busy || !settling.length} onclick={() => void act('settle', 'Settled', { step: 'settled', parent: s.lastHash ?? null, entries: settling })}><Icon name="balance" size={18} />{busy === 'settle' ? 'Checking…' : 'Settle'}</button>
								</fieldset>
							{/if}
						{/snippet}
					</ExchangeNow>
				{/if}
			</div>

			<div class="lg:col-span-2 min-w-0">
				<Section title="What happened" description="Every step, signed by whoever took it. The magnifier opens its receipt.">
					<AgreementTimeline steps={view.steps} terms={s.terms} {me} {names} {ledger} head={s.lastHash} />
				</Section>
			</div>
		</div>
	{/if}
</Page>
