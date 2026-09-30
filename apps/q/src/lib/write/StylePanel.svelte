<script lang="ts">
	/*
	 * A block's look, chosen — not written. Every choice is a token from a
	 * closed scale (q-core/style.ts), drawn by the same classes in Q and on the
	 * site, so light and dark, phones and screen readers all still work.
	 */
	import { CALLED, SCALES } from '@inqbeta/q-core/style';

	let { settings, group = false }: { settings: Record<string, unknown>; group?: boolean } = $props();

	const ROWS: { key: keyof typeof SCALES; label: string }[] = [
		{ key: 'frame', label: 'Box' },
		{ key: 'tone', label: 'Colour' },
		{ key: 'pad', label: 'Room inside' },
		{ key: 'align', label: 'Line up' },
		{ key: 'edge', label: 'Corners' },
		{ key: 'gap', label: 'Space between' }
	];

	function choose(key: string, value: string | null) {
		if (value === null) delete settings[`q:style/${key}`];
		else settings[`q:style/${key}`] = value;
	}
</script>

<div class="mt-2 space-y-2 rounded-container border border-surface-200-800 bg-surface-100-900 p-3">
	{#each ROWS.filter((r) => group || r.key !== 'gap') as row (row.key)}
		{@const now = settings[`q:style/${row.key}`]}
		<div class="flex flex-wrap items-center gap-2">
			<span class="w-28 text-xs font-medium">{row.label}</span>
			<div class="flex flex-wrap gap-1">
				<button type="button" class="btn btn-sm {now === undefined ? 'preset-filled' : 'preset-tonal'}" onclick={() => choose(row.key, null)}>As usual</button>
				{#each SCALES[row.key] as v (v)}
					<button type="button" class="btn btn-sm {now === v ? 'preset-filled' : 'preset-tonal'}" onclick={() => choose(row.key, v)}>{CALLED[row.key][v]}</button>
				{/each}
			</div>
		</div>
	{/each}
	<p class="hint">Chosen from the site's own palette, so it looks right in light and dark and on every screen.</p>
</div>
