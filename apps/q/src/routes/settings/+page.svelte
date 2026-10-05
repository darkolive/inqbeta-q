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
	import BackupChoices from '$lib/components/BackupChoices.svelte';
	import { payoutAccountsOf, setPayoutAccount } from '$lib/money';

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

	/*
	 * Your cashing-out account (ADR-Q-035): where cashing out pays, as a
	 * standing order. Changing it is a receipt you sign, naming the one it
	 * replaces, so who changed it, and when, is always on record.
	 */
	const accounts = $derived(identity ? payoutAccountsOf(ledger, identity.did) : []);
	const account = $derived(accounts.at(-1) ?? null);
	let acct = $state({ name: '', sort: '', number: '' });
	let acctSays = $state<{ good: boolean; text: string } | null>(null);
	let acctBusy = $state(false);
	let acctOpen = $state(false);
	async function saveAccount() {
		if (!identity) return;
		acctBusy = true;
		acctSays = null;
		const out = await setPayoutAccount(identity, ledger, acct);
		acctBusy = false;
		acctSays = out.ok ? { good: true, text: `Saved: cashing out now pays to the account ending ${out.account.content.ends}.` } : { good: false, text: out.says };
		if (out.ok) {
			acct = { name: '', sort: '', number: '' };
			acctOpen = false;
		}
	}

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
 aria-label="Email address"
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
 aria-label="Email address"
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
		<Section id="cashing-out" title="Cashing out" description="Where your credits are paid when you cash them out: one account, as a standing order. Someone with your phone can’t send money anywhere new; changing the account is signed by you, and kept.">
			<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-4 max-w-xl">
				{#if account}
					<p>Paid to the account ending <strong class="tabular-nums">{account.content.ends}</strong>, set {new Date(account.content.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}, signed by you.</p>
				{:else}
					<p><Status tone="needs-you">Not set</Status> Set an account before you cash out.</p>
				{/if}
				{#if acctOpen || !account}
					<label class="label"><span class="label-text">Name on the account</span><input class="input" autocomplete="off" bind:value={acct.name} /></label>
					<div class="flex flex-wrap gap-4">
						<label class="label"><span class="label-text">Sort code</span><input class="input max-w-36 tabular-nums" inputmode="numeric" autocomplete="off" placeholder="00-00-00" bind:value={acct.sort} /></label>
						<label class="label"><span class="label-text">Account number</span><input class="input max-w-44 tabular-nums" inputmode="numeric" autocomplete="off" placeholder="8 digits" bind:value={acct.number} /></label>
					</div>
					<p class="text-sm text-surface-700-300">Only the last four digits are kept to show; the rest is kept as a fingerprint, so a payout can be checked against it.</p>
					<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={acctBusy} onclick={() => void saveAccount()}>{acctBusy ? 'Signing…' : account ? 'Sign and change the account' : 'Sign and save'}</button>
				{:else}
					<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => (acctOpen = true)}>Change the account</button>
				{/if}
				{#if acctSays}<p><Status tone={acctSays.good ? 'good' : 'bad'}>{acctSays.good ? 'Done' : 'Not done'}</Status> {acctSays.text}</p>{/if}
				{#if accounts.length > 1}
					<details class="text-sm">
						<summary class="cursor-pointer select-none text-surface-700-300">Every change ({accounts.length})</summary>
						<ul class="mt-2 flex flex-col gap-1">
							{#each [...accounts].reverse() as a (a.contentHash)}
								<li>Ending {a.content.ends} · {new Date(a.content.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · signed by you{a.content.replaces ? ', replacing the one before' : ', the first'}</li>
							{/each}
						</ul>
					</details>
				{/if}
			</div>
		</Section>

		<Section title="Backups" description="When each copy of your vault happens. Your vault is sealed before any copy leaves this device.">
			<BackupChoices />
		</Section>

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
