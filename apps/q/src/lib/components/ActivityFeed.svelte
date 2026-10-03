<script lang="ts">
	/*
	 * What's happened lately, as people and sentences (lib/activity.ts).
	 * Grouped Today / This week / Earlier; the newest eight, then a way to all.
	 *
	 * 3 October 2026: beside each line, a magnifier opens the receipt behind it
	 * as a read-only card (ReceiptDrawer) — as in the Workhouse demonstrator,
	 * where every line of activity had its proof a tap away.
	 */
	import { Icon, Empty } from '@inqbeta/q-ui';
	import type { Ledger } from '$lib/ledger';
	import { activityFrom, whenGroup } from '$lib/activity';
	import { peopleFrom } from '$lib/people';
	import type { ReceiptEntry } from '$lib/receipts';
	import type { Names } from '$lib/receipt-read';
	import ReceiptDrawer from './ReceiptDrawer.svelte';

	let { ledger, did }: { ledger: Ledger | null; did: string } = $props();

	const all = $derived(activityFrom(ledger, did));

	/* The receipt behind a line, when there is one. */
	const receiptOf = (id: string) => ledger?.receipts.find((r) => r.id === id) ?? null;
	const people = $derived(peopleFrom(ledger, did));
	const names = $derived<Names>({ me: did, nameOf: (d) => people.find((p) => p.did === d)?.name });
	let opened = $state<ReceiptEntry | null>(null);
	let drawerOpen = $state(false);
	function view(r: ReceiptEntry) {
		opened = r;
		drawerOpen = true;
	}
	const shown = $derived(all.slice(0, 8));
	const groups = $derived.by(() => {
		const g: { label: string; items: typeof shown }[] = [];
		for (const a of shown) {
			const label = whenGroup(a.at);
			const last = g.at(-1);
			if (last?.label === label) last.items.push(a);
			else g.push({ label, items: [a] });
		}
		return g;
	});
	const time = (iso: string) => {
		const d = new Date(iso);
		return whenGroup(iso) === 'Today'
			? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
			: d.toLocaleDateString('en-GB', { weekday: whenGroup(iso) === 'This week' ? 'long' : undefined, day: 'numeric', month: 'long' });
	};
</script>

{#if ledger?.state !== 'ready'}
	<div class="card preset-tonal-surface h-32 animate-pulse" aria-label="Reading your activity"></div>
{:else if !all.length}
	<Empty icon="activity" title="Nothing yet" description="Messages, people you link with, calls and federations you join show here." />
{:else}
	<div class="flex flex-col gap-6">
		{#each groups as g (g.label)}
			<section aria-label={g.label}>
				<h3 class="text-xs font-bold uppercase opacity-60 mb-2">{g.label}</h3>
				<ul class="card preset-outlined-surface-200-800 bg-surface-50-950 divide-y divide-surface-200-800 overflow-hidden">
					{#each g.items as a (a.id)}
						<li class="flex items-center">
							<a href={a.href} class="flex-1 min-w-0 flex items-center gap-4 p-3 sm:p-4 hover:bg-surface-100-900 min-h-11">
								<span class="relative size-11 shrink-0 overflow-hidden rounded-full bg-surface-100-900 flex items-center justify-center">
									{#if a.who?.picture}
										<img src={a.who.picture} alt="" class="size-full object-cover" />
									{:else if a.who?.name}
										<span class="font-bold opacity-70">{a.who.name.slice(0, 1)}</span>
									{:else}
										<Icon name={a.icon} class="opacity-70" />
									{/if}
								</span>
								<span class="flex-1 min-w-0">
									<span class="block">{a.says}</span>
									{#if a.more}<span class="block text-sm opacity-60">{a.more}</span>{/if}
								</span>
								<span class="text-sm opacity-60 shrink-0">{time(a.at)}</span>
							</a>
							{#if receiptOf(a.id)}
								<button type="button" class="btn-icon preset-tonal mx-2 shrink-0" aria-label="See the receipt" title="See the receipt" onclick={() => view(receiptOf(a.id)!)}>
									<Icon name="search" size={18} />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
		{#if all.length > shown.length}
			<a href="/receipts" class="btn preset-tonal min-h-11 self-start">See everything ({all.length})</a>
		{/if}
	</div>
{/if}

<ReceiptDrawer receipt={opened} {names} bind:open={drawerOpen} />
