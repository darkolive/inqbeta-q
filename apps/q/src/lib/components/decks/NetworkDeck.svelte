<script lang="ts" module>
	import { DECK_WORDS } from './words';
	export const title = DECK_WORDS.network.title;
	export const scenes = DECK_WORDS.network.scenes;
</script>

<script lang="ts">
	import StoryDeck from './StoryDeck.svelte';
	import { along, lerp, type Frame } from './frame';
	import { Tick, Cross, Folder, Key } from '../story';

	let { hideable = true }: { hideable?: boolean } = $props();
	const CLUB: [number, number] = [120, 150];
	const providers = [
		{ y: 60, says: '99.9% up · 60 credits', ok: true },
		{ y: 150, says: '91% up · 40 credits', ok: false },
		{ y: 240, says: '99% up · 95 credits', ok: false }
	];
	const PX = 500;
</script>

<!-- A node: a small server with lights, centred on (x, y). -->
{#snippet node(x: number, y: number, lit = true)}
	<rect x={x - 40} y={y - 28} width="80" height="56" rx="8" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
	<rect x={x - 28} y={y - 14} width="56" height="8" rx="4" class="fill-surface-300-700" />
	<rect x={x - 28} y={y + 2} width="56" height="8" rx="4" class="fill-surface-300-700" />
	<circle cx={x + 22} cy={y - 10} r="3" class={lit ? 'fill-success-500' : 'fill-surface-400-600'} />
	<circle cx={x + 22} cy={y + 6} r="3" class={lit ? 'fill-success-500' : 'fill-surface-400-600'} />
{/snippet}

{#snippet pictures(f: Frame)}
	{@const heat = f.scene === 1 ? 0.05 : f.scene === 2 ? lerp(0.05, 0.72, f.p) : f.scene <= 4 ? 0.72 : f.scene === 5 ? lerp(0.72, 0.45, f.p) : 0.45}
	{@const joined = f.scene === 5 || f.scene === 6}
	{@const key = along([[CLUB[0] + 40, CLUB[1] - 40], [PX - 50, providers[0].y - 34]], f.at(5))}
	<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
		<!-- the club's node and its heat -->
		{@render node(CLUB[0], CLUB[1])}
		<text x={CLUB[0]} y={CLUB[1] + 50} text-anchor="middle" class="fill-surface-950-50 text-sm font-semibold">The club’s node</text>
		<rect x={CLUB[0] - 60} y="224" width="120" height="18" rx="9" class="fill-surface-300-700" />
		<rect x={CLUB[0] - 60} y="224" width={120 * heat} height="18" rx="9" class={heat >= 0.7 ? 'fill-warning-500' : 'fill-success-500'} />
		<line x1={CLUB[0] - 60 + 84} y1="218" x2={CLUB[0] - 60 + 84} y2="248" class="stroke-surface-950-50" stroke-width="2" />
		<text x={CLUB[0]} y="266" text-anchor="middle" class="fill-surface-700-300 text-xs">{Math.round(heat * 100)}% full · the line is 70%</text>

		<!-- 3: the wanted offer, going out -->
		<g class="{f.fade} {f.on(3, 3)}">
			{#each [0, 1, 2] as w (w)}
				<path d="M{CLUB[0] + 60 + w * 26} {CLUB[1] - 30 - w * 10}a{40 + w * 14} {40 + w * 14} 0 0 1 0 {60 + w * 20}" fill="none" class="stroke-primary-500" stroke-width="3" opacity={Math.max(0, Math.min(1, f.at(3) * 3 - w))} />
			{/each}
			<rect x="240" y="20" width="200" height="56" rx="10" class="fill-primary-500" />
			<text x="340" y="44" text-anchor="middle" class="fill-surface-50 text-sm font-bold">Wanted: 100 GB, a month</text>
			<text x="340" y="64" text-anchor="middle" class="fill-surface-50 text-sm">up to 70 credits</text>
		</g>

		<!-- 3–6: providers -->
		<g class="{f.fade} {f.on(3)}">
			{#each providers as p, i (i)}
				<g opacity={f.scene >= 5 && i > 0 ? 0.3 : 1}>
					{@render node(PX, p.y, !(f.scene === 6 && i === 0 && f.at(6) > 0.85))}
				</g>
			{/each}
		</g>
		<!-- 4: their offers, and the rules' answer -->
		<g class="{f.fade} {f.on(4, 4)}">
			{#each providers as p, i (i)}
				<text x={PX - 50} y={p.y + 5} text-anchor="end" class="fill-surface-950-50 text-sm">{p.says}</text>
				{#if p.ok}<Tick x={PX + 58} y={p.y} />{:else}<Cross x={PX + 58} y={p.y} />{/if}
			{/each}
		</g>

		<!-- 5–6: joined by a key that runs out with the month -->
		<g class="{f.fade} {joined ? 'opacity-100' : 'opacity-0'}">
			<line x1={CLUB[0] + 40} y1={CLUB[1]} x2={PX - 40} y2={providers[0].y} class="stroke-primary-500" stroke-width="3" stroke-dasharray="6 6" opacity={f.scene === 6 ? lerp(1, 0, Math.max(0, (f.at(6) - 0.7) / 0.3)) : 1} />
		</g>
		<g class="{f.fade} {f.on(5, 5)}">
			<Key x={key[0]} y={key[1]} s={0.5} />
			<text x={PX - 50} y={providers[0].y - 46} text-anchor="middle" class="fill-surface-950-50 text-xs font-semibold">until 4 November</text>
		</g>
		<!-- files spreading on (5), then moving off before it leaves (6) -->
		{#if f.scene === 5 || f.scene === 6}
			{#each [0, 1, 2] as n (n)}
				{@const t = f.scene === 5 ? f.at(5) * 1.3 - n * 0.15 : f.at(6) * 1.4 - n * 0.15}
				{@const [x, y] = f.scene === 5 ? along([[CLUB[0], CLUB[1]], [PX, providers[0].y]], t) : along([[PX, providers[0].y], [CLUB[0], CLUB[1]]], t)}
				<Folder x={x - 15} y={y - 11} s={0.5} />
			{/each}
		{/if}
		<g class="{f.fade} {f.on(6)}">
			<Tick x={CLUB[0] + 44} y={CLUB[1] - 36} />
		</g>
	</svg>
{/snippet}

<StoryDeck id="network" {title} {scenes} {pictures} {hideable} />
