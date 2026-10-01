<script lang="ts">
	/*
	 * Making your Personal card, one small step at a time (1 October 2026).
	 *
	 * Darren: "go into personal card and have the very basic form first, and
	 * then the next stage … my identity … my contact details … then
	 * businesses. You can keep adding."
	 *
	 * Four steps, a few questions each, never a long scroll:
	 *   1. You       — your name, date of birth, your photo and cover
	 *   2. Contact   — email, phone, WhatsApp, home address
	 *   3. Work      — businesses, added one at a time (or skipped)
	 *   4. Your card — switch on what people see, with the card beside it
	 *
	 * Each Next keeps what you've written (a new signed answering), so leaving
	 * half-way loses nothing.
	 */
	import { Steps } from '@skeletonlabs/skeleton-svelte';
	import { Icon } from '@inqbeta/q-ui';
	import { untrack } from 'svelte';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import type { AnswerValue } from '@inqbeta/q-core/questions';
	import ChooseShown from '$lib/components/ChooseShown.svelte';
	import { allDetails, ownDetails, justForMe, asText, saveProfile, nameFrom, businessesFrom, businessesAsDetails, blankBusiness, BIZ_PARTS, LABEL, type Business } from '$lib/profile';
	import { smallPicture, PICTURE, COVER } from '$lib/pictures';
	import { saveCard } from '$lib/cards';
	import { watchFolder, chooseFolder, wakeFolder, type FolderState } from '@inqbeta/q-core/folder';

	/*
	 * Someone brand new may have nowhere to keep things yet (a computer's
	 * browser waits for a folder to be chosen). Then the steps keep everything
	 * in this page, and the last step asks where to keep it — one choice,
	 * made once. On a phone the browser keeps it, so this never comes up.
	 */
	let folder = $state<FolderState>({ kind: 'checking' });
	$effect(() => watchFolder((f) => (folder = f)));
	let needPlace = $state(false);
	async function choosePlace() {
		says = '';
		const out = folder.kind === 'asleep' ? await wakeFolder() : await chooseFolder();
		if (!out.ok) return void (says = out.cancelled ? '' : out.says);
		needPlace = false;
		await finish();
	}

	let {
		identity,
		now,
		shown = [],
		startAt = 0,
		onDone,
		onCancel
	}: {
		identity: Identity;
		now: Record<string, AnswerValue>;
		/** What your Personal card shows now, if you have one. */
		shown?: string[];
		startAt?: number;
		onDone: () => void;
		onCancel: () => void;
	} = $props();

	const start = untrack(() => now);
	const startOwn = ownDetails(start);
	let values = $state<Record<string, string>>(Object.fromEntries(allDetails(startOwn).map((d) => [d.id, asText(start[d.id])])));
	/* A name that only repeats first and last follows them. */
	if (values['q:person/called'] && values['q:person/called'] === [values['q:person/first'], values['q:person/last']].filter(Boolean).join(' ')) values['q:person/called'] = '';
	/* Someone who only ever gave one name: offer it as their first name. */
	if (!values['q:person/first'] && values['q:person/called'] && !values['q:person/last']) {
		values['q:person/first'] = values['q:person/called'];
		values['q:person/called'] = '';
	}
	let businesses = $state<Business[]>(businessesFrom(start, startOwn));
	let adding = $state<Business | null>(null);
	let sameAsPhone = $state(!!values['q:person/whatsapp'] && values['q:person/whatsapp'] === values['q:person/phone']);
	const DEFAULT_SHOWN = ['q:person/cover', 'q:person/picture', 'q:person/called', 'q:person/email', 'q:person/phone', 'q:person/whatsapp'];
	let shows = $state<string[]>(untrack(() => (shown.length ? [...shown] : DEFAULT_SHOWN)));

	let step = $state(untrack(() => startAt));
	let busy = $state(false);
	let says = $state('');

	const STEPS = [
		{ title: 'You', says: 'Your name, and how you look on your card.' },
		{ title: 'Contact', says: 'How people reach you. Fill in what you like.' },
		{ title: 'Work', says: 'Where you work or what you run. Add as many as you like, or skip this.' },
		{ title: 'Your card', says: 'Switch on what people see. Everything else stays with you.' }
	];

	async function pick(e: Event, id: string, size: { w: number; h: number }) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			values[id] = await smallPicture(file, size.w, size.h);
		} catch (err) {
			says = err instanceof Error ? err.message : 'That picture couldn’t be used.';
		}
	}

	const name = $derived(nameFrom(values));
	const canGoOn = $derived(step !== 0 || !!name);

	/** Keep what's written so far. */
	async function keep(cardShows?: string[]): Promise<{ ok: true } | { ok: false; says: string[] }> {
		/* Nowhere to keep it yet: it stays in this page until the last step. */
		if (folder.kind !== 'ready') return { ok: true };
		if (sameAsPhone) values['q:person/whatsapp'] = values['q:person/phone'];
		const work = businessesAsDetails(businesses, ownDetails(start));
		const all = { ...values, ...work.values };
		/* Whatever goes on the card can't also be just for you. */
		const kept = justForMe(start).filter((id) => !(cardShows ?? []).includes(id));
		return saveProfile(identity, all, kept, work.own);
	}

	async function next() {
		says = '';
		busy = true;
		const out = await keep();
		busy = false;
		if (!out.ok) return void (says = out.says.join(' '));
		step = Math.min(step + 1, STEPS.length - 1);
	}

	async function finish() {
		says = '';
		if (folder.kind !== 'ready') return void (needPlace = true);
		busy = true;
		const out = await keep(shows);
		if (!out.ok) {
			busy = false;
			return void (says = out.says.join(' '));
		}
		const card = await saveCard(identity, 'Personal', shows.filter((id) => values[id] || id === 'q:person/called'), [], 'personal');
		busy = false;
		if (!card.ok) return void (says = card.says);
		onDone();
	}

	function addBusiness() {
		if (!adding?.name.trim()) return;
		businesses = [...businesses, { ...adding }];
		adding = null;
	}

	/* For the last step: what could go on a Personal card, with your name made from first and last. */
	const cardValues = $derived({ ...values, 'q:person/called': name, 'q:person/whatsapp': sameAsPhone ? values['q:person/phone'] : values['q:person/whatsapp'] });
	const OPTIONS = ['q:person/cover', 'q:person/picture', 'q:person/called', 'q:person/birthday', 'q:person/email', 'q:person/phone', 'q:person/whatsapp', 'q:person/address'].map((id) => ({
		id,
		label: id === 'q:person/called' ? 'Your name' : LABEL[id]
	}));
</script>

<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6 flex flex-col gap-6">
	<Steps count={STEPS.length} {step} onStepChange={(d) => (canGoOn || d.step < step) && (step = d.step)}>
		<Steps.List class="mb-6">
			{#each STEPS as s, i (s.title)}
				<Steps.Item index={i}>
					<Steps.Trigger class="min-h-11">
						<Steps.Indicator>{i + 1}</Steps.Indicator>
						<span class="hidden sm:inline">{s.title}</span>
					</Steps.Trigger>
					{#if i < STEPS.length - 1}<Steps.Separator />{/if}
				</Steps.Item>
			{/each}
		</Steps.List>

		<header class="mb-5">
			<h2 class="h3">{STEPS[step].title}</h2>
			<p class="opacity-70">{STEPS[step].says}</p>
		</header>

		<!-- 1. You -->
		<Steps.Content index={0}>
			<div class="flex flex-col gap-5 max-w-xl">
				<!-- Your cover and photo, placed the way your card shows them. -->
				<div class="relative">
					<label class="block h-32 overflow-hidden rounded-container cursor-pointer {values['q:person/cover'] ? '' : 'preset-tonal-primary'}">
						{#if values['q:person/cover']}<img src={values['q:person/cover']} alt="" class="size-full object-cover" />{/if}
						<span class="absolute right-3 top-3 btn btn-sm preset-filled-surface-50-950 shadow"><Icon name="image" size={14} /> {values['q:person/cover'] ? 'Change cover' : 'Add a cover'}</span>
						<input type="file" accept="image/*" class="sr-only" onchange={(e) => pick(e, 'q:person/cover', COVER)} />
					</label>
					<label class="absolute -bottom-10 left-5 block size-24 overflow-hidden rounded-full border-4 border-surface-50-950 bg-surface-100-900 shadow-md cursor-pointer" aria-label="Your photo">
						{#if values['q:person/picture']}
							<img src={values['q:person/picture']} alt="" class="size-full object-cover" />
						{:else}
							<span class="flex size-full flex-col items-center justify-center text-xs"><Icon name="plus" size={18} />Your photo</span>
						{/if}
						<input type="file" accept="image/*" class="sr-only" onchange={(e) => pick(e, 'q:person/picture', PICTURE)} />
					</label>
				</div>
				<div class="mt-10 grid gap-4 sm:grid-cols-2">
					<label class="label"><span class="label-text">First name</span><input class="input preset-outlined-surface-300-700" bind:value={values['q:person/first']} autocomplete="given-name" /></label>
					<label class="label"><span class="label-text">Last name</span><input class="input preset-outlined-surface-300-700" bind:value={values['q:person/last']} autocomplete="family-name" /></label>
				</div>
				<label class="label sm:w-60"><span class="label-text">Date of birth</span><input class="input preset-outlined-surface-300-700" type="date" bind:value={values['q:person/birthday']} autocomplete="bday" /></label>
			</div>
		</Steps.Content>

		<!-- 2. Contact -->
		<Steps.Content index={1}>
			<div class="flex flex-col gap-4 max-w-xl">
				<label class="label"><span class="label-text">Email</span><input class="input preset-outlined-surface-300-700" type="email" bind:value={values['q:person/email']} autocomplete="email" /></label>
				<label class="label"><span class="label-text">Phone</span><input class="input preset-outlined-surface-300-700" type="tel" bind:value={values['q:person/phone']} autocomplete="tel" placeholder="+44 7…" /></label>
				<div class="flex flex-col gap-2">
					<label class="flex items-center gap-3 min-h-11"><input type="checkbox" class="checkbox" bind:checked={sameAsPhone} /> My WhatsApp is the same number</label>
					{#if !sameAsPhone}
						<label class="label"><span class="label-text">WhatsApp</span><input class="input preset-outlined-surface-300-700" type="tel" bind:value={values['q:person/whatsapp']} placeholder="+44 7…" /></label>
					{/if}
				</div>
				<label class="label"><span class="label-text">Home address</span><textarea class="textarea preset-outlined-surface-300-700" rows="3" bind:value={values['q:person/address']} autocomplete="street-address"></textarea></label>
			</div>
		</Steps.Content>

		<!-- 3. Work: one business at a time -->
		<Steps.Content index={2}>
			<div class="flex flex-col gap-4 max-w-xl">
				{#each businesses as b, i (b.slug || b.name + i)}
					<div class="card preset-tonal-surface p-4 flex items-center justify-between gap-3">
						<div class="flex items-center gap-3">
							<Icon name="card" />
							<div class="flex flex-col">
								<span class="font-bold">{b.name}</span>
								<span class="text-sm opacity-70">{[b.role, b.site.replace(/^https?:\/\//, '').replace(/\/$/, '')].filter(Boolean).join(' · ')}</span>
							</div>
						</div>
						<div class="flex gap-2">
							<button type="button" class="btn btn-sm preset-tonal min-h-11" onclick={() => { adding = { ...b }; businesses = businesses.filter((_, j) => j !== i); }}>Change</button>
							<button type="button" class="btn btn-sm preset-tonal min-h-11" aria-label="Remove {b.name}" onclick={() => (businesses = businesses.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
						</div>
					</div>
				{/each}

				{#if adding}
					<div class="card preset-outlined-primary-500 p-4 flex flex-col gap-3">
						{#each BIZ_PARTS as p (p.part)}
							<label class="label">
								<span class="label-text">{p.label}</span>
								<input class="input preset-outlined-surface-300-700" bind:value={adding[p.part]} placeholder={p.hint ?? ''} type={p.part === 'email' ? 'email' : p.part === 'phone' ? 'tel' : 'text'} />
							</label>
						{/each}
						<div class="flex flex-wrap gap-3">
							<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!adding.name.trim()} onclick={addBusiness}>Add this business</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (adding = null)}>Not now</button>
						</div>
					</div>
				{:else}
					<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => (adding = blankBusiness())}>
						<Icon name="plus" size={16} /> {businesses.length ? 'Add another business' : 'Add a business'}
					</button>
					{#if !businesses.length}<p class="text-sm opacity-60">No work to add? Press Next.</p>{/if}
				{/if}
			</div>
		</Steps.Content>

		<!-- 4. Your card -->
		<Steps.Content index={3}>
			<ChooseShown did={identity.did} badge="Personal" options={OPTIONS} values={cardValues} bind:shows />
		</Steps.Content>
	</Steps>

	<footer class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-200-800 pt-4">
		<div class="flex gap-3">
			{#if step > 0}
				<button type="button" class="btn preset-tonal min-h-11" onclick={() => (step -= 1)}>Back</button>
			{:else}
				<button type="button" class="btn preset-tonal min-h-11" onclick={onCancel}>Not now</button>
			{/if}
		</div>
		{#if step < STEPS.length - 1}
			<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy || !canGoOn || !!adding} onclick={() => void next()}>{busy ? 'Keeping it…' : 'Next'}</button>
		{:else}
			<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy || !shows.length} onclick={() => void finish()}>{busy ? 'Making your card…' : 'Make my card'}</button>
		{/if}
	</footer>
	{#if step === 0 && !name}<p class="text-sm opacity-70 -mt-3">Your first name, and Next wakes up.</p>{/if}
	{#if adding}<p class="text-sm opacity-70 -mt-3">Add the business, or press Not now, and Next wakes up.</p>{/if}
	{#if needPlace}
		<div class="card preset-tonal-primary p-4 flex flex-col gap-3" aria-live="polite">
			<p class="font-bold">Last thing: where should Q keep your card?</p>
			<p class="text-sm">Choose or make a folder on this computer, “Q” in Documents, say. Everything in it is locked to your passkey. Making copies elsewhere comes next.</p>
			<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" onclick={() => void choosePlace()}>
				{folder.kind === 'asleep' ? `Allow my ${folder.name} folder` : 'Choose a folder'}
			</button>
		</div>
	{/if}
	{#if says}<p class="text-sm card preset-tonal-error p-3" aria-live="polite">{says}</p>{/if}
</div>
