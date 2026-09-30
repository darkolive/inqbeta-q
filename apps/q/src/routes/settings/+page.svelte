<script lang="ts">
	/*
	 * Settings
	 *
	 * 2FA, session, preferences.
	 */
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { getAccessLevel } from '@inqbeta/q-core/access';
	import { getZK2FAConfig, setupZK2FA, hasZK2FA, clearZK2FA, verifyWeDontStoreYourContact } from '@inqbeta/q-core/zk-2fa';
	import type { ChannelUse, VerifiedChannel } from '@inqbeta/q-core/channels';
	import { channelFrom, claimChannel, updateChannelUses } from '$lib/channels';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';

	let identity = $state<Identity | null>(null);
	const accessLevel = $derived(getAccessLevel());
	const zk2faConfig = $derived(getZK2FAConfig());
	const has2fa = $derived(hasZK2FA());

	// Setup state
	let setupEmail = $state('');
	let setupVerified = $state(false);
	let setupSays = $state('');

	$effect(() => watch((id) => (identity = id)));

	/*
	 * The channels in your folder. Only the receipt is read here — the address
	 * inside stays sealed, because a list of the ways you can be reached does
	 * not need to say what they are.
	 */
	let ledger = $state<Ledger | null>(null);
	let channels = $state<{ channel: VerifiedChannel; key: string }[]>([]);
	let channelSays = $state('');
	let busy = $state<string | null>(null);

	$effect(() => watchLedger((l) => (ledger = l)));

	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found).filter((f) => f.kind === 'channel') : [];
		void Promise.all(found.map(async (f) => ({ channel: await channelFrom(f.item), key: f.key })))
			.then((all) => (channels = all.filter((c): c is { channel: VerifiedChannel; key: string } => !!c.channel)));
	});

	/* Asking for a channel. The passkey is already here, so the claim is signed
	 * the moment it is made — and what goes out is a location, not a code. */
	let newAddress = $state('');
	let claiming = $state(false);
	let claimed = $state(false);

	async function askForChannel() {
		const id = identity;
		if (!id || !newAddress.trim()) return;
		channelSays = '';
		claimed = false;
		claiming = true;
		const out = await claimChannel(id, 'email', newAddress);
		claiming = false;
		if (out.ok) {
			claimed = true;
			newAddress = '';
		} else {
			channelSays = out.says;
		}
	}

	const SHARED_USES: { id: ChannelUse; label: string; says: string }[] = [
		{ id: 'notify', label: 'Notifications', says: 'Q tells you when something needs you.' },
		{ id: 'messages', label: 'Messages', says: 'People you have agreed to hear from can reach you here.' },
		{ id: 'marketing', label: 'News', says: 'Things we think you would want to know. Never sold on.' }
	];

	async function toggleUse(entry: { channel: VerifiedChannel }, use: ChannelUse) {
		const id = identity;
		if (!id) return;
		channelSays = '';
		busy = entry.channel.id;
		const uses = entry.channel.uses.includes(use)
			? entry.channel.uses.filter((u) => u !== use)
			: [...entry.channel.uses, use];
		const out = await updateChannelUses(id, entry.channel, uses);
		if (!out.ok) channelSays = out.says;
		else await refreshLedger();
		busy = null;
	}

	async function setup2FA() {
		setupSays = '';
		if (!setupEmail.trim()) {
			setupSays = 'Enter your email';
			return;
		}
		try {
			await setupZK2FA(setupEmail);
			setupVerified = true;
			setupSays = '2FA set up! We cannot see your email.';
		} catch (e) {
			setupSays = e instanceof Error ? e.message : 'Error';
		}
	}

	function disable2FA() {
		clearZK2FA();
	}
</script>

<svelte:head><title>Settings — Q</title></svelte:head>

<Page title="Settings" lead="Your preferences and security.">
	{#if !identity}
		<Empty icon="settings" title="Locked" description="Sign in to manage settings." />
	{:else}
		<!-- Identity -->
		<Section title="Identity">
			<Item icon="key" title="Your DID" subtitle={identity.did} />
		</Section>

		<!-- Security -->
		<Section title="Security">
			<Item 
				icon="shield" 
				title="Access Level" 
				description="Current session permissions"
			>
				{#snippet status()}
					<Status tone={accessLevel === 'attest' ? 'good' : 'plain'}>
						{accessLevel}
					</Status>
				{/snippet}
			</Item>

			<Item 
				icon="shield-check" 
				title="Zero-Knowledge 2FA" 
				description="Verify with email/SMS without us storing your contact"
			>
				{#snippet status()}
					{#if has2fa}
						<Status tone="good">Enabled</Status>
					{:else}
						<Status tone="plain">Not set up</Status>
					{/if}
				{/snippet}

				{#if !has2fa}
					<div class="mt-4 space-y-2">
						<input 
							type="email" 
							placeholder="your@email.com"
							bind:value={setupEmail}
							class="input input-sm"
						/>
						<button 
							class="btn btn-sm preset-filled-primary-500"
							onclick={() => void setup2FA()}
						>
							Set up 2FA
						</button>
						{#if setupSays}
							<p class="text-sm {setupVerified ? 'text-good-500' : 'text-warning-500'}">{setupSays}</p>
						{/if}
					</div>
				{:else}
					<div class="mt-4">
						<p class="text-sm text-surface-700-300">
							Contact hash: {zk2faConfig?.contactHash.slice(0, 12)}...
						</p>
						<button 
							class="btn btn-sm preset-outlined-error-500 mt-2"
							onclick={() => disable2FA()}
						>
							Disable 2FA
						</button>
					</div>
				{/if}
			</Item>
		</Section>

		<!-- Channels -->
		<Section title="Channels" description="The ways you can be reached. Each one was proved by opening a receipt with your passkey, and is kept as a receipt in your folder.">
			<div class="panel stack-tight">
				<p class="text-sm">
					Give an address and Q leaves a receipt there. The message carries the way to it
					and nothing else — no code, nothing to type. Opening the receipt with your
					passkey is what confirms the address.
				</p>
				<div class="flex flex-wrap items-end gap-2">
					<label class="flex-1 min-w-48">
						<span class="text-sm text-surface-900-100">Email address</span>
						<input
							type="email"
							autocomplete="email"
							class="input mt-1"
							bind:value={newAddress}
							placeholder="you@example.com"
							disabled={claiming}
							onkeydown={(e) => e.key === 'Enter' && void askForChannel()}
						/>
					</label>
					<button
						type="button"
						class="btn preset-filled-primary-500"
						disabled={claiming || !newAddress.trim()}
						onclick={() => void askForChannel()}
					>
						{claiming ? 'Sending…' : 'Leave a receipt there'}
					</button>
				</div>
				{#if claimed}
					<p class="text-sm" aria-live="polite">
						Sent. Open it on a device that has your passkey — a link from an email arrives
						in whichever browser your mail app chooses, and this one only opens for you.
					</p>
				{/if}
			</div>

			{#if !channels.length}
				<Empty
					icon="phone"
					title="No channels yet"
					description="Give an address above and it is kept here once you open the receipt — sealed so only you and Q's sender can open it."
				/>
			{:else}
				{#each channels as entry (entry.channel.id)}
					<Item
						icon={entry.channel.kind === 'email' ? 'info' : 'phone'}
						title={entry.channel.kind === 'email' ? 'Email' : 'Phone'}
						subtitle={entry.channel.id}
						description="Verified {new Date(entry.channel.verifiedAt).toLocaleDateString('en-GB')}"
					>
						{#snippet status()}
							<Status tone={entry.channel.proof ? 'good' : 'plain'}>
								{entry.channel.proof ? 'Verified' : 'No proof'}
							</Status>
						{/snippet}

						<div class="mt-3 space-y-2">
							<p class="text-sm opacity-70">
								Sign-in always. The rest is yours to give, and to take back.
							</p>
							<div class="flex flex-wrap gap-2">
								{#each SHARED_USES as use (use.id)}
									<button
										type="button"
										title={use.says}
										aria-pressed={entry.channel.uses.includes(use.id)}
										disabled={busy === entry.channel.id}
										class="btn btn-sm {entry.channel.uses.includes(use.id)
											? 'preset-filled-primary-500'
											: 'preset-outlined-surface-500'}"
										onclick={() => void toggleUse(entry, use.id)}
									>
										{use.label}
									</button>
								{/each}
							</div>
						</div>
					</Item>
				{/each}
				{#if channelSays}
					<p class="text-sm text-warning-700-300" aria-live="polite">{channelSays}</p>
				{/if}
			{/if}
		</Section>

		<!-- Privacy -->
		<Section title="Privacy">
			<Item 
				icon="eye-off" 
				title="What we don't store" 
				description="Your privacy is protected"
			>
				<div class="text-sm mt-2 space-y-1">
					<div>✗ Your address in the clear — a channel is sealed, and the receipt is locked in your folder</div>
					<div>✗ Other people's addresses — contacts are hashed, never held whole</div>
					<div>✗ Message content</div>
					<div>✓ A hash, so an address can be checked and never worked out</div>
					<div>✓ Q's sender can open a channel sealed to it — that is how a code reaches you before you sign in</div>
				</div>
			</Item>
		</Section>

		<!-- About -->
		<Section title="About">
			<Item icon="info" title="Q" description="Passkey identity for inQbeta" />
		</Section>
	{/if}
</Page>
