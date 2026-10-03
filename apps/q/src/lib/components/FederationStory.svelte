<script lang="ts">
	/*
	 * What a federation is, as a short picture story (2 October 2026), made the
	 * same way as the home page's ReceiptStory so the two read as one family:
	 * people agree, write it down, someone founds it with the federation's own
	 * key, others join one step at a time, the federation vouches for what's made
	 * in it, and federations vouch for each other. Anyone can leave.
	 *
	 * The player — autoplay, read-aloud, controls, captions — is PictureStory;
	 * this file is only the pictures. Words: `fedstory.*` in the language books.
	 */
	import PictureStory from './PictureStory.svelte';
</script>

<PictureStory prefix="fedstory">
	{#snippet pictures(on: (a: number, b?: number) => string, fade: string)}
		<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
			<!-- The people: always there -->
			{#each [{ x: 110, y: 230, l: 'A', c: 'fill-secondary-500' }, { x: 240, y: 268, l: 'B', c: 'fill-primary-500' }, { x: 400, y: 268, l: 'C', c: 'fill-tertiary-500' }, { x: 530, y: 230, l: 'D', c: 'fill-primary-700' }] as p (p.l)}
				<g>
					<circle cx={p.x} cy={p.y} r="22" class={p.c} />
					<text x={p.x} y={p.y + 8} text-anchor="middle" class="fill-surface-50 text-xl font-bold">{p.l}</text>
				</g>
			{/each}

			<!-- 1: people who want to do something together -->
			<g class="{fade} {on(1, 1)}">
				<ellipse cx="320" cy="245" rx="270" ry="62" fill="none" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 10" />
			</g>

			<!-- 2 on: the agreement, written down -->
			<g class="{fade} {on(2)}">
				<rect x="270" y="40" width="100" height="136" rx="8" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" />
				<rect x="286" y="60" width="68" height="8" rx="4" class="fill-surface-300-700" />
				<rect x="286" y="78" width="54" height="8" rx="4" class="fill-surface-300-700" />
				<rect x="286" y="96" width="62" height="8" rx="4" class="fill-surface-300-700" />
				<rect x="286" y="114" width="40" height="8" rx="4" class="fill-surface-300-700" />
			</g>

			<!-- 3 on: founded — the founder and the federation's own key both sign -->
			<g class="{fade} {on(3)}">
				<path d="M128 210C170 150 220 120 268 120" fill="none" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" />
				<circle cx="298" cy="152" r="13" class="fill-secondary-500" />
				<text x="298" y="157" text-anchor="middle" class="fill-surface-50 text-sm font-bold">A</text>
				<path d="M342 138l13 7v14l-13 7-13-7v-14z" class="fill-primary-500" />
				<path d="M336 152l4 4 8-8" fill="none" class="stroke-surface-50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
			</g>

			<!-- 4 on: others join, each signing for themselves -->
			<g class="{fade} {on(4)}">
				<path d="M246 246C258 210 282 190 300 178" fill="none" class="stroke-primary-500" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7" />
				<path d="M394 246C382 210 358 190 340 178" fill="none" class="stroke-tertiary-500" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7" />
				<path d="M512 212C470 160 420 140 372 132" fill="none" class="stroke-primary-700" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7" />
				{#each [{ x: 262, y: 236 }, { x: 418, y: 236 }, { x: 552, y: 200 }] as s (s.x)}
					<circle cx={s.x} cy={s.y} r="10" class="fill-success-500" />
					<path d="M{s.x - 5} {s.y}l3.5 3.5 7-7" fill="none" class="stroke-surface-50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
				{/each}
			</g>

			<!-- 5: the federation vouches — a member's receipt carries its stamp -->
			<g class="{fade} {on(5, 5)}">
				<rect x="430" y="70" width="64" height="84" rx="6" class="fill-surface-50-950 stroke-surface-500" stroke-width="2.5" />
				<rect x="441" y="84" width="40" height="6" rx="3" class="fill-surface-300-700" />
				<rect x="441" y="97" width="30" height="6" rx="3" class="fill-surface-300-700" />
				<path d="M462 116l11 6v12l-11 6-11-6v-12z" class="fill-primary-500" />
				<circle cx="492" cy="72" r="14" class="fill-success-500" />
				<path d="M485 72l5 5 9-9" fill="none" class="stroke-surface-50" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
			</g>

			<!-- 6: federations vouch for each other -->
			<g class="{fade} {on(6)}">
				<path d="M372 96C430 70 480 66 540 72" fill="none" class="stroke-primary-500" stroke-width="3.5" stroke-linecap="round" />
				<path d="M576 48l26 14v28l-26 14-26-14v-28z" class="fill-tertiary-500" />
				<path d="M564 76l8 8 16-16" fill="none" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
				<path d="M64 76l26 14v28l-26 14-26-14v-28z" class="fill-surface-300-700" />
				<path d="M90 104C150 104 210 100 268 96" fill="none" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 8" />
			</g>
		</svg>
	{/snippet}
</PictureStory>
