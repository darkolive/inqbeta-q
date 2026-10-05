<script lang="ts">
	/*
	 * What the AI reads to understand the idea (Darren, 5 October 2026: "a
	 * website, documents, some descriptive text, but whatever it is that AI is
	 * going to read to draw from"). Three ways in, one at a time: a web page,
	 * a document, or words written or said. Each one shows what Q read, so
	 * nothing goes to the AI unseen. Saved on the book's own chain.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { setRefs, freshId, wordsIn, REFS_MOST, type Book, type BookStep, type Ref } from '@inqbeta/q-core/storybook';
	import { fileText, READABLE } from '@inqbeta/q-core/doc-text';
	import { readLink } from '$lib/story-engine';
	import Dictate from './Dictate.svelte';
	let { book, steps, commit }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void } = $props();

	const ASK = 'What should Q read to understand it?';
	let way = $state<'link' | 'file' | 'say' | null>(null);
	let url = $state('');
	let words = $state('');
	let spoke = $state(false);
	let busy = $state(false);
	let said = $state('');
	const id = $props.id();

	async function add(r: Omit<Ref, 'id'>, answer: string) {
		commit(await setRefs(steps, book.id, [...book.refs, { ...r, id: freshId('ref') }], ASK, answer));
	}
	async function readIt(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		said = '';
		try {
			const page = await readLink(url.trim());
			await add({ kind: 'link', name: page.name, text: page.text, url: page.url }, `a web page: ${page.url}`);
			url = '';
			way = null;
		} catch (err) {
			said = err instanceof Error ? err.message : String(err);
		}
		busy = false;
	}
	async function files(e: Event) {
		/* Held now: after the first await the event no longer knows its input. */
		const input = e.currentTarget as HTMLInputElement;
		const list = Array.from(input.files ?? []);
		busy = true;
		said = '';
		let next = steps;
		let refs = book.refs;
		const refused: string[] = [];
		for (const f of list) {
			try {
				const text = await fileText(f.name, new Uint8Array(await f.arrayBuffer()));
				refs = [...refs, { id: freshId('ref'), kind: 'file', name: f.name, text }];
				next = await setRefs(next, book.id, refs, ASK, `a document: ${f.name}`);
			} catch (err) {
				refused.push(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		commit(next);
		input.value = '';
		said = refused.join(' ');
		busy = false;
		if (!refused.length) way = null;
	}
	async function keepWords() {
		if (!words.trim()) return;
		await add({ kind: spoke ? 'voice' : 'text', name: spoke ? 'What I said' : 'My notes', text: words }, spoke ? 'said it' : 'wrote it');
		words = '';
		spoke = false;
		way = null;
	}
	async function remove(r: Ref) {
		commit(await setRefs(steps, book.id, book.refs.filter((x) => x.id !== r.id), 'Take this out of what Q reads?', r.name));
	}
	const ICON = { link: 'link', file: 'file', text: 'message', voice: 'mic' } as const;
	const full = $derived(book.refs.length >= REFS_MOST);
</script>

<div class="flex flex-col gap-5">
	<div>
		<h2 class="h4 font-normal">{ASK}</h2>
		<p class="text-surface-700-300">A website, a document, some notes, or just say it. The AI reads these to draw from. You can skip this, and add more later.</p>
	</div>

	{#if book.refs.length}
		<ul class="flex flex-col gap-2" aria-label="What Q reads">
			{#each book.refs as r (r.id)}
				<li class="card preset-outlined-surface-200-800 bg-surface-50-950 p-3 flex flex-col gap-2">
					<div class="flex flex-wrap items-center gap-3">
						<span class="shrink-0 opacity-70"><Icon name={ICON[r.kind]} size={20} /></span>
						<span class="flex-1 min-w-0">
							<span class="block truncate">{r.name}</span>
							<span class="block text-xs opacity-70">{r.kind === 'link' ? 'A web page' : r.kind === 'file' ? 'A document' : r.kind === 'voice' ? 'Said' : 'Written'} · about {wordsIn(r.text)} words</span>
						</span>
						<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Take out “{r.name}”" onclick={() => remove(r)}><Icon name="close" size={18} /></button>
					</div>
					<details>
						<summary class="cursor-pointer text-sm min-h-11 flex items-center">See what Q read</summary>
						<p class="text-sm text-surface-700-300 whitespace-pre-line max-h-48 overflow-y-auto">{r.text}</p>
					</details>
				</li>
			{/each}
		</ul>
	{/if}

	{#if !full}
		{#if way === null}
			<div class="flex flex-wrap gap-3" role="group" aria-label="Add something for Q to read">
				<button type="button" class="btn preset-tonal-primary min-h-11" onclick={() => ((way = 'link'), (said = ''))}><Icon name="link" size={18} /> A web page</button>
				<button type="button" class="btn preset-tonal-primary min-h-11" onclick={() => ((way = 'file'), (said = ''))}><Icon name="file" size={18} /> A document</button>
				<button type="button" class="btn preset-tonal-primary min-h-11" onclick={() => ((way = 'say'), (said = ''))}><Icon name="mic" size={18} /> Write or say it</button>
			</div>
		{:else}
			<div class="card preset-outlined-primary-500 p-4 flex flex-col gap-3" aria-busy={busy}>
				{#if way === 'link'}
					<form class="flex flex-col gap-3" onsubmit={readIt}>
						<label for="{id}-url" class="h5 font-normal">The web page’s address</label>
						<input id="{id}-url" class="input text-lg" type="url" inputmode="url" bind:value={url} />
						<div class="flex flex-wrap gap-3">
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (way = null)}>Cancel</button>
							<button class="btn preset-filled-primary-500 min-h-11" disabled={busy || !url.trim()}>{busy ? 'Reading…' : 'Read it'}</button>
						</div>
					</form>
				{:else if way === 'file'}
					<label for="{id}-file" class="h5 font-normal">Choose documents</label>
					<p class="text-surface-700-300 -mt-2">Text, Markdown, web pages and Word files. For a PDF, copy its words and choose “Write or say it”.</p>
					<input id="{id}-file" class="input" type="file" multiple accept={READABLE.join(',')} disabled={busy} onchange={files} />
					<div><button type="button" class="btn preset-tonal min-h-11" onclick={() => (way = null)}>Cancel</button></div>
				{:else}
					<label for="{id}-words" class="h5 font-normal">Write it, paste it, or say it</label>
					<p class="text-surface-700-300 -mt-2">What it’s about, who it’s for, what you want them to understand. However it comes out.</p>
					<textarea id="{id}-words" class="textarea" rows="6" bind:value={words}></textarea>
					<div class="flex flex-wrap items-start gap-3">
						<button type="button" class="btn preset-tonal min-h-11" onclick={() => (way = null)}>Cancel</button>
						<Dictate bind:value={words} onheard={() => (spoke = true)} />
						<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!words.trim()} onclick={keepWords}>Add it</button>
					</div>
				{/if}
				{#if said}<p class="text-error-700-300" role="alert">{said}</p>{/if}
			</div>
		{/if}
	{/if}
</div>
