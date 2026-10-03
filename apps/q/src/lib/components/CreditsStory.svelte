<script lang="ts">
	/*
	 * How credits work, as a short picture story (3 October 2026), the same
	 * family as the others (ADR-Q-017, ADR-Q-023): passing things between
	 * people is free up to a daily amount; more than that uses credits; you buy
	 * them in packs, each one a receipt; every move is checked by the rules
	 * before it's kept; node operators will earn them for capacity delivered;
	 * and people will trade them — never for pounds back.
	 *
	 * Rewards and trades are not built yet (ADR-Q-023 build order 6–7), so
	 * their words say "coming soon". Change them when they open.
	 *
	 * The player — autoplay, read-aloud, controls, captions — is PictureStory;
	 * this file is only the pictures. Words: `credstory.*` in the language books.
	 */
	import PictureStory from './PictureStory.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { Tick, Cross, Folder, Envelope, Coin, Person } from './story';

	/* A shield: checked by the rules. Centred on 0 0. */
	const SHIELD = 'M0 -28l24 9v15c0 18-11 28-24 32c-13-4-24-14-24-32v-15z';
</script>

<!-- A receipt: a sheet with lines on it. (x, y) is the top-left; 80 × 104. -->
{#snippet receipt(x: number, y: number, dashed = false)}
	<rect {x} {y} width="80" height="104" rx="6" class={dashed ? 'fill-none stroke-error-500' : 'fill-surface-50-950 stroke-surface-500'} stroke-width="3" stroke-dasharray={dashed ? '6 5' : undefined} />
	<rect x={x + 12} y={y + 16} width="56" height="6" rx="3" class="fill-surface-300-700" />
	<rect x={x + 12} y={y + 30} width="40" height="6" rx="3" class="fill-surface-300-700" />
	<rect x={x + 12} y={y + 44} width="48" height="6" rx="3" class="fill-surface-300-700" />
{/snippet}

<PictureStory prefix="credstory">
	{#snippet pictures(on: (a: number, b?: number) => string, fade: string)}
		<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
			<!-- Ana: always there -->
			<Person x={80} y={60} letter="A" name={t('story.ana')} />

			<!-- 1–2 and 6: Ben -->
			<g class="{fade} {on(1, 2)}"><Person x={560} y={60} letter="B" fill="fill-primary-500" name={t('story.ben')} /></g>
			<g class="{fade} {on(6)}"><Person x={560} y={60} letter="B" fill="fill-primary-500" name={t('story.ben')} /></g>

			<!-- 1–2: today's free amount, as a bar -->
			<g class="{fade} {on(1, 2)}">
				<rect x="150" y="226" width="300" height="24" rx="12" class="fill-surface-300-700" />
			</g>

			<!-- 1: passing things between people is free, up to a daily amount -->
			<g class="{fade} {on(1, 1)}">
				<path d="M110 70C250 40 400 40 528 64" fill="none" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8" />
				<Envelope x={220} y={88} />
				<Folder x={330} y={90} s={0.8} />
				<rect x="150" y="226" width="110" height="24" rx="12" class="fill-primary-500" />
				<Tick x={474} y={238} />
			</g>

			<!-- 2: more than that — bigger, or more often — uses credits -->
			<g class="{fade} {on(2, 2)}">
				<path d="M110 70C250 40 400 40 528 64" fill="none" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" />
				<Folder x={250} y={78} s={1.6} />
				<rect x="150" y="226" width="300" height="24" rx="12" class="fill-primary-500" />
				<Coin x={482} y={238} />
				<Coin x={514} y={238} />
				<Coin x={546} y={238} />
			</g>

			<!-- 3: buy a pack; it's a receipt, kept in her vault -->
			<g class="{fade} {on(3, 3)}">
				<circle cx="190" cy="180" r="26" class="fill-surface-300-700" />
				<text x="190" y="190" text-anchor="middle" class="fill-surface-950-50 font-bold" font-size="28">£</text>
				<path d="M222 180h42" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
				<path d="M270 180l-12 7v-14z" class="fill-primary-500" />
				<Coin x={310} y={180} r={24} />
				<path d="M338 180h42" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
				<path d="M386 180l-12 7v-14z" class="fill-primary-500" />
				{@render receipt(400, 128)}
				<Coin x={440} y={206} r={11} />
				<Tick x={480} y={128} />
			</g>

			<!-- 4: every move checked by the rules before it's kept — never more than she holds, never twice -->
			<g class="{fade} {on(4, 4)}">
				{@render receipt(220, 110)}
				<Coin x={260} y={188} r={11} />
				<path d={SHIELD} transform="translate(340 170)" class="fill-primary-500" />
				<path d="M329 172l7 7 13-13" fill="none" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
				{@render receipt(420, 110, true)}
				<Cross x={500} y={110} />
			</g>

			<!-- 5: coming soon — run a node, earn credits for what it delivers -->
			<g class="{fade} {on(5, 5)}">
				<rect x="440" y="100" width="120" height="150" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
				{#each [124, 164, 204] as y (y)}
					<rect x="456" y={y} width="88" height="26" rx="5" class="fill-surface-300-700" />
					<circle cx="530" cy={y + 13} r="5" class="fill-success-500" />
				{/each}
				<Tick x={560} y={100} r={14} />
				<path d="M432 170C360 160 260 150 160 110" fill="none" class="stroke-secondary-500" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 8" />
				<Coin x={360} y={160} />
				<Coin x={290} y={146} />
				<Coin x={220} y={130} />
			</g>

			<!-- 6: coming soon — trade with people; both sign; never cashed out for pounds -->
			<g class="{fade} {on(6, 6)}">
				{@render receipt(280, 96)}
				<circle cx="300" cy="176" r="12" class="fill-secondary-500" />
				<text x="300" y="181" text-anchor="middle" class="fill-surface-50 text-sm font-bold">A</text>
				<circle cx="336" cy="176" r="12" class="fill-primary-500" />
				<text x="336" y="181" text-anchor="middle" class="fill-surface-50 text-sm font-bold">B</text>
				<path d="M110 90C170 120 220 130 270 136" fill="none" class="stroke-secondary-500" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 8" />
				<path d="M370 136C420 130 480 120 530 90" fill="none" class="stroke-primary-500" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 8" />
				<Coin x={200} y={124} />
				<Coin x={450} y={124} />
				<circle cx="320" cy="262" r="22" class="fill-surface-300-700" />
				<text x="320" y="271" text-anchor="middle" class="fill-surface-950-50 font-bold" font-size="24">£</text>
				<Cross x={340} y={246} r={11} />
			</g>
		</svg>
	{/snippet}
</PictureStory>
