<script lang="ts">
	/*
	 * How a video call works, as a short picture story (2 October 2026), the
	 * same family as ReceiptStory, FederationStory and MessageStory: find who,
	 * check how you look if you like, press Call and it rings, they answer,
	 * only the two of you can hear, and you each keep the record (ADR-Q-004).
	 *
	 * The player — autoplay, read-aloud, controls, captions — is PictureStory;
	 * this file is only the pictures. Words: `callstory.*` in the language books.
	 */
	import PictureStory from './PictureStory.svelte';
	import { t } from '$lib/i18n/index.svelte';
</script>

<PictureStory prefix="callstory">
	{#snippet pictures(on: (a: number, b?: number) => string, fade: string)}
		<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
			<!-- Ana: her computer, her folder -->
			<g>
				<circle cx="125" cy="72" r="22" class="fill-secondary-500" />
				<text x="125" y="80" text-anchor="middle" class="fill-surface-50 text-xl font-bold">A</text>
				<rect x="40" y="110" width="170" height="110" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
				<path d="M20 232h210l-16 14H36z" class="fill-surface-300-700" />
				<text x="125" y="276" text-anchor="middle" class="fill-surface-950-50 text-lg font-semibold">{t('story.ana')}</text>
			</g>
			<!-- Ben: his computer, his folder -->
			<g>
				<circle cx="515" cy="72" r="22" class="fill-primary-500" />
				<text x="515" y="80" text-anchor="middle" class="fill-surface-50 text-xl font-bold">B</text>
				<rect x="430" y="110" width="170" height="110" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
				<path d="M410 232h210l-16 14H426z" class="fill-surface-300-700" />
				<text x="515" y="276" text-anchor="middle" class="fill-surface-950-50 text-lg font-semibold">{t('story.ben')}</text>
			</g>

			<!-- 1: find who — a search, and Ben found -->
			<g class="{fade} {on(1, 1)}">
				<rect x="56" y="124" width="138" height="26" rx="13" fill="none" class="stroke-primary-500" stroke-width="2.5" />
				<circle cx="73" cy="136" r="6" fill="none" class="stroke-surface-500" stroke-width="2.5" />
				<path d="M78 141l5 5" class="stroke-surface-500" stroke-width="2.5" stroke-linecap="round" />
				<rect x="92" y="132" width="44" height="8" rx="4" class="fill-surface-300-700" />
				<rect x="56" y="164" width="138" height="34" rx="17" class="fill-primary-100-900" />
				<circle cx="74" cy="181" r="11" class="fill-primary-500" />
				<text x="74" y="186" text-anchor="middle" class="fill-surface-50 text-xs font-bold">B</text>
				<rect x="94" y="177" width="64" height="8" rx="4" class="fill-surface-400-600" />
				<line x1="230" y1="165" x2="410" y2="165" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 10" />
			</g>

			<!-- 2: see yourself, hear your microphone -->
			<g class="{fade} {on(2, 2)}">
				<circle cx="125" cy="117" r="3" class="fill-success-500" />
				<circle cx="108" cy="166" r="28" class="fill-secondary-500" />
				<text x="108" y="174" text-anchor="middle" class="fill-surface-50 text-xl font-bold">A</text>
				{#each [10, 18, 28, 20, 12] as h, i (i)}
					<rect x={160 + i * 8} y={186 - h} width="5" height={h} rx="2.5" class="fill-success-500" />
				{/each}
			</g>

			<!-- 3: Call — it rings on Ben's Q -->
			<g class="{fade} {on(3, 3)}">
				<path d="M215 150C290 95 350 95 425 150" fill="none" class="stroke-secondary-500" stroke-width="5" stroke-linecap="round" />
				<path d="M425 150l-18-2 9-14z" class="fill-secondary-500" />
				<path d="M482 134a46 46 0 0 1 66 0M490 144a34 34 0 0 1 50 0" fill="none" class="stroke-success-500" stroke-width="3" stroke-linecap="round" />
				<circle cx="515" cy="176" r="24" class="fill-success-500" />
				<g transform="translate(503 164)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" fill="none" class="stroke-surface-50" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></g>
			</g>

			<!-- 4–5: answered — each sees the other -->
			<g class="{fade} {on(4, 5)}">
				<circle cx="125" cy="165" r="30" class="fill-primary-500" />
				<text x="125" y="174" text-anchor="middle" class="fill-surface-50 text-2xl font-bold">B</text>
				<circle cx="515" cy="165" r="30" class="fill-secondary-500" />
				<text x="515" y="174" text-anchor="middle" class="fill-surface-50 text-2xl font-bold">A</text>
				<line x1="214" y1="165" x2="426" y2="165" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
			</g>

			<!-- 5: only the two of them can hear -->
			<g class="{fade} {on(5, 5)}">
				<path d="M311 158v-7a9 9 0 0 1 18 0v7" fill="none" class="stroke-primary-500" stroke-width="4" />
				<rect x="301" y="156" width="38" height="28" rx="5" class="fill-primary-500" />
				<circle cx="320" cy="169" r="3.5" class="fill-surface-50" />
			</g>

			<!-- 6: hung up; a record each — who, when, how long -->
			<g class="{fade} {on(6)}">
				<circle cx="320" cy="150" r="24" class="fill-error-500" />
				<g transform="translate(308 138) rotate(135 12 12)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" fill="none" class="stroke-surface-50" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></g>
			</g>
			{#each [{ x: 100, f: 'fill-secondary-200-800' }, { x: 490, f: 'fill-primary-200-800' }] as d (d.x)}
				<g class="{fade} {on(6)}">
					<path d="M{d.x - 42} 196v-18h14l5 5h24v13z" class={d.f} />
					<rect x={d.x} y="122" width="56" height="74" rx="5" class="fill-surface-50-950 stroke-surface-500" stroke-width="2.5" />
					<circle cx={d.x + 16} cy="142" r="8" fill="none" class="stroke-surface-500" stroke-width="2" />
					<path d="M{d.x + 16} 137v5l3 2" fill="none" class="stroke-surface-500" stroke-width="2" stroke-linecap="round" />
					<rect x={d.x + 30} y="139" width="18" height="5" rx="2.5" class="fill-surface-300-700" />
					<rect x={d.x + 9} y="158" width="36" height="5" rx="2.5" class="fill-surface-300-700" />
					<circle cx={d.x + 17} cy="180" r="7" class="fill-secondary-500" />
					<circle cx={d.x + 37} cy="180" r="7" class="fill-primary-500" />
					<circle cx={d.x + 55} cy="124" r="15" class="fill-success-500" />
					<path d="M{d.x + 48} 124l5 5 10-10" fill="none" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
				</g>
			{/each}
		</svg>
	{/snippet}
</PictureStory>
