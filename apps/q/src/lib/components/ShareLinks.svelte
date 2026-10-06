<script lang="ts">
	/*
	 * Share links as plain addresses — Dark Olive's way (its ShareLinks).
	 * No platform scripts: the official share widgets load third-party code and
	 * set cookies on every visit, whether or not anyone shares. These are
	 * share-intent links, so nothing loads and nothing is tracked until someone
	 * clicks. The phone's own share sheet first where there is one (it reaches
	 * apps a link cannot, Instagram among them); "Copy link" everywhere.
	 * No X, as on Dark Olive.
	 */
	import { page } from '$app/state';
	import { t } from '$lib/i18n/index.svelte';
	import { SITE } from '$lib/config';
	import QText from './QText.svelte';
	import { copyText, hasShareSheet, openShareSheet, shareAddresses } from '$lib/share';

	const url = $derived(`${SITE}${page.url.pathname === '/' ? '' : page.url.pathname}`);
	const text = $derived(t('share.message'));
	const to = $derived(shareAddresses(text, url, 'Q'));

	let copied = $state(false);
	let native = $state(false);
	$effect(() => {
		native = hasShareSheet();
	});

	async function share() {
		await openShareSheet({ title: 'Q', text, url });
	}
	async function copy() {
		copied = await copyText(url);
		if (copied) setTimeout(() => (copied = false), 2000);
	}

	const pill = 'btn btn-sm min-h-11 preset-outlined-surface-500 hover:preset-filled-secondary-50-950';
</script>

<div class="space-y-3">
	<h2 class="h6"><QText text={t('share.title')} /></h2>
	<p class="text-sm text-surface-700-300">{t('share.note')}</p>
	<div class="flex flex-wrap gap-2">
		{#if native}<button type="button" class={pill} onclick={share}>{t('share.native')}</button>{/if}
		<a class={pill} href={to.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
		<a class={pill} href={to.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
		<a class={pill} href={to.bluesky} target="_blank" rel="noopener noreferrer">Bluesky</a>
		<a class={pill} href={to.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
		<a class={pill} href={to.email}>{t('share.email')}</a>
		<button type="button" class={pill} onclick={copy} aria-live="polite">{copied ? t('share.copied') : t('share.copy')}</button>
	</div>
</div>
