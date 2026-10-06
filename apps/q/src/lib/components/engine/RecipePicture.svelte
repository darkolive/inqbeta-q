<svelte:options namespace="svg" />

<script lang="ts">
	/*
	 * A slide brought to life (ADR-Q-033; 6 October 2026): its scene recipe
	 * performed on the stage, drawn with Q's own pieces. `t` is how far through
	 * the slide we are (0 to 1); a still is drawn at 1, the end. Everything is
	 * worked out by q-core's stageAt, so this only draws.
	 *
	 * The stage is 100 by 100; it's drawn 640 by 300 inside the deck's picture.
	 */
	import { stageAt, type Recipe } from '@inqbeta/q-core/scene-recipe';
	import type { Piece as PieceKey } from '@inqbeta/q-core/storybook';
	import Piece from './Piece.svelte';
	let { recipe, t }: { recipe: Recipe; t: number } = $props();
	const W = 640;
	const H = 300;
	const X = (x: number) => (x / 100) * W;
	const Y = (y: number) => (y / 100) * H;
	/* Before it plays (the very start), show how the slide ends, like a poster; it builds from nothing as soon as it plays. */
	const now = $derived(stageAt(recipe, t <= 0 ? 1 : t));
	/* The second (and fourth) person on a stage is drawn in the olive, so two people read as two. */
	const other = $derived(new Set(recipe.actors.filter((a) => a.piece === 'person').filter((_, i) => i % 2 === 1).map((a) => a.id)));
	const len = (l: { ax: number; ay: number; bx: number; by: number }) => Math.hypot(X(l.bx) - X(l.ax), Y(l.by) - Y(l.ay));
</script>

<!-- Lines first, under everything: a connection drawing itself. -->
{#each now.links as l, i (i)}
	<line x1={X(l.ax)} y1={Y(l.ay)} x2={X(l.bx)} y2={Y(l.by)} class="stroke-primary-500" stroke-width="4" stroke-linecap="round" stroke-dasharray={len(l)} stroke-dashoffset={len(l) * (1 - l.drawn)} opacity="0.7" />
{/each}

{#if now.chart}
	{@const c = now.chart}
	{@const cx = X(c.x)}
	{@const cy = Y(c.y)}
	{#if c.kind === 'bars'}
		{@const bw = 26}
		{@const gap = 12}
		{@const left = cx - (c.values.length * (bw + gap) - gap) / 2}
		<line x1={left - 10} y1={cy + 60} x2={left + c.values.length * (bw + gap)} y2={cy + 60} class="stroke-surface-400-600" stroke-width="2" />
		{#each c.values as v, i (i)}
			{@const h = 120 * v * c.grown}
			<rect x={left + i * (bw + gap)} y={cy + 60 - h} width={bw} height={h} rx="4" class={i === c.values.length - 1 ? 'fill-secondary-500' : 'fill-primary-500'} />
		{/each}
	{:else if c.kind === 'line'}
		{@const w = 220}
		{@const pts = c.values.map((v, i) => [cx - w / 2 + (c.values.length > 1 ? (i * w) / (c.values.length - 1) : w / 2), cy + 60 - 120 * v])}
		{@const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')}
		<line x1={cx - w / 2 - 10} y1={cy + 60} x2={cx + w / 2 + 10} y2={cy + 60} class="stroke-surface-400-600" stroke-width="2" />
		<path {d} pathLength="1" fill="none" class="stroke-primary-500" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1" stroke-dashoffset={1 - c.grown} />
		{#if c.grown >= 1}{@const last = pts[pts.length - 1]}<circle cx={last[0]} cy={last[1]} r="8" class="fill-secondary-500" />{/if}
	{:else}
		{@const r = 56}
		{@const C = 2 * Math.PI * r}
		<circle {cx} {cy} {r} fill="none" class="stroke-surface-200-800" stroke-width="16" />
		<circle {cx} {cy} {r} fill="none" class="stroke-primary-500" stroke-width="16" stroke-linecap="round" stroke-dasharray={C} stroke-dashoffset={C * (1 - c.values[0] * c.grown)} transform="rotate(-90 {cx} {cy})" />
	{/if}
{/if}

{#each now.actors as a (a.id)}
	{#if a.opacity > 0.01}
		<g opacity={a.opacity}>
			{#if a.glow > 0}<circle cx={X(a.x)} cy={Y(a.y)} r={a.size * 0.62} class="fill-primary-100-900" opacity={0.85 * a.glow} />{/if}
			<Piece piece={a.piece as PieceKey} x={X(a.x)} y={Y(a.y)} size={a.size} other={other.has(a.id)} />
		</g>
	{/if}
{/each}

{#each now.ghosts as g, i (i)}
	<g opacity={g.opacity}><Piece piece={g.piece as PieceKey} x={X(g.x)} y={Y(g.y)} size={g.size} /></g>
{/each}
