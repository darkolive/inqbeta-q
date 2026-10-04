<script lang="ts" module>
	import type { DeckScene } from './frame';
	export const title = 'Credits you can trust: always backed, and you can see it';
	export const scenes: DeckScene[] = [
		{ title: 'It starts at nothing', says: 'A club’s mint begins at zero. No credit exists until value comes in.' },
		{ title: '£20 in, 20 credits out', says: 'Someone buys 20 credits for £20. Pounds and credits rise together: fully backed.' },
		{ title: 'Cash out 5', says: 'Cashing out destroys 5 credits and pays £5. Both fall together, so it’s still fully backed.' },
		{ title: 'When the reserve is drawn on', says: 'Over time, 100 credits are out, and the host spends £85 of the reserve running the node. Now £15 backs 100 credits: 15%. Below the host’s line of 20%, cash-outs pause.' },
		{ title: 'Buying heals it', says: 'Buying is never paused: each credit bought brings its own pound. Someone buys 50, and £65 backs 150 credits: 43%. Cash-outs open again.' },
		{ title: 'Trust you can see', says: 'The club’s page shows how it’s backed: stated by the host, honoured by every cash-out paid, witnessed by a treasurer, confirmed by the bank.' }
	];
</script>

<script lang="ts">
	import StoryDeck from './StoryDeck.svelte';
	import { lerp, type Frame } from './frame';
	import { Padlock, Tick } from '../story';

	let { hideable = true }: { hideable?: boolean } = $props();
	const BASE = 250;
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
	{@const ratio = v.credits ? v.pounds / v.credits : 1}
	{@const shut = ratio < 0.2}
	<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
		<!-- the two stacks -->
		<line x1="40" y1={BASE} x2="330" y2={BASE} class="stroke-surface-400-600" stroke-width="3" />
		<rect x="70" y={BASE - v.pounds * UNIT} width="90" height={v.pounds * UNIT} rx="6" class="fill-success-500" />
		<rect x="210" y={BASE - v.credits * UNIT} width="90" height={v.credits * UNIT} rx="6" class="fill-primary-500" />
		<text x="115" y={BASE + 26} text-anchor="middle" class="fill-surface-950-50 text-sm font-semibold">Pounds held</text>
		<text x="255" y={BASE + 26} text-anchor="middle" class="fill-surface-950-50 text-sm font-semibold">Credits out</text>
		<text x="115" y={BASE - v.pounds * UNIT - 8} text-anchor="middle" class="fill-surface-950-50 font-bold tabular-nums">£{Math.round(v.pounds)}</text>
		<text x="255" y={BASE - v.credits * UNIT - 8} text-anchor="middle" class="fill-surface-950-50 font-bold tabular-nums">{Math.round(v.credits)}</text>
		

		<!-- the gauge: how well backed -->
		<g class="{f.fade} {f.on(2, 5)}">
			<path d="M400 190a90 90 0 0 1 180 0" fill="none" class="stroke-surface-300-700" stroke-width="16" stroke-linecap="round" />
			<path d="M400 190a90 90 0 0 1 180 0" fill="none" class={shut ? 'stroke-error-500' : ratio < 0.999 ? 'stroke-warning-500' : 'stroke-success-500'} stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="{Math.min(1, ratio) * 100} 100" />
			<!-- the host's line, at 20% -->
			<line x1="409" y1="131" x2="425" y2="143" class="stroke-surface-950-50" stroke-width="3" />
			<text x="490" y="182" text-anchor="middle" class="fill-surface-950-50 text-3xl font-bold tabular-nums">{Math.round(Math.min(1, ratio) * 100)}%</text>
			<text x="490" y="212" text-anchor="middle" class="fill-surface-700-300 text-sm">backed</text>
			<!-- cash-outs: open or paused -->
			<rect x="410" y="232" width="160" height="40" rx="20" class={shut ? 'fill-error-500' : 'fill-success-500'} />
			<text x="490" y="258" text-anchor="middle" class="fill-surface-50 text-sm font-bold">{shut ? 'Cash-outs paused' : 'Cash-outs open'}</text>
			<g class="{f.fade} {shut ? 'opacity-100' : 'opacity-0'}"><Padlock x={600} y={238} fill="fill-error-500" stroke="stroke-error-500" /></g>
		</g>

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
