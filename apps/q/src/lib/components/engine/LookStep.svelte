<script lang="ts">
	/*
	 * Step 4, the look (Darren, 5 October 2026: "when it comes to the
	 * storyboard, you start making me choose, pick a picture … that's limited
	 * it. I think this is more where we work out the style theme of the
	 * storyboard … someone may want something that's very real … photo style
	 * or gothic style or ink animation style … maybe we offer preset styles to
	 * make it easier rather than let it get too expressive").
	 *
	 * One look for the whole book: a preset, seen as a small sample, and, if
	 * they like, a few words of their own on top. Q then imagines every
	 * picture in that look; nobody picks pictures slide by slide.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { setStyle, STYLES, STYLE_OWN_MOST, type Book, type BookStep, type Style, type StyleKey } from '@inqbeta/q-core/storybook';
	import StyleSwatch from './StyleSwatch.svelte';
	import Dictate from './Dictate.svelte';
	let { book, steps, commit, ondone }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; ondone: () => void } = $props();
	const ASK = 'How should your storyboard look?';
	let key = $state<StyleKey | 'own'>('icons');
	let own = $state('');
	let placed = false;
	$effect(() => {
		if (placed) return;
		placed = true;
		key = book.style?.key ?? 'icons';
		own = book.style?.own ?? '';
	});
	const all = Object.entries(STYLES) as [StyleKey, (typeof STYLES)[StyleKey]][];
	const id = $props.id();
	const ok = $derived(key !== 'own' || own.trim().length > 0);
	const imagined = $derived(book.stories.some((s) => s.slides.some((x) => x.scene)));
	const changed = $derived(!!book.style && (book.style.key !== key || (book.style.own ?? '') !== own.trim()));
	async function use() {
		const style: Style = { key, ...(own.trim() ? { own: own.trim() } : {}) };
		if (!book.style || changed) commit(await setStyle(steps, book.id, style, ASK));
		ondone();
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<h2 class="h4 font-normal">{ASK}</h2>
		<p class="text-surface-700-300">Pick one look for the whole book. Q imagines every picture in it, so you don’t have to.</p>
	</div>

	<fieldset>
		<legend class="sr-only">The look</legend>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
			{#each all as [k, s] (k)}
				<label class="card p-2 flex flex-col gap-2 cursor-pointer border-2 {key === k ? 'border-primary-500 preset-tonal-primary' : 'border-surface-200-800 bg-surface-50-950'}">
					<input type="radio" class="sr-only" name="{id}-look" value={k} checked={key === k} onchange={() => (key = k)} />
					<StyleSwatch style={{ key: k }} />
					<span class="px-1 pb-1 flex items-start gap-2">
						<span class="flex-1"><span class="block">{s.name}</span><span class="block text-xs opacity-70">{s.says}</span></span>
						{#if key === k}<Icon name="check" size={18} stroke={3} />{/if}
					</span>
				</label>
			{/each}
			<label class="card p-2 flex flex-col gap-2 cursor-pointer border-2 {key === 'own' ? 'border-primary-500 preset-tonal-primary' : 'border-surface-200-800 bg-surface-50-950'}">
				<input type="radio" class="sr-only" name="{id}-look" value="own" checked={key === 'own'} onchange={() => (key = 'own')} />
				<StyleSwatch style={{ key: 'own' }}><span class="flex h-full items-center justify-center text-sm opacity-70">Say it in your own words</span></StyleSwatch>
				<span class="px-1 pb-1 flex items-start gap-2"><span class="flex-1"><span class="block">Your own look</span><span class="block text-xs opacity-70">Describe it below</span></span>{#if key === 'own'}<Icon name="check" size={18} stroke={3} />{/if}</span>
			</label>
		</div>
	</fieldset>

	<div class="flex flex-col gap-3">
		<label for="{id}-own" class="h5 font-normal">{key === 'own' ? 'Describe the look' : 'Anything to add? (you can leave this)'}</label>
		<p class="text-surface-700-300 -mt-2">{key === 'own' ? 'Like a 1970s puppet show, or old maps and compasses. However you’d say it.' : 'Like “but in black and white”, or “with our olive green”.'}</p>
		<textarea id="{id}-own" class="textarea" rows="2" maxlength={STYLE_OWN_MOST} bind:value={own}></textarea>
		<div><Dictate bind:value={own} /></div>
	</div>

	{#if imagined && changed}<p class="card preset-tonal p-3">The pictures already imagined were for the old look. Mock up the storyboard again, or redo a story, to see them in the new one.</p>{/if}

	<div class="flex flex-wrap gap-3 border-t border-surface-200-800 pt-4">
		<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!ok} onclick={use}>Use this look: on to the storyboard <Icon name="arrowRight" size={18} /></button>
	</div>
</div>
