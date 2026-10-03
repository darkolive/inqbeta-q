<script lang="ts">
	/*
	 * An agreement as a card (ADR-Q-015, ADR-Q-025): who with, what each side
	 * gives, when and where, and where it stands — from your side. The whole
	 * card is a link when `href` is given (one target, not several).
	 */
	import { Icon, Status } from '@inqbeta/q-ui';
	import { valueText, type Standing } from '@inqbeta/q-core/agreements';
	import { standingWords } from '$lib/agreements';
	import type { Person } from '$lib/people';

	let { standing, me, people, href }: { standing: Standing; me: string; people: Person[]; href?: string } = $props();

	const t = $derived(standing.terms);
	const themDid = $derived(t ? (t.a === me ? t.b : t.a) : '');
	const them = $derived(people.find((p) => p.did === themDid));
	const mine = $derived(t ? (t.a === me ? t.aGives : t.bGives) : null);
	const theirs = $derived(t ? (t.a === me ? t.bGives : t.aGives) : null);
	const where = $derived(standingWords(standing, me));
	const KIND = { swap: 'Swap', job: 'Job', treaty: 'Treaty' } as const;
</script>

<svelte:element
	this={href ? 'a' : 'article'}
	{href}
	class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-5 flex flex-col gap-4 {href ? 'hover:preset-tonal-primary' : ''}"
>
	<header class="flex items-center gap-3">
		<span class="size-12 shrink-0 overflow-hidden rounded-full bg-surface-100-900 flex items-center justify-center">
			{#if them?.picture}<img src={them.picture} alt="" class="size-full object-cover" />{:else}<span class="font-bold opacity-70">{(them?.name ?? '?').slice(0, 1)}</span>{/if}
		</span>
		<span class="flex-1 min-w-0">
			<span class="block font-bold">With {them?.name ?? 'someone'}</span>
			<span class="block text-sm text-surface-700-300">{t ? KIND[t.kind] : 'Agreement'}{t?.business ? ' · business' : ''}</span>
		</span>
		<Status tone={where.tone}>{where.text}</Status>
	</header>

	{#if mine && theirs}
		<div class="grid gap-3 sm:grid-cols-[1fr_auto_1fr] items-center">
			<div class="card preset-tonal-secondary p-3">
				<p class="text-xs uppercase font-bold opacity-70">You give</p>
				<p class="font-semibold break-words">{valueText(mine)}</p>
			</div>
			<Icon name="exchange" size={22} class="justify-self-center opacity-70" />
			<div class="card preset-tonal-primary p-3">
				<p class="text-xs uppercase font-bold opacity-70">{them?.name?.split(' ')[0] ?? 'They'} gives</p>
				<p class="font-semibold break-words">{valueText(theirs)}</p>
			</div>
		</div>
	{/if}

	{#if t?.when || t?.where || t?.doneWhen}
		<dl class="grid gap-2 text-sm sm:grid-cols-3">
			{#if t.when}<div><dt class="opacity-70">When</dt><dd>{t.when}</dd></div>{/if}
			{#if t.where}<div><dt class="opacity-70">Where</dt><dd>{t.where}</dd></div>{/if}
			{#if t.doneWhen}<div><dt class="opacity-70">Done when</dt><dd>{t.doneWhen}</dd></div>{/if}
		</dl>
	{/if}
</svelte:element>
