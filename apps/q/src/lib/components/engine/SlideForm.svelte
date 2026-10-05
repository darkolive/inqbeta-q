<script lang="ts">
	/*
	 * Adding (or changing) a slide, one question at a time: what happens, then
	 * a little more, then its picture. Changing one shows all three at once,
	 * already filled, since the person knows what they're fixing.
	 */
	import { TITLE_MOST, SUBTEXT_MOST, type Piece, type Slide } from '@inqbeta/q-core/storybook';
	import AskOne from './AskOne.svelte';
	import PiecePicker from './PiecePicker.svelte';
	let { slide = null, first = false, onsave, oncancel }: { slide?: Slide | null; first?: boolean; onsave: (s: { title: string; subtext: string; piece: Piece | null }, asks: string) => void; oncancel: () => void } = $props();
	const Q1 = $derived(first ? 'What happens first?' : 'What happens next?');
	const Q2 = 'Say a little more.';
	let q = $state(0);
	let title = $state('');
	let subtext = $state('');
	let piece = $state<Piece | null>(null);
	const id = $props.id();
	$effect(() => {
		title = slide?.title ?? '';
		subtext = slide?.subtext ?? '';
		piece = slide?.piece ?? null;
	});
</script>

<div class="card preset-outlined-primary-500 p-4 sm:p-6 flex flex-col gap-6">
	{#if slide}
		<form class="flex flex-col gap-4" onsubmit={(e) => (e.preventDefault(), onsave({ title, subtext, piece }, 'Change this slide?'))}>
			<label class="label"><span class="label-text">The line</span><input id="{id}-t" class="input text-lg" maxlength={TITLE_MOST} bind:value={title} /></label>
			<label class="label"><span class="label-text">A little more</span><textarea class="textarea" rows="3" maxlength={SUBTEXT_MOST} bind:value={subtext}></textarea></label>
			<PiecePicker bind:value={piece} />
			<div class="flex gap-3"><button class="btn preset-filled-primary-500 min-h-11" disabled={!title.trim() && !subtext.trim()}>Save the slide</button><button type="button" class="btn preset-tonal min-h-11" onclick={oncancel}>Cancel</button></div>
		</form>
	{:else}
		{#key q}
			{#if q === 0}
				<AskOne question={Q1} hint="One idea. A few words." most={TITLE_MOST} bind:value={title} onnext={() => (q = 1)} onback={oncancel} />
			{:else if q === 1}
				<p class="chip preset-tonal self-start">“{title}”</p>
				<AskOne question={Q2} hint="One or two short sentences. Leave it empty and the first draft will write it." lines={3} most={SUBTEXT_MOST} optional bind:value={subtext} onnext={() => (q = 2)} onback={() => (q = 0)} />
			{:else}
				<p class="chip preset-tonal self-start">“{title}”</p>
				<PiecePicker bind:value={piece} label="Pick a picture for it" />
				<div class="flex gap-3">
					<button type="button" class="btn preset-tonal min-h-11" onclick={() => (q = 1)}>Back</button>
					<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => onsave({ title, subtext, piece }, Q1)}>Add the slide</button>
				</div>
			{/if}
		{/key}
	{/if}
</div>
