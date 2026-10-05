<script lang="ts">
	/*
	 * When the bank last reconciled (5 October 2026, ADR-Q-035): its books
	 * added up and signed by the mint at its treasurer's ask, a receipt anyone
	 * can hold. Darren: "daily reconciliation is green … going towards warning
	 * … red when reconciliation is 30 days older … and who signed it." The
	 * colour blends from green (today) through orange to red (a month or
	 * more), and the words always say how long, who asked, and how much has
	 * moved since.
	 */
	import type { ReconciliationReceipt } from '@inqbeta/q-core/mint';

	let { last, movesSince = 0, nameOf = () => undefined }: { last: { at: string; by: string; hash: string; receipt: ReconciliationReceipt } | null | undefined; movesSince?: number; nameOf?: (did: string) => string | undefined } = $props();

	const DAY = 24 * 60 * 60 * 1000;
	const days = $derived(last ? Math.max(0, (Date.now() - Date.parse(last.at)) / DAY) : Infinity);
	/* Green within a day; red at thirty days or more; orange half way. */
	const colour = $derived.by(() => {
		if (!last || days >= 30) return 'var(--color-error-600-400)';
		if (days <= 1) return 'var(--color-success-600-400)';
		const t = (days - 1) / 29;
		return t < 0.5
			? `color-mix(in oklch, var(--color-warning-600-400) ${Math.round((t / 0.5) * 100)}%, var(--color-success-600-400))`
			: `color-mix(in oklch, var(--color-error-600-400) ${Math.round(((t - 0.5) / 0.5) * 100)}%, var(--color-warning-600-400))`;
	});
	const ago = $derived(!last ? '' : days < 1 ? 'today' : days < 2 ? 'yesterday' : `${Math.floor(days)} days ago`);
	const short = (d: string) => (d.length > 24 ? `${d.slice(0, 14)}…${d.slice(-6)}` : d);
	const who = $derived(last ? (nameOf(last.by) ?? short(last.by)) : '');
</script>

<div class="flex items-start gap-3 text-sm">
	<span class="mt-1 inline-block size-3 shrink-0 rounded-full motion-safe:transition-colors" style:background-color={colour} aria-hidden="true"></span>
	<div class="flex flex-col gap-1 min-w-0">
		{#if last}
			<p><strong>Last reconciled {ago}</strong>, {new Date(last.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.</p>
			<p class="text-surface-700-300">Signed by the bank at the ask of <span title={last.by}>{who}</span>. {movesSince ? `${movesSince} move${movesSince === 1 ? '' : 's'} in its books since.` : 'Nothing has moved in its books since.'}</p>
			<details>
				<summary class="cursor-pointer select-none text-surface-700-300">The signed receipt</summary>
				<dl class="grid gap-1 mt-2">
					<div><dt class="inline opacity-70">Signed by </dt><dd class="inline role-token break-all" title={last.receipt.did}>{short(last.receipt.did)}</dd></div>
					<div><dt class="inline opacity-70">Receipt </dt><dd class="inline role-token break-all">{last.hash.slice(0, 16)}…</dd></div>
					<div><dt class="inline opacity-70">Covers </dt><dd class="inline">{last.receipt.content.covers.count} of the bank’s receipts; {last.receipt.content.books.circulation} in circulation, {last.receipt.content.books.reconciled ? 'reconciled' : 'not reconciled'}, {last.receipt.content.books.backed ? 'fully backed' : 'not backed'}</dd></div>
				</dl>
			</details>
		{:else}
			<p><strong>Never reconciled.</strong> The bank hasn’t signed its books yet. Its treasurer can ask it to.</p>
		{/if}
	</div>
</div>
