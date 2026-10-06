<script lang="ts">
	/*
	 * Bring a story to life (ADR-Q-033; 6 October 2026). Darren: "a simple
	 * draft experience where you're just seeing stills, but to really feel it
	 * … we want to see those moving parts and charts moving." A draft is
	 * stills; this is the step worth paying for: Q's AI choreographs each slide
	 * (a scene recipe: which pieces, where, what they do), and the player
	 * performs it. The cost is agreed first; the words never change; back to
	 * stills at any time. Each is kept in the story's history.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { drawsItself, moves, setStory, stillsOf, type Book, type BookStep, type Story } from '@inqbeta/q-core/storybook';
	import { run, type AiState } from '$lib/story-engine';
	import CostAgree from './CostAgree.svelte';
	let { book, steps, commit, ai, story }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; ai: AiState; story: Story } = $props();
	const ASKS = 'Bring this story to life?';
	const alive = $derived(moves(story));
	let again = $state(false);
	async function animate(agreed: number | 'practice') {
		const r = await run({ task: 'animate', book, story: story.id }, agreed);
		if (!r.story) throw new Error('Nothing came back. Nothing was changed.');
		commit(await setStory(steps, book.id, r.story, { kind: 'animate', asks: ASKS, answer: agreed === 'practice' ? 'practice' : `up to ${agreed} credits`, cost: { upTo: r.upTo, used: r.used, by: r.by } }));
		again = false;
	}
	async function stills() {
		commit(await setStory(steps, book.id, stillsOf(story), { kind: 'animate', asks: 'Back to stills?', answer: 'yes' }));
	}
</script>

<section class="card preset-outlined-surface-200-800 p-4 sm:p-6 flex flex-col gap-3 w-full max-w-3xl" aria-label="Bring it to life">
	{#if !drawsItself(book.style)}
		<p class="h6 font-normal">Moving pictures</p>
		<p class="text-surface-700-300">For this look, moving pictures are made from each scene later. Q’s own icons can move now: choose them in The look to try it.</p>
	{:else if alive && !again}
		<p class="h6 font-normal flex items-center gap-2"><Icon name="play" size={18} /> This story moves</p>
		<p class="text-surface-700-300">Play it to watch. The words are the same as the stills.</p>
		<div class="flex flex-wrap gap-3">
			<button type="button" class="btn preset-tonal-primary min-h-11" onclick={() => (again = true)}><Icon name="repeat" size={18} /> Choreograph it again</button>
			<button type="button" class="btn preset-tonal min-h-11" onclick={stills}>Back to stills</button>
		</div>
	{:else}
		<p class="h6 font-normal">{again ? 'Choreograph it again' : 'Bring it to life'}</p>
		<p class="text-surface-700-300">Right now this story is stills: the draft. Q can choreograph every slide, so things arrive, pass between people, connect, lock and grow while the words are said. The words stay as they are.</p>
		<CostAgree {ai} job={() => ({ task: 'animate', book, story: story.id })} what="bring “{story.title}” to life: the movement for each of its {story.slides.length} slides" onrun={animate} />
		{#if again}<div><button type="button" class="btn preset-tonal min-h-11" onclick={() => (again = false)}>Cancel</button></div>{/if}
	{/if}
</section>
