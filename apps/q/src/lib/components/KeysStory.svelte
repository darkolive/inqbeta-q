<script lang="ts">
	/*
	 * How your keys work, as a short picture story (3 October 2026), the same
	 * family as ReceiptStory, FederationStory, MessageStory and CallStory: your
	 * passkey is you, only you hold it, your phone and sites get keys linked to
	 * it, you can give someone a power, take it back, and a way back in keeps
	 * you you if the passkey is lost (ADR-Q-005).
	 *
	 * The player — autoplay, read-aloud, controls, captions — is PictureStory;
	 * this file is only the pictures. Words: `keystory.*` in the language books.
	 */
	import PictureStory from './PictureStory.svelte';
	import { t } from '$lib/i18n/index.svelte';
</script>

<!-- A key: round head with a hole, a shaft, two teeth. (x, y) is the head's centre. -->
{#snippet key(x: number, y: number, s: number, fill: string)}
	<g transform="translate({x} {y}) scale({s})">
		<circle r="16" class={fill} />
		<circle r="6" class="fill-surface-50-950" />
		<rect x="12" y="-4" width="44" height="8" rx="2" class={fill} />
		<rect x="40" y="4" width="6" height="10" rx="1" class={fill} />
		<rect x="50" y="4" width="6" height="7" rx="1" class={fill} />
	</g>
{/snippet}

<!-- A tick in a green circle. -->
{#snippet tick(x: number, y: number, r = 12)}
	<circle cx={x} cy={y} r={r} class="fill-success-500" />
	<path d="M{x - r * 0.45} {y}l{r * 0.3} {r * 0.3} {r * 0.6} {-r * 0.6}" fill="none" class="stroke-surface-50" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
{/snippet}

<!-- A cross in a red circle. -->
{#snippet cross(x: number, y: number, r = 14)}
	<circle cx={x} cy={y} r={r} class="fill-error-500" />
	<path d="M{x - r * 0.4} {y - r * 0.4}l{r * 0.8} {r * 0.8}M{x + r * 0.4} {y - r * 0.4}l{-r * 0.8} {r * 0.8}" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" />
{/snippet}

<PictureStory prefix="keystory">
	{#snippet pictures(on: (a: number, b?: number) => string, fade: string)}
		<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
			<!-- Ana and her computer: always there -->
			<g>
				<circle cx="120" cy="60" r="22" class="fill-secondary-500" />
				<text x="120" y="68" text-anchor="middle" class="fill-surface-50 text-xl font-bold">A</text>
				<rect x="40" y="96" width="160" height="108" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
				<path d="M20 216h200l-16 14H36z" class="fill-surface-300-700" />
				<text x="120" y="266" text-anchor="middle" class="fill-surface-950-50 text-lg font-semibold">{t('story.ana')}</text>
			</g>

			<!-- 1–5: her passkey, in her computer -->
			<g class="{fade} {on(1, 5)}">
				{@render key(94, 150, 1, 'fill-primary-500')}
			</g>

			<!-- 1: it is her — her face or finger opens it -->
			<g class="{fade} {on(1, 1)}">
				<circle cx="120" cy="150" r="46" fill="none" class="stroke-secondary-500" stroke-width="3" stroke-dasharray="4 8" />
				<path d="M120 84v18" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" />
				{@render tick(164, 112)}
			</g>

			<!-- 2: only she holds it — Q never gets a copy -->
			<g class="{fade} {on(2, 2)}">
				<rect x="460" y="96" width="140" height="108" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
				<text x="530" y="168" text-anchor="middle" class="fill-secondary-500 font-bold" font-size="56">Q</text>
				<line x1="214" y1="150" x2="446" y2="150" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 10" />
				<g opacity="0.55">{@render key(278, 150, 0.8, 'fill-surface-400-600')}</g>
				{@render cross(346, 150, 20)}
			</g>

			<!-- 3: her phone and her site get keys of their own, linked to hers -->
			<g class="{fade} {on(3, 3)}">
				<rect x="420" y="56" width="62" height="108" rx="12" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
				<rect x="440" y="150" width="22" height="5" rx="2.5" class="fill-surface-300-700" />
				{@render key(441, 104, 0.5, 'fill-primary-500')}
				<rect x="500" y="186" width="120" height="80" rx="8" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
				<rect x="500" y="186" width="120" height="16" rx="8" class="fill-surface-300-700" />
				<circle cx="512" cy="194" r="3" class="fill-surface-50-950" />
				<circle cx="522" cy="194" r="3" class="fill-surface-50-950" />
				{@render key(530, 234, 0.5, 'fill-primary-500')}
				<path d="M204 130C290 100 350 100 414 108" fill="none" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
				<path d="M204 176C300 210 400 226 494 226" fill="none" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
				{@render tick(310, 106)}
				{@render tick(350, 210)}
			</g>

			<!-- 4–5: Ben -->
			<g class="{fade} {on(4, 5)}">
				<circle cx="530" cy="60" r="22" class="fill-primary-500" />
				<text x="530" y="68" text-anchor="middle" class="fill-surface-50 text-xl font-bold">B</text>
				<text x="530" y="112" text-anchor="middle" class="fill-surface-950-50 text-lg font-semibold">{t('story.ben')}</text>
			</g>

			<!-- 4–5: the power she gives him, written down: who, who, what, until when -->
			<g class="{fade} {on(4, 5)}">
				<rect x="280" y="120" width="104" height="140" rx="8" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" />
				<rect x="296" y="140" width="72" height="8" rx="4" class="fill-surface-300-700" />
				<rect x="296" y="158" width="56" height="8" rx="4" class="fill-surface-300-700" />
				<rect x="296" y="176" width="64" height="8" rx="4" class="fill-surface-300-700" />
				<circle cx="304" cy="206" r="8" fill="none" class="stroke-surface-500" stroke-width="2.5" />
				<path d="M304 201v5h4" fill="none" class="stroke-surface-500" stroke-width="2" stroke-linecap="round" />
				<rect x="318" y="202" width="40" height="8" rx="4" class="fill-surface-300-700" />
				<circle cx="304" cy="238" r="12" class="fill-secondary-500" />
				<text x="304" y="243" text-anchor="middle" class="fill-surface-50 text-sm font-bold">A</text>
			</g>

			<!-- 4: it goes to Ben -->
			<g class="{fade} {on(4, 4)}">
				<path d="M390 150C440 130 480 110 508 84" fill="none" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" />
				<path d="M512 78l-4 18-12-10z" class="fill-secondary-500" />
				{@render tick(368, 124)}
			</g>

			<!-- 5: she takes it back — one press -->
			<g class="{fade} {on(5, 5)}">
				<rect x="280" y="120" width="104" height="140" rx="8" fill="none" class="stroke-error-500" stroke-width="3" stroke-dasharray="6 5" />
				<path d="M276 200C250 210 230 200 212 184" fill="none" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" />
				<path d="M206 176l18 2-8 14z" class="fill-secondary-500" />
				{@render cross(384, 120)}
			</g>

			<!-- 6: the passkey is gone, but a way back in opens her vault as the same her -->
			<g class="{fade} {on(6)}">
				<text x="120" y="172" text-anchor="middle" class="fill-surface-400-600 font-bold" font-size="64">?</text>
				<!-- a recovery card -->
				<rect x="250" y="70" width="110" height="70" rx="8" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" />
				{@render key(272, 105, 0.5, 'fill-secondary-500')}
				<rect x="306" y="94" width="40" height="6" rx="3" class="fill-surface-300-700" />
				<rect x="306" y="110" width="30" height="6" rx="3" class="fill-surface-300-700" />
				<!-- or a second passkey -->
				<rect x="276" y="176" width="54" height="92" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
				{@render key(293, 218, 0.45, 'fill-primary-500')}
				<!-- the vault -->
				<rect x="470" y="96" width="130" height="130" rx="12" class="fill-surface-50-950 stroke-primary-500" stroke-width="4" />
				<circle cx="535" cy="161" r="30" fill="none" class="stroke-primary-500" stroke-width="4" />
				<path d="M535 135v10M535 177v10M509 161h10M551 161h10" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
				<path d="M366 110C410 112 440 124 464 140" fill="none" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8" />
				<path d="M336 222C390 220 430 206 464 186" fill="none" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8" />
				{@render tick(596, 100, 16)}
			</g>
		</svg>
	{/snippet}
</PictureStory>
