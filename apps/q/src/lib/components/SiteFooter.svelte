<script lang="ts">
	/*
	 * The footer — on the front door, the public pages and the dashboard.
	 * Where to share Q, the legal pages, how to get in touch, the source, and
	 * who holds it. Skeleton pairs only, so it follows light and dark.
	 */
	import { FaIcon } from '@inqbeta/q-ui';
	import { t } from '$lib/i18n/index.svelte';
	import { REPO, SPONSORS_URL } from '$lib/config';
	import QText from './QText.svelte';
	import ShareLinks from './ShareLinks.svelte';

	const LINKS = [
		{ href: '/contact', key: 'footer.contact' },
		{ href: '/legal/privacy', key: 'footer.privacy' },
		{ href: '/legal/terms', key: 'footer.terms' },
		{ href: '/legal/accessibility', key: 'footer.access' },
		{ href: '/legal/licences', key: 'footer.licences' },
		{ href: '/#support', key: 'footer.support' }
	] as const;
</script>

<footer class="w-full border-t border-surface-200-800 bg-surface-100-900 mt-12">
	<div class="mx-auto max-w-5xl px-4 py-10 sm:px-8 grid gap-10 md:grid-cols-[3fr_2fr]">
		<ShareLinks />
		<nav aria-label={t('footer.label')} class="space-y-3">
			<h2 class="h6"><QText text={t('footer.label')} /></h2>
			<ul class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
				{#each LINKS as l (l.href)}
					<li><a class="anchor" href={l.href}><QText text={t(l.key)} /></a></li>
				{/each}
				<li>
					<a class="anchor inline-flex items-center gap-1.5" href={REPO} rel="noopener" target="_blank">
						<FaIcon name="github" /><span>{t('footer.source')}</span>
					</a>
				</li>
				{#if SPONSORS_URL}
					<li>
						<a class="anchor inline-flex items-center gap-1.5" href={SPONSORS_URL} rel="noopener" target="_blank">
							<FaIcon name="github" /><span>{t('support.sponsor')}</span>
						</a>
					</li>
				{/if}
			</ul>
		</nav>
	</div>
	<div class="border-t border-surface-200-800">
		<div class="mx-auto max-w-5xl px-4 py-4 sm:px-8 text-xs text-surface-700-300 flex flex-col gap-1 sm:flex-row sm:justify-between">
			<p><QText text={t('footer.made')} linkOrg /></p>
			<p>{t('footer.company')}</p>
		</div>
	</div>
</footer>
