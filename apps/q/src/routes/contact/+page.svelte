<script lang="ts">
	/*
	 * Contact us — a short form to Dark Olive's admin inbox (api/contact).
	 * No address on the page, so nothing for scrapers; says where it goes
	 * before anything is sent.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { t, language } from '$lib/i18n/index.svelte';
	import { SECURITY_REPORT } from '$lib/config';
	import QText from '$lib/components/QText.svelte';

	let name = $state('');
	let email = $state('');
	let message = $state('');
	let website = $state('');
	let stage = $state<'idle' | 'sending' | 'sent' | 'failed'>('idle');

	async function send(e: SubmitEvent) {
		e.preventDefault();
		stage = 'sending';
		try {
			const res = await fetch('/api/contact', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, email, message, website, lang: language.current })
			});
			stage = res.ok ? 'sent' : 'failed';
		} catch {
			stage = 'failed';
		}
	}
</script>

<svelte:head><title>{t('contact.title')} — Q</title></svelte:head>

<section class="mx-auto w-full max-w-xl space-y-6 px-4 py-10">
	<header class="space-y-3">
		<h1 class="h2">{t('contact.title')}</h1>
		<p class="text-surface-700-300"><QText text={t('contact.lead')} linkOrg /></p>
	</header>

	{#if stage === 'sent'}
		<p class="card preset-tonal-success p-4 flex items-center gap-2" role="status">
			<Icon name="check" size={20} stroke={2.5} /><span>{t('contact.sent')}</span>
		</p>
	{:else}
		<form class="space-y-4" onsubmit={send}>
			<label class="label">
				<span class="label-text">{t('contact.name')}</span>
				<input class="input min-h-11" type="text" autocomplete="name" maxlength="120" bind:value={name} disabled={stage === 'sending'} />
			</label>
			<label class="label">
				<span class="label-text">{t('contact.email')}</span>
				<input class="input min-h-11" type="email" required autocomplete="email" bind:value={email} disabled={stage === 'sending'} />
			</label>
			<label class="label">
				<span class="label-text">{t('contact.message')}</span>
				<textarea class="textarea" rows="6" required maxlength="5000" bind:value={message} disabled={stage === 'sending'}></textarea>
			</label>
			<input class="sr-only" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" bind:value={website} />
			<button type="submit" class="btn preset-filled-primary-500 min-h-11" disabled={stage === 'sending'}>
				<Icon name="mail" size={20} stroke={2.5} /><span>{t('contact.send')}</span>
			</button>
			{#if stage === 'failed'}<p class="text-sm text-error-600-400" role="alert">{t('contact.error')}</p>{/if}
		</form>
	{/if}

	<p class="text-sm text-surface-700-300">
		<a class="anchor" href={SECURITY_REPORT} rel="noopener" target="_blank">{t('contact.security')}</a>
	</p>
</section>
