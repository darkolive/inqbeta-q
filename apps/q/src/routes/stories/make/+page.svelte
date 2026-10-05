<script lang="ts">
	/*
	 * The story engine (ADR-Q-033 Part 2; first draft 4 October 2026).
	 *
	 * Darren: "Working on what is the main title idea, what are the chapters,
	 * building up the storyboard … then press generate and see what the AI
	 * builds in its first draft. And then each chapter you can redo … every
	 * question shows an answer, answer becomes another question until the
	 * user becomes satisfied that the whole deck story flows."
	 *
	 * For someone turning their thoughts into a clear picture story, one step
	 * and one question at a time: the idea (and what Q should read: links,
	 * documents, words written or said), the stories (Q suggests five or six;
	 * change them, or say more and ask again), the storyboard (mocked up by Q,
	 * or by hand), review (accept or reject each draft, redo, the ripple),
	 * play. Books are kept on this
	 * device as chains of steps (lib/story-engine). The AI is the host's, on
	 * localhost; elsewhere every step can be practised for free.
	 */
	import { Page, Icon } from '@inqbeta/q-ui';
	import { replaceState } from '$app/navigation';
	import { untrack } from 'svelte';
	import { bookFrom, needingWork, problemsOf, type BookStep } from '@inqbeta/q-core/storybook';
	import { aiHere, booksHere, forgetBook, newBookId, saveSteps, stepsOf, type AiState } from '$lib/story-engine';
	import StepRail from '$lib/components/engine/StepRail.svelte';
	import IdeaStep from '$lib/components/engine/IdeaStep.svelte';
	import StoriesStep from '$lib/components/engine/StoriesStep.svelte';
	import BoardStep from '$lib/components/engine/BoardStep.svelte';
	import DraftStep from '$lib/components/engine/DraftStep.svelte';
	import ReviewStep from '$lib/components/engine/ReviewStep.svelte';
	import PlayStep from '$lib/components/engine/PlayStep.svelte';
	import History from '$lib/components/engine/History.svelte';

	let bookId = $state<string | null>(null);
	let steps = $state<BookStep[]>([]);
	let at = $state(0);
	let ai = $state<AiState>({ ai: false });
	let unsaved = $state(false);
	let shelf = $state<ReturnType<typeof booksHere>>([]);
	const book = $derived(bookFrom(steps, bookId ?? ''));

	/* Once, on arrival: what this device holds, and the book in the address if there is one. */
	$effect(() =>
		untrack(() => {
			void aiHere().then((a) => (ai = a));
			shelf = booksHere();
			const want = new URLSearchParams(location.search).get('book');
			if (want && stepsOf(want).length) open(want, false);
		})
	);

	function commit(next: BookStep[]) {
		steps = next;
		if (bookId) unsaved = !saveSteps(bookId, next);
	}
	/* `address`: put the book in the address (not on first load: it's already there, and the router isn't ready yet). */
	function open(id: string, address = true) {
		bookId = id;
		const kept = stepsOf(id);
		steps = kept;
		const b = bookFrom(kept, id);
		at = !b.title ? 0 : !b.stories.length ? 1 : needingWork(b).length ? 2 : 4;
		if (address) replaceState(`?book=${id}`, {});
	}
	function start() {
		const id = newBookId();
		bookId = id;
		steps = [];
		at = 0;
		/* Nothing is saved until the first answer. */
		replaceState(`?book=${id}`, {});
	}
	function close() {
		bookId = null;
		steps = [];
		shelf = booksHere();
		replaceState(location.pathname, {});
	}
	function go(n: number) {
		at = n;
		requestAnimationFrame(() => document.getElementById('engine-step')?.focus());
	}
	const done = $derived([
		!!book.title,
		book.stories.length > 0,
		book.stories.length > 0 && book.stories.every((s) => s.slides.length > 0),
		book.stories.length > 0 && !needingWork(book).length,
		book.stories.length > 0 && !problemsOf(book).length,
		book.ready
	]);
	const when = (at: string) => (at ? new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
</script>

<svelte:head><title>{book.title ? `${book.title} — ` : ''}Make a story book</title></svelte:head>

<Page title="Make a story book" lead="Turn what’s in your head into a clear picture story, one step at a time. Nothing you try is lost.">
	{#if !bookId}
		<div class="flex flex-col gap-6 max-w-3xl">
			<div><button type="button" class="btn-lg preset-filled-primary-500 min-h-11" onclick={start}><Icon name="plus" size={20} /> Start a new book</button></div>
			{#if shelf.length}
				<section class="flex flex-col gap-3">
					<h2 class="h4 font-normal">Your books on this device</h2>
					<ul class="flex flex-col gap-2">
						{#each shelf as b (b.book.id)}
							<li class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 flex flex-wrap items-center gap-3">
								<div class="flex-1 min-w-0">
									<p class="text-lg">{b.book.title || 'A book with no title yet'}</p>
									<p class="text-xs opacity-70">{b.book.stories.length} {b.book.stories.length === 1 ? 'story' : 'stories'} · {b.book.ready ? 'ready' : 'being made'} · {when(b.at)}</p>
								</div>
								<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => open(b.book.id)}>Open</button>
								<button type="button" class="btn preset-tonal min-h-11" onclick={() => (forgetBook(b.book.id), (shelf = booksHere()))}>Delete</button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			<p class="text-surface-700-300">Books are kept in this browser for now. {ai.ai ? `Drafts are written by the host’s AI (${ai.model}), for a cost you agree first.` : ai.says || ''}</p>
		</div>
	{:else}
		<div class="flex flex-col gap-6">
			<div class="flex flex-wrap items-center gap-3">
				<button type="button" class="btn preset-tonal min-h-11" onclick={close}>All books</button>
				{#if book.title}<p class="text-lg font-light flex-1 min-w-0">{book.title}</p>{/if}
			</div>
			<StepRail {at} {done} onchoose={go} />
			{#if unsaved}<p class="card preset-tonal-error p-3" role="alert">This browser isn’t keeping your book (a private window, or it’s full). Keep a copy from Play before you leave.</p>{/if}
			<div id="engine-step" tabindex="-1" class="outline-none">
				{#if at === 0}<div class="max-w-2xl"><IdeaStep {book} {steps} {commit} ondone={() => go(1)} /></div>
				{:else if at === 1}<div class="max-w-2xl"><StoriesStep {book} {steps} {commit} {ai} ondone={() => go(2)} ondraft={() => go(3)} /></div>
				{:else if at === 2}<BoardStep {book} {steps} {commit} ondone={() => go(3)} />
				{:else if at === 3}<div class="max-w-3xl"><DraftStep {book} {steps} {commit} {ai} ondone={() => go(4)} /></div>
				{:else if at === 4}<ReviewStep {book} {steps} {commit} {ai} ondone={() => go(5)} />
				{:else}<PlayStep {book} {steps} {commit} />{/if}
			</div>
			{#if steps.length}<History steps={steps.filter((s) => s.chain === 'book')} title={book.title || 'the book'} />{/if}
		</div>
	{/if}
</Page>
