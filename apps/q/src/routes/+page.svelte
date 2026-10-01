<script lang="ts">
	/*
	 * Overview — the map. Every tile is a place in the sidebar, in the same
	 * order, with the one number that says how it stands.
	 */
	import { Page, Section, Tile, Item, Status, Empty, Icon } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder, type FolderState } from '@inqbeta/q-core/folder';
	import { listReplicas, type Replica } from '@inqbeta/q-core/replicas';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { readHome, type Home } from '$lib/home';
	import OpenFromBackup from '$lib/components/OpenFromBackup.svelte';
	import YouAtTop from '$lib/components/YouAtTop.svelte';
	import PointerNote from '$lib/components/PointerNote.svelte';
	import LeaveNoTrace from '$lib/components/LeaveNoTrace.svelte';
	import { FEATURES } from '$lib/features/registry';
	import { newestPerKey } from '$lib/features/dostudy';
	import { t, type Key } from '$lib/i18n/index.svelte';
	import type { IconName } from '@inqbeta/q-ui/icons';
	import ReceiptStory from '$lib/components/ReceiptStory.svelte';
	import BetaNews from '$lib/components/BetaNews.svelte';
	import SupportQ from '$lib/components/SupportQ.svelte';
	import SecurityStandards from '$lib/components/SecurityStandards.svelte';
	import Credits from '$lib/components/Credits.svelte';

	/* What people use Q for — the home page's uses, in order (29 September). */
	const USES: { key: string; icon: IconName }[] = [
		{ key: 'learning', icon: 'courses' },
		{ key: 'clubs', icon: 'federations' },
		{ key: 'site', icon: 'documents' },
		{ key: 'work', icon: 'receipts' },
		{ key: 'festival', icon: 'festival' },
		{ key: 'calls', icon: 'message' }
	];
	import QText from '$lib/components/QText.svelte';
	import { glideLink } from '$lib/glide';

	let identity = $state<Identity | null>(null);
	let folder = $state<FolderState>({ kind: 'checking' });
	let ledger = $state<Ledger | null>(null);
	let replicas = $state<Replica[]>([]);

	$effect(() => watch((id) => (identity = id)));
	$effect(() =>
		watchFolder((s) => {
			folder = s;
			if (s.kind === 'ready') void listReplicas().then((r) => (replicas = r));
		})
	);
	$effect(() => watchLedger((l) => (ledger = l)));

	const found = $derived(ledger ? newestPerKey(ledger.found) : []);
	const courses = $derived(found.filter((f) => f.kind === 'course'));
	const federations = $derived(found.filter((f) => f.kind === 'federation' || f.kind === 'membership'));
	const recent = $derived(found.slice(0, 5));
	/* Q's home federation (ADR-Q-016): offered once, calmly, until you join or have joined. */
	let home = $state<Home | null>(null);
	$effect(() => void readHome().then((h) => (home = h)));
	const inHome = $derived(
		!!home?.ok && found.some((f) => (f.kind === 'membership' || f.kind === 'federation') && f.key.endsWith(`:${home!.ok ? home!.federation : ''}`))
	);
	const linked = $derived(ledger?.links.filter((l) => l.link.event === 'identity.linked').length ?? 0);
</script>

<svelte:head><title>Q</title></svelte:head>

{#if !identity}
	<!--
		The sign-in is the app bar above this (lib/components/FrontDoor), filling
		the screen but for this one row: the page starts with the arrow down.
	-->
	<div class="flex h-20 items-center justify-center">
		<a
			href="#more"
			onclick={glideLink}
			class="inline-flex text-surface-700-300 rounded-base motion-safe:animate-bounce
				focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500"
		>
			<Icon name="arrowDown" class="size-8" stroke={2} />
			<span class="sr-only">{t('home.more')}</span>
		</a>
	</div>

	<!--
		Below the fold, in the order a newcomer needs it (29 September):
		what Q is in one bold line, the story in pictures, what people use it
		for, and where it is up to — beta, and staying in touch.
	-->
	<section id="more" tabindex="-1" class="outline-none flex flex-col items-center gap-12 px-4 py-12 sm:p-8">
		<!-- 1. What Q is: a bold introduction. -->
		<header class="max-w-2xl text-center space-y-4">
			<h2 class="h2 text-balance" data-read="home.whatQIs"><QText text={t('home.whatQIs')} /></h2>
			<p class="h3 text-balance text-primary-600-400" data-read="home.intro.lead"><QText text={t('home.intro.lead')} /></p>
			<p class="text-lg text-surface-700-300 text-balance" data-read="home.intro.body"><QText text={t('home.intro.body')} /></p>
		</header>

		<!-- 2. The story, in pictures. -->
		<ReceiptStory />

		<!-- 3. Uses. -->
		<section class="w-full max-w-5xl space-y-6" aria-labelledby="uses-title">
			<h2 id="uses-title" class="h3 text-center" data-read="uses.title">{t('uses.title')}</h2>
			<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each USES as u (u.key)}
					<li class="card preset-tonal p-5 space-y-2">
						<Icon name={u.icon} class="size-8 text-secondary-500" stroke={2} />
						<h3 class="h5" data-read={`uses.${u.key}.t`}>{t(`uses.${u.key}.t` as Key)}</h3>
						<p class="text-sm text-surface-700-300" data-read={`uses.${u.key}.d`}><QText text={t(`uses.${u.key}.d` as Key)} /></p>
					</li>
				{/each}
			</ul>
		</section>

		<!-- 4. How secure is this? Plain words, then the standards by name. -->
		<SecurityStandards />

		<!-- 5. Built with love, and who to thank. -->
		<Credits />

		<!-- 6. Stay in touch. -->
		<BetaNews />

		<!-- 7. Keep Q free: the one ask, said once. -->
		<SupportQ />
	</section>
{:else}
	<!-- Signed in: an empty browser offers the last backup first (someone
	     returning on a new device), then you — or, if you're new, your card. -->
	<div class="mb-4"><OpenFromBackup /></div>
	<div class="mb-4"><PointerNote /></div>
	<YouAtTop {identity} {ledger} />

	<Page title="Your activity" lead="Your files, receipts and federations — on this device, offline.">
		{#if identity && home?.ok && !inHome}
			<div class="card preset-outlined-primary-500 mb-6 p-5 flex flex-wrap items-center gap-4">
				<div class="min-w-48 flex-1">
					<p class="font-bold">Join {home.name}</p>
					<p class="text-sm opacity-80">{home.purpose}</p>
					<p class="text-sm opacity-70 mt-1">Your agreement is with {home.name}, one step at a time. You can leave whenever you like.</p>
				</div>
				<a class="btn preset-filled-primary-500 min-h-11" href={home.joinHref}>Read and join</a>
			</div>
		{/if}
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		<Tile href="/keys" icon="keys" title="Keys" meta={identity ? 'Signed in with your passkey' : 'Not signed in'}>
			{#snippet status()}
				<Status tone={identity ? 'good' : 'needs-you'}>{identity ? 'Ready' : 'Sign in'}</Status>
			{/snippet}
		</Tile>
		<Tile
			href="/data"
			icon="files"
			title="Files"
			count={folder.kind === 'ready' ? (ledger ? ledger.items.length - ledger.receiptPaths.size : '…') : undefined}
			meta={folder.kind === 'ready' ? (folder.inBrowser ? 'Kept in this browser' : `In your ${folder.name} folder`) : folder.kind === 'asleep' ? 'Folder needs allowing' : 'No folder yet'}
		/>
		<Tile
			href="/receipts"
			icon="receipts"
			title="Receipts"
			count={identity && folder.kind === 'ready' ? (ledger?.receipts.length ?? '…') : undefined}
			meta={ledger?.receipts.some((r) => r.holds === 'no') ? 'Some do not hold up' : 'Signed records, checked'}
		/>
		<Tile href="/federations" icon="federations" title="Federations" count={identity ? federations.length : undefined} meta="Founded or joined" />
		<Tile href="/devices" icon="devices" title="Devices" count={identity ? linked + 1 : undefined} meta="This one, plus linked keys" />
		<Tile href="/nodes" icon="nodes" title="Backups" count={folder.kind === 'ready' ? replicas.length : undefined} meta="Other places your vault is kept" />
		{#each FEATURES as f (f.id)}
			<Tile href={f.href} icon={f.icon} title={f.title} count={identity ? courses.length : undefined} meta={f.federation} />
		{/each}
	</div>

	<Section title="Recent" description="The newest things in your folder that Q understands.">
		{#if !identity}
			<Empty icon="lock" title="Locked" description="Sign in to see what is in your folder." />
		{:else if !recent.length}
			<Empty icon="activity" title="Nothing yet" description="Records saved from DoStudy, and links you approve, show here." />
		{:else}
			<div class="stack-tight">
				{#each recent as r (r.key)}
					<Item title={r.title} description={r.description} meta={r.meta}>
						{#snippet status()}
							{#if r.status}<Status tone={r.status.tone}>{r.status.text}</Status>{/if}
						{/snippet}
					</Item>
				{/each}
			</div>
		{/if}
	</Section>

	{#if identity}
		<!-- Last on the page, on purpose: nothing below it to press by mistake. -->
		<LeaveNoTrace />
	{/if}
</Page>
{/if}
