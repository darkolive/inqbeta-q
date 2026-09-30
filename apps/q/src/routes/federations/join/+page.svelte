<script lang="ts">
	/*
	 * Where a federation link lands (ADR-Q-007 §4).
	 *
	 * The packet is in the #fragment — never sent to a server — and is one of:
	 *
	 *   an INVITATION     read the federation and its agreement, check it
	 *                     offline, and join by signing the agreement.
	 *   a JOINING, at the caretaker    a request to accept, or news that
	 *                     someone joined on an open invitation.
	 *   a JOINING, back at the member  the caretaker's acceptance, taken home.
	 */
	import { onMount } from 'svelte';
	import { Page, Section, Status, Empty } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import ShareLink from '$lib/components/ShareLink.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { JOIN_POLICIES, KNOWN_AS, consentSteps, type KnownAs } from '@inqbeta/q-core/federations';
	import { CARD_PICTURE_MOST } from '@inqbeta/q-core/membership';
	import { answersFrom } from '$lib/answers';
	import { checkInvitation, checkMembership, isInvitation, isJoining, isNotice, unpack, type Packet } from '@inqbeta/q-core/membership';
	import {
		isFederationRecord,
		isMembershipRecord,
		joinFromInvitation,
		receiveJoining,
		receiveNotice,
		recordFrom,
		takeHome,
		type FederationRecord,
		type MembershipRecord
	} from '$lib/federations';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	let packet = $state<Packet | null>(null);
	let unreadable = $state(false);
	let check = $state<{ ok: boolean; says: string } | null>(null);
	let membership = $state<{ state: string; says: string } | null>(null);

	onMount(async () => {
		const hash = location.hash;
		if (!hash || hash.length < 2) return void (unreadable = true);
		packet = await unpack(hash);
		if (!packet) return void (unreadable = true);
		if (isInvitation(packet)) check = await checkInvitation(packet);
		else if (isJoining(packet)) membership = await checkMembership(packet);
	});

	const fed = $derived(packet ? (isInvitation(packet) ? packet.founding.federation : packet.federation) : '');
	const found = $derived(ledger?.state === 'ready' ? ledger.found : []);
	const newest = <T extends { at: string }>(xs: T[]) => [...xs].sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
	const ownItem = $derived(newest(found.filter((f) => f.feature === 'federations' && f.key === `federation:${fed}`)));
	const mineItem = $derived(newest(found.filter((f) => f.key === `membership:${fed}`)));

	let own = $state<FederationRecord | null>(null);
	let mine = $state<MembershipRecord | null>(null);
	$effect(() => {
		const i = ownItem?.item;
		if (!i) return void (own = null);
		void recordFrom(i).then((r) => (own = isFederationRecord(r) ? r : null));
	});
	$effect(() => {
		const i = mineItem?.item;
		if (!i) return void (mine = null);
		void recordFrom(i).then((r) => (mine = isMembershipRecord(r) ? r : null));
	});

	let busy = $state(false);
	let said = $state<{ tone: 'good' | 'bad'; text: string; rules?: string[] } | null>(null);
	let back = $state<{ link: string; label: string; note: string } | null>(null);
	let done = $state(false);
	let called = $state('');

	/*
	 * JOINING, ONE THING AT A TIME (Darren, 2026-09-28: "a consent form that is
	 * done in neurodivergent steps rather than overwhelm").
	 *
	 *   what it is  →  each consent block, agreed on its own  →  how you'd like
	 *   to be known  →  sign.
	 *
	 * "Not for me" at any step stops, and nothing is signed.
	 */
	const steps = $derived(packet && isInvitation(packet) ? consentSteps(packet.manifest) : []);
	/* -1: what it is. 0…steps.length-1: consent. steps.length: how you're known. +1: sign. */
	let at = $state(-1);
	let agreed = $state<string[]>([]);
	let declined = $state(false);
	const total = $derived(steps.length + 2);
	const stepNo = $derived(at + 2);

	function agree() {
		const id = steps[at]?.id;
		if (id && !agreed.includes(id)) agreed = [...agreed, id];
		at += 1;
	}
	/* Going back un-agrees the step you return to, so every agreement is one you just gave. */
	function backOne() {
		const prev = at - 1;
		if (prev >= 0 && prev < steps.length) agreed = agreed.filter((a) => a !== steps[prev].id);
		at = Math.max(-1, prev);
	}

	/* How you'd like to be known — your choice, and part of what you sign. */
	let knownAs = $state<KnownAs>('name');
	let cardName = $state('');
	let picture = $state<string | null>(null);
	let pictureSays = $state('');
	let prefilled = false;
	$effect(() => {
		if (prefilled || ledger?.state !== 'ready' || !identity) return;
		prefilled = true;
		const sets = ledger.found.filter((f) => f.kind === 'answers');
		void Promise.all(sets.map((f) => answersFrom(f.item))).then((list) => {
			const mine = list.filter((a) => a && a.did === identity?.did).sort((a, b) => b!.at.localeCompare(a!.at));
			const called = mine.map((a) => a!.answers['q:person/called']?.value).find((v) => typeof v === 'string' && v.trim());
			if (called && !cardName) cardName = String(called);
		});
	});

	/* A picture, made small here: 96 pixels square, so it fits in a link. */
	async function choosePicture(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		pictureSays = '';
		if (!file) return;
		try {
			const bitmap = await createImageBitmap(file);
			const side = Math.min(bitmap.width, bitmap.height);
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 96;
			canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 96, 96);
			let url = canvas.toDataURL('image/webp', 0.8);
			if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.8);
			if (url.length > CARD_PICTURE_MOST) return void (pictureSays = 'That picture is too detailed to send. Try another.');
			picture = url;
		} catch {
			pictureSays = 'That file could not be read as a picture.';
		}
	}
	const knownReady = $derived(knownAs === 'anonymous' || (cardName.trim() && (knownAs === 'name' || picture)));

	async function join() {
		if (!identity || !packet || !isInvitation(packet)) return;
		busy = true;
		said = null;
		const out = await joinFromInvitation(identity, packet, {
			agreed,
			knownAs,
			card: knownAs === 'anonymous' ? undefined : { name: cardName, ...(knownAs === 'name-and-picture' && picture ? { picture } : {}) }
		});
		busy = false;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says, rules: 'rules' in out ? out.rules : undefined });
		done = true;
		await refreshLedger();
		back =
			out.state === 'member'
				? {
						link: out.link,
						label: 'Let the caretaker know',
						note: `You are a member of ${packet.founding.name}. Send this to the caretaker so you appear in their list.`
					}
				: {
						link: out.link,
						label: 'Send this to the caretaker',
						note: `Your request to join ${packet.founding.name} is signed. The caretaker opens this link to accept you, and sends one back.`
					};
		said = { tone: 'good', text: out.state === 'member' ? 'Joined.' : 'Asked.' };
	}

	async function receive() {
		if (!identity || !own || !packet || !isJoining(packet)) return;
		busy = true;
		said = null;
		const out = await receiveJoining(identity, own, packet, called);
		busy = false;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says, rules: 'rules' in out ? out.rules : undefined });
		done = true;
		await refreshLedger();
		said = { tone: 'good', text: out.accepted ? 'Accepted — they are a member.' : 'Added to your members.' };
		if (out.link) back = { link: out.link, label: 'Send this back to them', note: 'Opening it puts your acceptance in their own folder.' };
	}

	async function keepNotice() {
		if (!mine || !packet || !isNotice(packet)) return;
		busy = true;
		said = null;
		const out = await receiveNotice(mine, packet);
		busy = false;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says });
		done = true;
		await refreshLedger();
		said = { tone: 'good', text: 'Kept with your membership.' };
	}

	async function takeItHome() {
		if (!mine || !packet || !isJoining(packet)) return;
		busy = true;
		said = null;
		const out = await takeHome(mine, packet);
		busy = false;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says });
		done = true;
		await refreshLedger();
		said = { tone: 'good', text: 'You are a member now.' };
	}

	const onDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<svelte:head><title>Federation link — Q</title></svelte:head>

<Page title={packet && isInvitation(packet) ? `Join ${packet.founding.name}` : 'A federation link'} lead="Everything here is checked on this device. Nothing about it was sent to a server.">
	{#if unreadable}
		<Empty icon="federations" title="This link can’t be read" description="It may have been cut short when it was copied. Ask for it again." />
	{:else if !packet}
		<p class="opacity-60">Reading the link…</p>
	{:else if !identity}
		<SignIn />
	{:else}
		{#if said}
			<div class="card p-4 mb-6 {said.tone === 'good' ? 'preset-tonal-success' : 'preset-tonal-error'}" role="status">
				<p>{said.text}</p>
				{#if said.rules?.length}<p class="role-token text-xs mt-2">{said.rules.join(' · ')}</p>{/if}
			</div>
		{/if}

		{#if isInvitation(packet)}
			{@const inv = packet}
			{@const c = inv.manifest.constitution}
			{#if own}
				<p class="card preset-tonal p-4">This is your own federation’s invitation.</p>
			{:else if mine && !mine.left && !done}
				<p class="card preset-tonal p-4">You have already joined {inv.founding.name}. <a class="anchor" href={`/federations/one?id=${encodeURIComponent(fed)}`}>Open it</a></p>
			{:else if declined}
				<div class="card preset-tonal p-6 flex flex-col gap-3">
					<p class="text-lg font-bold">Nothing was signed.</p>
					<p>You haven’t joined, and {inv.founding.name} has not been told anything. You can close this page.</p>
					<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => { declined = false; at = -1; agreed = []; }}>Start again</button>
				</div>
			{:else if !done}
				<p class="text-sm mb-3" aria-live="polite">Step {stepNo} of {total}</p>
				<progress class="progress mb-6" value={stepNo} max={total}></progress>

				{#if at === -1}
					<div class="card preset-outlined-surface-200-800 p-6 flex flex-col gap-4">
						{#if check}
							<div class="flex flex-wrap items-center gap-3">
								<Status tone={check.ok ? 'good' : 'bad'}>{check.ok ? 'Checked' : 'Does not check'}</Status><span class="text-sm">{check.says}</span>
							</div>
						{/if}
						<p class="text-2xl font-bold">{inv.founding.name}</p>
						<p class="text-lg">{c.purpose}</p>
						<p>{JOIN_POLICIES.find((p) => p.id === c.joinPolicy)?.means}{inv.offer.for ? ` This invitation was made for ${inv.offer.for}.` : ''} It runs out on {onDay(new Date(inv.offer.exp * 1000).toISOString())}.</p>
						<p>We’ll go through what joining means one thing at a time — {steps.length} {steps.length === 1 ? 'thing' : 'things'} to agree to, then how you’d like to be known. Nothing is signed until the end.</p>
						<div class="flex flex-wrap gap-3">
							<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!check?.ok} onclick={() => (at = 0)}>Start</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (declined = true)}>Not for me</button>
						</div>
					</div>
				{:else if at < steps.length}
					{@const step = steps[at]}
					<div class="card preset-outlined-surface-200-800 p-6 flex flex-col gap-4">
						<p class="text-2xl font-bold">{step.title}</p>
						{#if step.id === 'principles'}
							<ul class="list-disc pl-6 space-y-2 text-lg">
								{#each step.says.split(/(?<=\.)\s+/) as line (line)}<li>{line}</li>{/each}
							</ul>
						{:else}
							<p class="text-lg whitespace-pre-line">{step.says}</p>
						{/if}
						<div class="flex flex-wrap gap-3">
							<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={agree}>I agree</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={backOne}>Back</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (declined = true)}>Not for me</button>
						</div>
					</div>
				{:else if at === steps.length}
					<div class="card preset-outlined-surface-200-800 p-6 flex flex-col gap-4">
						<p class="text-2xl font-bold">How would you like to be known?</p>
						<p>Only the caretaker can open this. It is sealed to {inv.founding.name}, and it carries exactly what you choose here — nothing else.</p>
						<div class="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="How you would like to be known">
							{#each KNOWN_AS as k (k.id)}
								<button type="button" role="radio" aria-checked={knownAs === k.id}
									class="card p-4 text-left min-h-11 {knownAs === k.id ? 'preset-filled-primary-500' : 'preset-outlined-surface-200-800'}"
									onclick={() => (knownAs = k.id)}>
									<span class="block font-bold">{k.called}</span>
									<span class="block text-sm mt-1">{k.means}</span>
								</button>
							{/each}
						</div>
						{#if knownAs !== 'anonymous'}
							<label class="label max-w-sm">
								<span class="label-text">Your name, as they’ll see it</span>
								<input class="input" type="text" maxlength="80" bind:value={cardName} />
							</label>
						{/if}
						{#if knownAs === 'name-and-picture'}
							<div class="flex flex-wrap items-center gap-4">
								{#if picture}<img src={picture} alt="You, as they’ll see you" class="size-24 rounded-full" />{/if}
								<label class="label">
									<span class="label-text">{picture ? 'Choose a different picture' : 'Choose a picture'}</span>
									<input class="input" type="file" accept="image/*" onchange={choosePicture} />
								</label>
							</div>
							{#if pictureSays}<p class="text-sm">{pictureSays}</p>{/if}
						{/if}
						<div class="flex flex-wrap gap-3">
							<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!knownReady} onclick={() => (at += 1)}>Next</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={backOne}>Back</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (declined = true)}>Not for me</button>
						</div>
					</div>
				{:else}
					<div class="card preset-outlined-surface-200-800 p-6 flex flex-col gap-4">
						<p class="text-2xl font-bold">Ready to sign</p>
						<p>You agreed to:</p>
						<ul class="list-disc pl-6 space-y-1">{#each steps as st (st.id)}<li>{st.title}</li>{/each}</ul>
						<p>
							You’ll be known as:
							<strong>{knownAs === 'anonymous' ? 'an anonymous member' : knownAs === 'name' ? cardName.trim() : `${cardName.trim()}, with your picture`}</strong>
						</p>
						{#if knownAs === 'name-and-picture' && picture}<img src={picture} alt="" class="size-16 rounded-full" />{/if}
						<p class="text-sm">Signing records exactly this, with your key. You can leave at any time, and you keep everything you sign.</p>
						<div class="flex flex-wrap gap-3">
							<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy} onclick={join}>
								{busy ? 'Signing…' : inv.offer.admits ? 'Sign and join' : 'Sign and ask to join'}
							</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={backOne}>Back</button>
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (declined = true)}>Not for me</button>
						</div>
					</div>
				{/if}
			{/if}
		{:else if isNotice(packet)}
			{@const n = packet}
			{#if mine && n.member === identity.did}
				<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
					{#if n.event === 'federation.suspended'}
						<p class="font-bold">{mine.founding.name} has suspended you until {onDay(n.until)}.</p>
						<p>{n.says} ({n.clause})</p>
						<p class="text-sm">You are still a member, you can still leave, and it ends on its own.</p>
					{:else if n.event === 'federation.suspension-lifted'}
						<p class="font-bold">{mine.founding.name} has lifted your suspension.</p>
					{:else}
						<p class="font-bold">{mine.founding.name} has removed you.</p>
						<p>{n.says} ({n.clause})</p>
						<p class="text-sm">Everything you did before stays valid, and you keep every receipt you had.</p>
					{/if}
					{#if !done}
						<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy} onclick={keepNotice}>
							{busy ? 'Keeping…' : 'Keep this with my membership'}
						</button>
					{/if}
				</div>
			{:else if own}
				<p class="card preset-tonal p-4">This is a decision your federation made. Send it to the member it is about.</p>
			{:else}
				<Empty icon="federations" title="This link is for someone else" description="It is about a membership that isn't in your folder here." />
			{/if}
		{:else if isJoining(packet)}
			{@const j = packet}
			{#if own}
				<div class="mb-6 flex flex-wrap items-center gap-3">
					<Status tone={membership?.state === 'invalid' ? 'bad' : membership?.state === 'member' ? 'good' : 'waiting'}>
						{membership?.state === 'member' ? 'Joined' : membership?.state === 'waiting' ? 'Asking to join' : 'Does not check'}
					</Status>
					<span class="text-sm">{membership?.says}</span>
				</div>
				<p class="mb-4">
					<span class="role-token text-xs break-all">{j.member}</span>
					{membership?.state === 'waiting' ? 'asks to join' : 'joined'} {own.founding.name} on {onDay(j.at)}.
				</p>
				{#if !done && membership?.state !== 'invalid'}
					<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
						{#if j.knownAs === 'anonymous'}
							<p>They chose to be anonymous. You’ll see them as an anonymous member.</p>
						{:else if j.knownAs}
							<p>They chose to be known {j.knownAs === 'name' ? 'by their name' : 'by their name and picture'}. Their card opens with the federation’s key when you {membership?.state === 'waiting' ? 'accept' : 'add'} them.</p>
						{:else}
							<label class="label max-w-sm">
								<span class="label-text">Who is this? (a name for your list, optional)</span>
								<input class="input" type="text" bind:value={called} />
							</label>
						{/if}
						<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy} onclick={receive}>
							{busy ? 'Signing…' : membership?.state === 'waiting' ? 'Accept them' : 'Add to members'}
						</button>
					</div>
				{/if}
			{:else if mine && j.member === identity.did}
				{#if !done}
					<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
						<p>The caretaker of {mine.founding.name} has answered your request.</p>
						<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy || membership?.state !== 'member'} onclick={takeItHome}>
							{busy ? 'Keeping…' : 'Keep it — I’m a member'}
						</button>
					</div>
				{/if}
			{:else}
				<Empty icon="federations" title="This link is for someone else" description="It is about a federation you neither look after nor belong to here." />
			{/if}
		{/if}

		{#if back}
			<div class="mt-6"><ShareLink link={back.link} label={back.label} note={back.note} /></div>
		{/if}
		{#if done}
			<a class="btn preset-tonal-surface min-h-11 mt-6" href={`/federations/one?id=${encodeURIComponent(fed)}`}>Open the federation</a>
		{/if}
	{/if}
</Page>
