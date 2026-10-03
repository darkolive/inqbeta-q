<script lang="ts">
	/*
	 * Setting up your host, in cards (ADR-Q-018 §2). One question per card,
	 * each with why it's asked:
	 *
	 *   1. You           your passkey and where your vault lives. You'll be the
	 *                    founder.
	 *   2. Your host     its name, one sentence on what it's for, its logo.
	 *   3. Agreement     what everyone signs when they join. The principles no
	 *                    vote can change are shown, never editable.
	 *   4. Services      email, voice, AI: nothing needed now.
	 *   5. Look at it    the host as people will see it, then Found it. The one
	 *                    step that can't be undone, so it is its own button.
	 *   6. Way back in   a recovery card before anything goes live, because a
	 *                    localhost passkey only opens localhost.
	 */
	import { Steps } from '@skeletonlabs/skeleton-svelte';
	import StepWriter from './writer/StepWriter.svelte';
	import { Icon } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder, chooseFolder, wakeFolder, folderSupported, type FolderState } from '@inqbeta/q-core/folder';
	import { PRINCIPLES } from '@inqbeta/q-core/federations';
	import SignInBlock from './SignInBlock.svelte';
	import WaysBackIn from './WaysBackIn.svelte';
	import { foundHost, logoFrom } from '$lib/host-setup';
	import { refreshLedger } from '$lib/ledger';

	let { onDone }: { onDone: () => void } = $props();

	/** A starting point, not Incubator's final words: Darren writes those. */
	const DRAFT_AGREEMENT =
		'We agree to be kind to each other, to say plainly when we disagree, to look after what we share, and to use what this host offers respectfully.';

	let step = $state(0);
	let says = $state('');
	let busy = $state(false);

	/* ---- 1. You ---- */
	let identity = $state<Identity | null>(null);
	$effect(() => watch((id) => (identity = id)));
	let folder = $state<FolderState>({ kind: 'checking' });
	$effect(() => watchFolder((f) => (folder = f)));
	const ready = $derived(folder.kind === 'ready');
	async function choose() {
		says = '';
		const out = folder.kind === 'asleep' ? await wakeFolder() : await chooseFolder();
		if (!out.ok && !out.cancelled) says = out.says;
		await refreshLedger();
	}

	/* ---- 2. Your host ---- */
	let name = $state('');
	let purpose = $state('');
	let logo = $state<string | undefined>(undefined);
	async function pickLogo(e: Event) {
		says = '';
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!f) return;
		const out = await logoFrom(f);
		if (out.ok) logo = out.dataUrl;
		else says = out.says;
	}

	/* ---- 3. Agreement ---- */
	let agreement = $state(DRAFT_AGREEMENT);

	/* ---- 5. Look at it, then found it ---- */
	let founded = $state(false);
	async function found() {
		if (!identity) return;
		busy = true;
		says = '';
		const out = await foundHost(identity, { name, purpose, agreement, logo });
		busy = false;
		if (!out.ok) return void (says = out.says);
		founded = true;
		await refreshLedger();
	}

	const STEPS = [
		{ title: 'You', says: 'You’ll be the founder of this host. Your passkey signs its founding.' },
		{ title: 'Your host', says: 'What it’s called and what it’s for. People see these first.' },
		{ title: 'Agreement', says: 'What everyone signs when they join. Write it in your own words.' },
		{ title: 'Services', says: 'Email, voice and AI. Nothing is needed now.' },
		{ title: 'Look at it', says: 'Your host, as people will see it.' },
		{ title: 'Way back in', says: 'A passkey made here only opens it here. Keep a second way in.' }
	];
	const canGoOn = $derived(
		step === 0 ? !!identity && ready : step === 1 ? !!name.trim() && !!purpose.trim() : step === 2 ? !!agreement.trim() : step === 4 ? founded : true
	);
	/* Forward one card at a time; back freely, except past the founding once it's signed. */
	const mayGoTo = (to: number) => (to < step ? !(founded && to < 4) : to === step + 1 && canGoOn);
</script>

<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6 flex flex-col gap-6">
	<StepWriter steps={STEPS} bind:step ready={!!canGoOn} {mayGoTo} {busy} finishLabel="Done" onFinish={onDone} {says}>

		<!-- 1. You -->
		<Steps.Content index={0}>
			<div class="flex flex-col gap-4 max-w-xl">
				{#if !identity}
					<SignInBlock stay title="Make your passkey" line="This passkey founds your host." />
				{:else}
					<div class="card preset-tonal-success p-4 flex items-start gap-3">
						<Icon name="check" class="mt-0.5 shrink-0" />
						<div>
							<p class="font-bold">You’re signed in</p>
							<p class="text-sm">This passkey will sign your host’s founding.</p>
						</div>
					</div>
					{#if folder.kind === 'ready'}
						<div class="card preset-tonal-success p-4 flex items-start gap-3">
							<Icon name="check" class="mt-0.5 shrink-0" />
							<div>
								<p class="font-bold">{folder.inBrowser ? 'Your vault is in this browser' : `Your vault is in your ${folder.name} folder`}</p>
								<p class="text-sm">Your host’s founding is kept there, locked to your passkey.</p>
							</div>
						</div>
					{:else if folder.kind === 'asleep'}
						<p>Your <strong>{folder.name}</strong> folder needs allowing again.</p>
						<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" onclick={() => void choose()}>Allow my folder</button>
					{:else if folderSupported()}
						<p>Choose a folder for your vault: “Q” in Documents, say. Your host’s founding is kept there.</p>
						<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" onclick={() => void choose()}><Icon name="files" size={16} /> Choose a folder</button>
					{:else}
						<p class="opacity-70">Getting this browser ready…</p>
					{/if}
				{/if}
			</div>
		</Steps.Content>

		<!-- 2. Your host -->
		<Steps.Content index={1}>
			<div class="flex flex-col gap-4 max-w-xl">
				<label class="label">
					<span class="label-text font-bold">What’s the name of your host?</span>
					<input class="input min-h-11" bind:value={name} maxlength="60" />
					<span class="text-sm opacity-70">Ours is Incubator. Members see this when they join.</span>
				</label>
				<label class="label">
					<span class="label-text font-bold">What is it for, in one sentence?</span>
					<input class="input min-h-11" bind:value={purpose} maxlength="160" />
				</label>
				<div class="flex flex-col gap-2">
					<span class="font-bold">Your logo</span>
					<div class="flex items-center gap-4">
						<div class="size-20 shrink-0 rounded-base preset-tonal-surface flex items-center justify-center overflow-hidden">
							{#if logo}<img src={logo} alt="Your logo" class="size-full object-contain" />{:else}<Icon name="image" />{/if}
						</div>
						<label class="btn preset-tonal min-h-11 cursor-pointer">
							<Icon name="image" size={16} /> {logo ? 'Change it' : 'Add your logo'}
							<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="sr-only" onchange={(e) => void pickLogo(e)} />
						</label>
					</div>
					<span class="text-sm opacity-70">Optional. You can add it later.</span>
				</div>
			</div>
		</Steps.Content>

		<!-- 3. Agreement -->
		<Steps.Content index={2}>
			<div class="flex flex-col gap-4 max-w-xl">
				<label class="label">
					<span class="label-text font-bold">Everyone who joins signs this</span>
					<textarea class="textarea" rows="4" bind:value={agreement}></textarea>
					<span class="text-sm opacity-70">This is a starting draft. Change it to your own words.</span>
				</label>
				<div class="card preset-tonal-surface p-4 flex flex-col gap-2">
					<p class="font-bold">These come with every host, and can’t be changed</p>
					<ul class="list-disc pl-5 text-sm flex flex-col gap-1">
						{#each PRINCIPLES as p (p.id)}<li>{p.says}</li>{/each}
					</ul>
				</div>
			</div>
		</Steps.Content>

		<!-- 4. Services -->
		<Steps.Content index={3}>
			<div class="flex flex-col gap-4 max-w-xl">
				<p>Your host can send email, read aloud and use AI. Each needs a key from the company that provides it. You’ll add them later on your host’s <strong>Services</strong> page.</p>
				<ul class="flex flex-col gap-2">
					{#each [{ n: 'Email', w: 'Sign-in codes and messages. Resend.' }, { n: 'Voice', w: 'Reading aloud. ElevenLabs.' }, { n: 'AI', w: 'Help writing and checking. Vercel AI Gateway.' }] as s (s.n)}
						<li class="card preset-tonal-surface p-3"><p class="font-bold">{s.n}</p><p class="text-sm opacity-80">{s.w}</p></li>
					{/each}
				</ul>
				<p class="text-sm opacity-70">Keys only ever go into this computer, never into a web page. Press Next.</p>
			</div>
		</Steps.Content>

		<!-- 5. Look at it -->
		<Steps.Content index={4}>
			<div class="flex flex-col gap-4 max-w-xl">
				<div class="card preset-outlined-surface-200-800 p-6 flex flex-col items-center text-center gap-3">
					{#if logo}<img src={logo} alt="" class="h-20 w-auto object-contain" />{/if}
					<p class="h3">{name || 'Your host'}</p>
					<p class="opacity-80">{purpose}</p>
					<span class="btn preset-filled-primary-500 min-h-11 pointer-events-none" aria-hidden="true">Join {name}</span>
				</div>
				{#if founded}
					<div class="card preset-tonal-success p-4 flex items-start gap-3">
						<Icon name="check" class="mt-0.5 shrink-0" />
						<div>
							<p class="font-bold">{name} is founded</p>
							<p class="text-sm">You’re its founder and first member. Its host file is saved in this copy, ready for when it goes live.</p>
						</div>
					</div>
				{:else}
					<p class="text-sm">Happy with it? Founding signs it with your passkey. You can change the words and logo later, but not the founding.</p>
					<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy || !identity} onclick={() => void found()}>
						{busy ? 'Founding… touch your passkey' : `Found ${name}`}
					</button>
				{/if}
			</div>
		</Steps.Content>

		<!-- 6. Way back in -->
		<Steps.Content index={5}>
			<div class="flex flex-col gap-4 max-w-2xl">
				<p>When {name} goes live, you’ll open it with a recovery card, then add a passkey there. It’s still you, so you’re still the founder.</p>
				<WaysBackIn />
			</div>
		</Steps.Content>
	</StepWriter>
</div>
