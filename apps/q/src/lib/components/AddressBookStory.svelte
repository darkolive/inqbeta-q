<script lang="ts">
	/*
	 * How the address book works, as a short picture story (3 October 2026),
	 * the same family as the others: your people are their cards, you invite
	 * someone by sending yours, they press Link up, you each keep the other's
	 * card and your bell tells you, you message or call from their card, and
	 * you only ever see what they chose to share (ADR-Q-015).
	 *
	 * The player — autoplay, read-aloud, controls, captions — is PictureStory;
	 * this file is only the pictures. Words: `bookstory.*` in the language books.
	 */
	import PictureStory from './PictureStory.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { Tick, Cross, Card, Person } from './story';

	/* Little pictures drawn in white on a coloured circle, centred on 0 0. */
	const ICON = {
		link: 'M-1 5l-3 3a4 4 0 0 1-6-6l3-3M1 -5l3-3a4 4 0 0 1 6 6l-3 3M-4 4l8-8',
		message: 'M-8 -6h16v11h-9l-5 4v-4h-2z',
		video: 'M-9 -5h11v10h-11zM3 -1l6-4v10l-6-4',
		bell: 'M-9 5h18l-3-4v-5a6 6 0 0 0-12 0v5zM-3 8a3 3 0 0 0 6 0',
		lock: 'M-6 -1h12v9h-12zM-4 -1v-4a4 4 0 0 1 8 0v4'
	};
</script>

{#snippet button(x: number, y: number, fill: string, d: string, r = 18)}
	<circle cx={x} cy={y} {r} class={fill} />
	<path {d} transform="translate({x} {y})" fill="none" class="stroke-surface-50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
{/snippet}

<PictureStory prefix="bookstory">
	{#snippet pictures(on: (a: number, b?: number) => string, fade: string)}
		<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
			<!-- Ana: always there -->
			<Person x={80} y={64} letter="A" name={t('story.ana')} />

			<!-- 2 on: Ben -->
			<g class="{fade} {on(2)}">
				<Person x={560} y={64} letter="B" fill="fill-primary-500" name={t('story.ben')} />
			</g>

			<!-- 1: her address book is people — their cards -->
			<g class="{fade} {on(1, 1)}">
				<Card x={170} y={40} s={0.8} cover="fill-primary-200-800" photo="fill-primary-500" />
				<Card x={350} y={40} s={0.8} cover="fill-tertiary-200-800" photo="fill-tertiary-500" />
				<Card x={170} y={160} s={0.8} cover="fill-secondary-200-800" photo="fill-secondary-700" />
				<Card x={350} y={160} s={0.8} cover="fill-surface-300-700" photo="fill-primary-700" />
				<Tick x={510} y={44} r={14} />
			</g>

			<!-- 2: she invites Ben by sending her card -->
			<g class="{fade} {on(2, 2)}">
				<Card x={140} y={120} s={0.8} />
				<path d="M310 170C380 170 430 140 520 100" fill="none" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8" />
				<path d="M528 96l-10 14-6-12z" class="fill-secondary-500" />
				<path d="M398 128h44a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6h-30l-10 10v-10h-4a6 6 0 0 1-6-6v-20a6 6 0 0 1 6-6z" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" stroke-linejoin="round" />
			</g>

			<!-- 3: Ben sees her card, and presses Link up -->
			<g class="{fade} {on(3, 3)}">
				<Card x={360} y={110} s={0.8} />
				<rect x="392" y="226" width="96" height="40" rx="20" class="fill-primary-500" />
				<path d={ICON.link} transform="translate(440 246)" fill="none" class="stroke-surface-50" stroke-width="2.5" stroke-linecap="round" />
				<Tick x={488} y={226} />
			</g>

			<!-- 4: they each keep the other's card, and her bell rings -->
			<g class="{fade} {on(4, 4)}">
				<Card x={140} y={140} s={0.7} cover="fill-primary-200-800" photo="fill-primary-500" />
				<Card x={360} y={140} s={0.7} />
				<path d="M352 130C310 100 280 100 250 126" fill="none" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
				<path d="M244 132l4-16 10 10z" class="fill-primary-500" />
				{@render button(130, 40, 'fill-secondary-500', ICON.bell, 16)}
			</g>

			<!-- 5: message or call him, from his card -->
			<g class="{fade} {on(5, 5)}">
				<Card x={220} y={70} cover="fill-primary-200-800" photo="fill-primary-500" />
				{@render button(286, 240, 'fill-primary-500', ICON.message, 24)}
				{@render button(354, 240, 'fill-primary-500', ICON.video, 24)}
			</g>

			<!-- 6: she sees only what he chose to share -->
			<g class="{fade} {on(6, 6)}">
				<Card x={170} y={110} cover="fill-primary-200-800" photo="fill-primary-500" />
				<rect x="470" y="140" width="110" height="80" rx="10" fill="none" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 6" />
				{@render button(525, 180, 'fill-surface-400-600', ICON.lock, 20)}
				<path d="M466 180C440 180 410 180 384 180" fill="none" class="stroke-surface-400-600" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8" />
				<Cross x={426} y={180} r={14} />
			</g>
		</svg>
	{/snippet}
</PictureStory>
