<script lang="ts" module>
	import { DECK_WORDS } from './words';
	export const title = DECK_WORDS.festival.title;
	export const scenes = DECK_WORDS.festival.scenes;
</script>

<script lang="ts">
	import StoryDeck from './StoryDeck.svelte';
	import { along, lerp, type Frame } from './frame';
	import { Padlock, Tick, Coin } from '../story';

	let { hideable = true }: { hideable?: boolean } = $props();

	/* The crowd: rows of phones, slightly scattered, the same every time. */
	const phones: [number, number][] = [];
	let seed = 11;
	const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
	for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) phones.push([46 + c * 61 + (r % 2) * 18 + rnd() * 8, 62 + r * 68 + rnd() * 10]);
	const ANA = 20; /* left, third row */
	const BEN = 29; /* right, third row */
	const route = [20, 11, 12, 23, 24, 15, 16, 27, 28, 29];
	const hops = route.map((i) => phones[i]);
	const carriers = route.slice(1, -1);
	const EDGE = 9; /* top right: finds signal */
	const out = [phones[EDGE], [612, 18] as [number, number]];
	/* How brightly a phone glows as the box passes it (0 to 1). */
	const glowAt = (i: number, box: [number, number]) => Math.max(0, 1 - Math.hypot(phones[i][0] - box[0], phones[i][1] - box[1]) / 46);
</script>

{#snippet pictures(f: Frame)}
	{@const k = f.at(3)}
	{@const box = along(hops, k)}
	{@const up = along(out, f.at(5))}
	{@const moving = f.scene === 3 && !f.still}
	<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
		<!-- the crowd: each phone dark until something passes through it -->
		{#each phones as [x, y], i (i)}
			{@const end = (i === ANA || i === BEN) && f.scene >= 2}
			{@const carried = carriers.includes(i) && (f.scene > 3 || (f.scene === 3 && route.indexOf(i) <= k * (route.length - 1)))}
			{@const glow = moving ? glowAt(i, box) : 0}
			{@const edge = i === EDGE && f.scene === 5}
			{#if glow > 0 || end || edge}
				<circle cx={x} cy={y} r={20 + glow * 12} class="fill-primary-400" opacity={glow ? glow * 0.7 : 0.3} />
			{/if}
			<rect x={x - 11} y={y - 19} width="22" height="38" rx="5" class="fill-surface-500" />
			<rect x={x - 8} y={y - 15} width="16" height="27" rx="2" class={end || edge || glow > 0.3 ? 'fill-primary-400' : carried ? 'fill-secondary-400' : 'fill-surface-300-700'} />
		{/each}
		<g class="{f.fade} {f.on(2)}">
			<text x={phones[ANA][0]} y={phones[ANA][1] + 36} text-anchor="middle" class="fill-surface-950-50 text-sm font-bold">Ana</text>
			<text x={phones[BEN][0]} y={phones[BEN][1] + 36} text-anchor="middle" class="fill-surface-950-50 text-sm font-bold">Ben</text>
		</g>

		<!-- 1–4: no signal anywhere -->
		<g class="{f.fade} {f.on(1, 4)}">
			<text x="620" y="22" text-anchor="end" class="fill-error-600-400 text-sm font-bold">No signal</text>
		</g>

		<!-- 2–4: the sealed box, riding along -->
		<g class="{f.fade} {f.on(2, 4)}"><Padlock x={box[0]} y={box[1] - 50} /></g>

		<!-- 4: got it -->
		<g class="{f.fade} {f.on(4, 4)}"><Tick x={phones[BEN][0] + 26} y={phones[BEN][1] - 26} /></g>

		<!-- 5: signal at the edge, and the box going up -->
		<g class="{f.fade} {f.on(5, 5)}">
			{#each [0, 1, 2] as w (w)}
				<path d="M{phones[EDGE][0] - 10 - w * 7} {phones[EDGE][1] - 26 - w * 6}a{12 + w * 8} {12 + w * 8} 0 0 1 {20 + w * 14} 0" fill="none" class="stroke-primary-500" stroke-width="3" stroke-linecap="round" />
			{/each}
			<g transform="translate({up[0]} {up[1]}) scale(0.6)"><Padlock x={0} y={-14} /></g>
			<text x="620" y="22" text-anchor="end" class="fill-primary-700-300 text-sm font-bold">4G</text>
		</g>

		<!-- 6: a little earned by every carrier -->
		<g class="{f.fade} {f.on(6)}">
			{#each carriers as c, i (c)}
				<Coin x={phones[c][0]} y={phones[c][1] - 34 - lerp(0, 8, f.at(6)) * (i % 2 ? 1 : 0.6)} r={11} />
			{/each}
		</g>
	</svg>
{/snippet}

<StoryDeck id="festival" {title} {scenes} {pictures} {hideable} />
