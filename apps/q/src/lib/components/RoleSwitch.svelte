<script lang="ts">
	/*
	 * The role switch (ADR-Q-038): "Acting as: Me ⟷ Caretaker of Green Space".
	 * Turning it on says you're here for the federation, not for yourself;
	 * the page then shows what the office may do. Shown only where you hold
	 * an office; with none, the page says so once and nothing changes.
	 *
	 * Turning it on is a declaration (Darren, 6 October): "I am acting with no
	 * conflict of interest, or I may have a conflict and declare it, then you
	 * sign it." Every time, under the seven principles of public life.
	 */
	import { NOLAN_PRINCIPLES, type Declaration } from '@inqbeta/q-core/inrole';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { role, officeName } from '$lib/role.svelte';

	let { federation, name, offices, mandates = {}, standing = {} }: { federation: string; name: string; offices: string[]; mandates?: Record<string, string[]>; standing?: Record<string, string> } = $props();

	/* Several offices here: choose which one to take up. One at a time (ADR-Q-038 §2). */
	let chosen = $state('');
	const current = $derived(role.acting?.federation === federation && offices.includes(role.acting.office) ? role.acting.office : '');
	const office = $derived(current || (offices.includes(chosen) ? chosen : (offices[0] ?? '')));
	const on = $derived(!!current);
	const actingElsewhere = $derived(!!role.acting && role.acting.federation !== federation);

	/* The declaration, asked each time the switch goes on. */
	let declaring = $state(false);
	let kind = $state<'none' | 'interest' | ''>('');
	let interest = $state('');
	let busy = $state(false);
	let problem = $state('');
	/* An office that comes with an interest (an employee's, say): it's declared every time, and can't be left out. */
	const standingHere = $derived(standing[office] ?? '');
	const ready = $derived((kind === 'none' && !standingHere) || (kind === 'interest' && !!interest.trim() && interest.includes(standingHere)));
	function startDeclaring() {
		declaring = true;
		kind = standingHere ? 'interest' : '';
		interest = standingHere;
		problem = '';
	}
	async function sign() {
		if (!ready) return;
		busy = true;
		problem = '';
		try {
			const d: Declaration = kind === 'none' ? { kind: 'none' } : { kind: 'interest', says: interest };
			await role.takeUp(federation, name, office, mandates[office] ?? [], d);
			declaring = false;
		} catch (e) {
			problem = e instanceof Error ? e.message : String(e);
		}
		busy = false;
	}
</script>

{#if office}
	<div class="card {on ? 'preset-filled-secondary-500' : 'preset-outlined-surface-200-800'} p-4 flex flex-wrap items-center gap-4">
		<Switch checked={on || declaring} onCheckedChange={(d) => (d.checked ? startDeclaring() : declaring ? (declaring = false) : void role.setDown())}>
			<Switch.Control class="w-12 h-7"><Switch.Thumb /></Switch.Control>
			<Switch.Label class="sr-only">Acting as {officeName(office)} of {name}</Switch.Label>
			<Switch.HiddenInput />
		</Switch>
		<div class="flex-1 min-w-56">
			<p><span class="opacity-80">Acting as:</span> {on ? `${officeName(office)} of ${name}` : 'Me'}{on && role.acting?.interest ? ' · interest declared' : ''}</p>
			<p class="text-sm {on ? '' : 'opacity-70'}">
				{#if on}
					You’re here for {name}, not for yourself. What you sign, you sign in its name, under the rules you agreed when you joined.
				{:else if actingElsewhere}
					You’re acting as {officeName(role.acting!.office)} of {role.acting!.name}. Turning this on sets that down first.
				{:else if offices.length > 1}
					You hold {offices.length} offices here. Choose one to take up; set it down to be just you.
				{:else}
					You hold an office here: {officeName(office)}. Take it up to look after {name}; set it down to be just you.
				{/if}
			</p>
			{#if offices.length > 1 && !on}
				<div class="flex flex-wrap gap-2 mt-2" role="radiogroup" aria-label="Which office">
					{#each offices as o (o)}
						<button type="button" role="radio" aria-checked={office === o} class="btn btn-sm min-h-11 {office === o ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => (chosen = o)}>{officeName(o)}</button>
					{/each}
				</div>
			{/if}
		</div>
			{#if declaring && !on}
			<div class="w-full card preset-tonal-surface p-4 flex flex-col gap-3" role="group" aria-label="Your declaration">
				<p class="font-bold">Before you act as {officeName(office)} of {name}: your declaration.</p>
				<p class="text-sm">You’ll be acting for {name}, not for yourself. Say whether anything you might do in this role touches your own interests. It’s signed, and kept, each time.</p>
				<div class="flex flex-col gap-2" role="radiogroup" aria-label="Conflict of interest">
					{#if standingHere}
						<p class="text-sm">This office comes with an interest, declared every time: <strong>{standingHere}</strong> You can add to it.</p>
					{:else}
						<button type="button" role="radio" aria-checked={kind === 'none'} class="btn min-h-11 justify-start {kind === 'none' ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => (kind = 'none')}>I have no conflict of interest</button>
					{/if}
					<button type="button" role="radio" aria-checked={kind === 'interest'} class="btn min-h-11 justify-start {kind === 'interest' ? 'preset-filled-warning-500' : 'preset-tonal'}" onclick={() => (kind = 'interest')}>I may have one, and I declare it</button>
				</div>
				{#if kind === 'interest'}
					<label class="label"><span class="label-text">What it is, in plain words</span><textarea class="textarea" rows="2" bind:value={interest}></textarea></label>
					<p class="text-sm">You can still act. Your declaration goes with what you do, and anything that touches it should go to another office holder.</p>
				{/if}
				<details class="text-sm">
					<summary class="cursor-pointer min-h-11 flex items-center">The seven principles you’re acting under</summary>
					<ul class="flex flex-col gap-1 mt-2">
						{#each NOLAN_PRINCIPLES as p (p.id)}<li><strong>{p.called}:</strong> {p.says}</li>{/each}
					</ul>
				</details>
				{#if problem}<p class="card preset-tonal-error p-3" aria-live="polite">{problem}</p>{/if}
				<div class="flex flex-wrap gap-3">
					<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!ready || busy} onclick={() => void sign()}>{busy ? 'Signing…' : 'Sign and take it up'}</button>
					<button type="button" class="btn preset-tonal min-h-11" onclick={() => (declaring = false)}>Not now</button>
				</div>
			</div>
		{/if}
</div>
{/if}
