<script lang="ts">
	/*
	 * Agreements (ADR-Q-025, 3 October 2026): what you and the people you know
	 * have promised each other, and how it went. Agree first — the contract
	 * point — then settle, which is the accounting.
	 *
	 * Grouped by what they need: your answer first, then those in progress,
	 * then settled and ended. "Write an agreement" is always one tap away.
	 */
	import { Page, Section, Empty, Icon } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import AgreementCard from '$lib/components/AgreementCard.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { agreementsFrom, needsMe } from '$lib/agreements';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const me = $derived(identity?.did ?? '');
	const people = $derived(peopleFrom(ledger, me));
	/* Shop offers (ADR-Q-026) have their own group; someone else's are seen in their shop. */
	const everything = $derived(agreementsFrom(ledger));
	const shop = $derived(everything.filter((a) => a.listing && a.standing.offeredBy === me && a.standing.phase === 'agreeing'));
	const all = $derived(everything.filter((a) => !a.listing));
	const yours = $derived(all.filter((a) => needsMe(a.standing, me)));
	const going = $derived(all.filter((a) => !needsMe(a.standing, me) && (a.standing.phase === 'agreeing' || a.standing.phase === 'agreed')));
	const settled = $derived(all.filter((a) => a.standing.phase === 'complete'));
	const ended = $derived(all.filter((a) => a.standing.phase === 'ended'));
	const href = (id: string) => `/agreements/${encodeURIComponent(id)}`;
</script>

<svelte:head><title>Agreements — Q</title></svelte:head>

<Page title="Agreements" lead="What you and the people you know have promised each other. Agree first, then settle up. Every step is signed and kept by you both.">
	{#snippet actions()}
		{#if identity}
			<a href="/agreements/new" class="btn preset-filled-primary-500 min-h-11"><Icon name="plus" size={18} /> Write an agreement</a>
		{/if}
	{/snippet}

	{#if !identity}
		<div class="panel"><SignIn /></div>
	{:else if !all.length && !shop.length}
		<Empty icon="documents" title="No agreements yet" description="“I’ll cut your grass in exchange for…” Write one with anyone in your address book. It’s only binding once you both agree.">
			<a href="/agreements/new" class="btn preset-filled-primary-500 min-h-11"><Icon name="plus" size={18} /> Write an agreement</a>
		</Empty>
	{:else}
		{#if shop.length}
			<Section title="Your shop" description="Offers anyone can buy, until they’re gone.">
				{#snippet actions()}<a class="btn preset-tonal min-h-11" href="/shop/{encodeURIComponent(me)}"><Icon name="wallet" size={18} /> See your shop</a>{/snippet}
				<div class="grid gap-4 lg:grid-cols-2">
					{#each shop as a (a.id)}
						<AgreementCard standing={a.standing} {me} {people} href={href(a.id)} />
					{/each}
				</div>
			</Section>
		{/if}
		{#each [{ title: 'Waiting for you', description: 'An answer or a settlement only you can give.', list: yours }, { title: 'In progress', description: 'Waiting for the other person, or agreed and not yet settled.', list: going }, { title: 'Settled', description: 'Agreed, done, and settled by you both.', list: settled }, { title: 'Ended', description: 'Declined, withdrawn, or the offer ran out. Nothing was settled.', list: ended }] as group (group.title)}
			{#if group.list.length}
				<Section title={group.title} description={group.description}>
					<div class="grid gap-4 lg:grid-cols-2">
						{#each group.list as a (a.id)}
							<AgreementCard standing={a.standing} {me} {people} href={href(a.id)} />
						{/each}
					</div>
				</Section>
			{/if}
		{/each}
	{/if}
</Page>
