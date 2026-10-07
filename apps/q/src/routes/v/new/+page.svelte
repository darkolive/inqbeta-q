<script lang="ts">
	/*
	 * Sell a voucher (ADR-Q-044 steps 3–4): say what it is, how many, what it
	 * costs and whether it can be passed on. It's signed, kept at the storage
	 * with its own page and QR code, and put in your shop. Each sale holds the
	 * buyer's credits until the voucher is redeemed.
	 *
	 * Pictures (up to four) are made smaller, named by their hash in the
	 * signed voucher, and kept at the node beside it: what you see is what you get.
	 */
	import { goto } from '$app/navigation';
	import { Page, Section } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { KINDS, MOVES, voucherProblem, type Medium, type Moves, type VoucherKind } from '@inqbeta/q-core/vouchers';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { readMint, type MintView } from '$lib/money';
	import { preparePicture, sellVoucher, type PreparedPicture, type VoucherDraft } from '$lib/vouchers';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	let mint = $state<MintView | null>(null);
	$effect(() => void readMint().then((m) => (mint = m.view)));

	const MEDIA: { id: Exclude<Medium, 'capacity'>; called: string }[] = [
		{ id: 'physical', called: 'A physical thing' },
		{ id: 'digital', called: 'Something digital' },
		{ id: 'service', called: 'A service: a class, a room, a job' }
	];
	let title = $state('');
	let words = $state('');
	let medium = $state<Exclude<Medium, 'capacity'>>('physical');
	let kind = $state<VoucherKind>('edition');
	let of = $state<number | null>(10);
	let limit = $state<number | null>(10);
	let licence = $state('');
	let credits = $state<number | null>(null);
	let moves = $state<Moves>('sellable');
	let resaleUpTo = $state<number | null>(null);
	let ends = $state('');

	/* Pictures: up to four, each with words for someone who can't see it. */
	const MOST_PICTURES = 4;
	let pictures = $state<(PreparedPicture & { alt: string })[]>([]);
	let pictureSays = $state('');
	let preparing = $state(false);
	async function addPictures(files: FileList | null) {
		pictureSays = '';
		preparing = true;
		for (const f of [...(files ?? [])].slice(0, MOST_PICTURES - pictures.length)) {
			try {
				const p = await preparePicture(f);
				if (!pictures.some((x) => x.hash === p.hash)) pictures = [...pictures, { ...p, alt: '' }];
			} catch (e) {
				pictureSays = e instanceof Error ? e.message : String(e);
			}
		}
		preparing = false;
	}
	function removePicture(hash: string) {
		const gone = pictures.find((p) => p.hash === hash);
		if (gone) URL.revokeObjectURL(gone.preview);
		pictures = pictures.filter((p) => p.hash !== hash);
	}

	/* What each medium can be: a digital thing can't be owned outright. */
	const kindsFor = $derived((Object.keys(KINDS) as VoucherKind[]).filter((k) => (medium === 'digital' ? k === 'copyable' || k === 'consumable' : medium === 'service' ? k === 'consumable' || k === 'edition' : true)));
	$effect(() => {
		if (!kindsFor.includes(kind)) kind = kindsFor[0];
	});
	const open = $derived(kind === 'copyable' || kind === 'consumable');

	const draft = $derived<VoucherDraft | null>(
		mint && credits
			? {
					title: title.trim(),
					words: words.trim(),
					pictures: pictures.map((p) => ({ hash: p.hash, type: p.type, alt: p.alt.trim() })),
					medium,
					kind,
					of: kind === 'original' ? 1 : open ? null : of,
					price: { paid: true, credits, mint: mint.mint, currency: mint.currency },
					moves,
					...(moves === 'sellable' && resaleUpTo ? { resaleUpTo } : {}),
					realm: { kinds: 'itself', accepted: [] },
					...(kind === 'copyable' ? { licence: licence.trim() } : {}),
					...(ends ? { ends: { at: new Date(`${ends}T23:59:59Z`).toISOString(), then: 'refund' as const } } : {})
				}
			: null
	);
	const says = $derived(!mint ? 'Q can’t find your bank just now.' : !credits ? 'Say what it costs.' : pictures.some((p) => !p.alt.trim()) ? 'Say what each picture shows, for someone who can’t see it.' : draft ? voucherProblem(draft) : null);

	let busy = $state(false);
	let problem = $state('');
	async function sell() {
		if (!identity || !mint || !draft) return;
		busy = true;
		problem = '';
		const out = await sellVoucher(identity, ledger, peopleFrom(ledger, identity.did), mint, draft, open ? (limit ?? undefined) : undefined, pictures);
		busy = false;
		if (out.ok) void goto(`/v/${encodeURIComponent(out.hash)}${out.says ? `?said=${encodeURIComponent(out.says)}` : ''}`);
		else problem = out.says;
	}
</script>

<svelte:head><title>Sell a voucher — Q</title></svelte:head>

<Page title="Sell a voucher" lead="Say what you’re selling. It gets its own page and code, and goes in your shop. Buyers’ credits are held until it’s redeemed.">
	{#if !identity}
		<div class="panel"><SignIn stay /></div>
	{:else}
		<Section title="What it is">
			<div class="flex flex-col gap-4 max-w-xl">
				<label class="label"><span class="label-text">What it’s called</span><input class="input" bind:value={title} /></label>
				<label class="label"><span class="label-text">Say more: what it’s made of, how big, when</span><textarea class="textarea" rows="3" bind:value={words}></textarea></label>
				<label class="label"><span class="label-text">It’s</span>
					<select class="select" bind:value={medium}>{#each MEDIA as m (m.id)}<option value={m.id}>{m.called}</option>{/each}</select>
				</label>
				<fieldset class="flex flex-col gap-2">
					<legend class="label-text mb-1">What the buyer gets</legend>
					{#each kindsFor as k (k)}
						<label class="flex items-start gap-3 min-h-11 card preset-outlined-surface-200-800 p-3">
							<input class="radio mt-1" type="radio" name="kind" value={k} bind:group={kind} />
							<span><span class="font-bold">{KINDS[k].called}.</span> {KINDS[k].gets}</span>
						</label>
					{/each}
				</fieldset>
				{#if kind === 'edition'}
					<label class="label"><span class="label-text">How many in the edition</span><input class="input" type="number" min="2" inputmode="numeric" bind:value={of} /></label>
				{:else if open}
					<label class="label"><span class="label-text">How many you’ll sell</span><input class="input" type="number" min="1" inputmode="numeric" bind:value={limit} /></label>
				{/if}
				{#if kind === 'copyable'}
					<label class="label"><span class="label-text">The licence: what the holder may do with it</span><textarea class="textarea" rows="2" bind:value={licence}></textarea></label>
				{/if}
			</div>
		</Section>

		<Section title="Pictures" description="What you see is what you get: the voucher signs each picture, so it can’t be changed after a sale. Up to four.">
			<div class="flex flex-col gap-4 max-w-xl">
				{#each pictures as p (p.hash)}
					<div class="card preset-outlined-surface-200-800 p-3 flex flex-col sm:flex-row gap-3">
						<img src={p.preview} alt="" class="w-full sm:w-40 h-auto rounded-container" />
						<div class="flex-1 flex flex-col gap-2">
							<label class="label"><span class="label-text">What it shows, for someone who can’t see it</span><input class="input" bind:value={p.alt} /></label>
							<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => removePicture(p.hash)}>Take it out</button>
						</div>
					</div>
				{/each}
				{#if pictures.length < MOST_PICTURES}
					<label class="label"><span class="label-text">{pictures.length ? 'Add another picture' : 'Add a picture'}</span>
						<input class="input" type="file" accept="image/*" multiple disabled={preparing} onchange={(e) => void addPictures((e.currentTarget as HTMLInputElement).files)} />
					</label>
				{/if}
				{#if preparing}<p class="text-sm" aria-live="polite">Getting the picture ready…</p>{/if}
				{#if pictureSays}<p class="text-sm card preset-tonal-warning p-3">{pictureSays}</p>{/if}
			</div>
		</Section>

		<Section title="The terms">
			<div class="flex flex-col gap-4 max-w-xl">
				<label class="label"><span class="label-text">Price, in credits{mint ? ` (${mint.mode === 'test' ? 'test, ' : ''}${mint.currency})` : ''}</span><input class="input" type="number" min="1" inputmode="numeric" bind:value={credits} /></label>
				<fieldset class="flex flex-col gap-2">
					<legend class="label-text mb-1">Passing it on</legend>
					{#each ['sellable', 'giftable', 'bound'] as const as m (m)}
						<label class="flex items-start gap-3 min-h-11 card preset-outlined-surface-200-800 p-3">
							<input class="radio mt-1" type="radio" name="moves" value={m} bind:group={moves} />
							<span>{MOVES[m]}</span>
						</label>
					{/each}
				</fieldset>
				{#if moves === 'sellable'}
					<label class="label"><span class="label-text">The most it can be sold on for (or leave empty)</span><input class="input" type="number" min="1" inputmode="numeric" bind:value={resaleUpTo} /></label>
				{/if}
				<label class="label"><span class="label-text">Ends on (or leave empty: it doesn’t end). If unused by then, it’s refunded.</span><input class="input" type="date" bind:value={ends} /></label>
			</div>
		</Section>

		{#if says}<p class="card preset-tonal-warning p-3 text-sm max-w-xl">{says}</p>{/if}
		{#if problem}<p class="card preset-tonal-error p-3 text-sm max-w-xl" aria-live="polite">{problem}</p>{/if}
		<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy || !!says} onclick={() => void sell()}>{busy ? 'Signing…' : 'Sign it and put it in my shop'}</button>
	{/if}
</Page>
