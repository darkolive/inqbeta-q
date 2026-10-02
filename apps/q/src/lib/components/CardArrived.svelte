<script lang="ts">
	/*
	 * Someone sent you their card (ADR-Q-015): shown as a card, with Link up.
	 * Link up, and Q keeps their card in your vault and rings their bell with
	 * yours, so they know, and you can now reach each other.
	 *
	 * Where the card came from is the caller's business (`open`): the old
	 * links carry it in the #fragment; links from 2 October 2026 fetch it,
	 * locked, from the storage (q-core/drop.ts).
	 */
	import { Section, Status, Empty } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import CardFace from '$lib/components/CardFace.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { seal } from '@inqbeta/q-core/seal';
	import { saveLocked } from '@inqbeta/q-core/folder';
	import type { AnswerSet } from '@inqbeta/q-core/questions';
	import type { OpenedLink } from '$lib/cardlink';
	import { sendTo } from '$lib/messages';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';
	import { answersFrom } from '$lib/answers';
	import { profileNow, justForMe, asText } from '$lib/profile';
	import { CARD_PRESETS } from '$lib/questions/presets';
	import { thumbnail } from '$lib/pictures';

	let { open }: { open: () => Promise<OpenedLink> } = $props();

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	let opened = $state<OpenedLink | null>(null);
	$effect(() => void open().then((o) => (opened = o)));

	let answers = $state<AnswerSet[]>([]);
	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found) : [];
		void Promise.all(found.filter((f) => f.kind === 'answers').map((f) => answersFrom(f.item))).then((l) => (answers = l.filter((a): a is AnswerSet => !!a)));
	});

	let busy = $state(false);
	let done = $state<{ tone: 'good' | 'bad'; says: string } | null>(null);
	const theirName = $derived(opened?.ok ? (opened.card.details['q:person/called'] ?? 'them') : 'them');

	/* Your Personal card, as it would go back to them: shown details only, picture made small. */
	async function myCard(): Promise<Record<string, string>> {
		if (!identity) return {};
		const now = profileNow(answers, identity.did);
		const kept = justForMe(now);
		const ids = CARD_PRESETS.find((p) => p.id === 'personal')?.shows ?? [];
		const out: Record<string, string> = {};
		for (const id of ids) {
			if (id === 'q:person/cover' || kept.includes(id) || now[id] === undefined) continue;
			const v = asText(now[id]);
			out[id] = id === 'q:person/picture' && v.startsWith('data:') ? await thumbnail(v) : v;
		}
		return out;
	}

	async function linkUp() {
		if (!identity || !opened?.ok) return;
		busy = true;
		done = null;
		try {
			if (opened.from === identity.did) {
				/* Your own card: fine for trying it out; still kept and rung. */
			}
			const record = { schema: 'inqbeta.linked/1', source: 'inqbeta:q/link', with: opened.from, card: opened.card, signed: opened.signed, at: new Date().toISOString() };
			await saveLocked('contacts', `linked-${opened.from.slice(-16)}.json`, JSON.stringify(await seal(record), null, 2), 'application/json');
			/* Your card goes back to them, sealed to them, through their inbox: so they know, and can write back. */
			let rang = '';
			if (opened.card.inbox && opened.from !== identity.did) {
				const out = await sendTo({ did: opened.from, inbox: opened.card.inbox }, { kind: 'linked-back', card: await myCard() });
				rang = out.ok ? ` ${theirName} has been told.` : ` (${theirName} couldn’t be told just now: ${out.says})`;
			}
			done = { tone: 'good', says: `Linked. ${theirName}’s card is in your contacts.${rang}` };
			await refreshLedger();
		} catch (e) {
			done = { tone: 'bad', says: e instanceof Error ? e.message : String(e) };
		}
		busy = false;
	}
</script>

	{#if !opened}
		<p class="opacity-60">Opening the card…</p>
	{:else if !opened.ok}
		<Empty icon="card" title="This card can’t be opened" description={opened.says} />
	{:else}
		<div class="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr] items-start">
			<CardFace details={opened.card.details} did={opened.from} badge={opened.card.name} />
			<Section title="Link up with {theirName}?" description="Their card goes in your contacts, and they get yours back, so you can reach each other.">
				{#if !identity}
					<SignIn />
				{:else if done}
					<div class="card p-4 {done.tone === 'good' ? 'preset-tonal-success' : 'preset-tonal-error'}" role="status">{done.says}</div>
					{#if done.tone === 'good'}<a class="btn preset-tonal min-h-11 mt-4" href="/contacts">Open contacts</a>{/if}
				{:else}
					<div class="flex flex-wrap items-center gap-3">
						<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy} onclick={() => void linkUp()}>{busy ? 'Linking…' : `Link up with ${theirName}`}</button>
						<Status tone="good">Signed by them, unchanged</Status>
					</div>
				{/if}
			</Section>
		</div>
	{/if}
