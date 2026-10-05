<script lang="ts">
	/*
	 * Step 1, the main idea: the book's title, then its subtext, then what Q
	 * should read to understand it (links, documents, words written or said).
	 * One question at a time; each answer shown back.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { setIdea, TITLE_MOST, SUBTEXT_MOST, type Book, type BookStep } from '@inqbeta/q-core/storybook';
	import AskOne from './AskOne.svelte';
	import RefsPanel from './RefsPanel.svelte';
	let { book, steps, commit, ondone }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; ondone: () => void } = $props();
	const Q1 = 'What is your book called?';
	const Q2 = 'In a line or two: what is it about, and who is it for?';
	let q = $state(0);
	let title = $state('');
	let subtext = $state('');
	/* Where to start, once: the first question not yet answered. */
	let placed = false;
	$effect(() => {
		title = book.title;
		subtext = book.subtext;
		if (!placed) {
			placed = true;
			q = !book.title ? 0 : !book.subtext ? 1 : 2;
		}
	});
	async function save(asks: string, t: string, s: string) {
		if (t === book.title && s === book.subtext) return;
		commit(await setIdea(steps, book.id, { title: t, subtext: s }, asks));
	}
</script>

<div class="flex flex-col gap-6">
	{#if q > 0 && book.title}
		<div class="flex flex-wrap gap-2">
			<button type="button" class="chip preset-tonal min-h-11" onclick={() => (q = 0)}>You called it: “{book.title}” · change</button>
			{#if q > 1 && book.subtext}<button type="button" class="chip preset-tonal min-h-11 text-left" onclick={() => (q = 1)}>It’s about: “{book.subtext}” · change</button>{/if}
		</div>
	{/if}
	{#key q}
		{#if q === 0}
			<AskOne question={Q1} hint="A few words. You can change it any time." most={TITLE_MOST} bind:value={title} onnext={async (v) => (await save(Q1, v, book.subtext), (q = 1))} />
		{:else if q === 1}
			<AskOne question={Q2} hint="Say it as you’d say it to a friend. This sits under the title." lines={3} most={SUBTEXT_MOST} bind:value={subtext} onback={() => (q = 0)} onnext={async (v) => (await save(Q2, book.title || title, v), (q = 2))} />
		{:else}
			<RefsPanel {book} {steps} {commit} />
			<div class="flex flex-wrap gap-3 border-t border-surface-200-800 pt-4">
				<button type="button" class="btn preset-tonal min-h-11" onclick={() => (q = 1)}>Back</button>
				<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={ondone}>Next: the stories <Icon name="arrowRight" size={18} /></button>
			</div>
		{/if}
	{/key}
</div>
