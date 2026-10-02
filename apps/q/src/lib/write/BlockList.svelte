<script lang="ts">
	/*
	 * The body of an article as blocks you work on directly: write into a
	 * paragraph, choose a picture by sight, paste a film's link. A + between
	 * any two adds something; each block moves up or down, or goes.
	 *
	 * Groups (pictures side by side, a picture beside words) hold blocks of
	 * their own, drawn by this same list.
	 */
	import Self from './BlockList.svelte';
	import Words from './Words.svelte';
	import PictureChoice from './PictureChoice.svelte';
	import StylePanel from './StylePanel.svelte';
	import { parseMediaLink, mediaUrl } from '@inqbeta/q-core/embeds';
	import { newId, say, type EditBlock, type EditorContext } from './types';
	import { ALL_ITEMS, make } from './library';
	import { dnd, accepts, dropInto } from './drag.svelte';

	let {
		blocks = $bindable(),
		ctx,
		depth = 0,
		pictureRow = false
	}: { blocks: EditBlock[]; ctx: EditorContext; depth?: number; pictureRow?: boolean } = $props();

	let focusId = $state<string | null>(null);
	/* A block added from the palette or by a drop gets the cursor. */
	$effect(() => {
		const f = dnd.fresh;
		if (f && blocks.some((b) => b.id === f)) {
			focusId = f;
			dnd.fresh = null;
		}
	});
	let over = $state<number | null>(null);
	const canDrop = $derived(accepts(blocks, pictureRow));
	let menuAt = $state<number | null>(null);

	const set = (b: EditBlock, k: string, v: string) => {
		if (v === '') delete b.settings[`q:block/${k}`];
		else b.settings[`q:block/${k}`] = v;
	};

	function insert(at: number, kind: string) {
		const b = make(kind);
		blocks.splice(at, 0, b);
		menuAt = null;
		focusId = b.id;
	}

	function move(i: number, by: number) {
		const j = i + by;
		if (j < 0 || j >= blocks.length) return;
		const [b] = blocks.splice(i, 1);
		blocks.splice(j, 0, b);
	}

	function remove(i: number) {
		blocks.splice(i, 1);
		const prev = blocks[i - 1];
		if (prev) focusId = prev.id;
	}

	const CHOICES = $derived<[string, string][]>(pictureRow ? [['figure', 'Picture']] : ALL_ITEMS.map((i) => [i.kind, i.label]));

	const NAMES: Record<string, string> = {
		text: 'Paragraph',
		heading: 'Heading',
		figure: 'Picture',
		embed: 'Film or recording',
		quote: 'Quote',
		note: 'Note to self',
		divider: 'Line',
		space: 'Space',
		button: 'Button',
		section: 'Group'
	};

	function groupName(b: EditBlock) {
		const a = say(b, 'arrange') || 'grid';
		const n = b.children?.length ?? 0;
		if (a === 'gallery') return `Gallery · ${n} pictures`;
		if (a === 'disclosure') return 'Accordion — folded until opened';
		if (a === 'columns') return `${say(b, 'columns') === '3' ? 'Three' : 'Two'} columns`;
		return a === 'aside' ? 'A picture beside words' : a === 'profile' ? 'A portrait beside a section' : n === 3 ? 'Three pictures in a row' : 'Pictures side by side';
	}

	let links = $state<Record<string, string>>({});
	let styling = $state<string | null>(null);
	const hasStyle = (b: EditBlock) => Object.keys(b.settings).some((k) => k.startsWith('q:style/'));
</script>

{#snippet slot(at: number)}
	{#if canDrop}
		<div
			role="presentation"
			class="my-1 rounded-base border-2 border-dashed text-center text-xs transition-all {over === at ? 'border-primary-500 bg-primary-500/20 py-4 font-medium text-primary-700-300' : 'border-primary-500/50 bg-primary-500/5 py-1.5'}"
			ondragover={(e) => {
				e.preventDefault();
				over = at;
			}}
			ondragleave={() => (over = over === at ? null : over)}
			ondrop={(e) => {
				e.preventDefault();
				over = null;
				dropInto(blocks, at, pictureRow);
			}}
		>
			{over === at ? 'Drop it here' : ''}
		</div>
	{/if}
{/snippet}

{#snippet adder(at: number)}
	{@render slot(at)}
	<div class="group/add relative flex h-6 items-center justify-center" class:hidden={canDrop}>
		<div class="absolute inset-x-0 top-1/2 h-px bg-surface-200-800 opacity-0 transition group-hover/add:opacity-100"></div>
		<button
			type="button"
			class="relative z-[1] flex h-6 w-6 items-center justify-center rounded-full border border-surface-300-700 bg-surface-50-950 text-sm opacity-40 transition hover:opacity-100 focus:opacity-100 {menuAt === at ? 'opacity-100' : ''}"
			title="Add something here"
			onclick={() => (menuAt = menuAt === at ? null : at)}>+</button
		>
	</div>
	{#if menuAt === at}
		<div class="mb-2 flex flex-wrap justify-center gap-1">
			{#each CHOICES as [kind, label] (kind)}
				<button type="button" class="btn btn-sm preset-tonal" onclick={() => insert(at, kind)}>{label}</button>
			{/each}
		</div>
	{/if}
{/snippet}

<div class={pictureRow ? 'grid gap-3 sm:grid-cols-3' : 'flex flex-col'}>
	{#if !pictureRow}{@render adder(0)}{/if}
	{#each blocks as b, i (b.id)}
		{@const feature = b.kind === 'embed' && say(b, 'size') === 'feature'}
		<div
			role="group"
			aria-label={NAMES[b.kind] ?? b.kind}
			class="group/block relative rounded-container border p-2 transition hover:border-surface-400-600 hover:bg-surface-100-900/50 {dnd.here?.list === blocks && dnd.here.index === i ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-transparent'} {b.kind === 'note' ? 'bg-warning-50-950/40' : ''} {dnd.now?.what === 'move' && dnd.now.id === b.id ? 'opacity-40' : ''}"
			onfocusin={(e) => {
				e.stopPropagation();
				dnd.here = { list: blocks, index: i, pictureOnly: pictureRow };
			}}
		>
			<div class="mb-1 flex items-center justify-between gap-2 text-xs opacity-60 group-hover/block:opacity-100">
				<span class="flex items-center gap-1.5 font-mono uppercase tracking-wide">
					<span
						draggable="true"
						class="cursor-grab select-none px-1 text-base leading-none active:cursor-grabbing"
						title="Drag to move"
						aria-hidden="true"
						ondragstart={(e) => {
							e.stopPropagation();
							dnd.now = { what: 'move', from: blocks, id: b.id, kind: b.kind };
							e.dataTransfer?.setData('text/plain', b.id);
							if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
						}}
						ondragend={() => (dnd.now = null)}>⠿</span
					>{b.kind === 'section' ? groupName(b) : feature ? 'Film at the end' : NAMES[b.kind] ?? b.kind}</span>
				<span class="flex gap-1">
					{#if b.kind !== 'note'}
						<button
							type="button"
							class="btn btn-sm px-2 {styling === b.id ? 'preset-filled' : ''}"
							title="How it looks"
							onclick={() => (styling = styling === b.id ? null : b.id)}>Style{hasStyle(b) ? ' •' : ''}</button
						>
					{/if}
					<button type="button" class="btn btn-sm px-1" title="Move up" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
					<button type="button" class="btn btn-sm px-1" title="Move down" disabled={i === blocks.length - 1} onclick={() => move(i, 1)}>↓</button>
					<button type="button" class="btn btn-sm px-1" title="Remove" onclick={() => remove(i)}>✕</button>
				</span>
			</div>

			{#if b.kind === 'text'}
				<Words
					value={say(b, 'says')}
					focus={focusId === b.id}
					onchange={(v) => set(b, 'says', v)}
					onenter={() => insert(i + 1, 'text')}
					onempty={() => remove(i)}
				/>
			{:else if b.kind === 'heading'}
				<div class="flex items-center gap-2">
					<div class="flex-1">
						<Words value={say(b, 'says')} big marks={false} focus={focusId === b.id} placeholder="A heading" onchange={(v) => set(b, 'says', v)} onenter={() => insert(i + 1, 'text')} onempty={() => remove(i)} />
					</div>
					<select
						class="select select-sm w-auto"
						title="How big"
						value={String(b.settings['q:block/level'] ?? (say(b, 'size') === 'medium' ? 3 : say(b, 'size') === 'small' ? 4 : 2))}
						onchange={(e) => {
							const n = Number(e.currentTarget.value);
							b.settings['q:block/size'] = n === 2 ? 'large' : n === 3 ? 'medium' : 'small';
							if (n > 3) b.settings['q:block/level'] = n;
							else delete b.settings['q:block/level'];
						}}
					>
						<option value="2">Heading</option>
						<option value="3">Smaller heading</option>
						<option value="4">Small heading</option>
					</select>
				</div>
			{:else if b.kind === 'quote'}
				<div class="border-l-4 border-primary-500 pl-2 italic">
					<Words value={say(b, 'says')} focus={focusId === b.id} placeholder="Somebody else's words" onchange={(v) => set(b, 'says', v)} onempty={() => remove(i)} />
				</div>
			{:else if b.kind === 'note'}
				<Words value={say(b, 'says')} marks={false} focus={focusId === b.id} placeholder="A note to yourself — never shown on the site" onchange={(v) => set(b, 'says', v)} onempty={() => remove(i)} />
			{:else if b.kind === 'figure'}
				<PictureChoice pictures={ctx.pictures} origin={ctx.origin} value={say(b, 'at')} onchange={(a) => set(b, 'at', a)} />
				<label class="label mt-2">
					<span class="label-text text-xs">What is in it? <span class="opacity-60">— read aloud to anyone who cannot see it</span></span>
					<textarea class="textarea text-sm" rows="2" value={say(b, 'alt')} oninput={(e) => set(b, 'alt', e.currentTarget.value)}></textarea>
				</label>
				<label class="label mt-1">
					<span class="label-text text-xs">Caption or credit <span class="opacity-60">— optional, shown under it</span></span>
					<input class="input input-sm" value={say(b, 'caption')} oninput={(e) => set(b, 'caption', e.currentTarget.value)} />
				</label>
				{#if !pictureRow && depth === 0}
					<button
						type="button"
						class="btn btn-sm preset-tonal mt-2"
						onclick={() => {
							blocks[i] = { kind: 'section', id: newId('section'), settings: { 'q:block/arrange': 'grid' }, children: [b, make('figure')] };
						}}>Add one beside it</button
					>
				{/if}
			{:else if b.kind === 'embed'}
				{@const current = say(b, 'provider') && say(b, 'media') ? mediaUrl({ provider: say(b, 'provider') as never, media: say(b, 'media') }) : ''}
				<label class="label">
					<span class="label-text text-xs">Paste its link — YouTube, Vimeo, Dailymotion or SoundCloud</span>
					<input
						class="input input-sm"

						value={links[b.id] ?? current}
						oninput={(e) => {
							links[b.id] = e.currentTarget.value;
							const m = parseMediaLink(e.currentTarget.value);
							if (m) {
								b.settings['q:block/provider'] = m.provider;
								b.settings['q:block/media'] = m.media;
							}
						}}
					/>
				</label>
				{#if links[b.id] && !parseMediaLink(links[b.id])}
					<p class="text-xs text-error-600-400">That link is not one of the four we can play.</p>
				{:else if current}
					<p class="text-xs opacity-70">{say(b, 'provider')} · {say(b, 'media')}</p>
				{/if}
				<div class="mt-1 grid gap-2 sm:grid-cols-2">
					<label class="label"><span class="label-text text-xs">What it is called</span><input class="input input-sm" value={say(b, 'says')} oninput={(e) => set(b, 'says', e.currentTarget.value)} /></label>
					<label class="label"><span class="label-text text-xs">Who made it</span><input class="input input-sm" value={say(b, 'caption')} oninput={(e) => set(b, 'caption', e.currentTarget.value)} /></label>
				</div>
				{#if depth === 0}
					<label class="mt-2 flex items-center gap-2 text-xs">
						<input type="checkbox" class="checkbox" checked={feature} onchange={(e) => set(b, 'size', e.currentTarget.checked ? 'feature' : '')} />
						The film at the end of the article
					</label>
				{/if}
			{:else if b.kind === 'divider'}
				<hr class="hr" />
			{:else if b.kind === 'space'}
				<select class="select select-sm w-auto" value={say(b, 'size') || 'small'} onchange={(e) => set(b, 'size', e.currentTarget.value)}>
					<option value="small">A little space</option>
					<option value="large">A lot of space</option>
				</select>
			{:else if b.kind === 'button'}
				<div class="grid gap-2 sm:grid-cols-2">
					<label class="label"><span class="label-text text-xs">What it says</span><input class="input input-sm" value={say(b, 'says')} oninput={(e) => set(b, 'says', e.currentTarget.value)} /></label>
					<label class="label"><span class="label-text text-xs">Where it goes</span><input class="input input-sm" value={say(b, 'to')} oninput={(e) => set(b, 'to', e.currentTarget.value)} /></label>
				</div>
			{:else if b.kind === 'section'}
				{@const arrange = say(b, 'arrange') || 'grid'}
				{#if arrange === 'gallery'}
					<Self bind:blocks={b.children!} {ctx} depth={depth + 1} pictureRow />
					<button type="button" class="btn btn-sm preset-tonal mt-2" onclick={() => b.children!.push(make('figure'))}>Add a picture</button>
				{:else if arrange === 'disclosure'}
					<label class="label mb-2">
						<span class="label-text text-xs">What it says when folded</span>
						<input class="input input-sm" value={say(b, 'says')} oninput={(e) => set(b, 'says', e.currentTarget.value)} />
					</label>
					<div class="border-l-2 border-surface-300-700 pl-3">
						<Self bind:blocks={b.children!} {ctx} depth={depth + 1} />
					</div>
				{:else if arrange === 'columns'}
					<select class="select select-sm mb-2 w-auto" value={say(b, 'columns') || '2'} onchange={(e) => set(b, 'columns', e.currentTarget.value)}>
						<option value="2">Two columns</option>
						<option value="3">Three columns</option>
					</select>
					<p class="hint mb-1">Each block below sits in its own column, in order.</p>
					<div class="border-l-2 border-surface-300-700 pl-3">
						<Self bind:blocks={b.children!} {ctx} depth={depth + 1} />
					</div>
				{:else if arrange === 'grid' && (b.children ?? []).every((c) => c.kind === 'figure' || c.kind === 'embed')}
					<Self bind:blocks={b.children!} {ctx} depth={depth + 1} pictureRow />
					{#if (b.children?.length ?? 0) < 3}
						<button type="button" class="btn btn-sm preset-tonal mt-2" onclick={() => b.children!.push(make('figure'))}>Add another picture</button>
					{/if}
				{:else}
					<div class="border-l-2 border-surface-300-700 pl-3">
						<Self bind:blocks={b.children!} {ctx} depth={depth + 1} />
					</div>
				{/if}
			{:else}
				<p class="text-sm opacity-70">A {b.kind} block — edited in the text view for now.</p>
			{/if}
			{#if styling === b.id}
				<StylePanel settings={b.settings} group={b.kind === 'section'} />
			{/if}
		</div>
		{#if !pictureRow}{@render adder(i + 1)}{/if}
	{/each}
	{#if pictureRow}{@render slot(blocks.length)}{/if}
</div>
