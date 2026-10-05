<script lang="ts">
	/*
	 * Adding (or changing) a slide, one question at a time: what happens, then
	 * a little more. No picture to pick (Darren, 5 October 2026: picking
	 * pictures "is deciding how the story can be told already visually.
	 * That's limited it"): Q imagines each picture in the book's look.
	 * Changing a slide shows its words and the picture Q imagined, which can
	 * be changed or cleared for Q to imagine again.
	 */
	import { TITLE_MOST, SUBTEXT_MOST, SCENE_MOST, type Slide } from '@inqbeta/q-core/storybook';
	import AskOne from './AskOne.svelte';
	import Dictate from './Dictate.svelte';
	let { slide = null, first = false, onsave, oncancel }: { slide?: Slide | null; first?: boolean; onsave: (s: { title: string; subtext: string; scene?: string }, asks: string) => void; oncancel: () => void } = $props();
	const Q1 = $derived(first ? 'What happens first?' : 'What happens next?');
	const Q2 = 'Say a little more.';
	let q = $state(0);
	let title = $state('');
	let subtext = $state('');
	let scene = $state('');
	const id = $props.id();
	$effect(() => {
		title = slide?.title ?? '';
		subtext = slide?.subtext ?? '';
		scene = slide?.scene ?? '';
	});
</script>

<div class="card preset-outlined-primary-500 p-4 sm:p-6 flex flex-col gap-6">
	{#if slide}
		<form class="flex flex-col gap-4" onsubmit={(e) => (e.preventDefault(), onsave({ title, subtext, scene }, 'Change this slide?'))}>
			<label class="label"><span class="label-text">The line</span><input id="{id}-t" class="input text-lg" maxlength={TITLE_MOST} bind:value={title} /></label>
			<label class="label"><span class="label-text">A little more</span><textarea class="textarea" rows="3" maxlength={SUBTEXT_MOST} bind:value={subtext}></textarea></label>
			<label class="label"><span class="label-text">The picture Q imagined (change it, or clear it for Q to imagine again)</span><textarea class="textarea" rows="2" maxlength={SCENE_MOST} bind:value={scene}></textarea></label>
			<div><Dictate bind:value={scene} label="Say the picture" /></div>
			<div class="flex gap-3"><button class="btn preset-filled-primary-500 min-h-11" disabled={!title.trim() && !subtext.trim()}>Save the slide</button><button type="button" class="btn preset-tonal min-h-11" onclick={oncancel}>Cancel</button></div>
		</form>
	{:else}
		{#key q}
			{#if q === 0}
				<AskOne question={Q1} hint="One idea. A few words." most={TITLE_MOST} bind:value={title} onnext={() => (q = 1)} onback={oncancel} />
			{:else if q === 1}
				<p class="chip preset-tonal self-start">“{title}”</p>
				<AskOne question={Q2} hint="One or two short sentences. Leave it empty and Q will write it. Q imagines the picture." lines={3} most={SUBTEXT_MOST} optional next="Add the slide" empty="Leave it to Q" bind:value={subtext} onnext={(v) => onsave({ title, subtext: v }, Q1)} onback={() => (q = 0)} />
			{/if}
		{/key}
	{/if}
</div>
