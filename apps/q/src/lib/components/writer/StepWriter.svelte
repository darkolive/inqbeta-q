<script lang="ts">
	/*
	 * The writer set (ADR-Q-029): steps as data, one Next and Back, one
	 * finishing button. Host set-up, backups, your card and the agreement
	 * writer all draw this, so "Next stays greyed out" is fixed in one place
	 * (3 October 2026: it broke in one of four copies).
	 *
	 * A writer gives its steps (title, what it asks), whether this step is
	 * ready, and its own content as Steps.Content blocks; everything else is
	 * the same everywhere. Exceptions are props: a check before moving on
	 * (onNext), steps you can't go back to (mayGoTo), a hint while Next
	 * sleeps.
	 */
	import type { Snippet } from 'svelte';
	import { Steps } from '@skeletonlabs/skeleton-svelte';
	import { Icon } from '@inqbeta/q-ui';

	let {
		steps,
		step = $bindable(0),
		ready,
		mayGoTo,
		busy = false,
		busyLabel = '',
		onNext,
		finishLabel,
		finishIcon,
		finishDisabled = false,
		onFinish,
		notNow,
		hint = '',
		says = '',
		children,
		after
	}: {
		steps: { title: string; says: string }[];
		step?: number;
		/** Whether this step is done enough to go on. */
		ready: boolean;
		/** Which steps may be gone to from here (default: any before, and the next one once ready). */
		mayGoTo?: (to: number) => boolean;
		busy?: boolean;
		/** What the buttons say while busy, e.g. "Keeping it…". */
		busyLabel?: string;
		/** Moving on needs work first (keeping what was typed): do it, then move on yourself. */
		onNext?: () => void | Promise<void>;
		finishLabel: string;
		finishIcon?: 'share' | 'check' | 'wallet';
		finishDisabled?: boolean;
		onFinish: () => void;
		/** On the first step, a way out: a link or a button. */
		notNow?: { label?: string; href?: string; onclick?: () => void };
		/** Said under the buttons while Next is asleep: what wakes it. */
		hint?: string;
		/** Something went wrong, said in words. */
		says?: string;
		children: Snippet;
		after?: Snippet;
	} = $props();

	const last = $derived(step >= steps.length - 1);
	const may = (to: number) => (mayGoTo ? mayGoTo(to) : to < step || (to === step + 1 && ready));
	function next() {
		if (!ready || busy) return;
		if (onNext) void onNext();
		else step += 1;
	}
</script>

<Steps count={steps.length} {step} onStepChange={(d) => may(d.step) && (step = d.step)}>
	<Steps.List class="mb-6">
		{#each steps as s, i (s.title)}
			<Steps.Item index={i}>
				<Steps.Trigger class="min-h-11">
					<Steps.Indicator>{i + 1}</Steps.Indicator>
					<span class="hidden md:inline">{s.title}</span>
				</Steps.Trigger>
				{#if i < steps.length - 1}<Steps.Separator />{/if}
			</Steps.Item>
		{/each}
	</Steps.List>

	<header class="mb-5">
		<h2 class="h3">{steps[step]?.title}</h2>
		<p class="opacity-70">{steps[step]?.says}</p>
	</header>

	{@render children()}
</Steps>

<footer class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-200-800 pt-4">
	<div class="flex gap-3">
		{#if step > 0 && may(step - 1)}
			<button type="button" class="btn preset-tonal min-h-11" onclick={() => (step -= 1)}>Back</button>
		{:else if step === 0 && notNow?.href}
			<a class="btn preset-tonal min-h-11" href={notNow.href}>{notNow.label ?? 'Not now'}</a>
		{:else if step === 0 && notNow?.onclick}
			<button type="button" class="btn preset-tonal min-h-11" onclick={notNow.onclick}>{notNow.label ?? 'Not now'}</button>
		{/if}
	</div>
	{#if !last}
		<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!ready || busy} onclick={next}>{busy && busyLabel ? busyLabel : 'Next'}</button>
	{:else}
		<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy || finishDisabled} onclick={onFinish}>
			{#if finishIcon}<Icon name={finishIcon} size={18} />{/if}{busy && busyLabel ? busyLabel : finishLabel}
		</button>
	{/if}
</footer>
{#if hint && !ready && !last}<p class="text-sm opacity-70 -mt-3">{hint}</p>{/if}
{#if says}<p class="text-sm card preset-tonal-error p-3" aria-live="polite">{says}</p>{/if}
{@render after?.()}
