<script lang="ts">
	/*
	 * The exchange set's card (ADR-Q-029): who with, what each side gives, any
	 * details, and where it stands, from your side. Agreements, shop sales and
	 * offers all draw this; each says only what's its own. The whole card is a
	 * link when `href` is given (one target, not several).
	 */
	import { Icon, Status } from '@inqbeta/q-ui';

	type Tone = 'good' | 'waiting' | 'needs-you' | 'plain' | 'bad';
	let {
		heading,
		sub = '',
		who,
		status,
		give,
		get,
		details = [],
		href
	}: {
		heading: string;
		sub?: string;
		who: { name: string; picture?: string };
		status: { text: string; tone: Tone };
		give?: { label: string; value: string };
		get?: { label: string; value: string };
		details?: { label: string; value: string }[];
		href?: string;
	} = $props();
</script>

<svelte:element
	this={href ? 'a' : 'article'}
	{href}
	class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-5 flex flex-col gap-4 {href ? 'hover:preset-tonal-primary' : ''}"
>
	<header class="flex items-center gap-3">
		<span class="size-12 shrink-0 overflow-hidden rounded-full bg-surface-100-900 flex items-center justify-center">
			{#if who.picture}<img src={who.picture} alt="" class="size-full object-cover" />{:else}<span class="font-bold opacity-70">{who.name.slice(0, 1)}</span>{/if}
		</span>
		<span class="flex-1 min-w-0">
			<span class="block font-bold">{heading}</span>
			{#if sub}<span class="block text-sm text-surface-700-300">{sub}</span>{/if}
		</span>
		<Status tone={status.tone}>{status.text}</Status>
	</header>

	{#if give && get}
		<div class="grid gap-3 sm:grid-cols-[1fr_auto_1fr] items-center">
			<div class="card preset-tonal-secondary p-3">
				<p class="text-xs uppercase font-bold opacity-70">{give.label}</p>
				<p class="font-semibold break-words">{give.value}</p>
			</div>
			<Icon name="exchange" size={22} class="justify-self-center opacity-70" />
			<div class="card preset-tonal-primary p-3">
				<p class="text-xs uppercase font-bold opacity-70">{get.label}</p>
				<p class="font-semibold break-words">{get.value}</p>
			</div>
		</div>
	{/if}

	{#if details.length}
		<dl class="grid gap-2 text-sm sm:grid-cols-3">
			{#each details as d, i (i)}<div><dt class="opacity-70">{d.label}</dt><dd>{d.value}</dd></div>{/each}
		</dl>
	{/if}
</svelte:element>
