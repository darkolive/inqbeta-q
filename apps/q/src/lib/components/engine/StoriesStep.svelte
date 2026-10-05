<script lang="ts">
	/*
	 * Step 2, the stories: the parts of the book, in order, by title only.
	 *
	 * Darren, 5 October 2026: "AI should compile suggested five or six
	 * frames, what it thinks … and from there I'd want to edit or explain with
	 * an audio mic additional information context. That then will build those
	 * six up." So Q suggests first (from the idea and what it was given to
	 * read); the person changes the titles, or says more and asks again; then
	 * uses them. Or adds their own, one at a time. Each change is saved as
	 * it's made. A story's own slides are never touched here.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { setStories, setRefs, noteOutline, freshId, STORIES_MOST, TITLE_MOST, type Book, type BookStep } from '@inqbeta/q-core/storybook';
	import { run, type AiState } from '$lib/story-engine';
	import CostAgree from './CostAgree.svelte';
	import Dictate from './Dictate.svelte';
	let { book, steps, commit, ai, ondone, ondraft }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; ai: AiState; ondone: () => void; ondraft: () => void } = $props();

	/* Q's suggestions, being looked at: titles the person can change before using them. */
	let offered = $state<{ title: string; why: string }[] | null>(null);
	let asking = $state(false);
	let more = $state('');
	let spoke = $state(false);
	const SUGGEST = 'Suggest the stories?';
	async function suggest(agreed: number | 'practice') {
		let out = steps;
		let b = book;
		/* What the person just said or wrote goes with the book from now on, so every later draft knows it too. */
		if (more.trim()) {
			out = await setRefs(out, b.id, [...b.refs, { id: freshId('ref'), kind: spoke ? 'voice' : 'text', name: 'What I said about the stories', text: more }], 'Anything to add or change?', more.trim());
			b = { ...b, refs: [...b.refs, { id: 'new', kind: spoke ? 'voice' : 'text', name: 'What I said about the stories', text: more }] };
		}
		const current = offered?.map((o) => o.title).filter((t) => t.trim());
		const r = await run({ task: 'outline', book: b, more: more.trim() || undefined, current }, agreed);
		offered = r.outline ?? [];
		commit(await noteOutline(out, b.id, offered.map((x) => x.title), SUGGEST, more.trim() || (agreed === 'practice' ? 'practice' : `up to ${agreed} credits`), { upTo: r.upTo, used: r.used, by: r.by }));
		more = '';
		spoke = false;
		asking = false;
	}
	async function useThem() {
		if (!offered) return;
		/* A suggested title that matches a story already here keeps that story (and its slides). */
		const byTitle = new Map(book.stories.map((s) => [s.title.toLowerCase(), s.id]));
		const list = offered.filter((o) => o.title.trim()).map((o) => ({ id: byTitle.get(o.title.trim().toLowerCase()), title: o.title }));
		commit(await setStories(steps, book.id, list, 'Use these stories?'));
		offered = null;
	}
	const moveOffered = (i: number, by: number) => {
		const n = [...offered!];
		[n[i], n[i + by]] = [n[i + by], n[i]];
		offered = n;
	};
	const losing = $derived(offered ? book.stories.filter((s) => s.slides.length && !offered!.some((o) => o.title.trim().toLowerCase() === s.title.toLowerCase())) : []);
	const ASK = 'What are the parts of your book, in order?';
	let adding = $state('');
	let renaming = $state<string | null>(null);
	let renamed = $state('');
	const id = $props.id();
	const list = $derived(book.stories.map((s) => ({ id: s.id, title: s.title })));
	async function save(next: { id?: string; title: string }[]) {
		commit(await setStories(steps, book.id, next, ASK));
	}
	async function add(e: SubmitEvent) {
		e.preventDefault();
		const t = adding.trim();
		if (!t) return;
		await save([...list, { title: t }]);
		adding = '';
	}
	const move = (i: number, by: number) => {
		const next = [...list];
		[next[i], next[i + by]] = [next[i + by], next[i]];
		return save(next);
	};
</script>

<div class="flex flex-col gap-6">
	<div>
		<h2 class="h4 font-normal">{ASK}</h2>
		<p class="text-surface-700-300">Just a title for each, like chapters. Five or six is plenty. You can change them later.</p>
	</div>

	{#if offered}
		<!-- Q's suggestions: change any title, move them, take one out; or say more and ask again. -->
		<section class="card preset-outlined-secondary-500 p-4 sm:p-6 flex flex-col gap-4" aria-label="Suggested stories">
			<h3 class="h5 font-normal">Q suggests these stories</h3>
			<ol class="flex flex-col gap-2">
				{#each offered as o, i (i)}
					<li class="flex flex-wrap items-start gap-3">
						<span class="size-8 mt-1.5 shrink-0 rounded-full border-2 border-secondary-500 flex items-center justify-center tabular-nums" aria-hidden="true">{i + 1}</span>
						<div class="flex-1 min-w-48 flex flex-col gap-1">
							<label class="sr-only" for="{id}-o{i}">Story {i + 1}</label>
							<input id="{id}-o{i}" class="input text-lg" maxlength={TITLE_MOST} bind:value={o.title} />
							{#if o.why}<p class="text-sm text-surface-700-300">{o.why}</p>{/if}
						</div>
						<div class="flex gap-1">
							<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Move story {i + 1} up" disabled={i === 0} onclick={() => moveOffered(i, -1)}><span aria-hidden="true">↑</span></button>
							<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Move story {i + 1} down" disabled={i === offered.length - 1} onclick={() => moveOffered(i, 1)}><span aria-hidden="true">↓</span></button>
							<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Take out story {i + 1}" onclick={() => (offered = offered!.filter((_, k) => k !== i))}><Icon name="close" size={18} /></button>
						</div>
					</li>
				{/each}
			</ol>
			{#if offered.length < STORIES_MOST}<div><button type="button" class="btn preset-tonal min-h-11" onclick={() => (offered = [...offered!, { title: '', why: '' }])}><Icon name="plus" size={18} /> Add one</button></div>{/if}

			{#if asking}
				<div class="flex flex-col gap-3 border-t border-surface-200-800 pt-4">
					<label for="{id}-more" class="h5 font-normal">Anything to add or change?</label>
					<p class="text-surface-700-300 -mt-2">Say what’s missing, what to start with, what matters most. Talk it through: Q keeps it, and every draft after this reads it too.</p>
					<textarea id="{id}-more" class="textarea" rows="4" bind:value={more}></textarea>
					<div><Dictate bind:value={more} onheard={() => (spoke = true)} label="Say it" /></div>
					<CostAgree {ai} job={() => ({ task: 'outline', book, more: more.trim() || undefined, current: offered?.map((o) => o.title).filter((t) => t.trim()) })} what="suggest the stories again, with what you’ve added" onrun={suggest} />
					<div><button type="button" class="btn preset-tonal min-h-11" onclick={() => (asking = false)}>Cancel</button></div>
				</div>
			{:else}
				{#if losing.length}<p class="text-sm">Using these takes out {losing.map((s) => `“${s.title}”`).join(', ')}, which {losing.length === 1 ? 'has' : 'have'} slides. {losing.length === 1 ? 'It stays' : 'They stay'} in the book’s history.</p>{/if}
				<div class="flex flex-wrap gap-3">
					<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!offered.some((o) => o.title.trim())} onclick={useThem}><Icon name="check" size={18} /> Use these stories</button>
					<button type="button" class="btn preset-tonal-primary min-h-11" onclick={() => (asking = true)}><Icon name="mic" size={18} /> Tell Q more, and ask again</button>
					<button type="button" class="btn preset-tonal min-h-11" onclick={() => (offered = null)}>Not these</button>
				</div>
			{/if}
		</section>
	{:else}
		<section class="card preset-tonal p-4 flex flex-col gap-3" aria-label="Let Q suggest the stories">
			<p>Q can suggest five or six stories from your idea{book.refs.length ? ` and the ${book.refs.length === 1 ? 'thing' : `${book.refs.length} things`} you gave it to read` : ''}. You change them, or tell it more, until they’re right.</p>
			<CostAgree {ai} job={() => ({ task: 'outline', book })} what="suggest five or six stories for your book" onrun={suggest} />
		</section>
	{/if}

	{#if list.length && !offered}
		<ol class="flex flex-col gap-2" aria-label="Your stories">
			{#each list as s, i (s.id)}
				<li class="card preset-outlined-surface-200-800 bg-surface-50-950 p-3 flex flex-wrap items-center gap-3">
					<span class="size-8 shrink-0 rounded-full bg-primary-500 text-white flex items-center justify-center tabular-nums" aria-hidden="true">{i + 1}</span>
					{#if renaming === s.id}
						<form class="flex-1 flex flex-wrap gap-2 min-w-0" onsubmit={async (e) => (e.preventDefault(), renamed.trim() && (await save(list.map((x) => (x.id === s.id ? { ...x, title: renamed } : x)))), (renaming = null))}>
							<label class="sr-only" for="{id}-rename">New title for story {i + 1}</label>
							<input id="{id}-rename" class="input flex-1 min-w-40" maxlength={TITLE_MOST} bind:value={renamed} />
							<button class="btn preset-filled-primary-500 min-h-11">Save</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (renaming = null)}>Cancel</button>
						</form>
					{:else}
						<span class="flex-1 min-w-0 text-lg">{s.title}</span>
						<div class="flex gap-1">
							<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Move “{s.title}” up" disabled={i === 0} onclick={() => move(i, -1)}><span aria-hidden="true">↑</span></button>
							<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Move “{s.title}” down" disabled={i === list.length - 1} onclick={() => move(i, 1)}><span aria-hidden="true">↓</span></button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => ((renaming = s.id), (renamed = s.title))}>Rename</button>
							<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Take out “{s.title}”" onclick={() => save(list.filter((x) => x.id !== s.id))}><Icon name="close" size={18} /></button>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}

	{#if list.length < STORIES_MOST && !offered}
		<form class="flex flex-col gap-3" onsubmit={add}>
			<label for="{id}-add" class="h5 font-normal">{list.length ? 'What comes next?' : 'Or write your own: what comes first?'}</label>
			<div class="flex flex-wrap gap-2">
				<input id="{id}-add" class="input flex-1 min-w-48 text-lg" maxlength={TITLE_MOST} bind:value={adding} />
				<button class="btn preset-filled-primary-500 min-h-11" disabled={!adding.trim()}><Icon name="plus" size={18} /> Add</button>
			</div>
		</form>
	{/if}

	{#if list.length && !offered}
		<div class="flex flex-wrap gap-3 border-t border-surface-200-800 pt-4">
			<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={ondraft}>Next: choose the look <Icon name="arrowRight" size={18} /></button>
			<button type="button" class="btn preset-tonal-primary min-h-11" onclick={ondone}>I’ll write the slides myself</button>
		</div>
	{/if}
</div>
