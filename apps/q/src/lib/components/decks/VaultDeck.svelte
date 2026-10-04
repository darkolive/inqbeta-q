<script lang="ts" module>
	import type { DeckScene } from './frame';
	export const title = 'Your vault, in many places at once';
	export const scenes: DeckScene[] = [
		{ title: 'The newest is in your hand', says: 'Your phone always has the newest of everything. You work from what’s right in front of you, even with no signal.' },
		{ title: 'Every save goes out', says: 'Each time you agree, sign or capture something, a sealed copy goes out to your places: your cloud, your own bucket.' },
		{ title: 'Join a federation', says: 'On a club’s page, press Join. Its storage becomes one of your places, the cost shown and agreed in one step.' },
		{ title: 'Three places, three fates', says: 'Copies in different places, run by different people, are separate ways to survive. Q counts ways, not copies.' },
		{ title: 'Lose your phone', says: 'In a river, on a hike, stolen. Sign in on a new phone and everything that reached your places comes back, checked against its seal.' },
		{ title: 'Hot and cold', says: 'Your phone keeps what’s recent. Everything else waits, cool and cheap, in your places, and comes back the moment you open it.' }
	];
</script>

<script lang="ts">
	import StoryDeck from './StoryDeck.svelte';
	import { along, lerp, type Frame } from './frame';
	import { Phone, Folder, Cloud, Tick, Cross } from '../story';

	let { hideable = true }: { hideable?: boolean } = $props();

	const PHONE: [number, number] = [70, 150];
	const NEWPHONE: [number, number] = [200, 250];
	const places: { x: number; y: number; label: string }[] = [
		{ x: 300, y: 60, label: 'Your cloud' },
		{ x: 470, y: 60, label: 'Your bucket' },
		{ x: 470, y: 230, label: 'The club’s node' }
	];
</script>

<!-- A node: a small server with lights, centred on (x, y). -->
{#snippet node(x: number, y: number, label: string, lit = true)}
	<rect x={x - 40} y={y - 28} width="80" height="56" rx="8" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
	<rect x={x - 28} y={y - 14} width="56" height="8" rx="4" class="fill-surface-300-700" />
	<rect x={x - 28} y={y + 2} width="56" height="8" rx="4" class="fill-surface-300-700" />
	<circle cx={x + 22} cy={y - 10} r="3" class={lit ? 'fill-success-500' : 'fill-surface-400-600'} />
	<circle cx={x + 22} cy={y + 6} r="3" class={lit ? 'fill-success-500' : 'fill-surface-400-600'} />
	<text {x} y={y + 46} text-anchor="middle" class="fill-surface-950-50 text-sm font-semibold">{label}</text>
{/snippet}

{#snippet pictures(f: Frame)}
	{@const send = f.at(2)}
	{@const back = f.at(5)}
	{@const old = along([[places[2].x, places[2].y], [NEWPHONE[0] + 20, NEWPHONE[1] - 40]], f.at(6))}
	<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
		<!-- your phone (1–4), lost (5) -->
		<g class="{f.fade} {f.on(1, 5)}">
			<Phone x={PHONE[0] - 30} y={PHONE[1] - 52} />
			<Folder x={PHONE[0] - 22} y={PHONE[1] - 30} s={0.75} />
			<text x={PHONE[0]} y={PHONE[1] + 72} text-anchor="middle" class="fill-surface-950-50 text-sm font-semibold">Your phone</text>
		</g>
		<g class="{f.fade} {f.on(1, 1)}">
			<circle cx={PHONE[0] + 34} cy={PHONE[1] - 56} r="14" class="fill-warning-500" />
			<text x={PHONE[0] + 34} y={PHONE[1] - 51} text-anchor="middle" class="fill-surface-950 text-xs font-bold">new</text>
		</g>
		<g class="{f.fade} {f.on(5, 5)}"><Cross x={PHONE[0]} y={PHONE[1]} r={22} /></g>

		<!-- 2 onwards: cloud and bucket -->
		<g class="{f.fade} {f.on(2)}">
			<Cloud x={places[0].x} y={places[0].y} />
			<text x={places[0].x} y={places[0].y + 58} text-anchor="middle" class="fill-surface-950-50 text-sm font-semibold">{places[0].label}</text>
			{@render node(places[1].x, places[1].y, places[1].label)}
		</g>
		<!-- 2: copies travelling out -->
		{#if f.scene === 2}
			{#each places.slice(0, 2) as pl, i (i)}
				{@const [x, y] = along([[PHONE[0], PHONE[1] - 20], [pl.x, pl.y]], lerp(0, 1, send * 1.15 - i * 0.15))}
				<Folder x={x - 15} y={y - 11} s={0.5} />
			{/each}
		{/if}

		<!-- 3: join a club -->
		<g class="{f.fade} {f.on(3, 3)}">
			<rect x="230" y="200" width="120" height="44" rx="22" class="fill-primary-500" transform="translate(290 222) scale({f.still ? 1 : lerp(1, 0.92, Math.sin(f.at(3) * Math.PI))}) translate(-290 -222)" />
			<text x="290" y="228" text-anchor="middle" class="fill-surface-50 text-lg font-bold">Join</text>
		</g>
		<g class="{f.fade} {f.on(3)}">{@render node(places[2].x, places[2].y, places[2].label)}</g>
		{#if f.scene === 3}
			{@const [x, y] = along([[PHONE[0], PHONE[1]], [places[2].x, places[2].y]], f.at(3))}
			<Folder x={x - 15} y={y - 11} s={0.5} />
		{/if}

		<!-- 4: three fates -->
		<g class="{f.fade} {f.on(4, 4)}">
			{#each places as pl, i (i)}
				<Tick x={pl.x + 46} y={pl.y - 30} />
			{/each}
			<rect x="180" y="150" width="200" height="40" rx="20" class="fill-success-500" />
			<text x="280" y="176" text-anchor="middle" class="fill-surface-50 font-bold">3 ways to survive</text>
		</g>

		<!-- 5–6: a new phone, filled from your places -->
		<g class="{f.fade} {f.on(5)}">
			<Phone x={NEWPHONE[0] - 30} y={NEWPHONE[1] - 80} />
			<text x={NEWPHONE[0]} y={NEWPHONE[1] + 44} text-anchor="middle" class="fill-surface-950-50 text-sm font-semibold">Your new phone</text>
		</g>
		{#if f.scene === 5}
			{#each places as pl, i (i)}
				{@const [x, y] = along([[pl.x, pl.y], [NEWPHONE[0], NEWPHONE[1] - 40]], lerp(0, 1, back * 1.2 - i * 0.1))}
				<Folder x={x - 15} y={y - 11} s={0.5} />
			{/each}
		{/if}
		<g class="{f.fade} {f.on(5, 5)}"><Folder x={NEWPHONE[0] - 22} y={NEWPHONE[1] - 58} s={0.75} /></g>

		<!-- 6: hot in the hand, cold in your places -->
		<g class="{f.fade} {f.on(6)}">
			<Folder x={NEWPHONE[0] - 15} y={NEWPHONE[1] - 52} s={0.5} fill="fill-warning-300-700" />
			<text x={NEWPHONE[0]} y={NEWPHONE[1] - 92} text-anchor="middle" class="fill-warning-700-300 text-sm font-bold">recent</text>
			{#each places as pl, i (i)}
				<Folder x={pl.x + (i === 0 ? 72 : 46)} y={pl.y - 16} s={0.6} fill="fill-tertiary-300-700" />
			{/each}
			<text x="470" y="160" text-anchor="middle" class="fill-tertiary-700-300 text-sm font-bold">everything, kept cool</text>
			<Folder x={old[0] - 12} y={old[1] - 9} s={0.4} fill="fill-tertiary-300-700" />
		</g>
	</svg>
{/snippet}

<StoryDeck id="vault" {title} {scenes} {pictures} {hideable} />
