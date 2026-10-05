<script lang="ts">
	/* Pick the slide's picture: every piece, big enough to see, with its name; or none. */
	import { PIECES, type Piece } from '@inqbeta/q-core/storybook';
	import PieceIcon from './PieceIcon.svelte';
	let { value = $bindable(null), label = 'Pick a picture' }: { value?: Piece | null; label?: string } = $props();
	const all = Object.entries(PIECES) as [Piece, string][];
</script>

<fieldset class="flex flex-col gap-3">
	<legend class="h5 font-normal mb-2">{label}</legend>
	<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
		{#each all as [key, words] (key)}
			<label class="card p-2 flex flex-col items-center gap-1 cursor-pointer text-center text-xs border-2 {value === key ? 'border-primary-500 preset-tonal-primary' : 'border-surface-200-800'}">
				<input type="radio" class="sr-only" name="piece" value={key} checked={value === key} onchange={() => (value = key)} />
				<PieceIcon piece={key} size={48} />
				<span>{words}</span>
			</label>
		{/each}
		<label class="card p-2 flex flex-col items-center justify-center gap-1 cursor-pointer text-center text-xs border-2 {value === null ? 'border-primary-500 preset-tonal-primary' : 'border-surface-200-800'}">
			<input type="radio" class="sr-only" name="piece" checked={value === null} onchange={() => (value = null)} />
			<PieceIcon piece={null} size={48} />
			<span>No picture</span>
		</label>
	</div>
</fieldset>
