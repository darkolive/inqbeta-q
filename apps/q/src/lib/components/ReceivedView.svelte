<script lang="ts">
	/*
	 * A receipt the bell collected (ADR-Q-014), shown as a person would read it:
	 * who, what it says, when — and that it holds. The technical detail is there
	 * for investigating, folded away, never the first thing you see.
	 */
	import { Status, Icon } from '@inqbeta/q-ui';
	import CardFace from '$lib/components/CardFace.svelte';

	type Kept = {
		from?: string;
		title?: string;
		kind?: string;
		hash?: string;
		collectedAt?: string;
		receipt?: { says?: string; at?: string; card?: Record<string, string>; from?: string } & Record<string, unknown>;
	};
	let { kept: raw, holds = true, where = '' }: { kept: Record<string, unknown>; holds?: boolean; where?: string } = $props();
	const kept = $derived(raw as Kept);

	const from = $derived(kept.from ?? 'Someone');
	const initials = $derived(from.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
	const when = (iso?: string) =>
		iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
	const KIND: Record<string, string> = { message: 'A message', invitation: 'An invitation', call: 'A call', decision: 'A decision' };
</script>

<article class="flex flex-col gap-6">
	<header class="flex items-center gap-4">
		<span class="size-14 shrink-0 rounded-full preset-tonal-primary flex items-center justify-center text-xl font-bold" aria-hidden="true">{initials}</span>
		<div>
			<p class="text-sm opacity-70">{KIND[kept.kind ?? ''] ?? 'Something'} from</p>
			<p class="h4">{from}</p>
		</div>
	</header>

	{#if kept.receipt?.card}
		<!-- They linked with you: their card, as they shared it. -->
		<CardFace details={kept.receipt.card} did={kept.receipt.from ?? ''} badge="Their card" />
	{/if}
	<section class="card preset-tonal p-5">
		<p class="text-sm opacity-70 mb-1">{kept.title ?? ''}</p>
		<p class="text-xl leading-relaxed">{kept.receipt?.says ?? '—'}</p>
	</section>

	<dl class="grid gap-3 sm:grid-cols-[8rem_1fr]">
		{#if kept.receipt?.at}
			<dt class="opacity-60">Sent</dt>
			<dd>{when(kept.receipt.at)}</dd>
		{/if}
		{#if kept.collectedAt}
			<dt class="opacity-60">Captured</dt>
			<dd>{when(kept.collectedAt)}</dd>
		{/if}
		<dt class="opacity-60">Holds up</dt>
		<dd class="flex flex-wrap items-center gap-2">
			{#if holds}
				<Status tone="good">Yes</Status>
				<span class="text-sm">Exactly what was sent, kept and signed by you.</span>
			{:else}
				<Status tone="bad">No</Status>
				<span class="text-sm">It was changed after it was kept.</span>
			{/if}
		</dd>
	</dl>

	<details class="text-sm">
		<summary class="cursor-pointer opacity-70 min-h-11 flex items-center gap-2"><Icon name="info" size={16} /> For investigating</summary>
		<dl class="mt-3 grid gap-2">
			<dt class="opacity-60">Fingerprint</dt>
			<dd class="role-token text-xs break-all">{kept.hash ?? ''}</dd>
			{#if where}
				<dt class="opacity-60">Kept as</dt>
				<dd class="role-token text-xs break-all">{where}</dd>
			{/if}
			<dt class="opacity-60">The record itself</dt>
			<dd><pre class="max-h-[30vh] overflow-auto rounded-base bg-surface-100-900 p-3 text-xs whitespace-pre-wrap">{JSON.stringify(kept.receipt, null, 2)}</pre></dd>
		</dl>
	</details>
</article>
