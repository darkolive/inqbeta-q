<script lang="ts">
	/*
	 * Step 4, the first draft: the AI writes what's missing (empty slides, and
	 * each story brought to three to six), for a cost agreed first. Slides the
	 * person wrote stay word for word. Everything written comes back as a
	 * draft, shown as a draft, until the person keeps it.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { needingWork, setStory, keepDrafts, rejectDraft, rejectDrafts, historyOf, type Book, type BookStep } from '@inqbeta/q-core/storybook';
	import { run, type AiState } from '$lib/story-engine';
	import CostAgree from './CostAgree.svelte';
	import SlideCard from './SlideCard.svelte';
	let { book, steps, commit, ai, ondone }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; ai: AiState; ondone: () => void } = $props();
	const ASK = 'Draft what’s missing?';
	const todo = $derived(needingWork(book));
	const drafted = $derived(book.stories.filter((s) => s.slides.some((x) => x.draft)));
	async function draft(agreed: number | 'practice') {
		const r = await run({ task: 'draft', book }, agreed);
		let out = steps;
		const n = r.stories?.length ?? 0;
		for (const [i, s] of (r.stories ?? []).entries()) {
			/* The cost settles on the last story drafted, so it's counted once. */
			const cost = i === n - 1 ? { upTo: r.upTo, used: r.used, by: r.by } : undefined;
			out = await setStory(out, book.id, s, { kind: 'generate', asks: ASK, answer: agreed === 'practice' ? 'practice' : `up to ${agreed} credits`, cost });
		}
		commit(out);
	}
	async function keep(storyId: string, slide?: string) {
		const s = book.stories.find((x) => x.id === storyId);
		if (s) commit(await setStory(steps, book.id, keepDrafts(s, slide ? [slide] : undefined), { kind: 'keep', asks: slide ? 'Accept this slide?' : 'Accept this story’s drafts?', answer: slide ? 'yes' : 'yes, all of them' }));
	}
	async function reject(storyId: string, slide?: string) {
		const s = book.stories.find((x) => x.id === storyId);
		if (!s) return;
		const h = historyOf(steps, storyId);
		commit(await setStory(steps, book.id, slide ? rejectDraft(s, slide, h) : rejectDrafts(s, h), { kind: 'reject', asks: slide ? 'Reject this slide?' : 'Reject this story’s drafts?', answer: slide ? 'yes' : 'yes, all of them' }));
	}
</script>

<div class="flex flex-col gap-6">
	{#if todo.length}
		<div>
			<h2 class="h4 font-normal">{todo.length === 1 ? 'One story needs' : `${todo.length} stories need`} a first draft</h2>
			<ul class="list-disc pl-6 mt-2">
				{#each todo as s (s.id)}<li>{s.title}: {s.slides.length ? `${s.slides.length} ${s.slides.length === 1 ? 'slide' : 'slides'} so far` : 'no slides yet'}</li>{/each}
			</ul>
			<p class="text-surface-700-300 mt-2">Slides you wrote stay exactly as they are. What the AI writes comes back as a draft for you to keep, change or redo.</p>
		</div>
		<CostAgree {ai} job={() => ({ task: 'draft', book })} what="mock up the storyboard: the slides for {todo.length === 1 ? 'this story' : `these ${todo.length} stories`}{book.refs.length ? ', drawing on what you gave it to read' : ''}" onrun={draft} />
	{:else}
		<p class="h5 font-normal">Every story has its slides.{drafted.length ? ' Accept or reject each draft below.' : ''}</p>
	{/if}

	{#each drafted as s (s.id)}
		<section class="flex flex-col gap-3" aria-label={s.title}>
			<div class="flex flex-wrap items-center gap-3">
				<h3 class="h5 font-normal flex-1">{s.title}</h3>
				<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => keep(s.id)}><Icon name="check" size={18} /> Accept all</button>
				<button type="button" class="btn preset-tonal min-h-11" onclick={() => reject(s.id)}><Icon name="close" size={18} /> Reject all</button>
			</div>
			{#each s.slides as slide, i (slide.id)}<SlideCard {slide} n={i + 1} onkeep={() => keep(s.id, slide.id)} onreject={() => reject(s.id, slide.id)} />{/each}
		</section>
	{/each}

	<div class="flex flex-wrap gap-3 border-t border-surface-200-800 pt-4">
		<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={ondone}>Next: review <Icon name="arrowRight" size={18} /></button>
	</div>
</div>
