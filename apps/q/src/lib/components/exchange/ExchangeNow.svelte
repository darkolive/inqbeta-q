<script lang="ts">
	/*
	 * The exchange set's "now" panel (ADR-Q-029): where it stands, said to
	 * you, and only the things you can do from here — decided once, by the
	 * exchange's own rules (agreementNow and its like), and drawn here. Each
	 * step is checked by the rule engine before it's signed (onAct).
	 */
	import type { Snippet } from 'svelte';
	import { Icon, Status } from '@inqbeta/q-ui';
	import type { Now, NowAction } from '@inqbeta/q-core/agreements';

	let {
		now,
		busy = '',
		result = null,
		onAct,
		panel
	}: {
		now: Now;
		busy?: string;
		result?: { good: boolean; text: string } | null;
		onAct: (a: NowAction, note: string) => void;
		panel?: Snippet;
	} = $props();

	let note = $state('');
	const noted = $derived(now.actions.some((a) => a.withNote));
	const act = (a: NowAction) => {
		onAct(a, a.withNote ? note.trim() : '');
		if (a.withNote) note = '';
	};
</script>

<section class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-5 flex flex-col gap-4" aria-labelledby="now">
	<h2 id="now" class="h5">Now</h2>
	{#if now.finished === 'settled'}
		<p class="flex items-center gap-2"><Status tone="good">Settled</Status> {now.says}</p>
	{:else}
		<p>{now.says}</p>
	{/if}

	{@render panel?.()}

	{#if noted}
		<label class="label"><span class="label-text">A note (optional)</span><input class="input" bind:value={note} maxlength="200" /></label>
	{/if}
	{#if now.actions.length}
		<div class="flex flex-wrap gap-3">
			{#each now.actions as a (a.id)}
				{#if a.href}
					<a class="btn min-h-11 {a.primary ? 'preset-filled-primary-500' : 'preset-tonal'}" href={a.href}>{#if a.icon}<Icon name={a.icon} size={18} />{/if} {a.label}</a>
				{:else}
					<button type="button" class="btn min-h-11 {a.primary ? 'preset-filled-primary-500' : 'preset-tonal'}" disabled={!!busy} onclick={() => act(a)}>
						{#if a.icon}<Icon name={a.icon} size={18} />{/if}{busy === a.id ? 'Checking…' : a.label}
					</button>
				{/if}
			{/each}
		</div>
	{/if}
	{#if now.after}<p class="text-sm">{now.after}</p>{/if}

	{#if result}<p class="text-sm card p-3 {result.good ? 'preset-tonal-success' : 'preset-tonal-warning'}" aria-live="polite">{result.text}</p>{/if}
</section>
