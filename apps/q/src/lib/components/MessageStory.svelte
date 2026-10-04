<script lang="ts">
	/*
	 * How a message gets from one person to another, as a short picture story
	 * (2 October 2026), the same family as ReceiptStory and FederationStory.
	 * Plain steps, one at a time: write it, choose who, Q seals it, it waits in
	 * storage while the bellboy rings their bell (ADR-Q-014), they open it, and
	 * you both keep a signed copy.
	 *
	 * The player — autoplay, read-aloud, controls, captions — is PictureStory;
	 * this file is only the pictures. Words: `msgstory.*` in the language books.
	 */
	import PictureStory from './PictureStory.svelte';
	import { t } from '$lib/i18n/index.svelte';
</script>

<PictureStory prefix="msgstory">
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

			<!-- 2: choose who — Ana's people, Ben picked out (the message comes first, 4 October 2026) -->
			<g class="{fade} {on(2, 2)}">
				<rect x="52" y="152" width="146" height="28" rx="14" fill="none" class="stroke-secondary-500" stroke-width="3" />
				{#each [{ y: 132, c: 'fill-tertiary-500' }, { y: 166, c: 'fill-primary-500' }, { y: 200, c: 'fill-surface-400-600' }] as r (r.y)}
					<circle cx="70" cy={r.y} r="9" class={r.c} />
					<rect x="88" y={r.y - 4} width="80" height="8" rx="4" class="fill-surface-300-700" />
				{/each}
				<line x1="230" y1="165" x2="410" y2="165" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 10" />
			</g>

			<!-- 1: write it -->
			<g class="{fade} {on(1, 1)}">
				<path d="M60 124h130a8 8 0 0 1 8 8v50a8 8 0 0 1-8 8H96l-14 14v-14H60a8 8 0 0 1-8-8v-50a8 8 0 0 1 8-8z" class="fill-secondary-100-900 stroke-secondary-500" stroke-width="2.5" />
				<rect x="68" y="138" width="100" height="8" rx="4" class="fill-surface-400-600" />
				<rect x="68" y="154" width="80" height="8" rx="4" class="fill-surface-400-600" />
				<rect x="68" y="170" width="56" height="8" rx="4" class="fill-surface-400-600" />
			</g>

			<!-- 3–4: sealed — an envelope with a lock, from Ana -->
			<g class="{fade} {on(3, 4)}">
				<path d="M215 152C238 142 252 142 268 148" fill="none" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" />
				<rect x="275" y="112" width="90" height="62" rx="6" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" />
				<path d="M277 116l43 30 43-30" fill="none" class="stroke-surface-500" stroke-width="3" stroke-linejoin="round" />
				<path d="M311 160v-7a9 9 0 0 1 18 0v7" fill="none" class="stroke-primary-500" stroke-width="4" />
				<rect x="303" y="158" width="34" height="26" rx="5" class="fill-primary-500" />
				<circle cx="320" cy="170" r="3.5" class="fill-surface-50" />
			</g>

			<!-- 4: it waits in storage; the bellboy rings Ben's bell -->
			<g class="{fade} {on(4, 4)}">
				<rect x="262" y="196" width="116" height="40" rx="6" class="fill-surface-200-800 stroke-surface-400-600" stroke-width="3" />
				<rect x="300" y="212" width="40" height="8" rx="4" class="fill-surface-400-600" />
				<path d="M368 130C430 70 510 40 556 52" fill="none" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="4 8" stroke-linecap="round" />
				<path d="M562 80h28l-5-7V61a9 9 0 0 0-18 0v12z" class="fill-secondary-500" />
				<circle cx="576" cy="84" r="4" class="fill-secondary-500" />
				<circle cx="592" cy="50" r="10" class="fill-error-500" />
				<text x="592" y="55" text-anchor="middle" class="fill-surface-50 text-sm font-bold">1</text>
			</g>

			<!-- 5: Ben opens it, on his computer -->
			<g class="{fade} {on(5, 5)}">
				<path d="M372 152C390 142 404 142 422 148" fill="none" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
				<path d="M450 124h130a8 8 0 0 1 8 8v50a8 8 0 0 1-8 8H564v14l-14-14H450a8 8 0 0 1-8-8v-50a8 8 0 0 1 8-8z" class="fill-primary-100-900 stroke-primary-500" stroke-width="2.5" />
				<rect x="458" y="138" width="100" height="8" rx="4" class="fill-surface-400-600" />
				<rect x="458" y="154" width="80" height="8" rx="4" class="fill-surface-400-600" />
				<rect x="458" y="170" width="56" height="8" rx="4" class="fill-surface-400-600" />
				<circle cx="582" cy="124" r="15" class="fill-success-500" />
				<path d="M575 124l5 5 10-10" fill="none" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
			</g>

			<!-- 6: a signed copy each, in each folder, and both check -->
			{#each [{ x: 100, f: 'fill-secondary-200-800' }, { x: 490, f: 'fill-primary-200-800' }] as d (d.x)}
				<g class="{fade} {on(6)}">
					<path d="M{d.x - 42} 196v-18h14l5 5h24v13z" class={d.f} />
					<rect x={d.x} y="122" width="56" height="74" rx="5" class="fill-surface-50-950 stroke-surface-500" stroke-width="2.5" />
					<rect x={d.x + 9} y="134" width="36" height="5" rx="2.5" class="fill-surface-300-700" />
					<rect x={d.x + 9} y="145" width="28" height="5" rx="2.5" class="fill-surface-300-700" />
					<circle cx={d.x + 17} cy="180" r="7" class="fill-secondary-500" />
					<circle cx={d.x + 37} cy="180" r="7" class="fill-primary-500" />
					<circle cx={d.x + 55} cy="124" r="15" class="fill-success-500" />
					<path d="M{d.x + 48} 124l5 5 10-10" fill="none" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
				</g>
			{/each}
		</svg>
	{/snippet}
</PictureStory>
