<script lang="ts">
	/* The book's stories as the player shows them: a timeline, a numbered circle each, the one chosen lit. With a little note each (slides, drafts). */
	import type { Story } from '@inqbeta/q-core/storybook';
	let { stories, chosen, onchoose, note }: { stories: Story[]; chosen: string | null; onchoose: (id: string) => void; note?: (s: Story) => string } = $props();
</script>

<nav aria-label="Stories" class="card preset-outlined-surface-200-800 bg-surface-50-950 p-3">
	<ol class="flex flex-col">
		{#each stories as s, i (s.id)}
			{@const on = s.id === chosen}
			<li class="relative">
				{#if i < stories.length - 1}<span class="absolute left-[1.3rem] top-9 -bottom-1 w-0.5 bg-surface-300-700" aria-hidden="true"></span>{/if}
				<button type="button" class="relative w-full text-left flex items-start gap-3 rounded-base px-2 py-1.5 leading-snug font-normal transition-colors {on ? 'text-primary-800-200' : 'hover:preset-tonal'}" aria-current={on ? 'true' : undefined} onclick={() => onchoose(s.id)}>
					<span class="size-7 shrink-0 rounded-full border-2 flex items-center justify-center text-xs tabular-nums font-medium {on ? 'bg-primary-500 border-primary-500 text-white' : 'bg-surface-50-950 border-surface-400-600'}" aria-hidden="true">{i + 1}</span>
					<span class="flex-1 pt-0.5">{s.title}{#if note}<span class="block text-xs opacity-70">{note(s)}</span>{/if}</span>
				</button>
			</li>
		{/each}
	</ol>
</nav>
