<script lang="ts">
	/*
	 * Step 6, play: the book in the story player, exactly as it will be seen:
	 * the book's title and subtext at the top, the stories down the side, one
	 * story at a time, flowing on. Then the last questions, the person's own
	 * test of done: does it flow, make sense, is it clear, does it cover
	 * everything? All four, and it's ready.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { problemsOf, setOpen, setReady, type Book, type BookStep } from '@inqbeta/q-core/storybook';
	import MadeDeck from '../decks/MadeDeck.svelte';
	import { carryOnNext } from '../decks/StoryDeck.svelte';
	import { storyVoice, setStoryVoice } from '../decks/voice.svelte';
	import StoryList from './StoryList.svelte';
	import ShowIt from './ShowIt.svelte';
	import BringToLife from './BringToLife.svelte';
	import MakeFinal from './MakeFinal.svelte';
	import ExportVideo from './ExportVideo.svelte';
	import type { AiState } from '$lib/story-engine';
	let { book, steps, commit, ai }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; ai: AiState } = $props();

	let chosen = $state<string | null>(null);
	$effect(() => {
		if (!chosen || !book.stories.some((s) => s.id === chosen)) chosen = book.stories[0]?.id ?? null;
	});
	const story = $derived(book.stories.find((s) => s.id === chosen) ?? null);
	$effect(() => {
		storyVoice.inBook = true;
		return () => (storyVoice.inBook = false);
	});
	/* One continuous flow, as in the book of Q's own stories. */
	$effect(() => {
		const ended = (e: Event) => {
			const { id, voice } = (e as CustomEvent<{ id: string; voice: boolean }>).detail;
			if (id !== chosen) return;
			const next = book.stories[book.stories.findIndex((s) => s.id === id) + 1];
			if (!next) return;
			carryOnNext(voice);
			chosen = next.id;
		};
		addEventListener('q-story-end', ended);
		return () => removeEventListener('q-story-end', ended);
	});

	const problems = $derived(problemsOf(book));
	const CHECKS = ['It flows, story to story.', 'It makes sense.', 'It’s clear.', 'It covers everything.'];
	let ticked = $state<boolean[]>([false, false, false, false]);
	let said = $state('');
	async function ready() {
		said = '';
		try {
			commit(await setReady(steps, book.id, 'Is it ready? Does it flow, make sense, is it clear, does it cover everything?', CHECKS));
		} catch (e) {
			said = e instanceof Error ? e.message : String(e);
		}
	}
	function download() {
		const blob = new Blob([JSON.stringify({ schema: 'inqbeta.storybook/1', book, steps }, null, 2)], { type: 'application/json' });
		const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${book.title || 'story-book'}.json` });
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<div class="flex flex-col gap-8">
	<header class="flex flex-col gap-1">
		<p class="h3 font-light">{book.title || 'Your book'}</p>
		{#if book.subtext}<p class="text-surface-700-300 text-lg">{book.subtext}</p>{/if}
	</header>

	{#if book.stories.length}
		<div class="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-6 items-start">
			<div class="flex flex-col gap-3">
				<button type="button" class="btn-icon min-h-11 min-w-11 {storyVoice.on ? 'preset-filled-primary-500' : 'preset-tonal'}" aria-pressed={storyVoice.on} aria-label={storyVoice.on ? 'Sound off' : 'Sound on: tell the stories aloud'} onclick={() => setStoryVoice(!storyVoice.on)}>
					<Icon name={storyVoice.on ? 'speaker' : 'speaker-off'} size={18} />
				</button>
				<StoryList stories={book.stories} {chosen} onchoose={(id) => (chosen = id)} />
			</div>
			<div class="flex flex-col items-center min-w-0">
				{#if story}{#key story.id}<MadeDeck {story} look={book.style} />{#if book.course && !story.recap}<div class="mt-6 w-full flex justify-center"><ShowIt {book} {story} /></div>{/if}{/key}<div class="mt-6 w-full flex flex-col items-center gap-4"><BringToLife {book} {steps} {commit} {ai} {story} /><MakeFinal {book} {steps} {commit} {ai} {story} /><ExportVideo {book} {steps} {commit} {story} /></div>{/if}
			</div>
		</div>
	{/if}

	<section class="card preset-outlined-surface-200-800 p-4 sm:p-6 flex flex-col gap-4">
		{#if book.ready}
			<p class="h4 font-normal flex items-center gap-2"><Icon name="check" size={22} stroke={3} /> Ready</p>
			<p>You said it flows, makes sense, is clear and covers everything. Change any story and it will ask again.</p>
			<p class="text-surface-700-300">Publishing it as a page on your site, and recording it in a real voice, come next. For now you can keep a copy.</p>
			<div><button type="button" class="btn preset-tonal min-h-11" onclick={download}><Icon name="download" size={18} /> Keep a copy (a file)</button></div>
		{:else if problems.length}
			<h2 class="h4 font-normal">Before it’s ready</h2>
			<ul class="list-disc pl-6">{#each problems as p (p)}<li>{p}</li>{/each}</ul>
		{:else}
			<h2 class="h4 font-normal">Is it ready?</h2>
			<p class="text-surface-700-300">Play it through first. Then tick each one only if it’s true.</p>
			<div class="flex flex-col gap-2">
				{#each CHECKS as c, i (c)}
					<label class="flex items-center gap-3 min-h-11 text-lg"><input type="checkbox" class="checkbox size-6" bind:checked={ticked[i]} /> {c}</label>
				{/each}
			</div>
			<fieldset class="flex flex-col gap-2">
				<legend class="h6 font-normal mb-1">Who can watch it?</legend>
				<label class="flex items-center gap-3 min-h-11"><input type="radio" class="radio" name="open" checked={!book.open} onchange={async () => commit(await setOpen(steps, book.id, false, 'Who can watch it?'))} /> Members only</label>
				<label class="flex items-center gap-3 min-h-11"><input type="radio" class="radio" name="open" checked={book.open} onchange={async () => commit(await setOpen(steps, book.id, true, 'Who can watch it?'))} /> Anyone (public)</label>
			</fieldset>
			<div><button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!ticked.every(Boolean)} onclick={ready}><Icon name="check" size={18} /> It’s ready</button></div>
			{#if !ticked.every(Boolean)}<p class="text-surface-700-300">Something not true yet? Go back to Review and redo that story.</p>{/if}
		{/if}
		{#if said}<p class="text-error-700-300" role="alert">{said}</p>{/if}
	</section>
</div>
