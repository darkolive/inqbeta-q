<script lang="ts">
	/*
	 * Why you can talk safely, as a short picture story (3 October 2026), the
	 * same family as the others: everyone has a lock anyone can use and a key
	 * only they hold; a message is locked to Ben before it leaves; nobody in
	 * between can open it; only his key does; your signature shows it's you;
	 * and calls are locked too, straight between you (seal.ts, ADR-Q-004).
	 *
	 * The player — autoplay, read-aloud, controls, captions — is PictureStory;
	 * this file is only the pictures. Words: `commstory.*` in the language books.
	 */
	import PictureStory from './PictureStory.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { Key, Tick, Cross, Padlock, Envelope, Laptop, Screen, Person } from './story';

	/* An eye — someone looking — centred on 0 0. */
	const EYE = 'M-18 0q18-16 36 0q-18 16-36 0z';
</script>

<PictureStory prefix="commstory">
	{#snippet pictures(on: (a: number, b?: number) => string, fade: string)}
		<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
			<!-- Ana and Ben: always there -->
			<Person x={80} y={60} letter="A" name={t('story.ana')} />
			<Person x={560} y={60} letter="B" fill="fill-primary-500" name={t('story.ben')} />

			<!-- 1: each has a lock anyone can use, and a key only they hold -->
			<g class="{fade} {on(1, 1)}">
				<Padlock x={64} y={180} open fill="fill-secondary-500" stroke="stroke-secondary-500" />
				<Key x={110} y={194} s={0.6} fill="fill-secondary-500" />
				<Padlock x={514} y={180} open />
				<Key x={560} y={194} s={0.6} />
				<!-- Ben's lock, copied to Ana: anyone may have it -->
				<path d="M492 196C420 240 300 240 236 206" fill="none" class="stroke-primary-500" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 8" />
				<g opacity="0.85"><Padlock x={214} y={190} open /></g>
			</g>

			<!-- 2: her letter, locked with Ben's lock before it leaves -->
			<g class="{fade} {on(2, 2)}">
				<Envelope x={130} y={170} />
				<Padlock x={165} y={186} />
				<Tick x={204} y={168} />
			</g>

			<!-- 3: on the way, nobody in between can open it -->
			<g class="{fade} {on(3, 3)}">
				<line x1="110" y1="210" x2="530" y2="210" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 10" />
				<Envelope x={285} y={186} />
				<Padlock x={320} y={202} />
				{#each [210, 320, 430] as x (x)}
					<path d={EYE} transform="translate({x} 120)" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
					<circle cx={x} cy="120" r="6" class="fill-surface-400-600" />
					<Cross x={x + 20} y={104} r={11} />
				{/each}
			</g>

			<!-- 4: only Ben's key opens it, on his computer -->
			<g class="{fade} {on(4, 4)}">
				<Envelope x={470} y={192} open />
				<Padlock x={430} y={196} open />
				<Key x={590} y={160} s={0.6} />
				<Tick x={548} y={186} />
			</g>

			<!-- 5: signed, so he knows it came from Ana and nobody changed it -->
			<g class="{fade} {on(5, 5)}">
				<Envelope x={285} y={170} open />
				<circle cx="348" cy="214" r="15" class="fill-secondary-500 stroke-surface-50-950" stroke-width="3" />
				<text x="348" y="219" text-anchor="middle" class="fill-surface-50 text-sm font-bold">A</text>
				<path d="M370 196C420 170 470 130 520 100" fill="none" class="stroke-primary-500" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 8" />
				<Tick x={380} y={160} r={14} />
			</g>

			<!-- 6: calls too — locked, and straight between them -->
			<g class="{fade} {on(6, 6)}">
				<Laptop x={40} y={140} />
				<Person x={120} y={194} letter="B" fill="fill-primary-500" />
				<Screen x={450} y={140} />
				<Person x={525} y={190} letter="A" />
				<line x1="206" y1="196" x2="444" y2="196" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
				<Padlock x={325} y={182} />
			</g>
		</svg>
	{/snippet}
</PictureStory>
