<script lang="ts" module>
	import type { DeckScene } from './frame';
	export const title = 'A field of phones, all carrying for each other';
	export const scenes: DeckScene[] = [
		{ title: 'A festival field. No signal.', says: 'Thousands of people, thousands of phones, and not a bar of signal between them.' },
		{ title: 'Ana takes a photo for Ben', says: 'Q seals it as she takes it. Only Ben can open it: nobody else, ever.' },
		{ title: 'Hop, hop, hop', says: 'Phones nearby pass the sealed box along, by Bluetooth or the site’s Wi-Fi. They carry it without being able to look inside.' },
		{ title: 'Ben has it', says: 'Ben’s phone checks it and says “got it”. Only then does each phone that carried it let its copy go.' },
		{ title: 'Signal at the edge', says: 'Anything going beyond the field waits. The moment any phone finds 4G, it goes up to the cloud.' },
		{ title: 'Everyone earns a little', says: 'Each phone earns a little for what it carried. What you earn carrying for others pays for what you need carried. It cancels out.' }
	];
</script>

<script lang="ts">
	import StoryDeck from './StoryDeck.svelte';
	import { along, lerp, type Frame } from './frame';
	import { Cloud, Padlock, Tick, Coin } from '../story';

	let { hideable = true }: { hideable?: boolean } = $props();

	/* The crowd: a jittered grid of phones, the same every time. */
	const phones: [number, number][] = [];
	let seed = 7;
	const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
	for (let r = 0; r < 5; r++) for (let c = 0; c < 11; c++) phones.push([40 + c * 54 + rnd() * 20, 70 + r * 46 + rnd() * 16]);
	const ANA = 22; /* left, middle row */
	const BEN = 32; /* right, middle row */
	const hops = [22, 24, 26, 28, 30, 32].map((i) => phones[i]);
	const carriers = [24, 26, 28, 30];
	const EDGE = 10; /* top right: finds signal */
	const out = [phones[EDGE], [600, 34] as [number, number]];
</script>

{#snippet pictures(f: Frame)}
	{@const k = f.at(3)}
	{@const box = along(hops, k)}
	{@const up = along(out, f.at(5))}
	<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
		<!-- the field -->
		<rect x="0" y="0" width="640" height="320" class="fill-success-50-950" />
		<path d="M0 300Q160 284 320 296T640 292V320H0z" class="fill-success-200-800" />

		<!-- 1–4: no signal; 5–6: signal -->
		<g transform="translate(585 34) scale(0.5)"><Cloud x={0} y={0} /></g>
		<g class="{f.fade} {f.on(1, 4)}"><line x1="558" y1="14" x2="612" y2="56" class="stroke-error-500" stroke-width="4" stroke-linecap="round" /></g>

		<!-- the crowd -->
		{#each phones as [x, y], i (i)}
			<rect x={x - 6} y={y - 10} width="12" height="20" rx="3" class={(i === ANA || i === BEN) && f.scene >= 2 ? 'fill-primary-500' : carriers.includes(i) && f.scene >= 3 ? 'fill-secondary-500' : 'fill-surface-400-600'} />
		{/each}
		<g class="{f.fade} {f.on(2)}">
			<text x={phones[ANA][0]} y={phones[ANA][1] + 28} text-anchor="middle" class="fill-surface-950-50 text-sm font-bold">Ana</text>
			<text x={phones[BEN][0]} y={phones[BEN][1] + 28} text-anchor="middle" class="fill-surface-950-50 text-sm font-bold">Ben</text>
		</g>

		<!-- 3 onwards: the path the box took, drawn as it travels -->
		{#each hops.slice(1) as [x, y], i (i)}
			{@const done = k * (hops.length - 1) - i}
			{#if done > 0}
				<line x1={hops[i][0]} y1={hops[i][1]} x2={lerp(hops[i][0], x, done)} y2={lerp(hops[i][1], y, done)} class="stroke-secondary-500" stroke-width="3" stroke-dasharray="4 5" stroke-linecap="round" />
			{/if}
		{/each}

		<!-- 2–4: the sealed box, riding along -->
		<g class="{f.fade} {f.on(2, 4)}"><Padlock x={box[0]} y={box[1] - 44} /></g>

		<!-- 4: got it -->
		<g class="{f.fade} {f.on(4, 4)}"><Tick x={phones[BEN][0] + 24} y={phones[BEN][1] - 22} /></g>

		<!-- 5: signal at the edge, and the box going up -->
		<g class="{f.fade} {f.on(5, 5)}">
			{#each [0, 1, 2] as w (w)}
				<path d="M{phones[EDGE][0] - 10 - w * 7} {phones[EDGE][1] - 16 - w * 6}a{12 + w * 8} {12 + w * 8} 0 0 1 {20 + w * 14} 0" fill="none" class="stroke-primary-500" stroke-width="3" stroke-linecap="round" />
			{/each}
			<g transform="translate({up[0]} {up[1]}) scale(0.6)"><Padlock x={0} y={-14} /></g>
		</g>

		<!-- 6: a little earned by every carrier -->
		<g class="{f.fade} {f.on(6)}">
			{#each carriers as c, i (c)}
				<Coin x={phones[c][0]} y={phones[c][1] - 26 - lerp(0, 10, f.at(6)) * (i % 2 ? 1 : 0.6)} r={10} />
			{/each}
		</g>
	</svg>
{/snippet}

<StoryDeck id="festival" {title} {scenes} {pictures} {hideable} />
