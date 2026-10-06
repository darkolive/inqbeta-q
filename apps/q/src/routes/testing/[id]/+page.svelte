<script lang="ts">
	/*
	 * One checklist (6 October 2026): what to check on one page, or one tab.
	 * Take it ("I'll test this", signed, for two days), go through it, say what
	 * passed, what went wrong and what you didn't get to, and sign your report.
	 * What others and the AI runner found is shown alongside.
	 */
	import { page } from '$app/state';
	import { Page, Section, Status, Empty, Icon } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { AREAS, allChecks, CLAIM_DAYS, EVERY_PAGE, LANGUAGE_CHECKS, STATE_WORDS, claim, report, standing, listVersion, type Check, type Outcome, type Standing } from '@inqbeta/q-core/checks';
	import { GROUP_NAMES, listById, pageHref, readChecks, sendCheck } from '$lib/checklists';
	import SignIn from '$lib/components/SignIn.svelte';

	const list = $derived(listById(page.params.id ?? ''));
	let identity = $state<Identity | null>(null);
	$effect(() => watch((id) => (identity = id)));

	let found = $state<Standing | null>(null);
	async function refresh() {
		const l = list;
		if (!l) return;
		found = standing(l, await listVersion(l), await readChecks());
	}
	$effect(() => {
		void list;
		void refresh();
	});

	/* What you found, check by check. */
	type Found = Record<string, { outcome: Outcome | null; note: string }>;
	const blank = (): Found => (list ? Object.fromEntries(allChecks(list).map((c) => [c.id, { outcome: null, note: '' }])) : {});
	let results = $state<Found>({});
	/* Set outside render: a new list, a clean sheet. */
	$effect(() => {
		results = blank();
	});

	/* Your name and device, remembered on this device only (q.tester). */
	let name = $state('');
	let device = $state('');
	$effect(() => {
		try {
			const t = JSON.parse(localStorage.getItem('q.tester') ?? 'null') as { name?: string; device?: string } | null;
			name = t?.name ?? '';
			device = t?.device ?? '';
		} catch {
			/* nothing remembered */
		}
	});
	function rememberTester() {
		try {
			localStorage.setItem('q.tester', JSON.stringify({ name: name.trim(), device: device.trim() }));
		} catch {
			/* fine: asked again next time */
		}
	}

	const parts = $derived(
		list
			? [
					{ id: 'own', called: 'This page', checks: list.checks },
					{ id: 'every', called: 'What every page is checked for', checks: EVERY_PAGE },
					{ id: 'languages', called: 'Languages', checks: LANGUAGE_CHECKS }
				]
			: []
	);
	const answered = $derived(Object.values(results).filter((r) => r.outcome).length);
	const missingNote = $derived(Object.values(results).some((r) => r.outcome === 'fail' && !r.note.trim()));
	const mineClaim = $derived(!!found?.claimed && !!identity && found.claimed.tester === identity.did);

	let busy = $state<'claim' | 'report' | null>(null);
	let said = $state<{ good: boolean; text: string } | null>(null);
	async function take() {
		if (!identity || !list) return;
		busy = 'claim';
		said = null;
		try {
			rememberTester();
			const out = await sendCheck(await claim(identity, list, { name }));
			said = out.ok ? { good: true, text: `It’s yours for ${CLAIM_DAYS} days. Others will see you have it.` } : { good: false, text: out.says };
			await refresh();
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
		}
		busy = null;
	}
	async function send() {
		if (!identity || !list) return;
		busy = 'report';
		said = null;
		try {
			rememberTester();
			const r = await report(identity, list, {
				name,
				device,
				site: location.origin,
				results: Object.entries(results)
					.filter(([, v]) => v.outcome)
					.map(([check, v]) => ({ check, outcome: v.outcome!, note: v.note }))
			});
			const out = await sendCheck(r);
			if (out.ok) {
				const problems = r.content.results.filter((x) => x.outcome === 'fail').length;
				said = { good: true, text: problems ? `Thank you. Your report is signed and kept, with ${problems} problem${problems === 1 ? '' : 's'} for us to fix.` : 'Thank you. Your report is signed and kept.' };
				results = blank();
				await refresh();
			} else said = { good: false, text: out.says };
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
		}
		busy = null;
	}
	const onDay = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
	const HOW: Record<Check['how'], string> = { ai: 'AI can check', human: 'A person checks', both: 'AI and a person' };
	const OUTCOMES: { id: Outcome; called: string; tone: string }[] = [
		{ id: 'pass', called: 'Works', tone: 'preset-filled-success-500' },
		{ id: 'fail', called: 'Problem', tone: 'preset-filled-error-500' },
		{ id: 'skip', called: 'Didn’t check', tone: 'preset-filled-surface-500' }
	];
</script>

<svelte:head><title>{list ? `Testing: ${list.title}` : 'Testing'} — Q</title></svelte:head>

{#if !list}
	<Page title="Testing">
		<Empty icon="check" title="No such checklist" description="It may have been renamed. Go back to Testing to find it." />
	</Page>
{:else}
	<Page title={list.title} lead={`${GROUP_NAMES[list.group] ?? list.group} · ${list.page === '*' ? 'every page' : list.page}${list.tab ? ` · ${list.tab}` : ''}`}>
		<a class="anchor text-sm mb-4 inline-block" href="/testing">← All checklists</a>

		<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-3 mb-6">
			<div class="flex flex-wrap items-center gap-3">
				{#if found}<Status tone={found.state === 'passed' ? 'good' : found.state === 'issues' ? 'bad' : found.state === 'claimed' || found.state === 'part' ? 'waiting' : 'plain'}>{STATE_WORDS[found.state]}</Status><span class="text-sm">{found.passed} of {found.total} checks passed</span>{/if}
				{#if found?.claimed}<span class="text-sm opacity-80">{mineClaim ? 'You have it' : `${found.claimed.name ?? 'Someone'} has it`} until {onDay(found.claimed.until)}</span>{/if}
			</div>
			<p class="text-sm"><span class="font-bold">You’ll need:</span> {list.needs}</p>
			<div class="flex flex-wrap gap-2">
				{#if pageHref(list)}<a class="btn preset-tonal min-h-11" href={pageHref(list)} target="_blank" rel="noopener">Open the page <Icon name="arrowRight" size={16} /></a>{/if}
				{#if identity && !mineClaim}
					<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy !== null} onclick={() => void take()}>{busy === 'claim' ? 'Signing…' : found?.claimed ? 'Test it too' : 'I’ll test this'}</button>
				{/if}
			</div>
		</div>

		{#if found?.problems.length}
			<Section title="Problems found" description="From the latest reports on this version of the list.">
				<ul class="flex flex-col gap-2">
					{#each found.problems as p (p.check + p.at)}
						<li class="card preset-tonal-error p-3 text-sm flex flex-col gap-1">
							<span class="font-bold">{p.says}</span>
							<span>{p.note}</span>
							<span class="opacity-70">{p.by === 'ai' ? 'AI runner' : (p.name ?? 'A tester')}, {onDay(p.at)}</span>
						</li>
					{/each}
				</ul>
			</Section>
		{/if}

		{#if !identity}
			<p class="mb-4">Sign in to take this checklist and report on it. Anyone can read it.</p>
			<SignIn />
		{/if}

		{#each parts as part (part.id)}
			<Section title={part.called}>
				<ol class="flex flex-col gap-3">
					{#each part.checks as c (c.id)}
						{@const r = results[c.id]}
						<li class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 flex flex-col gap-3">
							<p>{c.says}</p>
							<div class="flex flex-wrap gap-2 text-xs">
								<span class="badge preset-tonal">{AREAS[c.area]}</span>
								<span class="badge preset-tonal">{HOW[c.how]}</span>
							</div>
							{#if identity && r}
								<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="What you found">
									{#each OUTCOMES as o (o.id)}
										<button type="button" role="radio" aria-checked={r.outcome === o.id} class="btn btn-sm min-h-11 {r.outcome === o.id ? o.tone : 'preset-tonal'}" onclick={() => (r.outcome = r.outcome === o.id ? null : o.id)}>{o.called}</button>
									{/each}
								</div>
								{#if r.outcome === 'fail' || r.outcome === 'skip'}
									<label class="label">
										<span class="label-text">{r.outcome === 'fail' ? 'What went wrong? What did you press, and what happened?' : 'Why not? (optional)'}</span>
										<textarea class="textarea" rows="2" bind:value={r.note}></textarea>
									</label>
								{/if}
							{/if}
						</li>
					{/each}
				</ol>
			</Section>
		{/each}

		{#if identity}
			<div class="card preset-outlined-primary-500 p-5 flex flex-col gap-3 sticky bottom-4 bg-surface-50-950">
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="label"><span class="label-text">Your name, as other testers see it</span><input class="input" type="text" autocomplete="name" bind:value={name} /></label>
					<label class="label"><span class="label-text">What you tested on (phone, browser)</span><input class="input" type="text" bind:value={device} /></label>
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy !== null || !answered || missingNote} onclick={() => void send()}>{busy === 'report' ? 'Signing… touch your passkey' : 'Sign and send my report'}</button>
					<span class="text-sm">{answered} answered{missingNote ? ' · say what went wrong for each problem' : ''}</span>
				</div>
				{#if said}<p class="card p-3 text-sm {said.good ? 'preset-tonal-success' : 'preset-tonal-error'}" aria-live="polite">{said.text}</p>{/if}
			</div>
		{/if}
	</Page>
{/if}
