<script lang="ts">
	/*
	 * Only on the test site (inqbeta.dev): say so, and where Q really lives.
	 * Passkeys belong to their domain, so an identity made here does not sign
	 * in on inqbeta.com — people should know before they make one.
	 *
	 * Read from the browser's own address after mount: the home page is
	 * prerendered, and a prerendered page does not know where it is served.
	 */
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/index.svelte';
	import QText from './QText.svelte';

	const HOME = 'https://inqbeta.com';
	let onTestSite = $state(false);

	onMount(() => {
		const host = location.hostname;
		onTestSite = host === 'inqbeta.dev' || host.endsWith('.inqbeta.dev');
	});
</script>

{#if onTestSite}
	<aside class="preset-tonal-warning px-4 py-2 text-center text-sm" aria-label={t('testsite.label')}>
		<QText text={t('testsite.note')} />
		<a class="anchor font-semibold" href={HOME}><QText text={t('testsite.go')} /></a>
	</aside>
{/if}
