<script lang="ts">
	/*
	 * A receipt as a read-only card (3 October 2026; lib/receipt-read.ts).
	 *
	 * Top: who and when — what kind of record, who signed it, when, its proof
	 * ID, whether it holds up. Then what changes, then what it says, field by
	 * field, in words. The JSON itself is folded away at the bottom, there for
	 * anyone who wants to see exactly what was signed.
	 */
	import { Collapsible } from '@skeletonlabs/skeleton-svelte';
	import { Icon, Status } from '@inqbeta/q-ui';
	import { readReceipt, when, type Field, type Names } from '$lib/receipt-read';
	import type { ReceiptEntry } from '$lib/receipts';

	let { receipt, names }: { receipt: ReceiptEntry; names: Names } = $props();

	const read = $derived(readReceipt(receipt.json, names, { what: receipt.what, at: receipt.at, signers: receipt.signers }));

	const TONE = { yes: 'good', partly: 'good', no: 'bad' } as const;
	const WORD = { yes: 'Holds up', partly: 'Signatures hold', no: 'Does not hold' } as const;
	const shortCode = (s: string) => (s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s);

	/* Copy, then say so for a moment (Skeleton's clipboard cookbook). */
	let copied = $state('');
	async function copy(what: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			setTimeout(() => copied === what && (copied = ''), 1800);
		} catch {
			copied = '';
		}
	}

	let showRecord = $state(false);
</script>

{#snippet face(p: { name: string; you: boolean })}
	<span class="inline-flex items-center gap-2">
		<span class="size-7 rounded-full {p.you ? 'preset-filled-secondary-500' : 'preset-filled-primary-500'} flex items-center justify-center text-xs font-bold" aria-hidden="true">{p.name.slice(0, 1)}</span>
		<span class="font-semibold">{p.name}</span>
	</span>
{/snippet}

{#snippet fields(list: Field[], depth: number)}
	<dl class="flex flex-col gap-3">
		{#each list as f, i (`${f.label}-${i}`)}
			<div class={f.group ? '' : 'grid grid-cols-[minmax(7rem,35%)_1fr] gap-3 items-baseline'}>
				<dt class="text-sm text-surface-700-300 {f.group ? 'mb-2 font-semibold' : ''}">{f.label}</dt>
				<dd class="min-w-0 break-words">
					{#if f.person}
						{@render face(f.person)}
					{:else if f.code}
						<span class="inline-flex items-center gap-2">
							<span class="role-token text-xs">{shortCode(f.code)}</span>
							<button type="button" class="btn-icon btn-icon-sm preset-tonal" aria-label="Copy {f.label}" onclick={() => copy(`${f.label}${i}`, f.code!)}>
								<Icon name={copied === `${f.label}${i}` ? 'check' : 'documents'} size={14} />
							</button>
						</span>
					{:else if f.list}
						<span class="flex flex-wrap gap-1">
							{#each f.list as item, k (k)}<span class="chip preset-tonal-surface">{item}</span>{/each}
						</span>
					{:else if f.group}
						<div class="card preset-outlined-surface-200-800 p-3 {depth % 2 ? 'bg-surface-50-950' : 'bg-surface-100-900'}">
							{@render fields(f.group, depth + 1)}
						</div>
					{:else}
						{f.text}
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
{/snippet}

<article class="flex flex-col gap-5">
	<!-- Who and when: the receipt's identity. -->
	<header class="card preset-tonal-primary p-4 flex flex-col gap-3">
		<div class="flex items-start gap-3">
			<span class="btn-icon preset-filled-primary-500 shrink-0 pointer-events-none" aria-hidden="true"><Icon name="receipts" size={20} /></span>
			<div class="flex-1 min-w-0">
				<p class="text-xs uppercase font-bold opacity-70">{read.kind}</p>
				<h3 class="h4 break-words">{receipt.title}</h3>
			</div>
			<Status tone={TONE[receipt.holds]}>{WORD[receipt.holds]}</Status>
		</div>
		<dl class="grid gap-2 text-sm sm:grid-cols-2">
			{#if read.signer}
				<div><dt class="opacity-70">Signed by</dt><dd>{@render face(read.signer)}</dd></div>
			{/if}
			{#if read.signedAt}
				<div><dt class="opacity-70">When</dt><dd class="font-semibold">{when(read.signedAt)}</dd></div>
			{/if}
			{#if read.proof}
				<div class="sm:col-span-2">
					<dt class="opacity-70">Proof ID</dt>
					<dd class="flex items-center gap-2">
						<span class="role-token text-xs">{shortCode(read.proof)}</span>
						<button type="button" class="btn btn-sm preset-tonal min-h-9" onclick={() => copy('proof', read.proof!)}>
							<Icon name={copied === 'proof' ? 'check' : 'documents'} size={14} />{copied === 'proof' ? 'Copied' : 'Copy'}
						</button>
					</dd>
				</div>
			{/if}
		</dl>
		{#if receipt.says}<p class="text-sm">{receipt.says}</p>{/if}
	</header>

	<!-- What changes. -->
	{#if read.changes.length}
		<section aria-labelledby="changes-{receipt.id}" class="flex flex-col gap-2">
			<h4 id="changes-{receipt.id}" class="h6">What it changes</h4>
			<ul class="flex flex-wrap gap-2">
				{#each read.changes as c, i (i)}<li class="chip preset-filled-surface-200-800 text-sm">{c}</li>{/each}
			</ul>
		</section>
	{/if}

	<!-- What it says. -->
	{#if read.says.length}
		<section aria-labelledby="says-{receipt.id}" class="flex flex-col gap-3">
			<h4 id="says-{receipt.id}" class="h6">What it says</h4>
			<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4">
				{@render fields(read.says, 0)}
			</div>
		</section>
	{/if}

	<!-- The record itself, for anyone who wants it. Not on the page until opened. -->
	{#if receipt.json}
		<Collapsible open={showRecord} onOpenChange={(d) => (showRecord = d.open)} class="card preset-outlined-surface-200-800">
			<Collapsible.Trigger class="w-full flex items-center gap-2 p-3 text-left text-sm hover:preset-tonal-surface min-h-11">
				<Icon name="file" size={16} />
				<span class="flex-1">The signed record, exactly as kept</span>
				<Icon name="chevronDown" size={16} class={showRecord ? 'rotate-180' : ''} />
			</Collapsible.Trigger>
			<Collapsible.Content>
				{#if showRecord}
					<pre class="max-h-[40vh] overflow-auto bg-surface-100-900 p-3 text-xs whitespace-pre-wrap">{JSON.stringify(receipt.json, null, 2)}</pre>
				{/if}
			</Collapsible.Content>
		</Collapsible>
	{/if}

	<p class="text-xs text-surface-700-300">Kept as <span class="role-token">{receipt.where}</span></p>
</article>
