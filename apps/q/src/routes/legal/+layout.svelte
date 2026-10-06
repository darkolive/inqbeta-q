<script lang="ts">
	/*
	 * The legal pages share one frame: a way between them, and a note in the
	 * other languages that these pages are in English for now.
	 */
	import { page } from '$app/state';
	import { t, language } from '$lib/i18n/index.svelte';
	import { qmarks } from '$lib/qmarks';

	let { children } = $props();
	const PAGES = [
		{ href: '/legal/privacy', key: 'footer.privacy' },
		{ href: '/legal/terms', key: 'footer.terms' },
		{ href: '/legal/accessibility', key: 'footer.access' },
		{ href: '/legal/licences', key: 'footer.licences' }
	] as const;
</script>

<div class="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
	<nav aria-label={t('legal.title')}>
		<ul class="flex flex-wrap gap-2">
			{#each PAGES as p (p.href)}
				<li>
					<a
						class="btn btn-sm min-h-11 {page.url.pathname === p.href ? 'preset-filled-primary-500' : 'preset-outlined-surface-500 hover:preset-filled-secondary-50-950'}"
						href={p.href}
						aria-current={page.url.pathname === p.href ? 'page' : undefined}>{t(p.key)}</a
					>
				</li>
			{/each}
		</ul>
	</nav>
	{#if language.current !== 'en'}
		<p class="card preset-tonal p-3 text-sm" lang={language.current}>{t('legal.inEnglish')}</p>
	{/if}
	<!-- Keyed by page, so each page's standalone Qs become the orange mark (lib/qmarks). -->
	{#key page.url.pathname}
		<article use:qmarks lang="en" class="space-y-4 [&_h2]:h4 [&_h2]:pt-4 [&_ul]:list-disc [&_ul]:ps-6 [&_ul]:space-y-1 [&_a]:anchor">
			{@render children()}
		</article>
	{/key}
</div>
