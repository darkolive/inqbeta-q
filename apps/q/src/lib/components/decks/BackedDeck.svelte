<script lang="ts" module>
	import { DECK_WORDS } from './words';
	export const title = DECK_WORDS.backed.title;
	export const scenes = DECK_WORDS.backed.scenes;
</script>

<script lang="ts">
	import StoryDeck from './StoryDeck.svelte';
	import { lerp, type Frame } from './frame';
	import { Tick } from '../story';
	import BackingGraphic from '../display/BackingGraphic.svelte';

	let { hideable = true }: { hideable?: boolean } = $props();
	const UNIT = 1.1; /* px per credit or pound */
	const levels = ['Stated', 'Honoured', 'Witnessed', 'Bank-confirmed'];
</script>

{#snippet pictures(f: Frame)}
	{@const v =
		f.scene === 1 ? { pounds: 0, credits: 0 }
		: f.scene === 2 ? { pounds: lerp(0, 20, f.p), credits: lerp(0, 20, f.p) }
		: f.scene === 3 ? { pounds: lerp(20, 15, f.p), credits: lerp(20, 15, f.p) }
		: f.scene === 4 ? { pounds: f.p < 0.4 ? lerp(15, 100, f.p / 0.4) : lerp(100, 15, (f.p - 0.4) / 0.6), credits: lerp(15, 100, Math.min(1, f.p / 0.4)) }
		: { pounds: lerp(15, 65, f.scene === 5 ? f.p : 1), credits: lerp(100, 150, f.scene === 5 ? f.p : 1) }}
	<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
		<!-- the stacks and the gauge: the same display as the Credits page -->
		<BackingGraphic pounds={v.pounds} credits={v.credits} minRatio={0.2} gauge={f.scene >= 2 && f.scene <= 5} unit={UNIT} />

		<!-- 6: the trust levels -->
		<g class="{f.fade} {f.on(6)}">
			{#each levels as l, i (l)}
				<rect x="380" y={40 + i * 64} width="230" height="48" rx="12" class="fill-surface-50-950 stroke-surface-300-700" stroke-width="2" opacity={Math.min(1, Math.max(0, f.at(6) * 4 - i + 0.3))} />
				<g opacity={Math.min(1, Math.max(0, f.at(6) * 4 - i + 0.3))}>
					<Tick x={406} y={64 + i * 64} />
					<text x="430" y={70 + i * 64} class="fill-surface-950-50 font-semibold">{l}</text>
				</g>
			{/each}
		</g>
	</svg>
{/snippet}

<StoryDeck id="backed" {title} {scenes} {pictures} {hideable} />
