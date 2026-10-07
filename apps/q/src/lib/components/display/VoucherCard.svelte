<script lang="ts">
	/*
	 * A voucher, as anyone sees it (ADR-Q-044 step 4): what you get, in words
	 * first, then the terms, and its QR code, which opens its page. Beside the
	 * coin (Coin.svelte): the coin says what pays; the voucher says what you
	 * get. Pictures are named by their hash in the signed voucher, so what's
	 * shown can't change after a sale; the node keeps them beside it. Without
	 * them, their words stand in.
	 */
	import { QrCode } from '@skeletonlabs/skeleton-svelte';
	import { Status } from '@inqbeta/q-ui';
	import { KINDS, MOVES, type VoucherReceipt } from '@inqbeta/q-core/vouchers';

	let { voucher, link, left = null, issuerName = '', pictureBase = '' }: { voucher: VoucherReceipt; link: string; left?: number | null; issuerName?: string; pictureBase?: string } = $props();

	const v = $derived(voucher.content);
	const onDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	const price = $derived(v.price.paid ? `${v.price.credits} credits` : v.price.from === 'credits' ? `Given: worth up to ${v.price.worth} credits` : `Given: ${v.price.worth} ${v.price.unit}`);
	const count = $derived(v.of === null ? 'Open: as many as are sold' : v.of === 1 ? 'One of one' : `An edition of ${v.of}`);
	const realm = $derived(v.realm.kinds === 'itself' ? 'Itself only, from whoever vouched for it' : `Any of: ${v.realm.kinds.join(', ')}, from a provider the issuer accepts`);
	const ends = $derived(v.ends ? `${onDay(v.ends.at)}: ${v.ends.then === 'refund' ? 'refunded if unused' : v.ends.then === 'return' ? 'unspent value returns to the giver' : 'it lapses'}` : 'It doesn’t end');
</script>

<article class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-4" aria-labelledby="voucher-title">
	<header class="flex flex-wrap items-start gap-3">
		<div class="flex-1 min-w-0 flex flex-col gap-1">
			<p class="text-sm opacity-80">Voucher{issuerName ? ` from ${issuerName}` : ''}</p>
			<h2 id="voucher-title" class="h3 break-words">{v.title}</h2>
		</div>
		{#if left !== null}<Status tone={left ? 'good' : 'plain'}>{left ? `${left} left` : 'Sold out'}</Status>{/if}
	</header>

	{#if v.words}<p class="text-lg">{v.words}</p>{/if}

	{#if v.pictures.length}
		<ul class="grid gap-3 sm:grid-cols-2">
			{#each v.pictures as p (p.hash)}
				<li class="flex flex-col gap-1">
					{#if pictureBase}
						<!-- the picture the voucher signed, by its hash: it can't be swapped after the sale -->
						<img src="{pictureBase}{p.hash}" alt={p.alt} loading="lazy" class="rounded-container w-full h-auto bg-surface-100-900" />
					{:else}
						<span class="card preset-tonal p-3 text-sm"><span class="font-bold">Picture:</span> {p.alt}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<p class="text-2xl font-semibold">{price}</p>

	<dl class="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr] text-sm">
		<dt class="font-bold">What you get</dt><dd>{KINDS[v.kind].called}. {KINDS[v.kind].gets}</dd>
		<dt class="font-bold">How many</dt><dd>{count}</dd>
		<dt class="font-bold">Passing it on</dt><dd>{MOVES[v.moves]}{v.resaleUpTo !== undefined ? ` For no more than ${v.resaleUpTo} credits.` : ''}</dd>
		<dt class="font-bold">Exchanged for</dt><dd>{realm}</dd>
		{#if v.licence}<dt class="font-bold">Licence</dt><dd>{v.licence}</dd>{/if}
		<dt class="font-bold">Ends</dt><dd>{ends}</dd>
		{#if v.price.paid}<dt class="font-bold">Your protection</dt><dd>Your credits are held, not paid, until it’s redeemed. This signed voucher is the evidence of what was promised.</dd>{/if}
	</dl>

	<div class="flex flex-wrap items-center gap-4">
		<a href={link} class="block size-32 rounded-container bg-white p-2" aria-label="This voucher’s own page: its code opens it">
			<QrCode value={link} class="size-full grid place-items-center">
				<QrCode.Frame class="size-full" aria-hidden="true">
					<QrCode.Pattern />
				</QrCode.Frame>
			</QrCode>
		</a>
		<p class="text-sm flex-1 min-w-48">Scan the code to open this voucher and check it’s real: signed by its issuer, unchanged since.</p>
	</div>
</article>
