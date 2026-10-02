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
	import { allDetails, ownDetails, justForMe, asText, saveProfile, nameFrom, businessesFrom, businessesAsDetails, blankBusiness, BIZ_PARTS, LABEL, ADDRESS_PARTS, addressFrom, directionsTo, SOCIALS, COMPANY_TYPES, type Business } from '$lib/profile';
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
	/* An address written before it had fields: its lines go into the fields once. */
	if (values['q:person/address'] && !ADDRESS_PARTS.some((p) => values[p.id])) {
		const lines = values['q:person/address'].split(/\n|,\s*/).map((l) => l.trim()).filter(Boolean);
		['q:address/line1', 'q:address/line2', 'q:address/town', 'q:address/county', 'q:address/postcode', 'q:address/country'].forEach((id, i) => lines[i] && (values[id] = lines[i]));
	}
	let businesses = $state<Business[]>(businessesFrom(start, startOwn));

	/* A pin where you are now: for directions to your door. */
	let pinning = $state(false);
	function dropPin() {
		says = '';
		if (!navigator.geolocation) return void (says = 'This device can’t tell where it is.');
		pinning = true;
		navigator.geolocation.getCurrentPosition(
			(p) => {
				values['q:address/pin'] = `${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`;
				pinning = false;
			},
			(e) => {
				pinning = false;
				says = e.code === 1 ? 'Your browser wasn’t allowed to say where you are. You can allow it in its settings, or leave the pin out.' : 'Couldn’t find where you are just now.';
			},
			{ enableHighAccuracy: true, timeout: 15000 }
		);
	}
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
		{ title: 'Home', says: 'Your address, and a pin for directions. Only shown if you switch it on.' },
		{ title: 'Social', says: 'The places people find you online. Leave any you don’t use.' },
		{ title: 'Work', says: 'Where you work or what you run. Add as many as you like, or skip this.' }
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
		/*
		 * The first time, your Personal card is made with the usual things on
		 * it; after that it's left as you set it. Either way you land on the
		 * card itself, where the switches decide what people see.
		 */
		if (!shown.length) {
			const card = await saveCard(identity, 'Personal', shows.filter((id) => cardValues[id]), [], 'personal');
			if (!card.ok) {
				busy = false;
				return void (says = card.says);
			}
		}
		busy = false;
		onDone();
	}

	function addBusiness() {
		if (!adding?.name.trim()) return;
		businesses = [...businesses, { ...adding }];
		adding = null;
	}

	/* For the last step: what could go on a Personal card, with your name made from first and last. */
	const cardValues = $derived<Record<string, string>>({ ...values, 'q:person/called': name, 'q:person/address': addressFrom(values), 'q:person/whatsapp': sameAsPhone ? values['q:person/phone'] : values['q:person/whatsapp'] });
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
				<div class="grid gap-4 sm:grid-cols-3">
					<label class="label"><span class="label-text">Date of birth</span><input class="input preset-outlined-surface-300-700" type="date" bind:value={values['q:person/birthday']} autocomplete="bday" /></label>
					<label class="label"><span class="label-text">Gender</span><input class="input preset-outlined-surface-300-700" bind:value={values['q:person/gender']} placeholder="In your own words" /></label>
					<label class="label"><span class="label-text">Pronouns</span><input class="input preset-outlined-surface-300-700" bind:value={values['q:person/pronouns']} placeholder="she/her, they/them…" /></label>
				</div>
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
			</div>
		</Steps.Content>

		<!-- 3. Home: the address in its own fields, and a pin -->
		<Steps.Content index={2}>
			<div class="flex flex-col gap-4 max-w-xl">
				<label class="label"><span class="label-text">First line</span><input class="input preset-outlined-surface-300-700" bind:value={values['q:address/line1']} autocomplete="address-line1" /></label>
				<label class="label"><span class="label-text">Second line</span><input class="input preset-outlined-surface-300-700" bind:value={values['q:address/line2']} autocomplete="address-line2" /></label>
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="label"><span class="label-text">Town or city</span><input class="input preset-outlined-surface-300-700" bind:value={values['q:address/town']} autocomplete="address-level2" /></label>
					<label class="label"><span class="label-text">County or region</span><input class="input preset-outlined-surface-300-700" bind:value={values['q:address/county']} autocomplete="address-level1" /></label>
					<label class="label"><span class="label-text">Postcode</span><input class="input preset-outlined-surface-300-700" bind:value={values['q:address/postcode']} autocomplete="postal-code" /></label>
					<label class="label"><span class="label-text">Country</span><input class="input preset-outlined-surface-300-700" bind:value={values['q:address/country']} autocomplete="country-name" /></label>
				</div>
				<div class="card preset-tonal-surface p-4 flex flex-col gap-3">
					<p class="font-bold flex items-center gap-2"><Icon name="map" /> A pin for directions</p>
					{#if values['q:address/pin']}
						<p class="text-sm">Pin set. <a class="anchor" href={directionsTo(values['q:address/pin'])} target="_blank" rel="noreferrer noopener">Check it on the map</a></p>
						<div class="flex flex-wrap gap-3">
							<button type="button" class="btn preset-tonal min-h-11" disabled={pinning} onclick={dropPin}>{pinning ? 'Finding you…' : 'Move it to where I am now'}</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (values['q:address/pin'] = '')}>Remove the pin</button>
						</div>
					{:else}
						<p class="text-sm opacity-80">Standing at home? Drop a pin, and a Directions button on your card takes people straight to your door.</p>
						<button type="button" class="btn preset-tonal min-h-11 self-start" disabled={pinning} onclick={dropPin}>{pinning ? 'Finding you…' : 'Drop a pin where I am'}</button>
					{/if}
				</div>
			</div>
		</Steps.Content>

		<!-- 4. Social -->
		<Steps.Content index={3}>
			<div class="grid gap-4 sm:grid-cols-2 max-w-xl">
				{#each SOCIALS as so (so.kind)}
					<label class="label"><span class="label-text">{so.label}</span><input class="input preset-outlined-surface-300-700" bind:value={values[`q:social/${so.kind}`]} placeholder={so.hint} autocapitalize="off" /></label>
				{/each}
			</div>
		</Steps.Content>

		<!-- 5. Work: one business at a time -->
		<Steps.Content index={4}>
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
							{#if p.part === 'site'}<p class="font-bold mt-2">How to reach it</p>{/if}
							{#if p.part === 'linkedin'}<p class="font-bold mt-2">Its pages</p>{/if}
							<label class="label">
								<span class="label-text">{p.label}</span>
								{#if p.part === 'type'}
									<select class="select preset-outlined-surface-300-700" bind:value={adding.type}>
										<option value="">Choose…</option>
										{#each COMPANY_TYPES as ct (ct)}<option value={ct}>{ct}</option>{/each}
									</select>
								{:else}
									<input class="input preset-outlined-surface-300-700" bind:value={adding[p.part]} placeholder={p.hint ?? ''} type={p.part === 'email' ? 'email' : p.part === 'phone' ? 'tel' : 'text'} />
								{/if}
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
			<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy || !!adding} onclick={() => void finish()}>{busy ? 'Keeping it…' : shown.length ? 'Done' : 'Done: see my card'}</button>
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
