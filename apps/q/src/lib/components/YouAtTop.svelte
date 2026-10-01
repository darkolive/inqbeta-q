<script lang="ts">
	/*
	 * The top of your Overview (1 October 2026). Darren: "when you first sign
	 * in … full width, your cover photo and your profile picture, name, last
	 * time signed on … like a Facebook profile view of yourself. And then it
	 * becomes a dashboard of activity."
	 *
	 * No card yet (someone new, whichever way they came in): the four steps of
	 * the Personal card are the first thing they see. After that: you, full
	 * width, with your card a tap away.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import type { AnswerSet } from '@inqbeta/q-core/questions';
	import { newestPerCard } from '@inqbeta/q-core/cards';
	import PersonalSteps from '$lib/components/PersonalSteps.svelte';
	import BackupSteps from '$lib/components/BackupSteps.svelte';
	import { copiesElsewhere } from '$lib/backup-state';
	import { watchFolder } from '@inqbeta/q-core/folder';
	import { answersFrom } from '$lib/answers';
	import { cardFrom, type KindCard } from '$lib/cards';
	import { refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';
	import { profileNow, asText, nameFrom, businessesFrom, ownDetails } from '$lib/profile';

	let { identity, ledger }: { identity: Identity; ledger: Ledger | null } = $props();

	let answers = $state<AnswerSet[]>([]);
	let cards = $state<KindCard[]>([]);
	let loaded = $state(false);
	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found) : [];
		const ready = ledger?.state === 'ready' || ledger?.state === 'no-folder';
		void Promise.all(found.filter((f) => f.kind === 'answers').map((f) => answersFrom(f.item))).then((l) => {
			answers = l.filter((a): a is AnswerSet => !!a);
			loaded = ready;
		});
		void Promise.all(found.filter((f) => f.kind === 'card').map((f) => cardFrom(f.item))).then((l) => (cards = newestPerCard(l.filter((c): c is KindCard => !!c)) as KindCard[]));
	});

	const now = $derived(profileNow(answers, identity.did));
	const text = $derived(Object.fromEntries(Object.entries(now).map(([k, v]) => [k, asText(v)])));
	const name = $derived(nameFrom(text));
	const personal = $derived(cards.find((c) => c.kind === 'personal'));
	const work = $derived(businessesFrom(now, ownDetails(now)));
	const role = $derived(work[0] ? [work[0].role, work[0].name].filter(Boolean).join(' at ') : '');

	/* When, said the way a person says it. */
	const times = $derived((ledger?.receipts ?? []).map((r) => r.at).filter(Boolean).sort());
	function ago(iso: string | undefined): string {
		if (!iso) return '';
		const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
		if (mins < 2) return 'just now';
		if (mins < 60) return `${mins} minutes ago`;
		const hours = Math.round(mins / 60);
		if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
		return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	}
	const since = $derived(times[0] ? new Date(times[0]).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '');

	let stepping = $state(false);

	/* Second core power: once your card exists, keeping it safe comes next. */
	let copies = $state<number | null>(null);
	let notNow = $state(false);
	let folderReady = $state(false);
	$effect(() => watchFolder((f) => (folderReady = f.kind === 'ready')));
	$effect(() => {
		if (name && folderReady && copies === null) void copiesElsewhere().then((n) => (copies = n));
	});
</script>

{#if !loaded}
	<div class="card preset-tonal-surface h-48 mb-8 animate-pulse" aria-label="Reading your card"></div>
{:else if stepping || !name}
	<section class="mb-8 flex flex-col gap-4" aria-labelledby="welcome">
		{#if !name}
			<header>
				<h2 id="welcome" class="h2">Welcome. Let’s make your card.</h2>
				<p class="opacity-70">Four short steps. It’s how people will know you, and only what you switch on is ever shown.</p>
			</header>
		{/if}
		<PersonalSteps
			{identity}
			{now}
			shown={personal?.shows ?? []}
			onDone={async () => {
				stepping = false;
				await refreshLedger();
			}}
			onCancel={() => (stepping = false)}
		/>
	</section>
{:else}
	<!-- You, full width: cover behind, your photo in front, your name. -->
	<section class="card preset-outlined-surface-200-800 overflow-hidden bg-surface-50-950 mb-8" aria-label="You">
		<div class="relative h-40 sm:h-56">
			{#if text['q:person/cover']}
				<img src={text['q:person/cover']} alt="" class="size-full object-cover" />
			{:else}
				<div class="size-full preset-tonal-primary"></div>
			{/if}
		</div>
		<div class="flex flex-wrap items-end justify-between gap-4 px-5 pb-5 sm:px-8">
			<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
				<div class="relative z-10 -mt-14 size-28 sm:size-32 shrink-0 overflow-hidden rounded-full border-4 border-surface-50-950 bg-surface-100-900 shadow-lg">
					{#if text['q:person/picture']}
						<img src={text['q:person/picture']} alt="" class="size-full object-cover" />
					{:else}
						<span class="flex size-full items-center justify-center text-4xl font-bold opacity-60">{name.slice(0, 1)}</span>
					{/if}
				</div>
				<div class="pb-1">
					<h2 class="h2">{name}</h2>
					{#if role}<p class="opacity-80">{role}</p>{/if}
					<p class="text-sm opacity-60">
						{times.length ? `Last active ${ago(times.at(-1))}${since ? ` · with Q since ${since}` : ''}` : 'Signed in now'}
					</p>
				</div>
			</div>
			<div class="flex flex-wrap gap-3 pb-1">
				<a class="btn preset-filled-primary-500 min-h-11" href="/cards?tab=personal"><Icon name="share" size={16} /> My card</a>
				<button type="button" class="btn preset-tonal min-h-11" onclick={() => (stepping = true)}>Change my details</button>
			</div>
		</div>
	</section>
{/if}

{#if loaded && name && !stepping && copies === 0 && !notNow}
	<section class="mb-8 flex flex-col gap-4" aria-labelledby="keep-safe">
		<header>
			<h2 id="keep-safe" class="h3">Next: keep your vault safe</h2>
			<p class="opacity-70">Your card, and everything Q keeps for you, lives on this device. Put a copy somewhere else, so losing this device doesn’t lose you.</p>
		</header>
		<BackupSteps
			onDone={async () => {
				copies = await copiesElsewhere();
				notNow = true;
			}}
			onCancel={() => (notNow = true)}
		/>
	</section>
{/if}
