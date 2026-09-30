<script lang="ts">
	/*
	 * Documentation — the start of Q's own wiki.
	 *
	 * For now a map into the docs as they live in the source (every decision,
	 * design and how-it-works page, each marked with its status). In time these
	 * pages will be written and published with Q itself — blocks, receipts and
	 * all — so the documentation is the proof of what it documents.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import type { IconName } from '@inqbeta/q-ui/icons';
	import { t, language } from '$lib/i18n/index.svelte';
	import { REPO } from '$lib/config';
	import QText from '$lib/components/QText.svelte';
	import { qmarks } from '$lib/qmarks';

	const TREE = `${REPO}/tree/main/docs`;
	const BLOB = `${REPO}/blob/main/docs`;
	const SHELVES: { icon: IconName; title: string; about: string; href: string }[] = [
		{ icon: 'info', title: 'Start here', about: 'What Q is, what is built, and what comes next.', href: `${BLOB}/where-we-are.md` },
		{ icon: 'fingerprint', title: 'How the identity works', about: 'Passkeys, your DID, devices, permissions and the threat model — in plain words.', href: `${TREE}/identity` },
		{ icon: 'balance', title: 'Decisions', about: 'Every architecture decision record: what was decided, and why.', href: `${TREE}/decisions` },
		{ icon: 'documents', title: 'Designs and guides', about: 'Receipts, storage, federations, nodes, read aloud, going public.', href: `${TREE}/q` },
		{ icon: 'history', title: 'Origins', about: 'Where the thinking began: the 2025 white paper and the rural narrative.', href: `${TREE}/origins` },
		{ icon: 'verified', title: 'Security and licences', about: 'How to report a problem, and what the open licences cover.', href: `${REPO}/blob/main/SECURITY.md` }
	];
</script>

<svelte:head><title>{t('docs.title')} — Q</title></svelte:head>

<section class="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
	<header class="max-w-2xl space-y-3">
		<h1 class="h2">{t('docs.title')}</h1>
		<p class="text-lg text-surface-700-300"><QText text={t('docs.lead')} /></p>
		{#if language.current !== 'en'}<p class="text-sm text-surface-700-300">{t('legal.inEnglish')}</p>{/if}
	</header>

	<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" lang="en" use:qmarks>
		{#each SHELVES as s (s.title)}
			<li>
				<a class="card preset-tonal p-5 flex h-full flex-col gap-2 hover:preset-filled-secondary-50-950" href={s.href} rel="noopener" target="_blank">
					<Icon name={s.icon} class="size-8 text-primary-600-400" stroke={2} />
					<span class="h5">{s.title}</span>
					<span class="text-sm text-surface-700-300">{s.about}</span>
				</a>
			</li>
		{/each}
	</ul>
</section>
