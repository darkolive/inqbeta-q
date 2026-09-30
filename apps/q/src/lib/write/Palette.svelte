<script lang="ts">
	/*
	 * Where the dashboard's menu was, while writing: everything that can go on
	 * the page. Drag one onto the page, or click it to add it after the block
	 * you were last working on.
	 */
	import { LIBRARY } from './library';
	import { dnd } from './drag.svelte';

	let { onadd }: { onadd: (kind: string) => void } = $props();
</script>

<nav aria-label="Blocks you can add" class="space-y-5">
	{#each LIBRARY as group (group.title)}
		<section>
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">{group.title}</h3>
			<ul class="grid gap-1.5">
				{#each group.items as item (item.kind)}
					<li>
						<button
							type="button"
							draggable="true"
							class="w-full cursor-grab rounded-container border border-surface-300-700 bg-surface-50-950 px-3 py-2 text-left shadow-sm transition hover:-translate-y-px hover:border-primary-500 hover:shadow active:cursor-grabbing"
							title="Drag onto the page, or click to add"
							ondragstart={(e) => {
								dnd.now = { what: 'new', kind: item.kind };
								e.dataTransfer?.setData('text/plain', item.kind);
								if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
							}}
							ondragend={() => (dnd.now = null)}
							onclick={() => onadd(item.kind)}
						>
							<span class="block text-sm font-medium">{item.label}</span>
							<span class="block text-xs opacity-60">{item.about}</span>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
	<p class="hint">Click adds it after the block you were last in. Every block also moves with ↑ ↓.</p>
</nav>
