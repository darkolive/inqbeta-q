<script lang="ts">
	/*
	 * Sharing with one person (1 October 2026). Darren: "send an invite to
	 * someone to be your friend and tick box which of those pieces of
	 * information you want to share with that person."
	 *
	 * Step 1: tick what this person gets. Step 2: send the link any way you
	 * like. The preview is exactly what they'll see, and nothing else leaves.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { untrack } from 'svelte';
	import CardFace from '$lib/components/CardFace.svelte';
	import ShareLink from '$lib/components/ShareLink.svelte';
	import { makeCardLink } from '$lib/cardlink';
	import { myInbox } from '$lib/messages';
	import { allDetails, withLabels, type OwnDetail } from '$lib/profile';

	let {
		did,
		name,
		details,
		own = [],
		ticked = Object.keys(details),
		onDone
	}: {
		did: string;
		/** What the card is called: Personal, Business, Your profile. */
		name: string;
		/** Everything that MAY go: id → value. Just-for-me details are never in here. */
		details: Record<string, string>;
		own?: OwnDetail[];
		/** What starts ticked. */
		ticked?: string[];
		onDone: () => void;
	} = $props();

	const rows = $derived(allDetails(own).filter((d) => details[d.id]));
	/* Ticked once, when it opens; after that it's yours to change. */
	let chosen = $state<string[]>(untrack(() => ticked.filter((id) => details[id])));
	const toggle = (id: string) => (chosen = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
	const picked = $derived(withLabels(Object.fromEntries(chosen.map((id) => [id, details[id]])), own));

	let link = $state('');
	let says = $state('');
	let making = $state(false);
	async function make() {
		making = true;
		says = '';
		try {
			link = await makeCardLink(name, picked, (await myInbox())?.id);
		} catch (e) {
			says = e instanceof Error ? e.message : 'The link couldn’t be made.';
		}
		making = false;
	}
</script>

<div class="card preset-outlined-primary-500 p-5 flex flex-col gap-5">
	{#if !link}
		<div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
			<div class="flex flex-col gap-3">
				<p class="font-bold">1. Tick what this person gets</p>
				<ul class="flex flex-col gap-1">
					{#each rows as d (d.id)}
						<li>
							<label class="flex items-center gap-3 min-h-11 cursor-pointer">
								<input type="checkbox" class="checkbox" checked={chosen.includes(d.id)} onchange={() => toggle(d.id)} />
								<span>{d.label}</span>
								{#if d.kind !== 'picture' && d.kind !== 'cover'}<span class="text-sm opacity-60 truncate">{details[d.id]}</span>{/if}
							</label>
						</li>
					{/each}
				</ul>
				<p class="text-xs opacity-60 flex items-center gap-1"><Icon name="lock" size={12} /> Anything just for you isn’t on this list, and can’t be.</p>
				<div class="flex flex-wrap gap-3">
					<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!chosen.length || making} onclick={() => void make()}>
						{making ? 'Making the link…' : 'Next: send it'}
					</button>
					<button type="button" class="btn preset-tonal min-h-11" onclick={onDone}>Not now</button>
				</div>
				{#if !chosen.length}<p class="text-xs opacity-70">Tick at least one thing, and the button wakes up.</p>{/if}
				{#if says}<p class="text-sm text-warning-700-300" aria-live="polite">{says}</p>{/if}
			</div>
			<aside class="flex flex-col gap-2">
				<p class="text-sm opacity-70">What they’ll see.</p>
				<CardFace details={picked} {did} badge={name} />
			</aside>
		</div>
	{:else}
		<p class="font-bold">2. Send it any way you like</p>
		<ShareLink
			{link}
			label="Your {name} card"
			note="When they open it and link up, you’ll hear the bell. The cover stays behind: a link has to fit in a message."
			subject="Let’s link up"
			message="Here’s my card. Open it to link up with me."
		/>
		<div class="flex flex-wrap gap-3">
			<button type="button" class="btn preset-tonal min-h-11" onclick={() => (link = '')}>Change what’s ticked</button>
			<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={onDone}>Done</button>
		</div>
	{/if}
</div>
