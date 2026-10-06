<script lang="ts">
	/*
	 * The sign-in block — the whole front door as one component.
	 *
	 * Built to be calm: one question, three big pictures to answer it, one big
	 * button to press. Every icon keeps a one-word label under it, because a
	 * picture alone makes a person guess. Words are short, nothing moves unless
	 * something is happening, and the layout never shifts between choices.
	 *
	 * Manifest: q-core/components.ts → SIGN_IN (q:sign-in@1.0.0). Its design brief
 * and promises are the spec; change them there first, then here.
 *
 * Same chain rule as SignIn: the passkey comes first, so there is a DID
	 * to hash from; opening a vault from a backup happens after it.
	 */
	import { goto } from '$app/navigation';
	import { afterSignIn } from '$lib/signin-stay';
	import { Icon } from '@inqbeta/q-ui';
	import type { IconName } from '@inqbeta/q-ui/icons';
	import {
		keyPlace,
		makePasskey,
		passkeyDomain,
		passkeysAvailable,
		unlock,
		watch,
		type Identity,
		type KeyPlace
	} from '@inqbeta/q-core/passkey';
	import { learnEnvelopeFrom } from '@inqbeta/q-core/ways-back-in';
	import { restoreVault, watchFolder } from '@inqbeta/q-core/folder';
	import RecoverWithCard from './RecoverWithCard.svelte';
	import { recovery } from '$lib/recovery.svelte';
	import { t, type Key } from '$lib/i18n/index.svelte';
	import { inAppBrowser, chromeIntent } from '$lib/in-app';

	/* A title or line set on the block (ADR-Q-006) is used as written; left
	 * unset, they follow the chosen language. */
	let {
		logo = '/inqbeta.svg',
		title,
		line,
		stay = false
	}: { logo?: string; title?: string; line?: string; /** Stay on this page after signing in (a shared card waiting to open). */ stay?: boolean } = $props();

	/* The three places, said as briefly as they can be — in the chosen language. */
	/* `say` and `sayHint` are the i18n keys, which read-aloud uses to find each line's recording. */
	const PLACES: { id: KeyPlace; word: string; icon: IconName; hint: string; say: Key; sayHint: Key }[] = $derived([
		{ id: 'device', word: t('place.device'), icon: 'devices', hint: t('place.device.hint'), say: 'place.device', sayHint: 'place.device.hint' },
		{ id: 'security-key', word: t('place.key'), icon: 'key', hint: t('place.key.hint'), say: 'place.key', sayHint: 'place.key.hint' },
		{ id: 'phone', word: t('place.phone'), icon: 'phone', hint: t('place.phone.hint'), say: 'place.phone', sayHint: 'place.phone.hint' }
	]);

	/* Each place pulls out one big corner, and a different one each time, so
	 * no two boxes match but they still read as one set. */
	const SHAPE: Record<KeyPlace, string> = {
		device: 'rounded-base rounded-tl-[40%]',
		'security-key': 'rounded-base rounded-br-[40%]',
		phone: 'rounded-base rounded-tr-[40%]'
	};

	let identity = $state<Identity | null>(null);
	let supported = $state(true);
	/* Inside Messenger, Facebook, Instagram…: say which, and how to get out. */
	const inApp = typeof navigator === 'undefined' ? null : inAppBrowser();
	let copied = $state(false);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(location.href);
			copied = true;
		} catch {
			copied = false;
		}
	}
	let place = $state<KeyPlace>('device');
	let mode = $state<'in' | 'new'>('in');
	let name = $state('');
	let working = $state(false);
	let says = $state('');
	let needsBackup = $state(false);
	let backupInput = $state<HTMLInputElement | null>(null);

	/* On a phone, "My phone" means ANOTHER phone — which asks for a QR code the
	 * phone cannot scan of itself. So a phone shows two choices, and calls its
	 * own keychain "This phone". */
	let onPhone = $state(false);
	const shown = $derived(
		onPhone
			? PLACES.filter((p) => p.id !== 'phone').map((p) =>
					p.id === 'device' ? { ...p, word: t('place.thisPhone'), icon: 'phone' as IconName, hint: t('place.thisPhone.hint'), say: 'place.thisPhone' as Key, sayHint: 'place.thisPhone.hint' as Key } : p
				)
			: PLACES
	);

	$effect(() => {
		onPhone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
		place = keyPlace();
		if (onPhone && place === 'phone') place = 'device';
		supported = passkeysAvailable();
		return watch((id) => (identity = id));
	});

	const chosen = $derived(shown.find((p) => p.id === place) ?? shown[0]);
	/* The big button shows what you are about to touch. */
	const bigIcon = $derived<IconName>(mode === 'new' ? 'plus' : place === 'device' ? 'fingerprint' : chosen.icon);
	const bigWord = $derived(working ? t('signin.touch') : mode === 'new' ? t('signin.make') : t('signin.go'));

	/* The root domain is set and this page is under it, so older passkeys —
	 * filed under this exact address — can be looked for on request. */
	const olderToo = $derived(!!passkeyDomain());

	async function go(exact = false) {
		says = '';
		working = true;
		const out = mode === 'new' ? await makePasskey(name, place) : await unlock(place, exact);
		working = false;
		if (!out.ok) {
			says = out.says;
			needsBackup = !!out.needsEnvelope;
			return;
		}
		needsBackup = false;
		{
			const to = afterSignIn(location.pathname, stay);
			if (to) void goto(to);
		}
	}

	/* A way-back-in passkey: the backup zip carries the continuity file. */
	async function fromBackup(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		says = '';
		working = true;
		const learnt = await learnEnvelopeFrom(file);
		working = false;
		if (!learnt.ok) {
			says = learnt.says;
			return;
		}
		says = t('backup.found');
		working = true;
		const out = await unlock(place);
		working = false;
		if (!out.ok) {
			says = out.says;
			return;
		}
		needsBackup = false;
		await new Promise<void>((resolve) => {
			let stop = () => {};
			const t = setTimeout(() => (stop(), resolve()), 5000);
			stop = watchFolder((st) => {
				if (st.kind === 'ready') {
					clearTimeout(t);
					queueMicrotask(() => stop());
					resolve();
				}
			});
		});
		const restored = await restoreVault([file]);
		says = restored.ok ? '' : restored.says;
		{
			const to = afterSignIn(location.pathname, stay);
			if (to) void goto(to);
		}
	}
</script>

<section class="w-full max-w-md mx-auto flex flex-col items-center gap-10 text-center" aria-labelledby="signin-title">
	<!-- Heading: picture, one line, one sentence. -->
	<header class="flex flex-col items-center gap-5">
		<img src={logo} alt="" class="h-20 w-auto" />
		<h1 id="signin-title" class="h2 text-balance" data-read={title ? '' : 'signin.title'}>{title ?? t('signin.title')}</h1>
		<p class="text-lg text-surface-700-300 text-balance" data-read={line ? '' : 'signin.line'}>{line ?? t('signin.line')}</p>
	</header>

	{#if recovery.active}
		<RecoverWithCard />
	{:else if !supported && inApp}
		<div class="card preset-tonal-warning p-5 w-full flex flex-col gap-4 text-left" role="status">
			<div class="flex items-center gap-4">
				<Icon name="info" size={32} stroke={2.5} />
				<p class="font-semibold">{t('signin.inApp').replace('{app}', inApp.app || t('signin.inApp.thisApp'))}</p>
			</div>
			{#if inApp.android}
				<a class="btn preset-filled-primary-500 min-h-11 w-full" href={chromeIntent()}>{t('signin.inApp.chrome')}</a>
				<p class="text-sm">{t('signin.inApp.android')}</p>
			{:else}
				<p class="text-sm">{t('signin.inApp.ios')}</p>
			{/if}
			<button type="button" class="btn preset-tonal min-h-11 w-full" onclick={() => void copyLink()}>{copied ? t('signin.inApp.copied') : t('signin.inApp.copy')}</button>
		</div>
	{:else if !supported}
		<div class="card preset-tonal-warning p-5 w-full flex items-center gap-4 text-left" role="status">
			<Icon name="info" size={32} stroke={2.5} />
			<p class="font-semibold">{t('signin.noPasskeys')}</p>
		</div>
	{:else if !identity}
		<!--
			Question to button: a wider step (gap-6) from the pictures down to the
			hint, then a tighter one (gap-3) from hint to thumbprint to its word.
		-->
		<div class="w-full flex flex-col items-center gap-3">
			<!-- 1. Where is your passkey? Three big pictures, one word each. -->
			<fieldset class="w-full flex flex-col items-center gap-6">
				<legend class="h5 mb-4" data-read="signin.where">{t('signin.where')}</legend>
				<div class="flex justify-center gap-4 w-full" role="radiogroup">
					{#each shown as p (p.id)}
						{@const on = place === p.id}
						<label
							class="card {SHAPE[p.id]} size-24 shrink-0 flex flex-col items-center justify-center gap-3 cursor-pointer border-2 transition-colors
								focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-500
								{on ? 'preset-filled-primary-500 border-primary-500' : 'preset-tonal border-transparent hover:preset-filled-secondary-50-950'}"
						>
							<input type="radio" class="sr-only" name="key-place" value={p.id} bind:group={place} />
							<Icon name={p.icon} class="size-10" stroke={2.5} />
							<span class="font-bold text-sm leading-tight" data-read={p.say}>{p.word}</span>
						</label>
					{/each}
				</div>
				<p id="place-hint" class="text-sm text-surface-700-300 min-h-5" data-read={chosen.sayHint}>{chosen.hint}</p>
			</fieldset>

			<!-- 2. One big button: the picture of what to touch, then the word. -->
			<div class="flex flex-col items-center gap-3 w-full">
				{#if mode === 'new'}
					<label class="label w-full text-left">
						<span class="label-text font-semibold">{t('signin.nameIt')}</span>
						<input class="input text-lg" bind:value={name} autocomplete="off" />
					</label>
				{/if}
				<!--
					The thumbprint and its word are one button, so they light together:
					hovered, both go to the light end of the olive.
				-->
				<button
					type="button"
					class="group flex flex-col items-center gap-3 rounded-base cursor-pointer
						focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-primary-500
						{working ? 'animate-pulse motion-reduce:animate-none' : ''}"
					aria-describedby="place-hint"
					aria-busy={working}
					disabled={working}
					onclick={() => void go()}
				>
					<Icon name={bigIcon} class="size-15 text-primary-600-400 transition-colors group-hover:text-primary-400 dark:group-hover:text-primary-50" stroke={2} />
					<span class="h4 transition-colors group-hover:text-primary-400 dark:group-hover:text-primary-50" aria-live="polite">{bigWord}</span>
				</button>
			</div>
		</div>

		{#if needsBackup}
			<div class="card preset-tonal-primary p-5 w-full flex flex-col items-center gap-3" role="region" aria-label={t('backup.region')}>
				<p class="font-semibold">{t('backup.opens')}</p>
				<p class="text-sm">{t('backup.choose')}</p>
				<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={working} onclick={() => backupInput?.click()}>
					<Icon name="drive" size={22} stroke={2.5} /><span>{t('backup.button')}</span>
				</button>
				<input bind:this={backupInput} type="file" class="sr-only" accept=".zip,application/zip" onchange={(e) => void fromBackup(e)} />
			</div>
		{/if}

		<!-- 3. The two other ways, quiet and side by side — pulled a step closer
		     to the sign-in than the section's usual gap, so they read as its options. -->
		<div class="flex flex-wrap justify-center gap-3 w-full -mt-6">
			{#if mode === 'in'}
				<button type="button" class="btn preset-tonal font-semibold min-h-11" onclick={() => ((mode = 'new'), (says = ''))}>
					<Icon name="plus" size={20} stroke={3} /><span>{t('signin.first')}</span>
				</button>
			{:else}
				<button type="button" class="btn preset-tonal font-semibold min-h-11" onclick={() => ((mode = 'in'), (says = ''))}>
					<Icon name="fingerprint" size={20} stroke={2.5} /><span>{t('signin.haveKey')}</span>
				</button>
			{/if}
			<button type="button" class="btn preset-tonal font-semibold min-h-11" onclick={() => (recovery.active = true)}>
				<Icon name="card" size={20} stroke={2.5} /><span>{t('signin.lost')}</span>
			</button>
		</div>
		{#if olderToo && mode === 'in'}
			<button type="button" class="btn btn-sm preset-tonal min-h-11 h-auto max-w-full whitespace-normal text-center" disabled={working} onclick={() => void go(true)}>
				{t('signin.older')}
			</button>
		{/if}
	{/if}

	{#if says}
		<p class="card preset-tonal-warning p-4 w-full text-sm font-medium" role="alert">{says}</p>
	{/if}
</section>
