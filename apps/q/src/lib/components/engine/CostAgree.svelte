<script lang="ts">
	/*
	 * The cost, agreed before any AI call (the brief: "up to 2 credits", settled
	 * at what was used). With the host's AI on: work it out, then agree. With
	 * it off: practise, at no cost, and say so plainly.
	 */
	import type { StoryTask } from '@inqbeta/q-core/story-ai';
	import { quote, type AiState } from '$lib/story-engine';
	let { ai, job, what, onrun }: { ai: AiState; job: () => StoryTask; what: string; onrun: (agreed: number | 'practice') => Promise<void> } = $props();
	let upTo = $state<number | null>(null);
	let busy = $state(false);
	let said = $state('');
	async function workOut() {
		busy = true;
		said = '';
		try {
			upTo = await quote(job());
		} catch (e) {
			said = e instanceof Error ? e.message : String(e);
		}
		busy = false;
	}
	async function go(agreed: number | 'practice') {
		busy = true;
		said = '';
		try {
			await onrun(agreed);
			upTo = null;
		} catch (e) {
			said = e instanceof Error ? e.message : String(e);
		}
		busy = false;
	}
	const credits = (n: number) => `${n.toFixed(2)} ${n === 1 ? 'credit' : 'credits'}`;
</script>

<div class="card preset-tonal p-4 flex flex-col gap-3" aria-live="polite" aria-busy={busy}>
	{#if ai.ai}
		{#if upTo === null}
			<p>The AI will {what}. First, see what it costs.</p>
			<div class="flex flex-wrap gap-3">
				<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy} onclick={workOut}>What will it cost?</button>
				<button type="button" class="btn preset-tonal min-h-11" disabled={busy} onclick={() => go('practice')}>Practise instead (free)</button>
			</div>
		{:else}
			<p class="h5 font-normal">Up to {credits(upTo)}</p>
			<p class="text-surface-700-300">You’ll be charged only what it uses, never more than this. (On this computer, a test: nothing is taken yet.)</p>
			<div class="flex flex-wrap gap-3">
				<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy} onclick={() => go(upTo!)}>{busy ? 'Working…' : 'Agree, and go'}</button>
				<button type="button" class="btn preset-tonal min-h-11" disabled={busy} onclick={() => (upTo = null)}>Not now</button>
			</div>
		{/if}
	{:else}
		<p>{ai.says || 'The AI isn’t on here yet.'}</p>
		<p class="text-surface-700-300">A practice run fills in plain prompts, so you can see how each step works. It’s free.</p>
		<div><button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy} onclick={() => go('practice')}>{busy ? 'Working…' : 'Practise this step'}</button></div>
	{/if}
	{#if said}<p class="text-error-700-300" role="alert">{said}</p>{/if}
</div>
