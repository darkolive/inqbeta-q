<script lang="ts">
	/*
	 * Fill in your profile like a form. Each detail has one switch: shown on
	 * cards, or just for me. At the bottom, the building blocks: add a detail
	 * of your own — words, a date, a number, a picture — one row at a time.
	 * The preview is you, as only you see it.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { untrack } from 'svelte';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import type { AnswerValue } from '@inqbeta/q-core/questions';
	import CardFace from '$lib/components/CardFace.svelte';
	import DetailInput from '$lib/components/DetailInput.svelte';
	import { allDetails, ownDetails, saveProfile, justForMe, asText, QUIET, OWN_KINDS, newOwnId, nameFrom, withLabels, type OwnDetail, type OwnKind } from '$lib/profile';

	let {
		identity,
		now,
		onSaved,
		onCancel
	}: { identity: Identity; now: Record<string, AnswerValue>; onSaved: () => void; onCancel?: () => void } = $props();

	/* Filled in once, from what you'd said when the form opened. */
	const start = untrack(() => now);
	let own = $state<OwnDetail[]>(ownDetails(start));
	const details = $derived(allDetails(own));
	const startText = (id: string) => {
		const v = start[id];
		return typeof v === 'boolean' ? (v ? 'yes' : 'no') : asText(v);
	};
	let values = $state<Record<string, string>>(Object.fromEntries(allDetails(ownDetails(start)).map((d) => [d.id, startText(d.id)])));
	/* "What people call you" that only repeats first and last is shown empty, so it follows them. */
	if (values['q:person/called'] && values['q:person/called'] === [values['q:person/first'], values['q:person/last']].filter(Boolean).join(' ')) values['q:person/called'] = '';
	/* Sharper details start just for you until you say otherwise. */
	let mine = $state<string[]>([...new Set([...justForMe(start), ...QUIET.filter((id) => start[id] === undefined)])]);
	let busy = $state(false);
	let says = $state('');

	const toggle = (id: string, shown: boolean) => (mine = shown ? mine.filter((x) => x !== id) : [...new Set([...mine, id])]);

	/* ---- The building block: one row, then Add ---- */
	let newLabel = $state('');
	let newKind = $state<OwnKind>('text');
	let newValue = $state('');
	let newShown = $state(true);
	function addRow() {
		const label = newLabel.trim();
		if (!label) return;
		const id = newOwnId(label, details.map((d) => d.id));
		own = [...own, { id, label, kind: newKind }];
		values[id] = newValue;
		if (!newShown) mine = [...mine, id];
		newLabel = '';
		newValue = '';
		newKind = 'text';
		newShown = true;
	}
	function removeRow(id: string) {
		own = own.filter((d) => d.id !== id);
		delete values[id];
		mine = mine.filter((x) => x !== id);
	}

	async function save() {
		busy = true;
		says = '';
		const out = await saveProfile(identity, values, mine, own);
		busy = false;
		if (!out.ok) return void (says = out.says.join(' '));
		onSaved();
	}

	const hasName = $derived(!!nameFrom(values));
	const preview = $derived(
		withLabels(Object.fromEntries([...Object.entries(values).filter(([, v]) => v), ...(hasName ? [['q:person/called', nameFrom(values)]] : [])]), own)
	);
</script>

{#snippet whoSees(id: string, label: string)}
	<!-- One switch per detail, in words: colour only confirms them. -->
	<div class="flex rounded-base preset-outlined-surface-300-700" role="group" aria-label="Who sees {label}">
		<button type="button" class="btn btn-sm min-h-11 {mine.includes(id) ? '' : 'preset-filled-primary-500'}" aria-pressed={!mine.includes(id)} onclick={() => toggle(id, true)}>Shown on cards</button>
		<button type="button" class="btn btn-sm min-h-11 {mine.includes(id) ? 'preset-filled-surface-500' : ''}" aria-pressed={mine.includes(id)} onclick={() => toggle(id, false)}><Icon name="lock" size={14} /> Just for me</button>
	</div>
{/snippet}

<div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
	<form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void save(); }}>
		{#each details as d (d.id)}
			<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<span class="font-bold">{d.label}{#if d.own}<span class="badge preset-tonal-surface ml-2">Yours</span>{/if}</span>
					<div class="flex flex-wrap items-center gap-2">
						{@render whoSees(d.id, d.label)}
						{#if d.own}<button type="button" class="btn btn-sm preset-tonal min-h-11" onclick={() => removeRow(d.id)} aria-label="Remove {d.label}"><Icon name="close" size={14} /></button>{/if}
					</div>
				</div>
				<DetailInput kind={d.kind} label={d.label} bind:value={values[d.id]} onerror={(m) => (says = m)} />
				{#if d.hint}<p class="text-xs opacity-60">{d.hint}</p>{/if}
			</div>
		{/each}

		<!-- The building block. -->
		<div class="card preset-tonal-primary p-4 flex flex-col gap-3">
			<span class="font-bold flex items-center gap-2"><Icon name="plus" size={16} /> Add a detail of your own</span>
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="label">
					<span class="label-text">What is it called?</span>
					<input class="input" bind:value={newLabel} />
				</label>
				<label class="label">
					<span class="label-text">What kind of thing?</span>
					<select class="select" bind:value={newKind} onchange={() => (newValue = '')}>
						{#each OWN_KINDS as k (k.kind)}<option value={k.kind}>{k.label}</option>{/each}
					</select>
				</label>
			</div>
			<DetailInput kind={newKind} label={newLabel || 'The detail'} bind:value={newValue} onerror={(m) => (says = m)} />
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex rounded-base preset-outlined-surface-300-700" role="group" aria-label="Who sees it">
					<button type="button" class="btn btn-sm min-h-11 {newShown ? 'preset-filled-primary-500' : ''}" aria-pressed={newShown} onclick={() => (newShown = true)}>Shown on cards</button>
					<button type="button" class="btn btn-sm min-h-11 {newShown ? '' : 'preset-filled-surface-500'}" aria-pressed={!newShown} onclick={() => (newShown = false)}><Icon name="lock" size={14} /> Just for me</button>
				</div>
				<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!newLabel.trim()} onclick={addRow}>Add</button>
			</div>
			{#if !newLabel.trim()}<p class="text-xs opacity-70">Give it a name, and Add wakes up. Then save your profile to keep it.</p>{/if}
		</div>

		<div class="flex flex-wrap gap-3">
			<button type="submit" class="btn preset-filled-primary-500 min-h-11" disabled={busy || !hasName}>
				{busy ? 'Saving…' : 'Save my profile'}
			</button>
			{#if onCancel}<button type="button" class="btn preset-tonal min-h-11" onclick={onCancel}>Not now</button>{/if}
		</div>
		{#if !hasName}<p class="text-xs opacity-70">Your first name, or what people call you, and Save wakes up.</p>{/if}
		{#if says}<p class="text-sm text-warning-700-300" aria-live="polite">{says}</p>{/if}
	</form>

	<aside class="flex flex-col gap-2 lg:sticky lg:top-4 self-start">
		<p class="text-sm opacity-70">Your whole profile. Only you see it like this; other people see a card.</p>
		<CardFace details={preview} did={identity.did} badge="Your profile" />
		{#if mine.length}
			<p class="text-xs opacity-60 flex items-center gap-1"><Icon name="lock" size={12} /> Details set to just for me never go on a card.</p>
		{/if}
	</aside>
</div>
