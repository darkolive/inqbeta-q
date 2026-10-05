<script lang="ts" module>
	/** Skeleton colour names a line can take. */
	export type Tone = 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface';
	/**
	 * One line, configured like the workhouse's ChartConfig (label + colour),
	 * plus what a line needs besides colour to be told apart: a dash and a mark.
	 */
	export interface Series {
		key: string;
		label: string;
		tone: Tone;
		/** Draw dashed, or dotted, so the line differs by more than colour. */
		dashed?: boolean;
		dotted?: boolean;
		/** False: no line of its own; it's seen only as the edge of a band. */
		line?: boolean;
		/** What it shows in words (tooltip, table), when that isn't its height: a band's own size, say. */
		amount?: (values: Record<string, number>) => number;
		/** Draw the line only from this point on (it shades and reads as usual before), e.g. where it parts from another. */
		from?: number;
		/** A short sign shown with the label, e.g. ↓ or ↑. */
		mark?: string;
	}
	export interface Band {
		a: string;
		b: string;
		tones: [Tone, Tone];
		/** How strongly the band is filled (0.18 by default). */
		opacity?: number;
	}
	export interface Point {
		at: string;
		values: Record<string, number>;
		/** What happened at this point, in words, e.g. "Bought 10 credits". */
		note?: string;
		/** A receipt: mark these series' lines here, where its numbers changed them. */
		marks?: string[];
	}
	export interface Tick {
		/** Where, by time; or, with even spacing, by point. */
		at?: string;
		index?: number;
		label: string;
	}
</script>

<script lang="ts">
	/*
	 * A line chart in Q's own drawn style (5 October 2026): the Svelte
	 * counterpart of the workhouse's recharts charts (BalanceCharts.tsx) —
	 * series configured by label and Skeleton colour, grid, legend, tooltip —
	 * drawn as plain SVG with Skeleton classes, so it themes with the page,
	 * works offline and adds no library.
	 *
	 * Made to be read by people who find numbers hard (dyscalculia in
	 * particular): each line is named in words at its end, beside its value,
	 * so nothing has to be matched against a legend or read off an axis; the
	 * axis shows only nought and the top; lines differ by dash and sign as
	 * well as colour; amounts are rounded and written without ".00"; the gap
	 * between lines can be shaded and said in words; and every point can
	 * be stepped through with the arrow keys, read out, or shown as a table.
	 */
	interface Props {
		series: Series[];
		/** Oldest first. Lines grow smoothly from one point to the next, and stay flat while a total doesn't change. */
		points: Point[];
		/** How a value is written. */
		format?: (n: number) => string;
		/**
		 * Shade between pairs of series: one colour while `a` is above `b`, the
		 * other once `b` passes it, with the crossing circled.
		 */
		bands?: Band[];
		/**
		 * A buffer, drawn now: a bar hanging down from the end of one line, as
		 * tall as the amount it holds back — e.g. credits promised, under what
		 * you've received. Only today's amount; it has no history.
		 */
		reserve?: { below: string; amount: number; label: string; tone: Tone };
		/** What the shading says now, in words, with the colour of its swatch. */
		says?: string;
		saysTone?: Tone;
		/** The time shown, start to end; left out, the first point to the last. */
		start?: string;
		end?: string;
		/**
		 * How points sit along the bottom: by the clock, or evenly — each
		 * receipt one step, so a burst of moves in a short time still reads as
		 * a shape rather than a cliff.
		 */
		spacing?: 'time' | 'even';
		/**
		 * Soften the lines, by about this many steps (0: through every point
		 * exactly). A gentle blur along the line: it keeps every line rising
		 * where it rose and keeps one line above another where it was above,
		 * so where lines meet or come close stays true.
		 */
		smooth?: number;
		/* (smooth is a fraction of the chart's width: the blur's spread, along a straightened, evenly sampled line.) */
		/** Fit the height to the lines shown (their lowest to their highest), not nought to the top: for seeing the shape. */
		zoom?: boolean | { below: number; above: number };
		/** Just the lines and shading: no names at the ends, no dots. */
		plain?: boolean;
		/** Times to label along the bottom; left out, the first and last dates. */
		ticks?: Tick[];
		/** What the chart shows, for screen readers and the table caption. */
		label: string;
	}
	let { series, points, format = (n) => String(Math.round(n)), bands = [], reserve, says: summary = '', saysTone = 'surface', start, end, ticks, spacing = 'time', smooth = 0, zoom = false, plain = false, label }: Props = $props();

	const W = 640;
	const H = 300;
	const L = 52;
	const R = $derived(plain ? 12 : 150);
	const T = 24;
	const B = 44;

	const STROKE: Record<Tone, string> = {
		primary: 'stroke-primary-600-400',
		secondary: 'stroke-secondary-600-400',
		tertiary: 'stroke-tertiary-600-400',
		success: 'stroke-success-600-400',
		warning: 'stroke-warning-600-400',
		error: 'stroke-error-600-400',
		surface: 'stroke-surface-950-50'
	};
	const FILL: Record<Tone, string> = {
		primary: 'fill-primary-600-400',
		secondary: 'fill-secondary-600-400',
		tertiary: 'fill-tertiary-600-400',
		success: 'fill-success-600-400',
		warning: 'fill-warning-600-400',
		error: 'fill-error-600-400',
		surface: 'fill-surface-950-50'
	};
	const BG: Record<Tone, string> = {
		primary: 'bg-primary-600-400',
		secondary: 'bg-secondary-600-400',
		tertiary: 'bg-tertiary-600-400',
		success: 'bg-success-600-400',
		warning: 'bg-warning-600-400',
		error: 'bg-error-600-400',
		surface: 'bg-surface-950-50'
	};

	/* A round top for the axis: 1, 2 or 5 times a power of ten. */
	function niceTop(n: number) {
		if (n <= 0) return 1;
		const p = 10 ** Math.floor(Math.log10(n));
		for (const m of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (m * p >= n) return m * p;
		return 10 * p;
	}
	const top = $derived(niceTop(1.05 * Math.max(0, ...points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0)))));
	const times = $derived(points.map((p) => new Date(p.at).getTime()));
	const t0 = $derived(start ? new Date(start).getTime() : times.length ? Math.min(...times) : 0);
	const t1 = $derived(end ? new Date(end).getTime() : times.length ? Math.max(...times) : 0);
	const xt = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
	const x = (i: number) => (spacing === 'time' && t1 > t0 ? xt(times[i]) : L + (points.length > 1 ? (i / (points.length - 1)) * (W - L - R) : 0));
	/* The height shown: nought to a round top; or, zoomed, just around the lines. */
	const range = $derived.by(() => {
		if (!zoom) return { lo: 0, hi: top };
		const vs = points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0));
		const mn = Math.min(...vs);
		const mx = Math.max(...vs);
		/* A share chart's view: a fraction below the lowest, a fraction above the highest. */
		if (typeof zoom === 'object') {
			let lo = Math.max(0, mn * (1 - zoom.below));
			let hi = mx * (1 + zoom.above);
			/*
			 * Keep heights honest (5 October 2026: committed at 55 beside
			 * received at 450 looked nothing like a ninth): when the lowest line
			 * is near nought anyway, start at nought, so twice as high is twice as
			 * much. Zoom in only when every line is well above it.
			 */
			if (lo < hi * 0.35) lo = 0;
			if (!(hi > lo)) hi = lo + 1;
			/* Round both to the gridlines' step, so every gridline is a round number. */
			const step = niceStep((hi - lo) / 4);
			lo = Math.floor(lo / step) * step;
			hi = Math.ceil(hi / step) * step;
			return { lo, hi, step };
		}
		const pad = Math.max((mx - mn) * 0.08, 1);
		return { lo: Math.max(0, Math.floor(mn - pad)), hi: Math.ceil(mx + pad) };
	});
	const y = (v: number) => T + (1 - (v - range.lo) / (range.hi - range.lo)) * (H - T - B);
	/* A round step for gridlines: 1, 2 or 5 times a power of ten. */
	function niceStep(n: number) {
		if (!(n > 0)) return 1;
		const p = 10 ** Math.floor(Math.log10(n));
		for (const m of [1, 2, 5, 10]) if (m * p >= n) return m * p;
		return 10 * p;
	}
	/* The gridlines between the bottom and the top, each labelled, so the height reads as a scale. */
	const grid = $derived.by(() => {
		const step = 'step' in range ? (range.step as number) : 0;
		if (!step) return [];
		const out: number[] = [];
		for (let v = range.lo + step; v < range.hi - step / 2; v += step) out.push(v);
		return out;
	});

	/*
	 * A growth line (5 October 2026, Darren: "it's a growth chart … it's going
	 * to grow and grow to when there's £50, and then it's going to stay
	 * there"): a smooth monotone curve through the totals — it never
	 * overshoots, rises from one move to the next, and lies flat while a
	 * total doesn't change. Every series is sampled at the same places, so
	 * the shading between two lines, and where one crosses the other, follow
	 * the curves exactly.
	 */
	const SAMPLES = 24;
	type At = { x: number; v: number };
	function curve(key: string): At[] {
		const xs = points.map((_, i) => x(i));
		const vs = points.map((p) => p.values[key] ?? 0);
		const n = points.length;
		if (n < 2) return n ? [{ x: xs[0], v: vs[0] }] : [];
		/* Softened: each total holds until its receipt, then the blur makes the rise a smooth one, centred on when it happened. */
		if (smooth > 0) {
			const stepped: At[] = [{ x: xs[0], v: vs[0] }];
			for (let i = 1; i < n; i++) stepped.push({ x: xs[i], v: vs[i - 1] }, { x: xs[i], v: vs[i] });
			return soften(stepped, smooth * (W - L - R));
		}
		const dx = xs.slice(1).map((a, i) => a - xs[i]);
		const d = dx.map((w, i) => (w > 0 ? (vs[i + 1] - vs[i]) / w : 0));
		/* tangents: flat at the ends and wherever the direction pauses or turns (Fritsch–Carlson) */
		const m = vs.map((_, i) => {
			if (i === 0 || i === n - 1) return 0;
			const a = d[i - 1];
			const b = d[i];
			if (a * b <= 0 || !(dx[i - 1] > 0) || !(dx[i] > 0)) return 0;
			return (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / a + (dx[i] + 2 * dx[i - 1]) / b);
		});
		const out: At[] = [{ x: xs[0], v: vs[0] }];
		for (let i = 0; i < n - 1; i++) {
			const w = dx[i];
			if (!(w > 0)) {
				for (let k = 1; k <= SAMPLES; k++) out.push({ x: xs[i + 1], v: vs[i] + ((vs[i + 1] - vs[i]) * k) / SAMPLES });
				continue;
			}
			for (let k = 1; k <= SAMPLES; k++) {
				const t = k / SAMPLES;
				const t2 = t * t;
				const t3 = t2 * t;
				const v = (2 * t3 - 3 * t2 + 1) * vs[i] + (t3 - 2 * t2 + t) * w * m[i] + (-2 * t3 + 3 * t2) * vs[i + 1] + (t3 - t2) * w * m[i + 1];
				out.push({ x: xs[i] + w * t, v });
			}
		}
		return smooth > 0 ? soften(out, smooth * (W - L - R)) : out;
	}
	/* A Gaussian blur of the values, the ends held: rising stays rising, above stays above. */
	function soften(c: At[], sigma: number): At[] {
		if (c.length < 2 || sigma <= 0) return c;
		/* Lay the line out evenly, 2 px apart, so the blur spreads the same everywhere along it. */
		const STEP = 2;
		const x0 = c[0].x;
		const x1 = c[c.length - 1].x;
		const n = Math.max(2, Math.round((x1 - x0) / STEP) + 1);
		const even: number[] = [];
		let j = 0;
		for (let i = 0; i < n; i++) {
			const px = x0 + ((x1 - x0) * i) / (n - 1);
			while (j < c.length - 2 && c[j + 1].x < px) j++;
			const a = c[j];
			const b = c[j + 1];
			/* at a jump (two samples at one place), take the later value */
			const f = b.x > a.x ? Math.min(1, Math.max(0, (px - a.x) / (b.x - a.x))) : 1;
			even.push(a.v + (b.v - a.v) * f);
		}
		/* The spread narrows towards each end, so the line starts and finishes on its true totals. */
		const sg = sigma / STEP;
		return even.map((_, i) => {
			const si = Math.min(sg, i / 3, (n - 1 - i) / 3);
			if (si < 0.5) return { x: x0 + ((x1 - x0) * i) / (n - 1), v: even[i] };
			const r = Math.ceil(si * 3);
			let v = 0;
			let sum = 0;
			for (let q = -r; q <= r; q++) {
				const w = Math.exp(-(q * q) / (2 * si * si));
				v += w * even[Math.min(n - 1, Math.max(0, i + q))];
				sum += w;
			}
			return { x: x0 + ((x1 - x0) * i) / (n - 1), v: v / sum };
		});
	}
	/* Where a line actually is, drawn, at a place along the bottom. */
	const drawn = $derived(Object.fromEntries(series.map((s) => [s.key, curve(s.key)])) as Record<string, At[]>);
	function onLine(key: string, px: number) {
		const c = drawn[key] ?? [];
		let best = c[0];
		for (const p of c) if (Math.abs(p.x - px) < Math.abs(best.x - px)) best = p;
		return best?.v ?? 0;
	}
	const path = (c: At[]) => c.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${y(p.v).toFixed(1)}`).join('');

	/* The shading between two lines, in runs: one colour while the first is ahead, the other once the second passes it. */
	function shade(band: Band) {
		const runs: { tone: Tone; d: string; opacity: number }[] = [];
		const crossings: { at: At; tone: Tone }[] = [];
		if (points.length < 2) return { runs, crossings };
		const A = curve(band.a);
		const B = curve(band.b);
		let a: At[] = [];
		let b: At[] = [];
		let sign = 0;
		const close = () => {
			if (sign && a.length > 1) runs.push({ tone: band.tones[sign > 0 ? 0 : 1], opacity: band.opacity ?? 0.18, d: `${path(a)}${[...b].reverse().map((p) => `L${p.x.toFixed(1)} ${y(p.v).toFixed(1)}`).join('')}Z` });
		};
		A.forEach((pa, j) => {
			const pb = B[j];
			const diff = pa.v - pb.v;
			const s = diff > 1e-9 ? 1 : diff < -1e-9 ? -1 : 0;
			if (s && sign && s !== sign) {
				const pd = A[j - 1].v - B[j - 1].v;
				const f = pd / (pd - diff);
				const c = { x: A[j - 1].x + (pa.x - A[j - 1].x) * f, v: A[j - 1].v + (pa.v - A[j - 1].v) * f };
				a.push(c);
				b.push(c);
				close();
				if (s < 0) crossings.push({ at: c, tone: band.tones[1] });
				a = [c];
				b = [c];
			}
			if (s) sign = s;
			a.push(pa);
			b.push(pb);
		});
		close();
		return { runs, crossings };
	}
	const gaps = $derived.by(() => {
		const all = bands.map(shade);
		return { runs: all.flatMap((g) => g.runs), crossings: all.flatMap((g) => g.crossings) };
	});
	const dash = (s: Series) => (s.dotted ? '0.5 9' : s.dashed ? '10 8' : undefined);

	const last = $derived(points[points.length - 1]);
	/* The buffer bar: from the end of its line, down by its amount (never below nought). */
	const bar = $derived.by(() => {
		if (!reserve || !last || reserve.amount <= 0) return null;
		const top = last.values[reserve.below] ?? 0;
		return { ...reserve, top, bottom: Math.max(0, top - reserve.amount) };
	});
	/* Name each line at its end; push names apart so they never overlap. */
	const ends = $derived.by(() => {
		if (!last) return [];
		const e = series.map((s) => ({ s, v: last.values[s.key] ?? 0, show: last.values[s.key] ?? 0, bar: false, at: y(last.values[s.key] ?? 0) }));
		if (bar) e.push({ s: { key: '__reserve', label: bar.label, tone: bar.tone }, v: (bar.top + bar.bottom) / 2, show: bar.amount, bar: true, at: y((bar.top + bar.bottom) / 2) });
		e.sort((a, b) => a.at - b.at);
		for (let i = 1; i < e.length; i++) if (e[i].at - e[i - 1].at < 40) e[i].at = e[i - 1].at + 40;
		const over = e.length ? e[e.length - 1].at - (H - B) : 0;
		if (over > 0) for (const p of e) p.at -= over;
		return e;
	});

	const when = (at: string) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
	const whenLong = (at: string) => new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

	/* The point being looked at: by pointer, or by arrow keys once focused. */
	let active = $state<number | null>(null);
	let svg = $state<SVGSVGElement>();
	function nearest(e: PointerEvent) {
		if (!svg || !points.length) return;
		const r = svg.getBoundingClientRect();
		const px = ((e.clientX - r.left) / r.width) * W;
		let best = 0;
		points.forEach((_, i) => {
			if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
		});
		active = best;
	}
	function key(e: KeyboardEvent) {
		if (!points.length) return;
		const n = points.length - 1;
		const at = active ?? n;
		const to = e.key === 'ArrowLeft' ? Math.max(0, at - 1) : e.key === 'ArrowRight' ? Math.min(n, at + 1) : e.key === 'Home' ? 0 : e.key === 'End' ? n : e.key === 'Escape' ? null : undefined;
		if (to === undefined) return;
		e.preventDefault();
		active = to;
	}
	const shown = $derived(points[active ?? -1] ?? null);
	/* What a series shows in words: its own amount when it has one, else its height. */
	const amountOf = (s: Series, values: Record<string, number>) => (s.amount ? s.amount(values) : (values[s.key] ?? 0));
	const says = (p: Point) => `${p.note ? `${p.note}. ` : ''}${whenLong(p.at)}: ${series.map((s) => `${s.label} ${format(amountOf(s, p.values))}`).join(', ')}.`;
</script>

<figure class="card preset-outlined-surface-200-800 bg-surface-50-950 p-3 sm:p-4 flex flex-col gap-3">
	<div class="relative">
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<svg
			bind:this={svg}
			viewBox="0 0 {W} {H}"
			class="w-full h-auto touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-base"
			role="img"
			tabindex="0"
			aria-label="{label}. {last ? says(last) : ''} Use the left and right arrow keys to step through each move."
			onpointermove={nearest}
			onpointerdown={nearest}
			onpointerleave={() => (active = null)}
			onkeydown={key}
			onblur={() => (active = null)}
		>
			<!-- the bottom and the top, and round gridlines between when zoomed -->
			{#each grid as g (g)}
				<line x1={L} y1={y(g)} x2={W - R} y2={y(g)} class="stroke-surface-200-800" stroke-width="1" stroke-dasharray="2 6" />
				<text x={L - 8} y={y(g) + 4} text-anchor="end" class="fill-surface-700-300 text-xs tabular-nums">{format(g)}</text>
			{/each}
			<line x1={L} y1={y(range.lo)} x2={W - R} y2={y(range.lo)} class="stroke-surface-400-600" stroke-width="2" />
			<line x1={L} y1={y(range.hi)} x2={W - R} y2={y(range.hi)} class="stroke-surface-200-800" stroke-width="1" stroke-dasharray="4 6" />
			<text x={L - 8} y={y(range.hi) + 4} text-anchor="end" class="fill-surface-700-300 text-xs tabular-nums">{format(range.hi)}</text>
			<text x={L - 8} y={y(range.lo) + 4} text-anchor="end" class="fill-surface-700-300 text-xs tabular-nums">{format(range.lo)}</text>

			{#each gaps.runs as g, i (i)}<path d={g.d} class={FILL[g.tone]} opacity={g.opacity} />{/each}

			{#each series.filter((s) => s.line !== false) as s (s.key)}
				<path d={path((drawn[s.key] ?? []).slice((s.from ?? 0) * SAMPLES))} fill="none" class={STROKE[s.tone]} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={dash(s)} />
			{/each}

			<!-- where the second line overtakes the first: the point to watch -->
			{#each plain ? [] : gaps.crossings as c, i (i)}
				<circle cx={c.at.x} cy={y(c.at.v)} r="9" fill="none" class={STROKE[c.tone]} stroke-width="3" />
			{/each}

			<!-- each line named at its end, with its value -->
			{#if bar}
				<rect x={W - R - 8} y={y(bar.top)} width="16" height={Math.max(4, y(bar.bottom) - y(bar.top))} rx="5" class="{FILL[bar.tone]} stroke-surface-50-950" stroke-width="2" />
			{/if}
			{#each plain ? [] : ends as e (e.s.key)}
				{#if !e.bar}<circle cx={W - R} cy={y(e.v)} r="5" class={FILL[e.s.tone]} />{/if}
				<line x1={W - R + (e.bar ? 9 : 6)} y1={y(e.v)} x2={W - R + 16} y2={e.at} class={STROKE[e.s.tone]} stroke-width="2" />
				<text x={W - R + 22} y={e.at - 4} class="fill-surface-950-50 text-sm font-semibold">{e.s.mark ? `${e.s.mark} ` : ''}{e.s.label}</text>
				<text x={W - R + 22} y={e.at + 16} class="{FILL[e.s.tone]} text-lg font-bold tabular-nums">{format(e.show)}</text>
			{/each}

			<!-- each receipt, marked where it changed a line -->
			{#each plain ? [] : points as p, i (i)}
				{#each p.marks ?? [] as k (k)}
					{@const s = series.find((s) => s.key === k)}
					{#if s}<circle cx={x(i)} cy={y(p.values[k] ?? 0)} r="5" class="{FILL[s.tone]} stroke-surface-50-950" stroke-width="2" />{/if}
				{/each}
			{/each}

			{#if ticks && (spacing === 'even' ? points.length > 1 : t1 > t0)}
				<!-- the times asked for, along the bottom -->
				{#each ticks as k, j (j)}
					{@const tx = k.index !== undefined ? x(k.index) : xt(new Date(k.at ?? 0).getTime())}
					<line x1={tx} y1={y(range.lo)} x2={tx} y2={y(range.lo) + 6} class="stroke-surface-400-600" stroke-width="2" />
					<text x={tx} y={H - 14} text-anchor={tx < L + 20 ? 'start' : tx > W - R - 20 ? 'end' : 'middle'} class="fill-surface-700-300 text-xs">{k.label}</text>
				{/each}
			{:else if points.length}
				<!-- first and last dates only -->
				<text x={x(0)} y={H - 14} class="fill-surface-700-300 text-xs">{when(points[0].at)}</text>
				{#if points.length > 1}<text x={x(points.length - 1)} y={H - 14} text-anchor="end" class="fill-surface-700-300 text-xs">{when(last.at)}</text>{/if}
			{/if}

			<!-- the point being looked at -->
			{#if active !== null && shown}
				<line x1={x(active)} y1={T} x2={x(active)} y2={y(range.lo)} class="stroke-surface-500" stroke-width="2" stroke-dasharray="3 4" />
				{#each series.filter((s) => s.line !== false) as s (s.key)}
					<circle cx={x(active)} cy={y(onLine(s.key, x(active)))} r="7" class="{FILL[s.tone]} stroke-surface-50-950" stroke-width="3" />
				{/each}
			{/if}
		</svg>

		{#if active !== null && shown}
			<div
				class="card preset-filled-surface-50-950 border border-surface-200-800 shadow-lg p-3 text-sm absolute top-2 pointer-events-none min-w-44 space-y-1"
				style="left: clamp(0px, calc({(x(active) / W) * 100}% - 5.5rem), calc(100% - 11rem));"
			>
				{#if shown.note}<p class="font-semibold">{shown.note}</p>{/if}
				<p class="text-xs text-surface-700-300">{whenLong(shown.at)}</p>
				{#each series as s (s.key)}
					<p class="flex items-center gap-2"><span class="inline-block w-3 h-3 rounded-full {BG[s.tone]}"></span><span class="flex-1">{s.label}</span><strong class="tabular-nums">{format(amountOf(s, shown.values))}</strong></p>
				{/each}
			</div>
		{/if}
	</div>

	<p class="sr-only" aria-live="polite">{shown ? says(shown) : ''}</p>

	{#if summary}
		<p class="flex items-start gap-2 text-sm"><span class="inline-block w-4 h-4 mt-0.5 shrink-0 rounded-sm {BG[saysTone]} opacity-40"></span>{summary}</p>
	{/if}

	<details class="text-sm">
		<summary class="cursor-pointer select-none text-surface-700-300">Show the numbers as a table</summary>
		<table class="table mt-2">
			<caption class="sr-only">{label}</caption>
			<thead><tr><th>When</th><th>What</th>{#each series as s (s.key)}<th class="text-right">{s.label}</th>{/each}</tr></thead>
			<tbody>
				{#each points as p, i (i)}
					<tr><td>{whenLong(p.at)}</td><td>{p.note ?? ''}</td>{#each series as s (s.key)}<td class="text-right tabular-nums">{format(amountOf(s, p.values))}</td>{/each}</tr>
				{/each}
			</tbody>
		</table>
	</details>
</figure>
