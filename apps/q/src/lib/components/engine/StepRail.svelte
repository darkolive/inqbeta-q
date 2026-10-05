<script lang="ts" module>
	export const STEPS = ['The idea', 'Q’s questions', 'The stories', 'The look', 'Storyboard', 'Review', 'Play'] as const;
</script>

<script lang="ts">
	/* Where you are in making the book: seven big steps, the one you're on lit, the ones done ticked. Any can be opened. */
	import { Icon } from '@inqbeta/q-ui';
	let { at, done, onchoose }: { at: number; done: boolean[]; onchoose: (n: number) => void } = $props();
</script>

<nav aria-label="Making the book">
	<ol class="flex flex-wrap gap-2">
		{#each STEPS as label, i (label)}
			{@const on = i === at}
			<li>
				<button
					type="button"
					class="btn min-h-11 gap-2 {on ? 'preset-filled-primary-500' : done[i] ? 'preset-tonal-primary' : 'preset-tonal'}"
					aria-current={on ? 'step' : undefined}
					onclick={() => onchoose(i)}
				>
					<span class="size-6 rounded-full flex items-center justify-center text-xs tabular-nums border-2 {on ? 'border-white' : 'border-current'}" aria-hidden="true">
						{#if done[i] && !on}<Icon name="check" size={14} stroke={3} />{:else}{i + 1}{/if}
					</span>
					<span class="font-normal">{label}</span>{#if done[i]}<span class="sr-only"> (done)</span>{/if}
				</button>
			</li>
		{/each}
	</ol>
</nav>
