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

	const url = $derived(`${SITE}${page.url.pathname === '/' ? '' : page.url.pathname}`);
	const text = $derived(t('share.message'));
	const e = $derived({ url: encodeURIComponent(url), text: encodeURIComponent(text) });

	let copied = $state(false);
	let native = $state(false);
	$effect(() => {
		native = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
	});

	async function share() {
		try {
			await navigator.share({ title: 'Q', text, url });
		} catch {
			/* dismissed */
		}
	}
	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}

	const pill = 'btn btn-sm preset-outlined-surface-500 hover:preset-filled-secondary-50-950';
</script>

<div class="space-y-3">
	<h2 class="h6"><QText text={t('share.title')} /></h2>
	<p class="text-sm text-surface-700-300">{t('share.note')}</p>
	<div class="flex flex-wrap gap-2">
		{#if native}<button type="button" class={pill} onclick={share}>{t('share.native')}</button>{/if}
		<a class={pill} href="https://www.facebook.com/sharer/sharer.php?u={e.url}" target="_blank" rel="noopener noreferrer">Facebook</a>
		<a class={pill} href="https://www.linkedin.com/sharing/share-offsite/?url={e.url}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
		<a class={pill} href="https://bsky.app/intent/compose?text={e.text}%20{e.url}" target="_blank" rel="noopener noreferrer">Bluesky</a>
		<a class={pill} href="https://wa.me/?text={e.text}%20{e.url}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
		<a class={pill} href="mailto:?subject=Q&body={e.text}%20{e.url}">{t('share.email')}</a>
		<button type="button" class={pill} onclick={copy} aria-live="polite">{copied ? t('share.copied') : t('share.copy')}</button>
	</div>
</div>
