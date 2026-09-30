<script lang="ts">
	/*
	 * Keep Q free — the one ask on the home page, said plainly and once.
	 *
	 * Q is given free; this is how it stays that way. The words say who builds
	 * it and why a contribution matters, without pressure, and say honestly
	 * where the money goes: Dark Olive CIC is a community interest company, not
	 * a charity, so there is no Gift Aid and nothing is tax-deductible.
	 *
	 * The button goes to DONATE_URL (lib/config) — a Stripe Payment Link where
	 * the supporter chooses the amount. Until that exists it says so.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { t } from '$lib/i18n/index.svelte';
	import { DONATE_URL } from '$lib/config';
	import QText from './QText.svelte';
</script>

<section id="support" class="w-full max-w-2xl text-center space-y-4 scroll-mt-8" aria-labelledby="support-title">
	<Icon name="heart" class="size-10 mx-auto text-secondary-500" stroke={2} />
	<h2 id="support-title" class="h3" data-read="support.title">{t('support.title')}</h2>
	<p class="text-lg text-surface-700-300 text-balance" data-read="support.body"><QText text={t('support.body')} linkOrg /></p>
	{#if DONATE_URL}
		<a class="btn preset-filled-secondary-500 min-h-11" href={DONATE_URL} rel="noopener" target="_blank">
			<Icon name="heart" size={20} stroke={2.5} /><span>{t('support.button')}</span>
		</a>
	{:else}
		<p><span class="badge preset-tonal-secondary">{t('support.soon')}</span></p>
	{/if}
	<p class="text-sm text-surface-700-300 max-w-xl mx-auto">{t('support.note')}</p>
</section>
