<script lang="ts">
	/*
	 * Step 5, review: one story at a time. Keep its drafts, or redo it. A redo
	 * asks four questions first, one at a time (happy with, isn't right, must
	 * change, must not change), and changes only that story. Then the ripple
	 * review reads the whole book and suggests changes to the other stories so
	 * it still flows: each one shown, accepted or left.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { REDO_QUESTIONS, setStory, keepDrafts, rejectDraft, rejectDrafts, applySuggestion, historyOf, type Book, type BookStep, type RedoAnswers, type Story, type Suggestion } from '@inqbeta/q-core/storybook';
	import { run, type AiState } from '$lib/story-engine';
	import StoryList from './StoryList.svelte';
	import SlideCard from './SlideCard.svelte';
	import AskOne from './AskOne.svelte';
	import CostAgree from './CostAgree.svelte';
	import History from './History.svelte';
	import PieceIcon from './PieceIcon.svelte';
	let { book, steps, commit, ai, ondone }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; ai: AiState; ondone: () => void } = $props();

	let chosen = $state<string | null>(null);
	$effect(() => {
		if (!chosen || !book.stories.some((s) => s.id === chosen)) chosen = book.stories[0]?.id ?? null;
	});
	const story = $derived(book.stories.find((s) => s.id === chosen) ?? null);

	/* The redo: which question (0–3), then the cost (4). */
	let redo = $state<number | null>(null);
	let answers = $state<RedoAnswers>({});
	let answer = $state('');
	/* After a redo: the story as it was, to put back; and the ripple. */
	let before = $state<Story | null>(null);
	let ripple = $state<Suggestion[] | null>(null);
	let rippleFor = $state<string | null>(null);

	function choose(id: string) {
		chosen = id;
		redo = null;
		before = null;
	}
	function startRedo() {
		answers = {};
		answer = '';
		redo = 0;
		ripple = null;
	}
	function answered(v: string) {
		const q = REDO_QUESTIONS[redo!];
		answers = { ...answers, [q.key]: v };
		answer = answers[REDO_QUESTIONS[redo! + 1]?.key] ?? '';
		redo = redo! + 1;
	}
	async function doRedo(agreed: number | 'practice') {
		if (!story) return;
		const r = await run({ task: 'redo', book, story: story.id, answers }, agreed);
		if (!r.story) throw new Error('Nothing came back. Nothing was changed.');
		before = story;
		const said = Object.fromEntries(REDO_QUESTIONS.map((q) => [q.asks, answers[q.key] ?? '']));
		commit(await setStory(steps, book.id, r.story, { kind: 'redo', asks: 'Redo this story?', answer: said, cost: { upTo: r.upTo, used: r.used, by: r.by } }));
		redo = null;
		rippleFor = story.id;
	}
	async function putBack() {
		if (!before) return;
		commit(await setStory(steps, book.id, before, { kind: 'redo', asks: 'Put the old one back?', answer: 'yes' }));
		before = null;
		rippleFor = null;
	}
	async function doRipple(agreed: number | 'practice') {
		if (!rippleFor) return;
		const r = await run({ task: 'ripple', book, changed: rippleFor }, agreed);
		ripple = r.suggestions ?? [];
		/* A ripple that found nothing is still a fact worth keeping: the book was read again and it held. */
		const changed = book.stories.find((s) => s.id === rippleFor);
		if (changed) commit(await setStory(steps, book.id, changed, { kind: 'ripple', asks: 'Does the rest of the book still flow?', answer: ripple.length ? `${ripple.length} suggestions` : 'it flows', cost: { upTo: r.upTo, used: r.used, by: r.by } }));
		before = null;
	}
	async function decide(s: Suggestion, take: boolean) {
		const target = book.stories.find((x) => x.id === s.story);
		if (!target) return;
		const next = take ? applySuggestion(target, s) : target;
		commit(await setStory(steps, book.id, next, { kind: 'ripple', asks: `${s.why} Take this change?`, answer: take ? `yes: “${s.title}”` : 'left as it is' }));
		ripple = ripple!.filter((x) => x.id !== s.id);
	}
	async function keepOne(slide?: string) {
		if (story) commit(await setStory(steps, book.id, keepDrafts(story, slide ? [slide] : undefined), { kind: 'keep', asks: slide ? 'Accept this slide?' : 'Accept this story’s drafts?', answer: slide ? 'yes' : 'yes, all of them' }));
	}
	async function rejectOne(slide?: string) {
		if (!story) return;
		const h = historyOf(steps, story.id);
		commit(await setStory(steps, book.id, slide ? rejectDraft(story, slide, h) : rejectDrafts(story, h), { kind: 'reject', asks: slide ? 'Reject this slide?' : 'Reject this story’s drafts?', answer: slide ? 'yes' : 'yes, all of them' }));
	}
	const titleOf = (id: string) => book.stories.find((s) => s.id === id)?.title ?? '';
	const slideOf = (s: Suggestion) => book.stories.find((x) => x.id === s.story)?.slides.find((x) => x.id === s.slide) ?? null;
	const note = (s: Story) => {
		const d = s.slides.filter((x) => x.draft).length;
		return d ? `${d} ${d === 1 ? 'draft' : 'drafts'} to look at` : `${s.slides.length} ${s.slides.length === 1 ? 'slide' : 'slides'}, kept`;
	};
</script>

{#if !book.stories.length}
	<p>Add the stories first.</p>
{:else}
	<div class="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-6 items-start">
		<StoryList stories={book.stories} {chosen} onchoose={choose} {note} />
		<div class="flex flex-col gap-6 min-w-0">
			{#if ripple}
				<!-- The ripple review: suggestions for the other stories, one by one. -->
				<section class="card preset-outlined-secondary-500 p-4 sm:p-6 flex flex-col gap-4" aria-live="polite">
					<h2 class="h4 font-normal">Does the rest still flow?</h2>
					{#if !ripple.length}
						<p>Nothing else needs to change. The book still flows.</p>
						<div><button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => (ripple = null)}>Good</button></div>
					{:else}
						{@const s = ripple[0]}
						{@const was = slideOf(s)}
						<p class="text-xs opacity-70">Suggestion 1 of {ripple.length} · in “{titleOf(s.story)}”</p>
						<p>{s.why}</p>
						<div class="grid sm:grid-cols-2 gap-3">
							<div class="card preset-tonal p-3 flex flex-col gap-1">
								<p class="text-xs opacity-70">{was ? 'Now' : 'A new slide at the end'}</p>
								{#if was}<p class="h6 font-normal">{was.title}</p><p class="text-surface-700-300">{was.subtext}</p>{/if}
							</div>
							<div class="card preset-outlined-secondary-500 border-dashed p-3 flex gap-3">
								<PieceIcon piece={s.piece ?? was?.piece ?? null} size={44} />
								<div class="flex flex-col gap-1 min-w-0"><p class="text-xs opacity-70">Suggested</p><p class="h6 font-normal">{s.title}</p><p class="text-surface-700-300">{s.subtext}</p></div>
							</div>
						</div>
						<div class="flex flex-wrap gap-3">
							<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => decide(s, true)}><Icon name="check" size={18} /> Take it</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => decide(s, false)}>Leave it</button>
						</div>
					{/if}
				</section>
			{/if}

			{#if story}
				<section class="flex flex-col gap-4" aria-label={story.title}>
					<h2 class="h4 font-normal">{story.title}</h2>

					{#if redo !== null && redo < REDO_QUESTIONS.length}
						<div class="card preset-outlined-primary-500 p-4 sm:p-6 flex flex-col gap-4">
							<p class="text-xs opacity-70">Redo · question {redo + 1} of {REDO_QUESTIONS.length}</p>
							{#key redo}
								<AskOne question={REDO_QUESTIONS[redo].asks} lines={2} most={600} optional bind:value={answer} onnext={answered} onback={() => (redo === 0 ? (redo = null) : ((redo = redo! - 1), (answer = answers[REDO_QUESTIONS[redo!].key] ?? '')))} />
							{/key}
						</div>
					{:else if redo === REDO_QUESTIONS.length}
						<div class="flex flex-col gap-3">
							<ul class="flex flex-col gap-1">
								{#each REDO_QUESTIONS as q (q.key)}<li><span class="opacity-70">{q.asks}</span> {answers[q.key] || '—'}</li>{/each}
							</ul>
							<CostAgree {ai} job={() => ({ task: 'redo', book, story: story.id, answers })} what="redo “{story.title}” from your answers. Only this story changes" onrun={doRedo} />
							<div><button type="button" class="btn preset-tonal min-h-11" onclick={() => (redo = null)}>Cancel the redo</button></div>
						</div>
					{:else}
						<div class="flex flex-wrap gap-3">
							{#if story.slides.some((x) => x.draft)}
								<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => keepOne()}><Icon name="check" size={18} /> Accept all</button>
								<button type="button" class="btn preset-tonal min-h-11" onclick={() => rejectOne()}><Icon name="close" size={18} /> Reject all</button>
							{/if}
							<button type="button" class="btn preset-tonal-primary min-h-11" onclick={startRedo}><Icon name="repeat" size={18} /> Redo this story</button>
						</div>
					{/if}

					{#if before && rippleFor === story.id}
						<div class="card preset-tonal p-4 flex flex-col gap-3">
							<p>Redone. Only “{story.title}” changed. Now check the rest of the book still flows with it.</p>
							<CostAgree {ai} job={() => ({ task: 'ripple', book, changed: rippleFor! })} what="read the whole book again and suggest changes to the other stories" onrun={doRipple} />
							<div><button type="button" class="btn preset-tonal min-h-11" onclick={putBack}>Put the old one back</button></div>
						</div>
					{/if}

					{#each story.slides as slide, i (slide.id)}<SlideCard {slide} n={i + 1} onkeep={() => keepOne(slide.id)} onreject={() => rejectOne(slide.id)} />{/each}
					<History steps={historyOf(steps, story.id)} title={story.title} />
				</section>
			{/if}

			<div class="flex flex-wrap gap-3 border-t border-surface-200-800 pt-4">
				<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={ondone}>Next: play the book <Icon name="arrowRight" size={18} /></button>
			</div>
		</div>
	</div>
{/if}
