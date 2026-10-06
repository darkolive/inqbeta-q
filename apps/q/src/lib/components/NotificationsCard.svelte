<script lang="ts">
	/*
	 * Your notifications card (ADR-Q-016 §6), 2 October 2026: one switch per
	 * source. On, the bell rings and counts it; off, Q doesn't even listen.
	 * Messages from people, post for an office you hold (with its hours,
	 * 6 October 2026), and each federation you're in.
	 */
	import { officeHours, setOfficeHours } from '$lib/notify';
	import { WEEKDAYS_9_TO_5, hoursInWords, type OfficeHours } from '@inqbeta/q-core/offices';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { Icon, type IconName } from '@inqbeta/q-ui';
	import { reachFor, setReach, watchReach, type Reach, type Source } from '$lib/notify';

	let { federations = [] }: { federations?: { did: string; name: string }[] } = $props();

	type Row = { source: Source; name: string; what: string; icon: IconName };
	const rows = $derived<Row[]>([
		{ source: 'people', name: 'Messages', what: 'From people: messages, invitations, linking up', icon: 'message' },
		{ source: 'offices', name: 'Office post', what: 'Questions to an office you hold, like treasurer, in your office hours', icon: 'federations' },
		...federations.map((f) => ({ source: `fed:${f.did}` as Source, name: f.name, what: 'What’s new, things to try, asking what you think', icon: 'federations' as IconName }))
	]);

	let all = $state<Record<string, Reach>>({});
	$effect(() => watchReach((a) => ((all = a), (hours = officeHours()))));

	/* Office hours: out of hours, post waits on the office's desk, and whoever writes is told before they send. */
	let hours = $state<OfficeHours | null>(null);
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
	const DAYS = [1, 2, 3, 4, 5, 6, 0];
	const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const HOURS = Array.from({ length: 25 }, (_, i) => i);
	const clock = (n: number) => (n === 0 || n === 24 ? 'Midnight' : n === 12 ? 'Noon' : n < 12 ? `${n}am` : `${n - 12}pm`);
	function change(next: Partial<OfficeHours>) {
		const h = { ...(hours ?? WEEKDAYS_9_TO_5(zone)), ...next, zone };
		if (h.days.length && h.from < h.to) setOfficeHours(h);
	}
	const toggleDay = (d: number) => hours && change({ days: hours.days.includes(d) ? hours.days.filter((x) => x !== d) : [...hours.days, d] });
</script>

<article class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-2 max-w-xl">
	<header class="flex items-center gap-2 h5 mb-2"><Icon name="bell" /> What rings your bell</header>
	<ul class="flex flex-col divide-y divide-surface-200-800">
		{#each rows as r (r.source)}
			{@const on = reachFor(r.source, all) !== 'off'}
			<li class="py-2">
				<Switch checked={on} onCheckedChange={(d) => setReach(r.source, d.checked ? 'ring' : 'off')} class="flex items-center justify-between gap-4 min-h-11">
					<Switch.Label class="flex items-start gap-3">
						<Icon name={r.icon} class="mt-1 shrink-0" />
						<span class="flex flex-col">
							<span class="font-bold">{r.name}</span>
							<span class="text-sm opacity-70">{on ? r.what : 'Off: nothing from here reaches you.'}</span>
						</span>
					</Switch.Label>
					<Switch.Control><Switch.Thumb /></Switch.Control>
					<Switch.HiddenInput />
				</Switch>
				{#if r.source === 'offices' && on}
					<div class="flex flex-col gap-3 mt-2 pl-9">
						<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="When it rings">
							<button type="button" role="radio" aria-checked={!hours} class="btn btn-sm min-h-11 {!hours ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => setOfficeHours(null)}>Any time</button>
							<button type="button" role="radio" aria-checked={!!hours} class="btn btn-sm min-h-11 {hours ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => change({})}>In office hours</button>
						</div>
						{#if hours}
							<div class="flex flex-wrap gap-1" role="group" aria-label="Days">
								{#each DAYS as d (d)}
									<button type="button" aria-pressed={hours.days.includes(d)} class="btn btn-sm min-h-11 min-w-11 {hours.days.includes(d) ? 'preset-filled-secondary-500' : 'preset-tonal'}" onclick={() => toggleDay(d)}>{DAY[d]}</button>
								{/each}
							</div>
							<div class="flex flex-wrap items-end gap-3">
								<label class="label w-32"><span class="label-text">From</span><select class="select" value={hours.from} onchange={(e) => change({ from: Number(e.currentTarget.value) })}>{#each HOURS.slice(0, 24) as h (h)}<option value={h}>{clock(h)}</option>{/each}</select></label>
								<label class="label w-32"><span class="label-text">Till</span><select class="select" value={hours.to} onchange={(e) => change({ to: Number(e.currentTarget.value) })}>{#each HOURS.slice(1) as h (h)}<option value={h}>{clock(h)}</option>{/each}</select></label>
							</div>
							<p class="text-sm opacity-70">{hoursInWords(hours)}. Out of hours, post waits on the office’s desk, and whoever writes is told before they send. You can always check in yourself.</p>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	{#if !federations.length}<p class="text-sm opacity-70">When you join a federation that sends news, it appears here with its own switch.</p>{/if}
	<footer class="text-sm opacity-70 border-t border-surface-200-800 pt-3 mt-2">Calls always ring. This is kept in your vault; nobody else sees it.</footer>
</article>
