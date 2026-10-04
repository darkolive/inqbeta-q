<script lang="ts" module>
	import { DECK_WORDS } from './words';
	export const title = DECK_WORDS.backing.title;
	export const scenes = DECK_WORDS.backing.scenes;
</script>

<script lang="ts">
	import StoryDeck from './StoryDeck.svelte';
	import { along, lerp, type Frame } from './frame';
	import { Person, Coin, Padlock, Cross, Card, Envelope } from '../story';

	let { hideable = true }: { hideable?: boolean } = $props();
	const SAM: [number, number] = [320, 56];
	const backers = [80, 200, 320, 440, 560].map((x) => [x, 262] as [number, number]);
	const letters = ['A', 'B', 'C', 'D', 'E'];
	const BAR = { x: 170, y: 132, w: 300 };
</script>

{#snippet pictures(f: Frame)}
	{@const pledged = f.scene === 2 ? f.at(2) : f.scene >= 3 && f.scene !== 5 ? 1 : f.scene === 5 ? 0.7 : 0}
	{@const moved = f.at(4)}
	<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
		<!-- Sam and the idea -->
		<Person x={SAM[0]} y={SAM[1]} letter="S" fill="fill-primary-500" />
		<text x={SAM[0] + 40} y={SAM[1] + 6} class="fill-surface-950-50 text-sm font-semibold">Sam’s data farm</text>

		<!-- the bar: pledged (striped) and moved (solid) -->
		<rect x={BAR.x} y={BAR.y} width={BAR.w} height="24" rx="12" class="fill-surface-300-700" />
		<rect x={BAR.x} y={BAR.y} width={BAR.w * pledged} height="24" rx="12" class={f.scene === 5 ? 'fill-none stroke-warning-500' : 'fill-secondary-300-700'} stroke-width="3" stroke-dasharray={f.scene === 5 ? '6 5' : undefined} />
		<g class="{f.fade} {f.on(4, 4)}"><rect x={BAR.x} y={BAR.y} width={BAR.w * moved} height="24" rx="12" class="fill-primary-500" /></g>
		<g class="{f.fade} {f.on(6)}"><rect x={BAR.x} y={BAR.y} width={BAR.w} height="24" rx="12" class="fill-primary-500" /></g>
		<text x={BAR.x + BAR.w / 2} y={BAR.y + 50} text-anchor="middle" class="fill-surface-950-50 text-sm font-semibold">{f.scene === 1 ? 'Target: 300 credits by 1 December' : f.scene <= 3 ? `${Math.round(pledged * 300)} of 300 pledged, still held by their backers` : f.scene === 5 ? '210 of 300 pledged: the date has passed, all released' : '300 of 300: the target is met'}</text>

		<!-- the backers -->
		{#each backers as [x, y], i (i)}
			<Person {x} {y} letter={letters[i]} />
		{/each}

		<!-- 2–3 and 5: each pledge held beside its backer, locked -->
		{#each backers as [x, y], i (i)}
			{@const shown = f.scene === 2 ? Math.min(1, Math.max(0, f.at(2) * 5 - i)) : f.scene === 3 || (f.scene === 5 && i < 4) ? 1 : 0}
			<g class="{f.fade}" opacity={shown}>
				<Coin x={x + 32} y={y - 36} r={15} />
				<g transform="translate({x + 32} {y - 20}) scale(0.6)"><Padlock x={0} y={0} open={f.scene === 5 && f.at(5) > 0.5} fill={f.scene === 5 ? 'fill-warning-500' : 'fill-primary-500'} stroke={f.scene === 5 ? 'stroke-warning-500' : 'stroke-primary-500'} /></g>
			</g>
		{/each}

		<!-- 3: trying to spend promised credits elsewhere -->
		<g class="{f.fade} {f.on(3, 3)}">
			<path d="M{backers[4][0] + 30} {backers[4][1] - 44}Q600 150 590 112" fill="none" class="stroke-error-500" stroke-width="3" stroke-dasharray="5 5" />
			<rect x="560" y="80" width="60" height="32" rx="6" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
			<text x="590" y="101" text-anchor="middle" class="fill-surface-950-50 text-xs font-bold">a shop</text>
			<Cross x={584} y={150} r={14} />
		</g>

		<!-- 4: every pledge moves at once -->
		{#if f.scene === 4}
			{#each backers as [x, y], i (i)}
				{@const [cx, cy] = along([[x + 32, y - 36], [SAM[0], SAM[1] + 30]], moved)}
				<Coin x={cx} y={cy} r={15} />
			{/each}
		{/if}

		<!-- 6: rewards and updates going out -->
		<g class="{f.fade} {f.on(6)}">
			{#each backers as [x, y], i (i)}
				{@const [cx, cy] = along([[SAM[0], SAM[1]], [x, y - 54]], f.at(6))}
				{#if i % 2 === 0}
					<Card x={cx - 22} y={cy - 16} s={0.35} />
				{:else}
					<g transform="translate({cx - 18} {cy - 12}) scale(0.5)"><Envelope x={0} y={0} /></g>
				{/if}
			{/each}
		</g>
	</svg>
{/snippet}

<StoryDeck id="backing" {title} {scenes} {pictures} {hideable} />
