<script lang="ts">
	/*
	 * How Q works across your devices, as a short picture story (3 October
	 * 2026), the same family as the others: your browser keeps the fast working
	 * copy, it copies itself to your own cloud every few minutes, your phone can
	 * be your passkey, another computer opens the same vault from your cloud, a
	 * borrowed computer can be left with no trace, and a lost device is unlinked
	 * while your things stay safe.
	 *
	 * The player — autoplay, read-aloud, controls, captions — is PictureStory;
	 * this file is only the pictures. Words: `devstory.*` in the language books.
	 */
	import PictureStory from './PictureStory.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { Key, Tick, Cross, Folder, Cloud, Phone, Screen, Laptop, Person } from './story';
</script>

<PictureStory prefix="devstory">
	{#snippet pictures(on: (a: number, b?: number) => string, fade: string)}
		<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
			<!-- Ana and her computer: always there -->
			<Person x={120} y={60} letter="A" name={t('story.ana')} nameY={266} />
			<Laptop x={40} y={96} />

			<!-- Her vault, in her browser: there except while the phone's code is showing -->
			<g class="{fade} {on(1, 2)}"><Folder x={90} y={128} /></g>
			<g class="{fade} {on(4)}"><Folder x={90} y={128} /></g>

			<!-- 1: fast, and works offline -->
			<g class="{fade} {on(1, 1)}">
				<circle cx="120" cy="150" r="46" fill="none" class="stroke-secondary-500" stroke-width="3" stroke-dasharray="4 8" />
				<path d="M176 104l-10 18h10l-6 16 16-22h-10l6-12z" class="fill-secondary-500" />
				<Tick x={168} y={186} />
			</g>

			<!-- 2, 4, 5, 6: her own cloud -->
			<g class="{fade} {on(2, 2)}"><Cloud x={360} y={110} /></g>
			<g class="{fade} {on(4)}"><Cloud x={320} y={74} /></g>

			<!-- 2: copied to her cloud, every five minutes -->
			<g class="{fade} {on(2, 2)}">
				<Folder x={334} y={98} />
				<path d="M210 150C250 150 270 140 288 128" fill="none" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
				<path d="M294 122l-4 16-12-8z" class="fill-primary-500" />
				<!-- a little clock: every few minutes -->
				<circle cx="250" cy="190" r="18" class="fill-surface-50-950 stroke-primary-500" stroke-width="3" />
				<path d="M250 179v11h8" fill="none" class="stroke-primary-500" stroke-width="3" stroke-linecap="round" />
				<Tick x={426} y={70} />
			</g>

			<!-- 3: the computer shows a code, her phone signs her in -->
			<g class="{fade} {on(3, 3)}">
				<g class="fill-surface-950-50">
					<rect x="88" y="118" width="64" height="64" rx="4" class="fill-surface-50-950 stroke-surface-950-50" stroke-width="3" />
					<rect x="96" y="126" width="16" height="16" />
					<rect x="128" y="126" width="16" height="16" />
					<rect x="96" y="158" width="16" height="16" />
					<rect x="118" y="146" width="8" height="8" />
					<rect x="130" y="160" width="8" height="8" />
					<rect x="138" y="148" width="6" height="6" />
				</g>
				<Phone x={300} y={96} />
				<Key x={318} y={140} s={0.45} />
				<path d="M294 150C250 150 210 150 160 150" fill="none" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8" />
				<Tick x={366} y={110} />
			</g>

			<!-- 4: another computer opens the same vault from her cloud -->
			<g class="{fade} {on(4, 4)}">
				<Screen x={450} y={100} />
				<Folder x={495} y={128} />
				<path d="M204 130C230 100 240 90 250 84" fill="none" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8" />
				<path d="M390 84C420 90 450 100 470 110" fill="none" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
				<path d="M476 114l-16 2 6-12z" class="fill-primary-500" />
				<Tick x={596} y={104} />
			</g>

			<!-- 5: a borrowed computer, left with no trace — her cloud still holds it all -->
			<g class="{fade} {on(5, 5)}">
				<Screen x={450} y={140} />
				<!-- sparkles: nothing left behind -->
				{#each [{ x: 500, y: 176, r: 12 }, { x: 540, y: 200, r: 8 }, { x: 556, y: 168, r: 6 }] as k (k.x)}
					<path d="M{k.x} {k.y - k.r}q2 {k.r - 2} {k.r} {k.r}q{2 - k.r} 2 {-k.r} {k.r}q-2 {2 - k.r} {-k.r} {-k.r}q{k.r - 2} -2 {k.r} {-k.r}z" class="fill-secondary-500" />
				{/each}
				<Folder x={294} y={56} />
				<Tick x={362} y={50} />
				<path d="M470 140C450 110 420 90 396 84" fill="none" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8" />
			</g>

			<!-- 6: a lost phone, unlinked — her things are still in her cloud -->
			<g class="{fade} {on(6, 6)}">
				<Folder x={294} y={56} />
				<Tick x={362} y={50} />
				<g opacity="0.55">
					<Phone x={500} y={150} />
					<Key x={518} y={194} s={0.45} fill="fill-surface-400-600" />
				</g>
				<path d="M206 190C280 220 360 220 420 210" fill="none" class="stroke-surface-400-600" stroke-width="4" stroke-linecap="round" />
				<path d="M450 206C470 204 484 202 494 200" fill="none" class="stroke-surface-400-600" stroke-width="4" stroke-linecap="round" />
				<Cross x={436} y={208} r={16} />
			</g>
		</svg>
	{/snippet}
</PictureStory>
