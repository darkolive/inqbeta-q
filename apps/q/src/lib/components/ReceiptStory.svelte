<script lang="ts">
	/*
	 * How Q works, as a short picture story — "visual explanation is much
	 * easier" (Darren, 29 September). Two people, two computers, one receipt:
	 * something happens, Q writes it down, both sign, each keeps a copy, and
	 * the proof holds.
	 *
	 * The player — autoplay, read-aloud, controls, captions — is PictureStory;
	 * this file is only the pictures. Words: `story.*` in the language books.
	 */
	import PictureStory from './PictureStory.svelte';
	import { t } from '$lib/i18n/index.svelte';
</script>

<PictureStory prefix="story">
	{#snippet pictures(on: (a: number, b?: number) => string, fade: string)}
		<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
			<!-- Ana: her computer, her folder -->
			<g>
				<circle cx="125" cy="72" r="22" class="fill-secondary-500" />
				<text x="125" y="80" text-anchor="middle" class="fill-surface-50 text-xl font-bold">A</text>
				<rect x="40" y="110" width="170" height="110" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
				<path d="M20 232h210l-16 14H36z" class="fill-surface-300-700" />
				<path d="M58 196v-18h14l5 5h24v13z" class="fill-secondary-200-800" />
				<text x="125" y="276" text-anchor="middle" class="fill-surface-950-50 text-lg font-semibold">{t('story.ana')}</text>
			</g>
			<!-- Ben: his computer, his folder -->
			<g>
				<circle cx="515" cy="72" r="22" class="fill-primary-500" />
				<text x="515" y="80" text-anchor="middle" class="fill-surface-50 text-xl font-bold">B</text>
				<rect x="430" y="110" width="170" height="110" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
				<path d="M410 232h210l-16 14H426z" class="fill-surface-300-700" />
				<path d="M448 196v-18h14l5 5h24v13z" class="fill-primary-200-800" />
				<text x="515" y="276" text-anchor="middle" class="fill-surface-950-50 text-lg font-semibold">{t('story.ben')}</text>
			</g>

			<!-- 1: nothing in the middle -->
			<g class="{fade} {on(1, 1)}">
				<line x1="230" y1="165" x2="410" y2="165" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 10" />
			</g>

			<!-- 2: something happens, Ana → Ben -->
			<g class="{fade} {on(2, 2)}">
				<path d="M215 150C290 95 350 95 425 150" fill="none" class="stroke-secondary-500" stroke-width="5" stroke-linecap="round" />
				<path d="M425 150l-18-2 9-14z" class="fill-secondary-500" />
			</g>

			<!-- 3–4: the receipt, signed by Ana, then by Ben -->
			<g class="{fade} {on(3, 4)}">
				<rect x="270" y="90" width="100" height="140" rx="8" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" />
				<rect x="286" y="110" width="68" height="8" rx="4" class="fill-surface-300-700" />
				<rect x="286" y="128" width="54" height="8" rx="4" class="fill-surface-300-700" />
				<rect x="286" y="146" width="62" height="8" rx="4" class="fill-surface-300-700" />
				<rect x="286" y="164" width="40" height="8" rx="4" class="fill-surface-300-700" />
				<circle cx="300" cy="204" r="14" class="fill-secondary-500" />
				<text x="300" y="209" text-anchor="middle" class="fill-surface-50 text-sm font-bold">A</text>
			</g>
			<g class="{fade} {on(4, 4)}">
				<circle cx="340" cy="204" r="14" class="fill-primary-500" />
				<text x="340" y="209" text-anchor="middle" class="fill-surface-50 text-sm font-bold">B</text>
			</g>

			<!-- 5–6: a copy each, in each folder -->
			{#each [125, 515] as x (x)}
				<g class="{fade} {on(5)}">
					<rect x={x - 5} y="122" width="56" height="74" rx="5" class="fill-surface-50-950 stroke-surface-500" stroke-width="2.5" />
					<rect x={x + 4} y="134" width="36" height="5" rx="2.5" class="fill-surface-300-700" />
					<rect x={x + 4} y="145" width="28" height="5" rx="2.5" class="fill-surface-300-700" />
					<circle cx={x + 12} cy="180" r="7" class="fill-secondary-500" />
					<circle cx={x + 32} cy="180" r="7" class="fill-primary-500" />
				</g>
				<!-- 6: both still check -->
				<g class="{fade} {on(6)}">
					<circle cx={x + 50} cy="124" r="15" class="fill-success-500" />
					<path d="M{x + 43} 124l5 5 10-10" fill="none" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
				</g>
			{/each}

			<!-- 6: a changed copy does not -->
			<g class="{fade} {on(6)}">
				<rect x="292" y="120" width="56" height="74" rx="5" class="fill-surface-50-950 stroke-error-500" stroke-width="2.5" stroke-dasharray="5 4" />
				<rect x="301" y="132" width="36" height="5" rx="2.5" class="fill-error-500" />
				<rect x="301" y="143" width="28" height="5" rx="2.5" class="fill-surface-300-700" />
				<circle cx="342" cy="122" r="15" class="fill-error-500" />
				<path d="M336 116l12 12M348 116l-12 12" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" />
			</g>
		</svg>
	{/snippet}
</PictureStory>
