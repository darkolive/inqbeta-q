<script lang="ts">
	/*
	 * Staying in touch — the end of the home page.
	 * One field, one button. Says plainly where the address goes before it is
	 * given, and nothing is kept on the server (api/interest).
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { t, language } from '$lib/i18n/index.svelte';
	import QText from './QText.svelte';

	let email = $state('');
	/* Hidden from people; bots fill it in. */
	let website = $state('');
	let stage = $state<'idle' | 'sending' | 'sent' | 'failed'>('idle');

	async function send(e: SubmitEvent) {
		e.preventDefault();
		stage = 'sending';
		try {
			const res = await fetch('/api/interest', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, website, lang: language.current })
			});
			stage = res.ok ? 'sent' : 'failed';
		} catch {
			stage = 'failed';
		}
	}
</script>

<!-- The last thing on the page: stay in touch. Centred, no box. (Beta is said
     once, in the security section's honest line — not twice.) -->
<section class="w-full max-w-2xl text-center space-y-4" aria-labelledby="touch-title">
	<h2 id="touch-title" class="h4" data-read="beta.touch">{t('beta.touch')}</h2>
	{#if stage === 'sent'}
		<p class="card preset-tonal-success p-3 flex items-center justify-center gap-2 max-w-lg mx-auto" role="status">
			<Icon name="check" size={20} stroke={2.5} /><span>{t('beta.sent')}</span>
		</p>
	{:else}
		<form class="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto" onsubmit={send}>
			<label class="label flex-1">
				<span class="sr-only">{t('beta.email')}</span>
				<input
					class="input min-h-11"
					type="email"
					required
					autocomplete="email"
					aria-label={t('beta.email')}
					bind:value={email}
					disabled={stage === 'sending'}
				/>
			</label>
			<!-- Not for people: left empty by everyone except bots. -->
			<input class="sr-only" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" bind:value={website} />
			<button type="submit" class="btn preset-filled-primary-500 min-h-11" disabled={stage === 'sending'}>
				<Icon name="mail" size={20} stroke={2.5} /><span>{t('beta.send')}</span>
			</button>
		</form>
		<p class="text-sm text-surface-700-300" data-read="beta.why"><QText text={t('beta.why')} linkOrg /></p>
		{#if stage === 'failed'}<p class="text-sm text-error-600-400" role="alert">{t('beta.error')}</p>{/if}
	{/if}
</section>
