<svelte:options namespace="svg" />

<script lang="ts">
	/*
	 * How well a mint's credits are backed, drawn (4 October 2026): money held
	 * beside credits out, and a gauge of the ratio, with the host's minimum line
	 * and whether cash-outs are open. Darren: "Absolutely love … that kind of
	 * typography … a component display." Drawn in a 640 × 320 space, so the
	 * same picture serves the Credits page (BackingDisplay) and the story deck.
	 */
	interface Props {
		/** Money held, in whole units of the currency (pounds for a pound-mint). */
		held: number;
		/** Credits in circulation. */
		credits: number;
		/** The mint's currency: one credit is one unit of it (ADR-Q-042 §3). */
		currency?: string;
		/** The host's minimum ratio (0.2 = 20%); with it, the gauge shows the line and whether cash-outs are open. */
		minRatio?: number;
		/** Draw the gauge (the stacks are always drawn). */
		gauge?: boolean;
		/** Pixels per pound or credit in the stacks; leave out to fit. */
		unit?: number;
	}
	let { held, credits, currency = 'GBP', minRatio, gauge = true, unit }: Props = $props();

	const BASE = 250;
	const owed = $derived(credits);
	const ratio = $derived(owed > 0 ? held / owed : 1);
	const shut = $derived(minRatio !== undefined && ratio < minRatio);
	const u = $derived(unit ?? 165 / Math.max(1, held, owed));
	const tone = $derived(shut ? 'stroke-error-500' : ratio < 0.999 ? 'stroke-warning-500' : 'stroke-success-500');
	/* Where the minimum sits on the arc (a half circle centred at 490,190, radius 90). */
	const mark = $derived.by(() => {
		if (minRatio === undefined) return null;
		const a = Math.PI * (1 - Math.min(1, Math.max(0, minRatio)));
		return { x1: 490 + 80 * Math.cos(a), y1: 190 - 80 * Math.sin(a), x2: 490 + 100 * Math.cos(a), y2: 190 - 100 * Math.sin(a) };
	});
	const money = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.round(n));
</script>

<!-- the two stacks -->
<line x1="40" y1={BASE} x2="330" y2={BASE} class="stroke-surface-400-600" stroke-width="3" />
<rect x="70" y={BASE - held * u} width="90" height={held * u} rx="6" class="fill-success-500" />
<rect x="210" y={BASE - owed * u} width="90" height={owed * u} rx="6" class="fill-primary-500" />
<text x="115" y={BASE + 26} text-anchor="middle" class="fill-surface-950-50 text-sm font-semibold">Pounds held</text>
<text x="255" y={BASE + 26} text-anchor="middle" class="fill-surface-950-50 text-sm font-semibold">Credits out</text>
<text x="115" y={BASE - held * u - 8} text-anchor="middle" class="fill-surface-950-50 font-bold tabular-nums">{money(held)}</text>
<text x="255" y={BASE - owed * u - 8} text-anchor="middle" class="fill-surface-950-50 font-bold tabular-nums">{Math.round(credits).toLocaleString('en-GB')}</text>

{#if gauge}
	<path d="M400 190a90 90 0 0 1 180 0" fill="none" class="stroke-surface-300-700" stroke-width="16" stroke-linecap="round" />
	<path d="M400 190a90 90 0 0 1 180 0" fill="none" class={tone} stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="{Math.min(1, ratio) * 100} 100" />
	{#if mark}<line x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} class="stroke-surface-950-50" stroke-width="3" />{/if}
	<text x="490" y="182" text-anchor="middle" class="fill-surface-950-50 text-3xl font-bold tabular-nums">{Math.round(Math.min(1, ratio) * 100)}%</text>
	<text x="490" y="212" text-anchor="middle" class="fill-surface-700-300 text-sm">backed</text>
	{#if minRatio !== undefined}
		<rect x="410" y="232" width="160" height="40" rx="20" class={shut ? 'fill-error-500' : 'fill-success-500'} />
		<text x="490" y="258" text-anchor="middle" class="fill-surface-50 text-sm font-bold">{shut ? 'Cash-outs paused' : 'Cash-outs open'}</text>
	{:else}
		<text x="490" y="250" text-anchor="middle" class="fill-surface-700-300 text-sm">{ratio >= 0.999 ? 'every credit has its pound' : 'of what’s owed is held'}</text>
	{/if}
{/if}
