<script lang="ts">
	/*
	 * A slide drawn by the polished build (ADR-Q-033, "Make it final"),
	 * playing in its own sealed frame (lib/story-art). `t` is seconds into the
	 * slide; Infinity (a still, or less motion asked for) shows how it ends,
	 * and so does 0, before it plays, like a poster. When this browser doesn't
	 * have the picture (a book opened from a file), `fallback` is shown.
	 */
	import type { Snippet } from 'svelte';
	import { artOf, frameDoc, isDark, stageIn, type Stage } from '$lib/story-art';
	let { hash, t, fallback }: { hash: string; t: number; fallback?: Snippet } = $props();
	let svg = $state<string | null | undefined>(undefined);
	let frame = $state<HTMLIFrameElement | null>(null);
	let stage = $state<Stage | null>(null);
	$effect(() => {
		const h = hash;
		svg = undefined;
		stage = null;
		void artOf(h).then((s) => {
			if (h === hash) svg = s;
		});
	});
	$effect(() => {
		const s = stage;
		const now = t;
		if (s) s.at(now <= 0 ? Infinity : now);
	});
</script>

{#if svg}
	<iframe
		bind:this={frame}
		title="The slide’s picture"
		aria-hidden="true"
		tabindex="-1"
		sandbox="allow-same-origin"
		srcdoc={frameDoc(svg, isDark())}
		class="w-full aspect-[2/1] border-0 pointer-events-none block"
		onload={() => (stage = frame ? stageIn(frame) : null)}
	></iframe>
{:else if svg === null && fallback}
	{@render fallback()}
{:else}
	<div class="w-full aspect-[2/1]"></div>
{/if}
