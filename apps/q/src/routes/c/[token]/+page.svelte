<script lang="ts">
	/*
	 * Opening a receipt.
	 *
	 * Nothing arrived in the email except the way here. What is on this page
	 * cannot be read without the passkey the claim was sealed to — so opening
	 * it is the proof, and the button below is the first action in the whole
	 * exchange.
	 *
	 * The awkward case, handled rather than hidden: mail apps open links in
	 * whatever browser they please, which may not be the one holding the
	 * passkey. Passkeys usually follow you through a keychain, but when they do
	 * not, this says so instead of failing blankly.
	 */
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import Thumbprint from '$lib/components/Thumbprint.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { openWith } from '@inqbeta/q-core/seal';
	import { confirmClaim, saveChannel, type ClaimView } from '$lib/channels';

	let { data }: { data: ClaimView } = $props();

	let identity = $state<Identity | null>(null);
	$effect(() => watch((id) => (identity = id)));

	type Inside = { kind: 'email' | 'sms'; address: string; witness: string };

	let inside = $state<Inside | null>(null);
	let opening = $state(false);
	let says = $state('');
	let done = $state(false);
	let working = $state(false);

	const forMe = $derived(!data.gone && !!identity && identity.did === data.did);

	/* Open it the moment the right passkey is here. There is nothing to decide
	 * yet — reading the receipt is how you find out what it asks. */
	$effect(() => {
		if (!forMe || inside || opening || data.gone) return;
		opening = true;
		void (async () => {
			const out = await openWith(data.sealed, identity!);
			if (out.ok) inside = out.body as Inside;
			else says = out.says;
			opening = false;
		})();
	});

	async function confirm() {
		if (!identity || !inside || data.gone) return;
		says = '';
		working = true;
		const out = await confirmClaim(identity, data.token, inside.witness);
		if (!out.ok) {
			says = out.says;
			working = false;
			return;
		}
		const saved = await saveChannel(identity, { kind: out.kind, address: out.address, proof: out.proof });
		working = false;
		if (saved.ok) done = true;
		else says = `Confirmed, but not written down: ${saved.says}`;
	}
</script>

<svelte:head>
	<title>A receipt for you — Q</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if !identity && !data.gone}
	<!-- Sealed, and no passkey here yet: only the thumbprint (5 October 2026). -->
	<Thumbprint />
{:else}
<Page title="A receipt for you" lead="Someone asked Q to add an address to their identity. This is what they left.">
	{#if data.gone}
		<Empty icon="lock" title="Nothing here" description={data.says} />
	{:else if !forMe}
		<Section title="Not this passkey">
			<Item icon="lock" title="Sealed to someone else" subtitle={data.did}>
				{#snippet status()}<Status tone="needs-you">Cannot open</Status>{/snippet}
			</Item>
			<p class="mt-4">
				You are signed in as a different identity. If the passkey this was meant for is on
				another device, open this link there — a link in an email arrives in whichever
				browser your mail app chooses, which is not always the one holding your keys.
			</p>
		</Section>
	{:else if done}
		<Section title="Added">
			<Item icon="verified" title="The channel is yours" description="Written into your folder, sealed. You can say what it is for in Settings.">
				{#snippet status()}<Status tone="good">Verified</Status>{/snippet}
			</Item>
			<div class="actions mt-4">
				<a class="btn preset-filled-primary-500" href="/settings">See your channels</a>
			</div>
		</Section>
	{:else if inside}
		<Section title="What it says">
			<Item
				icon={inside.kind === 'email' ? 'info' : 'phone'}
				title={inside.kind === 'email' ? 'Email' : 'Phone'}
				subtitle={inside.address}
				description="You opened this with your passkey, which is the proof. Nothing was sent here except the way to this page."
			/>
			<div class="actions mt-4">
				<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void confirm()}>
					{working ? 'Adding…' : 'Yes, that is mine'}
				</button>
			</div>
		</Section>
	{:else}
		<Section title="Opening">
			<p>{opening ? 'Asking your passkey…' : 'Waiting for your passkey.'}</p>
		</Section>
	{/if}

	{#if says}
		<p class="mt-4 text-warning-700-300" aria-live="polite">{says}</p>
	{/if}
</Page>
{/if}
