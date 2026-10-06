<script lang="ts">
	/*
	 * Make it final (ADR-Q-033, the polished build; 6 October 2026). Darren:
	 * "a really, really polished end product that you kind of like, I want to
	 * put this out, put my name to it … that kind of liquid feel, you know,
	 * where two people look like they're talking to each other … worth waiting
	 * five, ten minutes for a proper build."
	 *
	 * The whole story's cost is agreed once. Then, slide by slide: the stronger
	 * model draws it (carrying on the slide before), Q takes pictures of it
	 * playing, the model looks at them and refines it, twice. Each finished
	 * slide is kept as it's done, so stopping, or a failure, loses nothing
	 * already built. Words never change.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { REVIEW_AT, REVIEW_ROUNDS } from '@inqbeta/q-core/art-ai';
	import { finished, setStory, slideSeconds, unfinishedOf, type Book, type BookStep, type Story } from '@inqbeta/q-core/storybook';
	import { runArt, type AiState } from '$lib/story-engine';
	import { framesOf, keepArt } from '$lib/story-art';
	import CostAgree from './CostAgree.svelte';
	let { book, steps, commit, ai, story }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; ai: AiState; story: Story } = $props();

	const done = $derived(finished(story));
	let again = $state(false);
	let building = $state(false);
	let stop = $state(false);
	let said = $state('');
	let progress = $state<{ slide: number; of: number; doing: string } | null>(null);
	let frames = $state<string[]>([]);
	let notes = $state('');

	async function build(agreed: number | 'practice') {
		building = true;
		stop = false;
		said = '';
		let used = 0;
		const id = story.id;
		const left = () => (agreed === 'practice' ? 'practice' : Math.max(0, Math.round((agreed - used) * 100) / 100));
		try {
			const n = story.slides.length;
			let before: string | undefined;
			for (let i = 0; i < n; i++) {
				if (stop) break;
				const now = book.stories.find((s) => s.id === id);
				if (!now) throw new Error('The story was taken out.');
				const slide = now.slides[i];
				const seconds = slideSeconds(now, i);
				progress = { slide: i + 1, of: n, doing: 'Drawing it' };
				frames = [];
				let r = await runArt({ task: 'art', book, story: id, slide: slide.id, ...(before ? { before } : {}) }, left());
				used += r.used;
				let svg = r.art.svg;
				let dropped = r.art.dropped;
				notes = r.art.notes;
				let spent = r.upTo;
				for (let round = 1; round <= REVIEW_ROUNDS && !stop; round++) {
					progress = { slide: i + 1, of: n, doing: `Watching it play (look ${round} of ${REVIEW_ROUNDS})` };
					const shots = await framesOf(svg, seconds, REVIEW_AT);
					frames = shots.map((f) => f.image);
					progress = { slide: i + 1, of: n, doing: `Making it better (look ${round} of ${REVIEW_ROUNDS})` };
					r = await runArt({ task: 'art-review', book, story: id, slide: slide.id, svg, frames: shots, dropped, round }, left());
					used += r.used;
					spent += r.upTo;
					svg = r.art.svg;
					dropped = r.art.dropped;
					notes = r.art.notes;
				}
				const hash = await keepArt(svg);
				const latest = book.stories.find((s) => s.id === id)!;
				const next: Story = { ...latest, slides: latest.slides.map((s) => (s.id === slide.id ? { ...s, art: { hash, seconds, ...(r.model ? { model: r.model } : {}) } } : s)) };
				commit(await setStory(steps, book.id, next, { kind: 'final', asks: 'Make it final?', answer: { slide: slide.title, notes }, cost: { upTo: spent, used: r.by === 'practice' ? 0 : used, by: r.by } }));
				before = svg;
			}
			progress = null;
			again = false;
		} catch (e) {
			said = `${e instanceof Error ? e.message : String(e)} The slides already finished are kept.`;
		}
		building = false;
	}
	async function takeOff() {
		commit(await setStory(steps, book.id, unfinishedOf(story), { kind: 'final', asks: 'Take off the final build?', answer: 'yes' }));
	}
</script>

<section class="card preset-outlined-surface-200-800 p-4 sm:p-6 flex flex-col gap-3 w-full max-w-3xl" aria-label="Make it final">
	{#if building && progress}
		<p class="h6 font-normal">Making “{story.title}” final</p>
		<p aria-live="polite">Slide {progress.slide} of {progress.of}: {progress.doing}…</p>
		<div class="h-2 w-full rounded-full bg-surface-200-800 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress.of} aria-valuenow={progress.slide - 1} aria-label="Slides finished"><div class="h-full bg-primary-500 transition-[width] duration-500 motion-reduce:transition-none" style="width:{((progress.slide - 1) / progress.of) * 100}%"></div></div>
		{#if frames.length}
			<div class="grid grid-cols-4 gap-2" aria-label="What the AI is looking at">
				{#each frames as f, i (i)}<img src={f} alt="Frame {i + 1} of the slide as it plays" class="w-full rounded-base border border-surface-200-800" />{/each}
			</div>
		{/if}
		{#if notes}<p class="text-sm text-surface-700-300">{notes}</p>{/if}
		<p class="text-sm text-surface-700-300">Keep this page open. Each slide is kept as it’s finished.</p>
		<div><button type="button" class="btn preset-tonal min-h-11" disabled={stop} onclick={() => (stop = true)}>{stop ? 'Stopping after this step…' : 'Stop'}</button></div>
	{:else if done && !again}
		<p class="h6 font-normal flex items-center gap-2"><Icon name="check" size={18} stroke={3} /> Final build</p>
		<p class="text-surface-700-300">Every slide is drawn by {story.slides[0]?.art?.model ?? 'the AI'}. Play it to see.</p>
		<div class="flex flex-wrap gap-3">
			<button type="button" class="btn preset-tonal-primary min-h-11" onclick={() => (again = true)}><Icon name="repeat" size={18} /> Build it again</button>
			<button type="button" class="btn preset-tonal min-h-11" onclick={takeOff}>Take off the final build</button>
		</div>
	{:else}
		<p class="h6 font-normal">{again ? 'Build it again' : 'Make it final'}</p>
		<p class="text-surface-700-300">For something to put your name to. {ai.finalModel ? `${ai.finalModel} draws` : 'The stronger AI draws'} every slide by hand: people who turn and talk, things that travel and settle, charts that draw themselves. Then it watches each one play and makes it better, twice. It takes a few minutes; the words stay as they are.</p>
		<CostAgree {ai} job={() => ({ task: 'final', book, story: story.id })} what="make “{story.title}” final: {story.slides.length} slides, each drawn and refined twice" onrun={build} />
		{#if again}<div><button type="button" class="btn preset-tonal min-h-11" onclick={() => (again = false)}>Cancel</button></div>{/if}
	{/if}
	{#if said}<p class="text-error-700-300" role="alert">{said}</p>{/if}
</section>
