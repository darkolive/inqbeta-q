<script lang="ts">
	/*
	 * Your credits in and out, drawn (5 October 2026): growth lines that only
	 * ever climb — credits received (bought, or given to you in agreements),
	 * credits spent (in agreements, or cashed out) — and committed, in amber:
	 * spent plus what's promised in agreements not yet settled, so it runs
	 * above spent by today's promised amount, all the way from nought.
	 *
	 * Darren: "you can't get into negative … my red line is getting too close
	 * to the green line … a buffer zone … my committed expenditure … pushing
	 * me even closer … a horizontal line, dashed, that represents committed …
	 * whatever the spent line is plus the committed." So: amber between spent
	 * and committed is held back; green between committed and received is
	 * free. When the amber band nears the green, act. (Since 5 October: green
	 * and red are softened curves; committed has no line of its own — it's the
	 * filled amber band above spent, a skin that grows and shrinks with your
	 * commitments. By the clock, like a share chart, each window zoomed from a
	 * fifth below its lowest to 15% above its highest. The totals sit in cards
	 * above in the lines' own colours.)
	 *
	 * Read straight off the receipts (Darren: "every time there's a change …
	 * there is a receipt and a timestamp and an amount and a closing balance
	 * … received, always recorded, spent, always recorded, committed, always
	 * recorded … every time there is a receipt, it will mark the curve"):
	 * each receipt is a point, marked on the line it moved, with its closing
	 * balance in its words; committed is read from the agreements as they
	 * stood at each step, not just today. Seen over a chosen time — the last
	 * 24 hours, week, month, three months, year, or all — each starting from
	 * the totals as they stood when it opens.
	 */
	import LineChart, { type Band, type Point, type Series, type Tone } from './LineChart.svelte';
	import type { Tick } from './LineChart.svelte';
	import { Icon } from '@inqbeta/q-ui';
	import type { creditFlow, committedFlow } from '$lib/agreements';

	let {
		flow,
		commits = [],
		committed = 0,
		has = () => false,
		onOpen
	}: {
		flow: ReturnType<typeof creditFlow>;
		commits?: ReturnType<typeof committedFlow>;
		committed?: number;
		/** Whether a receipt can be opened, by content hash. */
		has?: (hash: string) => boolean;
		/** Open a receipt in the drawer. */
		onOpen?: (hash: string) => void;
	} = $props();

	/*
	 * Your activity, by card (5 October 2026): tap Received, Spent or
	 * Committed and its receipts in the window drop down beneath the chart,
	 * each opening its receipt. Darren: "it only appears when … I click on
	 * received … that makes the whole scrolling much smaller."
	 */
	type Showing = 'in' | 'out' | 'committed';
	let showing = $state<Showing | null>(null);
	const toggle = (k: Showing) => (showing = showing === k ? null : k);

	const HOUR = 60 * 60 * 1000;
	const DAY = 24 * HOUR;
	const SCALES = [
		{ key: 'hour', label: '1 hour', span: HOUR },
		{ key: 'hours4', label: '4 hours', span: 4 * HOUR },
		{ key: 'day', label: '24 hours', span: DAY },
		{ key: 'week', label: 'Week', span: 7 * DAY },
		{ key: 'month', label: 'Month', span: 30 * DAY },
		{ key: 'quarter', label: '3 months', span: 91 * DAY },
		{ key: 'year', label: 'Year', span: 365 * DAY },
		{ key: 'all', label: 'All', span: 0 }
	] as const;
	type ScaleKey = (typeof SCALES)[number]['key'];
	/* A day first: close enough to see the shape, and whether lines are touching. */
	let scale = $state<ScaleKey>('day');
	/*
	 * How many windows back you've stepped (5 October 2026, Darren: "a left
	 * and a right arrow … as you press left, the time frame … goes down in
	 * sequence … 24 hours, 24 hours, 24 hours"). Nought is the window ending now.
	 */
	let back = $state(0);
	function choose(k: ScaleKey) {
		scale = k;
		back = 0;
	}

	const SERIES: Series[] = [
		{ key: 'in', label: 'Received', tone: 'primary' },
		{ key: 'out', label: 'Spent', tone: 'error' },
		{ key: 'promised', label: 'Committed', tone: 'warning', line: false, amount: (v) => (v.promised ?? 0) - (v.out ?? 0) }
	];
	const BANDS: Band[] = [
		{ a: 'in', b: 'promised', tones: ['primary', 'error'] },
		{ a: 'promised', b: 'out', tones: ['warning', 'warning'], opacity: 0.5 }
	];
	/* Close: less than a fifth of what you've received is still free. */
	const CLOSE = 0.2;

	const count = (n: number) => Math.round(n).toLocaleString('en-GB');
	const credits = (n: number) => `${count(n)} credit${Math.round(n) === 1 ? '' : 's'}`;

	/* Every receipt, oldest first, with the totals it leaves: received, spent, committed. */
	const receipts = $derived.by(() => {
		const events = [...flow.map((m) => ({ at: m.at, n: m.n, says: m.says, commit: null as number | null })), ...commits.map((c) => ({ at: c.at, n: 0, says: '', commit: c.committed }))].sort((a, b) => a.at.localeCompare(b.at));
		let got = 0;
		let spent = 0;
		let held = 0;
		const out: { at: string; values: { in: number; out: number; promised: number }; note: string; marks: string[] }[] = [];
		for (const e of events) {
			if (e.commit !== null) {
				const was = held;
				held = e.commit;
				if (held === was) continue;
				out.push({ at: e.at, values: { in: got, out: spent, promised: spent + held }, note: held > was ? `Committed ${credits(held - was)} to an agreement` : `${credits(was - held)} no longer committed`, marks: ['promised'] });
				continue;
			}
			if (e.n > 0) got += e.n;
			else spent -= e.n;
			out.push({ at: e.at, values: { in: got, out: spent, promised: spent + held }, note: `${e.says} · balance ${count(got - spent)}`, marks: e.n > 0 ? ['in'] : ['out', 'promised'] });
		}
		/* Receipts at the same moment (a settlement both spends and releases what was committed) are one point. */
		const one: typeof out = [];
		for (const r of out) {
			const prev = one.at(-1);
			if (prev && prev.at === r.at) one[one.length - 1] = { at: r.at, values: r.values, note: `${prev.note}; ${r.note}`, marks: [...new Set([...prev.marks, ...r.marks])] };
			else one.push(r);
		}
		return one;
	});

	/* The time shown: from the scale's start (or the day of the first receipt) to now. */
	const nowAt = $derived(new Date());
	const span = $derived.by(() => {
		const s = SCALES.find((x) => x.key === scale)!;
		if (s.span) {
			const end = new Date(nowAt.getTime() - back * s.span);
			return { start: new Date(end.getTime() - s.span), end };
		}
		const first = new Date(receipts[0]?.at ?? nowAt);
		const day = new Date(first.getFullYear(), first.getMonth(), first.getDate());
		if (first.getTime() - day.getTime() < HOUR) day.setDate(day.getDate() - 1);
		return { start: day, end: nowAt };
	});

	/* Whether there's anything further back to step to, and anything forward. */
	const firstAt = $derived(receipts[0]?.at ?? '');
	const canBack = $derived(scale !== 'all' && !!firstAt && span.start.toISOString() > firstAt);
	const canForward = $derived(scale !== 'all' && back > 0);
	/* The window in words: "in the last 24 hours", or its own dates once you've stepped back. */
	const fmtAt = (d: Date) => d.toLocaleString('en-GB', scale === 'hour' || scale === 'hours4' || scale === 'day' ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: scale === 'year' ? 'numeric' : undefined });
	const IN_WINDOW: Record<ScaleKey, string> = { hour: 'in the last hour', hours4: 'in the last 4 hours', day: 'in the last 24 hours', week: 'in the last week', month: 'in the last month', quarter: 'in the last 3 months', year: 'in the last year', all: 'since your first receipt' };
	const windowSays = $derived(back === 0 ? IN_WINDOW[scale] : `from ${fmtAt(span.start)} to ${fmtAt(span.end)}`);

	const points = $derived.by((): Point[] => {
		if (!receipts.length && !committed) return [];
		const from = span.start.toISOString();
		const before = receipts.filter((r) => r.at <= from).at(-1);
		const opening = before?.values ?? { in: 0, out: 0, promised: 0 };
		const out: Point[] = [{ at: from, values: { ...opening }, note: before ? `Opening: balance ${count(opening.in - opening.out)}` : 'Start: no credits yet' }];
		const to = span.end.toISOString();
		for (const r of receipts) if (r.at > from && r.at <= to) out.push({ ...r, values: { ...r.values } });
		const last = out[out.length - 1].values;
		/* At the window's end: today's commitment if it ends now, else as it stood then. */
		const held = back === 0 ? committed : last.promised - last.out;
		out.push({ at: to, values: { in: last.in, out: last.out, promised: last.out + held }, note: `${back === 0 ? 'Now' : 'Then'}: balance ${count(last.in - last.out)}${held ? `, ${credits(held)} committed` : ''}` });
		return out;
	});

	/*
	 * By the clock, like a share price (Darren: "it does need to be time
	 * scaled … like a share … over the last 24 hours … the last week … the
	 * last month"): a few times along the bottom in the scale's own steps.
	 */
	const ticks = $derived.by((): Tick[] => {
		const a = span.start;
		const b = span.end;
		const t: Tick[] = [];
		/* not too close to "Now", so the two labels never run together */
		const push = (d: Date, label: string) => d > a && b.getTime() - d.getTime() > (b.getTime() - a.getTime()) * 0.08 && t.push({ at: d.toISOString(), label });
		if (scale === 'hour' || scale === 'hours4') {
			/* every quarter of an hour, or every hour */
			const step = scale === 'hour' ? 15 : 60;
			const d = new Date(a);
			d.setSeconds(0, 0);
			d.setMinutes(Math.ceil((d.getMinutes() + 1) / step) * step);
			for (; d < b; d.setMinutes(d.getMinutes() + step)) push(new Date(d), d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
		} else if (scale === 'day') {
			const d = new Date(a);
			d.setMinutes(0, 0, 0);
			for (d.setHours(Math.ceil((a.getHours() + 1) / 6) * 6); d < b; d.setHours(d.getHours() + 6)) push(new Date(d), d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
		} else if (scale === 'week') {
			for (const d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1); d < b; d.setDate(d.getDate() + 1)) push(new Date(d), d.toLocaleDateString('en-GB', { weekday: 'short' }));
		} else if (scale === 'month') {
			for (const d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7); d < b; d.setDate(d.getDate() + 7)) push(new Date(d), d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
		} else if (scale === 'quarter' || scale === 'year') {
			const step = scale === 'quarter' ? 1 : 3;
			for (const d = new Date(a.getFullYear(), a.getMonth() + 1, 1); d < b; d.setMonth(d.getMonth() + step)) push(new Date(d), d.toLocaleDateString('en-GB', scale === 'year' ? { month: 'short', year: 'numeric' } : { month: 'long' }));
		} else {
			t.push({ at: a.toISOString(), label: a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
		}
		t.push({ at: b.toISOString(), label: back === 0 ? 'Now' : fmtAt(b) });
		return t;
	});

	const now = $derived(receipts.at(-1)?.values ?? { in: 0, out: 0, promised: 0 });
	const free = $derived(now.in - now.out - committed);
	const close = $derived(now.in > 0 && free < now.in * CLOSE);

	/*
	 * What the window holds, for the cards (Darren: "that information in
	 * those blocks is relevant to what the tab is showing"): received and
	 * spent within it, and committed now, with how it moved within it.
	 */
	const inWindow = $derived.by(() => {
		const from = span.start.toISOString();
		const to = span.end.toISOString();
		const moves = flow.filter((m) => m.at > from && m.at <= to);
		const committedThen = commits.filter((c) => c.at <= from).at(-1)?.committed ?? 0;
		const committedEnd = back === 0 ? committed : (commits.filter((c) => c.at <= to).at(-1)?.committed ?? 0);
		return {
			received: moves.reduce((n, m) => n + Math.max(0, m.n), 0),
			spent: moves.reduce((n, m) => n + Math.max(0, -m.n), 0),
			moved: scale === 'all' ? committedEnd : committedEnd - committedThen,
			committedEnd,
			/* credits newly committed to agreements within the window */
			committedIn: commits.filter((c) => c.at > from && c.at <= to && c.delta > 0).reduce((n, c) => n + c.delta, 0)
		};
	});
	/* The receipts for the open card, in the window. */
	const listed = $derived.by(() => {
		const from = span.start.toISOString();
		const to = span.end.toISOString();
		if (showing === 'committed')
			return commits
				.filter((c) => c.at > from && c.at <= to)
				.map((c) => ({ at: c.at, n: c.delta, hash: c.hash, says: c.delta > 0 ? `Committed ${credits(c.delta)} to an agreement` : `${credits(-c.delta)} no longer committed` }))
				.reverse();
		return flow
			.filter((m) => m.at > from && m.at <= to && (showing === 'in' ? m.n > 0 : m.n < 0))
			.map((m) => ({ at: m.at, n: m.n, hash: m.hash, says: m.says }))
			.reverse();
	});
	const summary = $derived.by(() => {
		const promised = committed ? ` ${credits(committed)} ${committed === 1 ? 'is' : 'are'} committed to agreements not yet settled: the amber band above the red line.` : '';
		const more = 'Get more: buy some, ask for them, or crowdfund.';
		if (free < 0) return `The amber band has passed the green: you’ve committed ${credits(-free)} more than you have.${promised} Agreements can’t settle until you get more credits. ${more}`;
		if (!free) return `Nothing free: the amber band is touching the green.${promised} ${more}`;
		if (close) return `Getting close: only ${credits(free)} free between the amber band and the green.${promised} ${more}`;
		return `${credits(free)} free: the green shading.${promised} You can’t go below nought; keep the amber band away from the green.`;
	});
	const tone = $derived<Tone>(free <= 0 ? 'error' : close ? 'warning' : 'primary');
</script>

{#if points.length}
	<div class="flex flex-col gap-3">
		<!-- the time to look at -->
		<div class="flex flex-wrap gap-2" role="group" aria-label="Time shown">
			{#each SCALES as s (s.key)}
				<button type="button" class="btn btn-sm {scale === s.key ? 'preset-filled-primary-500' : 'preset-tonal-surface'}" aria-pressed={scale === s.key} onclick={() => choose(s.key)}>{s.label}</button>
			{/each}
		</div>
		<!-- what that time holds, each card in its line's colour (the theme's primary, error and warning); tap one for its receipts -->
		<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
			<button type="button" class="card preset-filled-primary-600-400 p-4 text-left {showing === 'in' ? 'ring-4 ring-primary-300-700' : ''}" aria-expanded={showing === 'in'} aria-controls="credit-receipts" onclick={() => toggle('in')}>
				<p class="text-sm font-semibold flex justify-between gap-2">Received <span aria-hidden="true">{showing === 'in' ? '▴' : '▾'}</span></p>
				<p class="h3 tabular-nums {inWindow.received ? '' : 'opacity-60'}" style="color: inherit">{count(inWindow.received)}</p>
				<p class="text-xs opacity-80">{inWindow.received ? windowSays : `nothing ${windowSays}`}</p>
			</button>
			<button type="button" class="card preset-filled-error-600-400 p-4 text-left {showing === 'out' ? 'ring-4 ring-error-300-700' : ''}" aria-expanded={showing === 'out'} aria-controls="credit-receipts" onclick={() => toggle('out')}>
				<p class="text-sm font-semibold flex justify-between gap-2">Spent <span aria-hidden="true">{showing === 'out' ? '▴' : '▾'}</span></p>
				<p class="h3 tabular-nums {inWindow.spent ? '' : 'opacity-60'}" style="color: inherit">{count(inWindow.spent)}</p>
				<p class="text-xs opacity-80">{inWindow.spent ? windowSays : `nothing ${windowSays}`}</p>
			</button>
			<button type="button" class="card preset-filled-warning-600-400 p-4 text-left col-span-2 sm:col-span-1 {showing === 'committed' ? 'ring-4 ring-warning-300-700' : ''}" aria-expanded={showing === 'committed'} aria-controls="credit-receipts" onclick={() => toggle('committed')}>
				<p class="text-sm font-semibold flex justify-between gap-2">Committed <span aria-hidden="true">{showing === 'committed' ? '▴' : '▾'}</span></p>
				<p class="h3 tabular-nums {inWindow.committedIn ? '' : 'opacity-60'}" style="color: inherit">{count(inWindow.committedIn)}</p>
				<p class="text-xs opacity-80">{inWindow.committedIn ? windowSays : `nothing ${windowSays}`} · {count(inWindow.committedEnd)} committed {back === 0 ? 'now' : 'then'}</p>
			</button>
		</div>
		{#snippet list()}
			<!-- the receipts behind the card you tapped, in the window you chose, newest first -->
			<div id="credit-receipts">
				{#if showing}
					{@const rows = listed}
					<div class="card preset-outlined-surface-200-800 bg-surface-50-950 overflow-hidden">
						<p class="px-4 pt-3 pb-1 text-xs uppercase tracking-wide opacity-70">{showing === 'in' ? 'Received' : showing === 'out' ? 'Spent' : 'Committed'} {windowSays}</p>
						{#if rows.length}
							<ul class="divide-y divide-surface-200-800">
								{#each rows as r (r.hash + r.at)}
									<!-- one quiet line each: what, when, how many, and the receipt -->
									<li class="flex items-center gap-3 px-4 py-2 text-sm">
										<span class="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
											<span class="truncate">{r.says}</span>
											<span class="text-xs text-surface-700-300 tabular-nums shrink-0">{new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
										</span>
										<span class="tabular-nums font-medium {r.n < 0 ? 'text-error-600-400' : showing === 'committed' ? 'text-warning-600-400' : 'text-primary-600-400'}">{r.n > 0 ? '+' : ''}{count(r.n)}</span>
										{#if has(r.hash)}
											<button type="button" class="btn-icon btn-icon-sm preset-tonal shrink-0" aria-label="See the receipt" title="See the receipt" onclick={() => onOpen?.(r.hash)}><Icon name="search" size={14} /></button>
										{/if}
									</li>
								{/each}
							</ul>
						{:else}
							<p class="px-4 pb-4 pt-1 text-sm text-surface-700-300">Nothing {windowSays}.</p>
						{/if}
					</div>
				{/if}
			</div>
		{/snippet}
		{@render list()}
		<LineChart series={SERIES} {points} start={span.start.toISOString()} end={span.end.toISOString()} smooth={0.018} zoom={{ below: 0.2, above: 0.15 }} plain {ticks} format={count} bands={BANDS} says={summary} saysTone={tone} label="Credits received and credits spent, added up over time, with what’s committed as a band above spent" />
		{#if scale !== 'all'}
			<!-- step through time, a window at a time -->
			<div class="flex items-center justify-between gap-3" role="group" aria-label="Step through time">
				<button type="button" class="btn btn-sm preset-tonal" disabled={!canBack} aria-label="The {SCALES.find((x) => x.key === scale)?.label} before" onclick={() => (back += 1)}>← Earlier</button>
				<span class="text-sm text-surface-700-300 text-center">{back === 0 ? `The last ${SCALES.find((x) => x.key === scale)?.label.toLowerCase()}` : `${fmtAt(span.start)} – ${fmtAt(span.end)}`}</span>
				<button type="button" class="btn btn-sm preset-tonal" disabled={!canForward} aria-label="The {SCALES.find((x) => x.key === scale)?.label} after" onclick={() => (back = Math.max(0, back - 1))}>Later →</button>
			</div>
		{/if}
	</div>
{/if}
