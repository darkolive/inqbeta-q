<script lang="ts">
	/*
	 * Step 1, the main idea, one question at a time, each answer shown back:
	 * what kind of book it is (a story book, or a course unit), its title, its
	 * subtext (for a unit, its aim); for a unit, the unit card (level, time to
	 * study, what you need first) and how its teacher teaches; then what Q
	 * should read to understand it (links, documents, words written or said).
	 *
	 * The storyboard for courses (ADR-Q-033, 6 October 2026): a book can be a
	 * course unit, each story one thing you'll learn. The teacher's way of
	 * explaining is described here, typed or said, and every slide is written
	 * in it; the lines are recorded in their own voice later.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { setCourse, setIdea, unitOf, TITLE_MOST, SUBTEXT_MOST, UNIT_MOST, VOICE_MOST, type Book, type BookStep, type Unit } from '@inqbeta/q-core/storybook';
	import AskOne from './AskOne.svelte';
	import RefsPanel from './RefsPanel.svelte';
	let { book, steps, commit, ondone }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; ondone: () => void } = $props();

	const KIND = 'What are you making?';
	const Q1 = $derived(book.course ? 'What is the unit called?' : 'What is your book called?');
	const Q2 = $derived(book.course ? 'In a line or two: what is the unit’s aim?' : 'In a line or two: what is it about, and who is it for?');
	const CARD: { key: Exclude<keyof Unit, 'voice'>; asks: string; hint: string; chip: string }[] = [
		{ key: 'level', asks: 'What level is it?', hint: 'However you’d say it: “Level 2”, “Beginners”.', chip: 'Level' },
		{ key: 'time', asks: 'About how long does it take to study?', hint: '“About two hours”, “Three short sessions”.', chip: 'Time' },
		{ key: 'needFirst', asks: 'What do they need first?', hint: 'Things to have, or to know already. Nothing is fine.', chip: 'Need first' }
	];
	const VOICE = 'How do you teach it?';

	/* The questions, in order: 0 kind, 1 title, 2 subtext, 3–5 the card, 6 the voice, 7 what Q reads. */
	let q = $state(0);
	let title = $state('');
	let subtext = $state('');
	let card = $state<Unit>(unitOf(null));
	/* Where to start, once: the first question not yet answered. */
	let placed = false;
	$effect(() => {
		title = book.title;
		subtext = book.subtext;
		card = unitOf(book.course);
		if (!placed) {
			placed = true;
			q = !steps.length ? 0 : !book.title ? 1 : !book.subtext ? 2 : book.course && !book.course.voice ? (book.course.level ? 6 : 3) : 7;
		}
	});
	async function save(asks: string, t: string, s: string) {
		if (t === book.title && s === book.subtext) return;
		commit(await setIdea(steps, book.id, { title: t, subtext: s }, asks));
	}
	async function kind(course: boolean) {
		if (course !== !!book.course) commit(await setCourse(steps, book.id, course ? unitOf(null) : null, KIND));
		q = 1;
	}
	async function saveCard(asks: string, next: Unit) {
		if (book.course && JSON.stringify(unitOf(next)) === JSON.stringify(unitOf(book.course))) return;
		commit(await setCourse(steps, book.id, next, asks));
	}
	const afterSubtext = $derived(book.course ? 3 : 7);
</script>

<div class="flex flex-col gap-6">
	{#if q > 0 && steps.length}
		<div class="flex flex-wrap gap-2">
			<button type="button" class="chip preset-tonal min-h-11" onclick={() => (q = 0)}>{book.course ? 'A course unit' : 'A story book'} · change</button>
			{#if q > 1 && book.title}<button type="button" class="chip preset-tonal min-h-11" onclick={() => (q = 1)}>You called it: “{book.title}” · change</button>{/if}
			{#if q > 2 && book.subtext}<button type="button" class="chip preset-tonal min-h-11 text-left" onclick={() => (q = 2)}>{book.course ? 'Its aim' : 'It’s about'}: “{book.subtext}” · change</button>{/if}
			{#if book.course}
				{#each CARD as c, i (c.key)}
					{#if q > 3 + i && book.course[c.key]}<button type="button" class="chip preset-tonal min-h-11" onclick={() => (q = 3 + i)}>{c.chip}: {book.course[c.key]} · change</button>{/if}
				{/each}
				{#if q > 6 && book.course.voice}<button type="button" class="chip preset-tonal min-h-11 text-left" onclick={() => (q = 6)}>How you teach: “{book.course.voice.length > 60 ? `${book.course.voice.slice(0, 60)}…` : book.course.voice}” · change</button>{/if}
			{/if}
		</div>
	{/if}
	{#key q}
		{#if q === 0}
			<section class="flex flex-col gap-4" aria-labelledby="engine-kind">
				<h2 id="engine-kind" class="h4 font-normal">{KIND}</h2>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<button type="button" class="card p-4 text-left flex flex-col gap-1 min-h-11 {steps.length && !book.course ? 'preset-filled-primary-500' : 'preset-outlined-surface-200-800 hover:preset-tonal'}" aria-pressed={!!steps.length && !book.course} onclick={() => kind(false)}>
						<span class="h5 font-normal">A story book</span>
						<span class="opacity-80">Explain an idea, picture by picture.</span>
					</button>
					<button type="button" class="card p-4 text-left flex flex-col gap-1 min-h-11 {book.course ? 'preset-filled-primary-500' : 'preset-outlined-surface-200-800 hover:preset-tonal'}" aria-pressed={!!book.course} onclick={() => kind(true)}>
						<span class="h5 font-normal">A course unit</span>
						<span class="opacity-80">Each story is one thing they’ll learn, ending with a Show it.</span>
					</button>
				</div>
			</section>
		{:else if q === 1}
			<AskOne question={Q1} hint="A few words. You can change it any time." most={TITLE_MOST} bind:value={title} onback={() => (q = 0)} onnext={async (v) => (await save(Q1, v, book.subtext), (q = 2))} />
		{:else if q === 2}
			<AskOne question={Q2} hint={book.course ? 'What they’ll be able to do by the end. This sits under the title.' : 'Say it as you’d say it to a friend. This sits under the title.'} lines={3} most={SUBTEXT_MOST} bind:value={subtext} onback={() => (q = 1)} onnext={async (v) => (await save(Q2, book.title || title, v), (q = afterSubtext))} />
		{:else if q >= 3 && q <= 5 && book.course}
			{@const c = CARD[q - 3]}
			<AskOne question={c.asks} hint={c.hint} most={UNIT_MOST} optional empty="Skip" bind:value={card[c.key]} onback={() => (q = q - 1)} onnext={async (v) => (await saveCard(c.asks, { ...card, [c.key]: v }), (q = q + 1))} />
		{:else if q === 6 && book.course}
			<AskOne
				question={VOICE}
				hint="Say it the way you’d explain it to someone in the room: how you start, how you show things, what you never do. Q writes every slide in your way. You record it in your own voice later."
				lines={5}
				most={VOICE_MOST}
				optional
				empty="Let Q choose for now"
				bind:value={card.voice}
				onback={() => (q = 5)}
				onnext={async (v) => (await saveCard(VOICE, { ...card, voice: v }), (q = 7))}
			/>
		{:else}
			<RefsPanel {book} {steps} {commit} />
			<div class="flex flex-wrap gap-3 border-t border-surface-200-800 pt-4">
				<button type="button" class="btn preset-tonal min-h-11" onclick={() => (q = book.course ? 6 : 2)}>Back</button>
				<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={ondone}>Next: Q’s questions <Icon name="arrowRight" size={18} /></button>
			</div>
		{/if}
	{/key}
</div>
