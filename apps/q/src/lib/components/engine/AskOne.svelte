<script lang="ts">
	/*
	 * One question at a time (the story engine's house rule, ADR-Q-033 Part 2):
	 * the question big, one thick field under it with no placeholder, a short
	 * hint if it helps, and the way on. Enter goes on from a one-line field.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import Dictate from './Dictate.svelte';
	let {
		question,
		hint = '',
		value = $bindable(''),
		lines = 1,
		most = 220,
		next = 'Next',
		optional = false,
		empty = 'Nothing to say',
		onnext,
		onback
	}: {
		question: string;
		hint?: string;
		value?: string;
		lines?: number;
		most?: number;
		next?: string;
		/** May be left empty ("Nothing to say"). */
		optional?: boolean;
		/** The button's words when an optional field is left empty. */
		empty?: string;
		onnext: (value: string) => void;
		onback?: () => void;
	} = $props();
	const id = $props.id();
	const ready = $derived(optional || value.trim().length > 0);
	let field = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	$effect(() => void field?.focus());
	function go() {
		if (ready) onnext(value.trim());
	}
</script>

<form class="flex flex-col gap-4" onsubmit={(e) => (e.preventDefault(), go())}>
	<label for={id} class="h4 font-normal">{question}</label>
	{#if hint}<p id="{id}-hint" class="text-surface-700-300 -mt-2">{hint}</p>{/if}
	{#if lines > 1}
		<textarea bind:this={field} {id} class="textarea text-lg" rows={lines} maxlength={most} bind:value aria-describedby={hint ? `${id}-hint` : undefined}></textarea>
	{:else}
		<input bind:this={field} {id} class="input text-lg" maxlength={most} bind:value aria-describedby={hint ? `${id}-hint` : undefined} />
	{/if}
	<div class="flex flex-wrap items-center gap-3">
		{#if onback}<button type="button" class="btn preset-tonal min-h-11" onclick={onback}>Back</button>{/if}
		<Dictate bind:value />
		<button type="submit" class="btn preset-filled-primary-500 min-h-11" disabled={!ready}>
			{optional && !value.trim() ? empty : next} <Icon name="arrowRight" size={18} />
		</button>
		<span class="text-xs opacity-60 tabular-nums ml-auto">{value.length} / {most}</span>
	</div>
</form>
