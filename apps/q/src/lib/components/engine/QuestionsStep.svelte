<script lang="ts">
	/*
	 * Step 2, Q's questions (Darren, 5 October 2026: "these questions and
	 * answers received, which then present the next question … the questions
	 * aren't rigid questions. They are just helping perfect the prompt").
	 *
	 * The AI asks, one question at a time, each chosen from the idea, what it
	 * read, and every answer so far: the questions it would want answered to
	 * write something wonderful. It says what it understands so far, so the
	 * person sees they've been heard. Each can be answered in their own words
	 * (typed or said), by tapping a likely answer, or with "You decide", which
	 * gives the AI free rein there. "That's enough" goes on at any time. One
	 * cost agreement covers the whole conversation.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { setBrief, BRIEF_MOST, ANSWER_MOST, type Book, type BookStep, type BriefAnswer, type Cost } from '@inqbeta/q-core/storybook';
	import type { NextQuestion } from '@inqbeta/q-core/story-ai';
	import { run, type AiState } from '$lib/story-engine';
	import CostAgree from './CostAgree.svelte';
	import Dictate from './Dictate.svelte';
	let { book, steps, commit, ai, ondone }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; ai: AiState; ondone: () => void } = $props();

	/* The agreement for this conversation: up to so much a question, or practice. */
	let agreed = $state<number | 'practice' | null>(null);
	let current = $state<NextQuestion | null>(null);
	let lastCost = $state<Cost | undefined>(undefined);
	let answer = $state('');
	let busy = $state(false);
	let said = $state('');
	let editing = $state<number | null>(null);
	let edited = $state('');
	const id = $props.id();
	const finished = $derived(!!current && current.question === null);

	async function ask(b: Book, deal: number | 'practice') {
		busy = true;
		said = '';
		try {
			const r = await run({ task: 'ask', book: b }, deal);
			current = r.next ?? { understood: '', question: null, why: '', options: [] };
			lastCost = { upTo: r.upTo, used: r.used, by: r.by };
			answer = '';
		} catch (e) {
			said = e instanceof Error ? e.message : String(e);
		}
		busy = false;
	}
	async function start(deal: number | 'practice') {
		agreed = deal;
		await ask(book, deal);
	}
	async function reply(text: string, free = false) {
		if (!current?.question || agreed === null) return;
		const a: BriefAnswer = { asks: current.question, ...(current.why ? { why: current.why } : {}), answer: free ? '' : text.trim(), ...(free ? { free: true } : {}) };
		/* Read once, before the commit: the book prop follows the new steps straight after. */
		const b = { ...book, brief: [...book.brief, a] };
		commit(await setBrief(steps, book.id, b.brief, current.question, free ? 'you decide' : text.trim(), lastCost));
		if (b.brief.length >= BRIEF_MOST) current = { understood: current.understood, question: null, why: '', options: [] };
		else await ask(b, agreed);
	}
	async function saveEdit(i: number) {
		const brief = book.brief.map((a, k) => (k === i ? { ...a, answer: edited.trim(), free: !edited.trim() } : a));
		commit(await setBrief(steps, book.id, brief, `Change your answer to “${book.brief[i].asks}”?`, edited.trim() || 'you decide'));
		editing = null;
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<h2 class="h4 font-normal">Q’s questions</h2>
		<p class="text-surface-700-300">Q asks what it needs to know, one question at a time. Answer however it comes out, tap a suggestion, or say “You decide”.</p>
	</div>

	{#if book.brief.length}
		<ol class="flex flex-col gap-2" aria-label="Your answers so far">
			{#each book.brief as a, i (i)}
				<li class="card preset-outlined-surface-200-800 bg-surface-50-950 p-3 flex flex-col gap-2">
					<p class="text-sm opacity-70">{a.asks}</p>
					{#if editing === i}
						<label class="sr-only" for="{id}-edit">Your answer</label>
						<textarea id="{id}-edit" class="textarea" rows="3" maxlength={ANSWER_MOST} bind:value={edited}></textarea>
						<div class="flex flex-wrap gap-2">
							<Dictate bind:value={edited} />
							<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => saveEdit(i)}>Save</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (editing = null)}>Cancel</button>
						</div>
					{:else}
						<div class="flex flex-wrap items-start gap-2">
							<p class="flex-1 min-w-0">{a.free ? 'You decide' : a.answer}</p>
							<button type="button" class="btn-sm preset-tonal min-h-11" onclick={() => ((editing = i), (edited = a.answer))}>Change</button>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}

	{#if agreed === null}
		<section class="card preset-tonal p-4 flex flex-col gap-3">
			<p>{book.brief.length ? 'Q can ask you more, to get it just right.' : 'Before it writes anything, Q will ask you a few questions, so it understands what you really want.'}</p>
			<CostAgree {ai} job={() => ({ task: 'ask', book })} what="ask you up to {BRIEF_MOST - book.brief.length} questions, one at a time" times={BRIEF_MOST - book.brief.length} onrun={start} />
		</section>
	{:else if busy && !current?.question}
		<p class="card preset-tonal p-4" aria-live="polite">Q is thinking about what to ask…</p>
	{:else if current?.question}
		<section class="card preset-outlined-primary-500 p-4 sm:p-6 flex flex-col gap-4" aria-busy={busy}>
			{#if current.understood}<p class="text-sm"><span class="opacity-70">Q understands:</span> {current.understood}</p>{/if}
			<p class="text-xs opacity-70">Question {book.brief.length + 1}{current.why ? ` · ${current.why}` : ''}</p>
			<form class="flex flex-col gap-4" onsubmit={(e) => (e.preventDefault(), answer.trim() && reply(answer))}>
				<label for="{id}-a" class="h4 font-normal">{current.question}</label>
				{#if current.options.length}
					<div class="flex flex-wrap gap-2" role="group" aria-label="Tap an answer">
						{#each current.options as o (o)}
							<button type="button" class="chip preset-tonal-primary min-h-11" disabled={busy} onclick={() => reply(o)}>{o}</button>
						{/each}
					</div>
				{/if}
				<textarea id="{id}-a" class="textarea text-lg" rows="3" maxlength={ANSWER_MOST} bind:value={answer}></textarea>
				<div class="flex flex-wrap items-start gap-3">
					<Dictate bind:value={answer} />
					<button class="btn preset-filled-primary-500 min-h-11" disabled={busy || !answer.trim()}>{busy ? 'Thinking…' : 'Answer'} <Icon name="arrowRight" size={18} /></button>
					<button type="button" class="btn preset-tonal min-h-11" disabled={busy} onclick={() => reply('', true)}>You decide</button>
				</div>
			</form>
		</section>
	{:else if finished}
		<section class="card preset-tonal p-4 flex flex-col gap-2" aria-live="polite">
			<p class="h5 font-normal">Q has what it needs.</p>
			{#if current?.understood}<p><span class="opacity-70">Q understands:</span> {current.understood}</p>{/if}
		</section>
	{/if}
	{#if said}<p class="text-error-700-300" role="alert">{said}</p>{/if}

	<div class="flex flex-wrap gap-3 border-t border-surface-200-800 pt-4">
		<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={ondone}>{finished || !current?.question ? (book.course ? 'Next: what you’ll learn' : 'Next: the stories') : 'That’s enough, go on'} <Icon name="arrowRight" size={18} /></button>
	</div>
</div>
