<script lang="ts">
	/*
	 * A membership card (ADR-Q-015 §5): your place in a federation, drawn from
	 * what's already in your vault from joining. Who and since when, your
	 * standing, when it runs out, what they hold on you, what they can never
	 * have — and the way out, which never needs anyone's permission.
	 */
	import { Avatar, Status, Icon } from '@inqbeta/q-ui';
	import { PRINCIPLES } from '@inqbeta/q-core/federations';

	let {
		name,
		purpose = '',
		since,
		endsOn,
		standing,
		caretaker = false,
		caretakerUntil,
		knownAs = 'anonymous',
		card,
		did,
		kept = [],
		href
	}: {
		name: string;
		purpose?: string;
		since: string;
		endsOn?: string;
		standing: { is: 'member' | 'suspended' | 'left' | 'removed'; until?: string; at?: string };
		caretaker?: boolean;
		caretakerUntil?: string;
		knownAs?: string;
		card?: { name?: string; picture?: string } | null;
		did: string;
		/** Your "just for me" details, by label. */
		kept?: string[];
		href: string;
	} = $props();

	const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
	const initials = $derived(name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
	const KNOWN: Record<string, string> = {
		anonymous: 'Nothing about you: you joined anonymously.',
		name: 'Your name, from the card you gave them.',
		'name-and-picture': 'Your name and picture, from the card you gave them.'
	};
</script>

<article class="card preset-outlined-surface-200-800 overflow-hidden bg-surface-50-950">
	<!-- Cover: the federation, behind. -->
	<div class="relative z-0 h-24 preset-tonal-secondary flex items-center px-5">
		<span class="text-4xl font-bold opacity-40" aria-hidden="true">{initials}</span>
		<span class="absolute right-3 top-3 z-10 badge preset-filled-primary-500 shadow-lg">Membership</span>
	</div>
	<div class="px-5 pb-5">
		<!-- You, in front, as they know you. -->
		<div class="relative z-10 -mt-8 mb-3 size-16 overflow-hidden rounded-full border-4 border-surface-50-950 bg-surface-100-900 shadow-md">
			{#if card?.picture}
				<img src={card.picture} alt="" class="size-full object-cover" />
			{:else}
				<span class="flex size-full items-center justify-center"><Avatar {did} size={56} label="" /></span>
			{/if}
		</div>

		<h3 class="h4">{name}</h3>
		{#if purpose}<p class="opacity-80">{purpose}</p>{/if}

		<dl class="mt-4 grid gap-2 sm:grid-cols-[9rem_1fr] text-sm">
			<dt class="opacity-60">Standing</dt>
			<dd class="flex flex-wrap items-center gap-2">
				{#if standing.is === 'member'}
					<Status tone="good">{caretaker ? 'You look after it' : 'Member'}</Status>
				{:else if standing.is === 'suspended'}
					<Status tone="needs-you">Suspended until {day(standing.until)}</Status>
				{:else if standing.is === 'left'}
					<Status tone="plain">You left {day(standing.at)}</Status>
				{:else}
					<Status tone="plain">Removed {day(standing.at)}</Status>
				{/if}
			</dd>
			<dt class="opacity-60">Since</dt>
			<dd>{day(since)}</dd>
			<dt class="opacity-60">Runs out</dt>
			<dd>{endsOn ? day(endsOn) : 'Never on its own — while you choose to stay.'}</dd>
			{#if caretaker && caretakerUntil}
				<dt class="opacity-60">Caretaker until</dt>
				<dd>{day(caretakerUntil)}</dd>
			{/if}
			<dt class="opacity-60">What they hold</dt>
			<dd>{KNOWN[knownAs] ?? KNOWN.anonymous}</dd>
			<dt class="opacity-60">What they can’t have</dt>
			<dd>
				{kept.length ? `Anything just for you (${kept.join(', ')}), ` : 'Anything you keep just for you, '}and nothing beyond what you gave them.
			</dd>
		</dl>

		<details class="mt-3 text-sm">
			<summary class="cursor-pointer opacity-70 min-h-11 flex items-center gap-2"><Icon name="shield" size={16} /> What can never change</summary>
			<ul class="mt-2 list-disc pl-6 space-y-1">
				{#each PRINCIPLES as p (p.id)}<li>{p.says}</li>{/each}
			</ul>
		</details>

		<div class="mt-4 flex flex-wrap gap-2">
			<a class="btn preset-tonal min-h-11" {href}>Open</a>
			{#if standing.is === 'member' || standing.is === 'suspended'}
				{#if !caretaker}<a class="btn preset-tonal min-h-11" href="{href}&tab=members">Leave…</a>{/if}
			{/if}
		</div>
	</div>
</article>
