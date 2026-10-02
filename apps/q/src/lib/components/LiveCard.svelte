<script lang="ts">
	/*
	 * One card, edited where you see it (2 October 2026). Darren: "it's not a
	 * case of then you make your card … switch on what people see … your last
	 * settings is your receipt … share underneath that … you can select there
	 * and then specifically what information you want them to have, and then
	 * you share. One singular interface, nothing else, no other steps."
	 *
	 * The switches ARE the card: flip one and the card changes, and a moment
	 * later it's kept (a new signed version; the old one stays as evidence).
	 * Share sits under the card and sends exactly what it shows, by email,
	 * WhatsApp, copy or QR. Anything off stays just for you.
	 */
	import { untrack } from 'svelte';
	import { Icon } from '@inqbeta/q-ui';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import ChooseShown from '$lib/components/ChooseShown.svelte';
	import ShareLink from '$lib/components/ShareLink.svelte';
	import { saveCard, type CardKind } from '$lib/cards';
	import { makeCardLink } from '$lib/cardlink';
	import { bellConfig } from '$lib/bellboy';
	import { refreshLedger } from '$lib/ledger';
	import { withLabels, type OwnDetail } from '$lib/profile';

	let {
		identity,
		name,
		kind,
		options,
		values,
		own = [],
		shown,
		always = [],
		children
	}: {
		identity: Identity;
		/** What the card is called: Personal, or the business's name. It's the badge they'll see. */
		name: string;
		kind: CardKind;
		options: { id: string; label: string }[];
		values: Record<string, string>;
		own?: OwnDetail[];
		/** What it shows now. */
		shown: string[];
		/** Always on the card, whatever the switches say (a business card always names the business). */
		always?: string[];
		children?: import('svelte').Snippet;
	} = $props();

	let shows = $state<string[]>(untrack(() => [...shown]));
	let status = $state<'saved' | 'saving' | 'waiting' | 'failed'>('saved');
	let says = $state('');
	let timer: ReturnType<typeof setTimeout> | null = null;
	let first = true;

	const showing = $derived([...new Set([...always, ...shows])].filter((id) => values[id]));

	$effect(() => {
		const now = [...shows];
		if (first) {
			first = false;
			return;
		}
		/* What's on the card changed: a link made before no longer matches it. */
		link = '';
		status = 'waiting';
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void keep(now), 900);
	});

	async function keep(list: string[]) {
		status = 'saving';
		const out = await saveCard(identity, name, [...new Set([...always, ...list])].filter((id) => values[id]), [], kind);
		if (!out.ok) {
			status = 'failed';
			says = out.says;
			return;
		}
		status = 'saved';
		void refreshLedger();
	}

	/* ---- Share: exactly what the card shows, signed, in a link ---- */
	let link = $state('');
	let making = $state(false);
	async function share() {
		says = '';
		making = true;
		try {
			const details = withLabels(Object.fromEntries(showing.map((id) => [id, values[id]])), own);
			link = await makeCardLink(name, details, bellConfig()?.inbox);
		} catch (e) {
			says = e instanceof Error ? e.message : 'The link couldn’t be made.';
		}
		making = false;
	}
</script>

<section class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6 flex flex-col gap-5">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="h3">{name}</h2>
			<p class="opacity-70">Switch on what people see. Anything off stays just for you.</p>
		</div>
		<p class="text-sm flex items-center gap-2" aria-live="polite">
			{#if status === 'saved'}<Icon name="check" size={16} /> Kept{:else if status === 'failed'}<span class="text-error-600-400">{says}</span>{:else}Keeping…{/if}
		</p>
	</header>

	<ChooseShown did={identity.did} badge={name} {options} {values} {own} bind:shows>
		{#snippet below()}
			{#if link}
				<ShareLink
					{link}
					label="Your {name} card"
					note="Exactly what the card above shows. When they open it and link up, you’ll hear the bell."
					subject="Let’s link up"
					message="Here’s my card. Open it to link up with me."
				/>
				<button type="button" class="btn preset-tonal min-h-11" onclick={() => (link = '')}>Done</button>
			{:else}
				<button type="button" class="btn preset-filled-primary-500 min-h-11 w-full" disabled={making || !showing.length} onclick={() => void share()}>
					<Icon name="share" size={16} /> {making ? 'Making the link…' : 'Share this card'}
				</button>
				<p class="text-xs opacity-60">Sends what the card shows. Switch things on or off first to change what this person gets.</p>
			{/if}
			{#if says && status !== 'failed'}<p class="text-sm text-error-600-400">{says}</p>{/if}
		{/snippet}
	</ChooseShown>

	{#if children}
		<footer class="flex flex-wrap gap-3 border-t border-surface-200-800 pt-4">
			{@render children()}
		</footer>
	{/if}
</section>
