<script lang="ts">
	/* A story's history (or the book's own): every step, oldest first, with the question asked and the answer given. Nothing is lost by trying. */
	import type { BookStep } from '@inqbeta/q-core/storybook';
	let { steps, title }: { steps: BookStep[]; title: string } = $props();
	const KIND: Record<string, string> = { idea: 'The idea', refs: 'What Q reads', brief: 'Q’s questions', style: 'The look', outline: 'Suggested stories', reject: 'Rejected', stories: 'The stories', storyboard: 'Storyboard', generate: 'First draft', redo: 'Redo', ripple: 'Review', keep: 'Kept', open: 'Who can watch', ready: 'Ready' };
	const said = (a: unknown): string => {
		if (a === null || a === undefined || a === '') return '';
		if (typeof a === 'string') return a;
		if (Array.isArray(a)) return a.map(said).filter(Boolean).join(' · ');
		if (typeof a === 'object') return Object.values(a as Record<string, unknown>).map(said).filter(Boolean).join(' · ');
		return String(a);
	};
	const when = (at: string) => new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>

<details class="card preset-outlined-surface-200-800 p-4">
	<summary class="cursor-pointer min-h-11 flex items-center">History of “{title}” ({steps.length} {steps.length === 1 ? 'step' : 'steps'})</summary>
	<ol class="flex flex-col gap-3 mt-3">
		{#each steps as s (s.id)}
			<li class="border-l-4 border-primary-500 pl-3">
				<p class="text-xs opacity-70">{when(s.at)} · {KIND[s.kind] ?? s.kind}{#if s.cost} · {s.cost.by === 'practice' ? 'practice, free' : `${s.cost.used.toFixed(2)} of up to ${s.cost.upTo.toFixed(2)} credits`}{/if}</p>
				<p>{s.asks}</p>
				{#if said(s.answer)}<p class="text-surface-700-300">“{said(s.answer)}”</p>{/if}
			</li>
		{/each}
	</ol>
</details>
