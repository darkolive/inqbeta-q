<script lang="ts">
	/*
	 * Step 3, the storyboard: each story, slide by slide, until it feels
	 * complete. One story at a time; each slide a card. A slide can be left
	 * empty for the first draft to write. Every change saves to that story's
	 * own history and touches nothing else.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { setStory, uniqueSlideId, historyOf, SLIDES_MOST, type Book, type BookStep, type Story, type Slide } from '@inqbeta/q-core/storybook';
	import StoryList from './StoryList.svelte';
	import SlideCard from './SlideCard.svelte';
	import SlideForm from './SlideForm.svelte';
	import History from './History.svelte';
	let { book, steps, commit, ondone }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; ondone: () => void } = $props();

	let chosen = $state<string | null>(null);
	$effect(() => {
		if (!chosen || !book.stories.some((s) => s.id === chosen)) chosen = book.stories[0]?.id ?? null;
	});
	const story = $derived(book.stories.find((s) => s.id === chosen) ?? null);
	const at = $derived(book.stories.findIndex((s) => s.id === chosen));
	let form = $state<'add' | string | null>(null);

	async function save(next: Story, asks: string, answer: unknown) {
		commit(await setStory(steps, book.id, next, { kind: 'storyboard', asks, answer }));
	}
	function slides(fn: (s: Slide[]) => Slide[], asks: string, answer: unknown) {
		if (story) return save({ ...story, slides: fn(story.slides) }, asks, answer);
	}
	const move = (i: number, by: number) =>
		slides((s) => {
			const n = [...s];
			[n[i], n[i + by]] = [n[i + by], n[i]];
			return n;
		}, 'Move this slide?', by < 0 ? 'up' : 'down');
	const note = (s: Story) => (s.slides.length ? `${s.slides.length} ${s.slides.length === 1 ? 'slide' : 'slides'}` : 'No slides yet');
</script>

{#if !book.stories.length}
	<p>Add the stories first.</p>
{:else}
	<div class="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-6 items-start">
		<StoryList stories={book.stories} {chosen} onchoose={(id) => ((chosen = id), (form = null))} {note} />
		{#if story}
			<section class="flex flex-col gap-4 min-w-0" aria-label={story.title}>
				<div>
					<p class="text-xs opacity-70">Story {at + 1} of {book.stories.length}</p>
					<h2 class="h4 font-normal">{story.title}</h2>
					<p class="text-surface-700-300">How does it unfold, slide by slide? Add slides until it feels complete.</p>
				</div>

				{#each story.slides as slide, i (slide.id)}
					{#if form === slide.id}
						<SlideForm {slide} onsave={async (s, asks) => (await slides((all) => all.map((x) => (x.id === slide.id ? { ...x, ...s, draft: false } : x)), asks, s), (form = null))} oncancel={() => (form = null)} />
					{:else}
						<SlideCard {slide} n={i + 1} look={book.style}>
							{#snippet actions()}
								<button type="button" class="btn preset-tonal min-h-11" onclick={() => (form = slide.id)}>Change</button>
								<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Move slide {i + 1} up" disabled={i === 0} onclick={() => move(i, -1)}><span aria-hidden="true">↑</span></button>
								<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Move slide {i + 1} down" disabled={i === story.slides.length - 1} onclick={() => move(i, 1)}><span aria-hidden="true">↓</span></button>
								<button type="button" class="btn preset-tonal min-h-11" onclick={() => slides((all) => all.filter((x) => x.id !== slide.id), 'Take this slide out?', slide.title || 'an empty slide')}>Take out</button>
							{/snippet}
						</SlideCard>
					{/if}
				{/each}

				{#if form === 'add'}
					<SlideForm first={!story.slides.length} onsave={async (s, asks) => (await slides((all) => [...all, { id: uniqueSlideId(story), ...s, piece: null, draft: false }], asks, s), (form = null))} oncancel={() => (form = null)} />
				{:else if story.slides.length < SLIDES_MOST}
					<div class="flex flex-wrap gap-3">
						<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => (form = 'add')}><Icon name="plus" size={18} /> Add a slide</button>
						<button type="button" class="btn preset-tonal min-h-11" onclick={() => slides((all) => [...all, { id: uniqueSlideId(story), title: '', subtext: '', piece: null, draft: false }], 'Leave a slide for the first draft?', 'yes')}>Leave one for the AI</button>
					</div>
				{/if}

				<div class="flex flex-wrap gap-3 border-t border-surface-200-800 pt-4">
					{#if at < book.stories.length - 1}
						<button type="button" class="btn preset-tonal-primary min-h-11" onclick={() => ((chosen = book.stories[at + 1].id), (form = null))}>This feels complete: next story <Icon name="arrowRight" size={18} /></button>
					{/if}
					<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={ondone}>Done: back to the storyboard <Icon name="arrowRight" size={18} /></button>
				</div>

				<History steps={historyOf(steps, story.id)} title={story.title} />
			</section>
		{/if}
	</div>
{/if}
