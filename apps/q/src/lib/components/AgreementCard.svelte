<script lang="ts">
	/*
	 * An agreement as a card (ADR-Q-015, ADR-Q-025), drawn by the exchange
	 * set's card (ADR-Q-029): this file says only what's an agreement's own —
	 * the heading for each kind (a shop offer, a sale, an open offer), what
	 * each side gives, and when, where and done-when.
	 */
	import { valueText, type Standing } from '@inqbeta/q-core/agreements';
	import { standingWords } from '$lib/agreements';
	import type { Person } from '$lib/people';
	import ExchangeCard from './exchange/ExchangeCard.svelte';

	let { standing, me, people, href }: { standing: Standing; me: string; people: Person[]; href?: string } = $props();

	const t = $derived(standing.terms);
	const themDid = $derived(t ? (t.a === me ? t.b : t.a) : '');
	const them = $derived(people.find((p) => p.did === themDid));
	const name = $derived(them?.name ?? 'someone');
	const mine = $derived(t ? (t.a === me ? t.aGives : t.bGives) : null);
	const theirs = $derived(t ? (t.a === me ? t.bGives : t.aGives) : null);
	/* A hire's credits are the most it can come to: paid for what it holds. */
	const say = (v: NonNullable<typeof mine>) =>
		t?.service?.kind === 'pass-through' && 'credits' in v ? `Up to ${valueText(v)}, at ${t.service.perGBHour} a GB held an hour`
		: t?.service?.kind === 'store' && 'credits' in v ? `${valueText(v)} for ${t.service.gb} GB kept ${t.service.months} month${t.service.months === 1 ? '' : 's'}`
		: valueText(v);
	const KIND = { swap: 'Swap', job: 'Job', treaty: 'Treaty' } as const;

	const heading = $derived(
		t && !t.b && standing.limit && t.a === me ? `In your shop: ${standing.limit} to sell`
		: t && !t.b && standing.limit ? `In ${name}’s shop`
		: t && !t.b && t.a === me ? 'Your open offer, shared by link'
		: standing.takenFrom && t?.service?.kind === 'store' && t.a === me ? `Storage taken by ${name}`
		: standing.takenFrom && t?.service?.kind === 'store' ? `Storage from ${name}`
		: standing.takenFrom && t?.service && t.a === me ? `Hired by ${name}`
		: standing.takenFrom && t?.service ? `Hired from ${name}`
		: standing.takenFrom && t?.a === me ? `Sold to ${name}`
		: standing.takenFrom ? `Bought from ${name}’s shop`
		: t && !t.b ? `An offer from ${name}`
		: `With ${name}`
	);
	const getsLabel = $derived(t && !t.b && t.a === me ? (standing.limit ? 'Whoever buys it gives' : 'Whoever takes it gives') : `${them?.name?.split(' ')[0] ?? 'They'} gives`);
	const details = $derived(
		[
			{ label: 'When', value: t?.when ?? '' },
			{ label: 'Where', value: t?.where ?? '' },
			{ label: 'Done when', value: t?.doneWhen ?? '' }
		].filter((d) => d.value)
	);
</script>

<ExchangeCard
	{heading}
	sub="{t ? KIND[t.kind] : 'Agreement'}{t?.business ? ' · business' : ''}"
	who={{ name: them?.name ?? '?', picture: them?.picture }}
	status={standingWords(standing, me)}
	give={mine ? { label: 'You give', value: say(mine) } : undefined}
	get={theirs ? { label: getsLabel, value: say(theirs) } : undefined}
	{details}
	{href}
/>
