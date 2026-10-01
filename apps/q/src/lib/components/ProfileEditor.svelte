<script lang="ts">
	/*
	 * Fill in your profile like a form. Each detail has one switch: shown on
	 * cards, or just for you. The preview is you, as only you see it.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { untrack } from 'svelte';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import type { AnswerValue } from '@inqbeta/q-core/questions';
	import CardFace from '$lib/components/CardFace.svelte';
	import { DETAILS, saveProfile, justForMe, asText } from '$lib/profile';
	import { smallPicture, PICTURE, COVER } from '$lib/pictures';

	let {
		identity,
		now,
		onSaved,
		onCancel
	}: { identity: Identity; now: Record<string, AnswerValue>; onSaved: () => void; onCancel?: () => void } = $props();

	/* Filled in once, from what you'd said when the form opened. */
	const start = untrack(() => now);
	let values = $state<Record<string, string>>(Object.fromEntries(DETAILS.map((d) => [d.id, asText(start[d.id])])));
	let mine = $state<string[]>(justForMe(start));
	let busy = $state(false);
	let says = $state('');

	const toggle = (id: string, shown: boolean) => (mine = shown ? mine.filter((x) => x !== id) : [...new Set([...mine, id])]);

	async function pick(e: Event, id: string, size: { w: number; h: number }) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			values[id] = await smallPicture(file, size.w, size.h);
		} catch (err) {
			says = err instanceof Error ? err.message : 'That picture couldn’t be used.';
		}
	}

	async function save() {
		busy = true;
		says = '';
		const out = await saveProfile(identity, values, mine);
		busy = false;
		if (!out.ok) return void (says = out.says.join(' '));
		onSaved();
	}

	const preview = $derived(Object.fromEntries(Object.entries(values).filter(([, v]) => v)));
</script>

<div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
	<form class="flex flex-col gap-5" onsubmit={(e) => { e.preventDefault(); void save(); }}>
		{#each DETAILS as d (d.id)}
			<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<span class="font-bold">{d.label}{d.required ? '' : ''}</span>
					<!-- One switch per detail, in words: colour only confirms them. -->
					<div class="flex rounded-base preset-outlined-surface-300-700" role="group" aria-label="Who sees {d.label}">
						<button type="button" class="btn btn-sm min-h-11 {mine.includes(d.id) ? '' : 'preset-filled-primary-500'}" aria-pressed={!mine.includes(d.id)} onclick={() => toggle(d.id, true)}>Shown on cards</button>
						<button type="button" class="btn btn-sm min-h-11 {mine.includes(d.id) ? 'preset-filled-surface-500' : ''}" aria-pressed={mine.includes(d.id)} onclick={() => toggle(d.id, false)}><Icon name="lock" size={14} /> Just for me</button>
					</div>
				</div>
				{#if d.kind === 'picture' || d.kind === 'cover'}
					<div class="flex flex-wrap items-center gap-3">
						{#if values[d.id]}
							<img src={values[d.id]} alt="" class="{d.kind === 'picture' ? 'size-16 rounded-full' : 'h-16 w-48 rounded-base'} object-cover" />
						{/if}
						<label class="btn preset-tonal min-h-11 cursor-pointer">
							{values[d.id] ? 'Choose another' : 'Choose a picture'}
							<input type="file" accept="image/*" class="sr-only" onchange={(e) => pick(e, d.id, d.kind === 'picture' ? PICTURE : COVER)} />
						</label>
						{#if values[d.id]}
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (values[d.id] = '')}>Remove</button>
						{/if}
					</div>
				{:else if d.kind === 'longtext'}
					<textarea class="textarea" rows="3" bind:value={values[d.id]} aria-label={d.label}></textarea>
				{:else}
					<input class="input" type="text" bind:value={values[d.id]} aria-label={d.label} required={d.required} />
				{/if}
				{#if d.hint}<p class="text-xs opacity-60">{d.hint}</p>{/if}
			</div>
		{/each}

		<div class="flex flex-wrap gap-3">
			<button type="submit" class="btn preset-filled-primary-500 min-h-11" disabled={busy || !values['q:person/called']?.trim()}>
				{busy ? 'Saving…' : 'Save my profile'}
			</button>
			{#if onCancel}<button type="button" class="btn preset-tonal min-h-11" onclick={onCancel}>Not now</button>{/if}
		</div>
		{#if says}<p class="text-sm text-warning-700-300" aria-live="polite">{says}</p>{/if}
	</form>

	<aside class="flex flex-col gap-2 lg:sticky lg:top-4 self-start">
		<p class="text-sm opacity-70">Your whole profile. Only you see it like this; other people see a card.</p>
		<CardFace details={preview} did={identity.did} badge="Your profile" />
		{#if mine.length}
			<p class="text-xs opacity-60 flex items-center gap-1"><Icon name="lock" size={12} /> {mine.length} {mine.length === 1 ? 'detail is' : 'details are'} just for you and never go on a card.</p>
		{/if}
	</aside>
</div>
