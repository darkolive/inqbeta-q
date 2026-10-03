<script lang="ts">
	/*
	 * What Information is, as a short picture story (3 October 2026), the same
	 * family as the others: your details are kept in your vault, a switch
	 * beside each one decides what people see, one card for you, one for each
	 * place you work, membership cards from your clubs, and Share sends exactly
	 * what a card shows (ADR-Q-015: cards with a purpose).
	 *
	 * The player — autoplay, read-aloud, controls, captions — is PictureStory;
	 * this file is only the pictures. Words: `infostory.*` in the language books.
	 */
	import PictureStory from './PictureStory.svelte';
	import { Tick, Card, Person } from './story';

	/* The details on your profile: how long each line is, and whether it is on a card. */
	const ROWS = [
		{ y: 116, w: 90, on: true },
		{ y: 150, w: 70, on: true },
		{ y: 184, w: 80, on: true },
		{ y: 218, w: 60, on: false },
		{ y: 252, w: 76, on: true }
	];
</script>

<!-- A small round badge on a card, with a picture in it. -->
{#snippet badge(x: number, y: number, fill: string, d: string)}
	<circle cx={x} cy={y} r="18" class={fill} />
	<path {d} transform="translate({x} {y})" fill="none" class="stroke-surface-50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
{/snippet}

<PictureStory prefix="infostory">
	{#snippet pictures(on: (a: number, b?: number) => string, fade: string)}
		<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
			<!-- Ana's profile: always there -->
			<g>
				<rect x="30" y="24" width="200" height="272" rx="12" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
				<path d="M31.5 35.5a10 10 0 0 1 10-10h177a10 10 0 0 1 10 10v34.5h-197z" class="fill-surface-300-700" />
				<Person x={76} y={72} letter="A" />
				<rect x="106" y="80" width="84" height="10" rx="5" class="fill-surface-950-50" opacity="0.7" />
				{#each ROWS as r (r.y)}
					<circle cx="54" cy={r.y} r="8" class="fill-surface-300-700" />
					<rect x="70" y={r.y - 4} width={r.w} height="8" rx="4" class="fill-surface-300-700" />
				{/each}
			</g>

			<!-- 1: filled in a step at a time, kept in her vault -->
			<g class="{fade} {on(1, 1)}">
				<rect x="40" y="100" width="180" height="168" rx="8" fill="none" class="stroke-secondary-500" stroke-width="3" stroke-dasharray="4 8" />
				<Tick x={220} y={100} r={14} />
			</g>

			<!-- 2 on: a switch beside each detail — on the card, or just for her -->
			<g class="{fade} {on(2)}">
				{#each ROWS as r (r.y)}
					<rect x="176" y={r.y - 9} width="34" height="18" rx="9" class={r.on ? 'fill-primary-500' : 'fill-surface-300-700'} />
					<circle cx={r.on ? 201 : 185} cy={r.y} r="6" class="fill-surface-50" />
				{/each}
			</g>

			<!-- 2: flip a switch, and the card changes -->
			<g class="{fade} {on(2, 2)}">
				<Card x={380} y={98} />
				<path d="M216 150C280 150 320 150 370 156" fill="none" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
				<path d="M376 157l-15 7v-14z" class="fill-primary-500" />
			</g>

			<!-- 3: one card for her — friends and family -->
			<g class="{fade} {on(3, 3)}">
				<Card x={380} y={98} />
				{@render badge(570, 98, 'fill-primary-500', 'M-8 1l8-7 8 7M-5 -1v8h10v-8')}
			</g>

			<!-- 4: one for each place she works -->
			<g class="{fade} {on(4, 4)}">
				<Card x={330} y={56} cover="fill-primary-200-800" />
				<Card x={410} y={150} cover="fill-primary-200-800" />
				{@render badge(520, 56, 'fill-primary-500', 'M-8 -3h16v10h-16zM-3 -3v-3h6v3')}
				{@render badge(600, 150, 'fill-primary-500', 'M-8 -3h16v10h-16zM-3 -3v-3h6v3')}
			</g>

			<!-- 5: a membership card from her club — what it lets her do, and until when -->
			<g class="{fade} {on(5, 5)}">
				<Card x={380} y={98} cover="fill-tertiary-200-800" />
				<path d="M548 166l16 9v18l-16 9-16-9v-18z" class="fill-primary-500" />
				<path d="M541 184l5 5 9-9" fill="none" class="stroke-surface-50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
				{@render badge(570, 98, 'fill-secondary-500', 'M0 -8a8 8 0 1 0 0.01 0M0 -4v4h4')}
			</g>

			<!-- 6: Share sends exactly what the card shows: email, message, or a code -->
			<g class="{fade} {on(6, 6)}">
				<Card x={290} y={98} />
				{#each [70, 160, 250] as y (y)}
					<path d="M496 160C520 160 540 {y} 566 {y}" fill="none" class="stroke-secondary-500" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="2 7" />
				{/each}
				<!-- email -->
				<rect x="572" y="52" width="52" height="36" rx="5" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" />
				<path d="M574 56l24 18 24-18" fill="none" class="stroke-surface-500" stroke-width="3" stroke-linejoin="round" />
				<!-- a message -->
				<path d="M576 144h44a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6h-30l-10 10v-10h-4a6 6 0 0 1-6-6v-20a6 6 0 0 1 6-6z" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" stroke-linejoin="round" />
				<!-- a code -->
				<rect x="574" y="230" width="44" height="44" rx="4" class="fill-surface-50-950 stroke-surface-950-50" stroke-width="3" />
				<rect x="580" y="236" width="11" height="11" class="fill-surface-950-50" />
				<rect x="601" y="236" width="11" height="11" class="fill-surface-950-50" />
				<rect x="580" y="257" width="11" height="11" class="fill-surface-950-50" />
				<rect x="601" y="258" width="6" height="6" class="fill-surface-950-50" />
			</g>
		</svg>
	{/snippet}
</PictureStory>
