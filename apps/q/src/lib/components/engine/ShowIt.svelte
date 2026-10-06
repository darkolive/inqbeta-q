<script lang="ts">
	/*
	 * An outcome's Show it, under the player (ADR-Q-033, the storyboard for
	 * courses; 6 October 2026): what to make or do, and "Keep my evidence":
	 * words typed or said, and/or a photo or file. Kept as a hashed record
	 * against the unit and the outcome (lib/evidence); a file by its
	 * fingerprint, never uploaded. What's been kept shows below.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import type { Book, Evidence, Story } from '@inqbeta/q-core/storybook';
	import { evidenceFor, keepEvidence } from '$lib/evidence';
	import Dictate from './Dictate.svelte';
	let { book, story }: { book: Book; story: Story } = $props();
	const show = $derived(story.slides.find((s) => s.show) ?? null);
	const id = $props.id();
	let open = $state(false);
	let words = $state('');
	let file = $state<File | null>(null);
	let said = $state('');
	let kept = $state<Evidence[]>([]);
	$effect(() => {
		kept = evidenceFor(book.id, story.id);
	});
	async function keep(e: SubmitEvent) {
		e.preventDefault();
		said = '';
		try {
			await keepEvidence(book, story, { words, file });
			kept = evidenceFor(book.id, story.id);
			words = '';
			file = null;
			open = false;
		} catch (err) {
			said = err instanceof Error ? err.message : String(err);
		}
	}
	const when = (at: string) => new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>

{#if show}
	<section class="card preset-outlined-tertiary-500 p-4 sm:p-6 flex flex-col gap-3 w-full max-w-3xl" aria-labelledby="{id}-h">
		<p class="badge bg-tertiary-700 text-white self-start">Show it</p>
		<h3 id="{id}-h" class="h5 font-normal">{show.title}</h3>
		{#if show.subtext}<p class="text-surface-700-300">{show.subtext}</p>{/if}

		{#if open}
			<form class="flex flex-col gap-3 border-t border-surface-200-800 pt-3" onsubmit={keep}>
				<label for="{id}-w" class="h6 font-normal">What did you make or do?</label>
				<textarea id="{id}-w" class="textarea" rows="3" maxlength="2000" bind:value={words}></textarea>
				<div><Dictate bind:value={words} label="Say it" /></div>
				<label class="flex flex-col gap-1">
					<span class="h6 font-normal">A photo or a file (if you have one)</span>
					<input type="file" class="input min-h-11" accept="image/*,video/*,audio/*,.pdf,.txt,.md,.docx" onchange={(e) => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} />
					<span class="text-sm text-surface-700-300">It stays on your device. Q keeps its fingerprint, so the record shows exactly which file it was.</span>
				</label>
				<div class="flex flex-wrap gap-3">
					<button class="btn preset-filled-primary-500 min-h-11" disabled={!words.trim() && !file}><Icon name="check" size={18} /> Keep it</button>
					<button type="button" class="btn preset-tonal min-h-11" onclick={() => ((open = false), (said = ''))}>Cancel</button>
				</div>
				{#if said}<p class="text-error-700-300" role="alert">{said}</p>{/if}
			</form>
		{:else}
			<div><button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => (open = true)}><Icon name="plus" size={18} /> Keep my evidence</button></div>
		{/if}

		{#if kept.length}
			<div class="flex flex-col gap-2 border-t border-surface-200-800 pt-3">
				<h4 class="h6 font-normal">Kept for this</h4>
				<ul class="flex flex-col gap-2">
					{#each kept as e (e.id)}
						<li class="flex flex-col">
							<span>{e.words ?? e.file?.name}</span>
							<span class="text-xs opacity-70">{when(e.at)}{e.words && e.file ? ` · with ${e.file.name}` : ''} · record {e.id.slice(0, 8)}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>
{/if}
