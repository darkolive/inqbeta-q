<script lang="ts">
	/*
	 * Write a message (Darren, 4 October 2026): "sending a message should be
	 * the first thing, and then who to comes after … add a file, add a
	 * picture … a link … make it really enjoyable as a send-a-message card."
	 *
	 * Two steps, one thing each:
	 *   1. Write: your words, and what you add to them — pictures, a file, a
	 *      link, a voice note, a card, a place — each a big picture to tap.
	 *      What you've added sits in the card as you'd see it arrive.
	 *   2. Who it's for: faces from your address book. Tap as many as you
	 *      like; each gets their own sealed copy.
	 * In a conversation the person is already known, so it's one step.
	 */
	import { Icon, type IconName } from '@inqbeta/q-ui';
	import { attach, attachmentProblem, linkProblem, tidyLink, sizeText, weightOf, MOST_ATTACHMENTS, type Attachment, type Piece } from '@inqbeta/q-core/attachments';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import type { Ledger } from '$lib/ledger';
	import type { Person } from '$lib/people';
	import { sendMessage } from '$lib/messages';
	import { shrinkPicture, cardOf, namesText } from '$lib/attachments';
	import { myCardDetails } from '$lib/mycard';
	import { myInbox } from '$lib/messages';
	import { canRecord, startRecording, tooBig, lengthOf, MOST_SECONDS, type Recording } from '$lib/voicemail';
	import AttachmentView from './AttachmentView.svelte';

	let {
		identity,
		ledger,
		people,
		to = null,
		onSent = () => {}
	}: { identity: Identity; ledger: Ledger | null; people: Person[]; to?: Person | null; onSent?: (names: string[]) => void } = $props();

	type Step = 'write' | 'who' | 'sending' | 'sent';
	let step = $state<Step>('write');
	let text = $state('');

	/* What's been added, with the bytes and pieces each one travels as. */
	type Added = { a: Attachment; pieces: Piece[]; bytes?: Uint8Array<ArrayBuffer>; id: string };
	let added = $state<Added[]>([]);
	let voice = $state<Recording | null>(null);
	let says = $state('');
	const weight = $derived(weightOf(added.map((x) => x.a), voice?.audio.length ?? 0));
	const hasSomething = $derived(!!text.trim() || added.length > 0 || !!voice);

	/* The tray of things to add. One open at a time. */
	type Tool = 'picture' | 'file' | 'link' | 'voice' | 'card' | 'place';
	const TOOLS: { id: Tool; word: string; icon: IconName; shape: string }[] = [
		{ id: 'picture', word: 'Picture', icon: 'image', shape: 'rounded-tl-[40%]' },
		{ id: 'file', word: 'File', icon: 'paperclip', shape: '' },
		{ id: 'link', word: 'Link', icon: 'link', shape: 'rounded-tr-[40%]' },
		{ id: 'voice', word: 'Voice note', icon: 'mic', shape: 'rounded-bl-[40%]' },
		{ id: 'card', word: 'A card', icon: 'card', shape: '' },
		{ id: 'place', word: 'A place', icon: 'map', shape: 'rounded-br-[40%]' }
	];
	let tool = $state<Tool | null>(null);
	let pictureInput = $state<HTMLInputElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	function choose(t: Tool) {
		says = '';
		if (added.length >= MOST_ATTACHMENTS && t !== 'voice') return void (says = `Up to ${MOST_ATTACHMENTS} things in one message.`);
		if (t === 'picture') return pictureInput?.click();
		if (t === 'file') return fileInput?.click();
		tool = tool === t ? null : t;
	}
	const newId = () => crypto.randomUUID().slice(0, 8);

	let working = $state(false);
	async function addFiles(list: FileList | null, kind: 'picture' | 'file') {
		if (!list?.length) return;
		working = true;
		says = '';
		for (const f of [...list].slice(0, MOST_ATTACHMENTS - added.length)) {
			try {
				const prepared = kind === 'picture' && f.type.startsWith('image/') ? await shrinkPicture(f) : { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) };
				const out = await attach(kind === 'picture' && f.type.startsWith('image/') ? 'picture' : 'file', prepared);
				if ('says' in out) says = out.says;
				else added = [...added, { a: out.attachment, pieces: out.pieces, bytes: prepared.bytes, id: newId() }];
			} catch {
				says = `${f.name} couldn’t be read.`;
			}
		}
		working = false;
		if (pictureInput) pictureInput.value = '';
		if (fileInput) fileInput.value = '';
	}
	const remove = (id: string) => (added = added.filter((x) => x.id !== id));

	/* Link */
	let linkUrl = $state('');
	let linkTitle = $state('');
	const linkSays = $derived(linkUrl.trim() ? linkProblem(tidyLink(linkUrl)) : null);
	function addLink() {
		const url = tidyLink(linkUrl);
		if (linkProblem(url)) return;
		added = [...added, { a: { kind: 'link', url, ...(linkTitle.trim() ? { title: linkTitle.trim() } : {}) }, pieces: [], id: newId() }];
		linkUrl = linkTitle = '';
		tool = null;
	}

	/* Place */
	let placeWords = $state('');
	let pin = $state<{ lat: number; lng: number } | null>(null);
	let finding = $state(false);
	function findMe() {
		if (!navigator.geolocation) return void (says = 'This device can’t tell where it is.');
		finding = true;
		navigator.geolocation.getCurrentPosition(
			(p) => {
				pin = { lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5 };
				finding = false;
			},
			() => {
				finding = false;
				says = 'Q wasn’t allowed to know where you are. You can type the place instead.';
			},
			{ enableHighAccuracy: true, timeout: 15_000 }
		);
	}
	function addPlace() {
		const a: Attachment = { kind: 'place', ...(pin ?? {}), ...(placeWords.trim() ? { label: placeWords.trim() } : {}) };
		if (attachmentProblem(a)) return;
		added = [...added, { a, pieces: [], id: newId() }];
		placeWords = '';
		pin = null;
		tool = null;
	}

	/* Card */
	async function addMyCard() {
		const details = await myCardDetails(identity, ledger);
		const inbox = (await myInbox(identity))?.id;
		added = [...added, { a: cardOf({ did: identity.did, details, inbox }), pieces: [], id: newId() }];
		tool = null;
	}
	function addTheirCard(p: Person) {
		added = [...added, { a: cardOf(p), pieces: [], id: newId() }];
		tool = null;
	}

	/* Voice note */
	let recorder = $state<Awaited<ReturnType<typeof startRecording>> | null>(null);
	let recSeconds = $state(0);
	async function record() {
		says = '';
		try {
			recSeconds = 0;
			recorder = await startRecording({ onTick: (s) => (recSeconds = s), onLimit: () => void stopRecording() });
		} catch {
			says = 'Q wasn’t allowed to use the microphone.';
		}
	}
	async function stopRecording() {
		if (!recorder) return;
		const r = await recorder.stop();
		recorder = null;
		if (tooBig(r)) return void (says = 'That voice note is too long to send. Try a shorter one.');
		voice = r;
		tool = null;
	}

	/* Who it's for */
	const reachable = $derived(people.filter((p) => p.inbox && p.did !== identity.did));
	let chosen = $state<string[]>([]);
	const toggle = (did: string) => (chosen = chosen.includes(did) ? chosen.filter((d) => d !== did) : [...chosen, did]);
	const recipients = $derived(to ? [to] : reachable.filter((p) => chosen.includes(p.did)));
	const first = (p: Person) => p.name.split(' ')[0];

	/* Send */
	let progress = $state({ done: 0, of: 1 });
	let result = $state<{ reached: string[]; missed: { name: string; says: string }[] } | null>(null);
	async function send() {
		if (!hasSomething || !recipients.length) return;
		step = 'sending';
		says = '';
		const files = added.filter((x) => x.bytes && x.a.sha256 && x.pieces.length).map((x) => ({ sha256: x.a.sha256!, name: x.a.name!, type: x.a.type!, bytes: x.bytes! }));
		result = await sendMessage(
			recipients,
			{ text: text.trim(), attachments: added.map((x) => x.a), ...(voice ? { audio: voice.audio, seconds: voice.seconds } : {}) },
			added.flatMap((x) => x.pieces),
			files,
			(done, of) => (progress = { done, of })
		);
		if (result.reached.length) onSent(result.reached);
		if (to && !result.missed.length) return reset();
		step = 'sent';
	}
	function reset() {
		text = '';
		added = [];
		voice = null;
		chosen = [];
		result = null;
		tool = null;
		step = 'write';
	}
</script>

<section class="card preset-outlined-primary-500 bg-surface-50-950 p-4 sm:p-6 flex flex-col gap-5" aria-label="Write a message">
	{#if step === 'write'}
		{#if !to}
			<header class="flex items-center gap-3">
				<span class="rounded-full preset-filled-primary-500 size-10 flex items-center justify-center" aria-hidden="true"><Icon name="message" size={20} /></span>
				<div>
					<h2 class="h4">Write a message</h2>
					<p class="text-sm text-surface-700-300">Say it first. Choose who it’s for next.</p>
				</div>
			</header>
		{/if}

		<label class="label">
			<span class="label-text font-semibold">{to ? `To ${first(to)}` : 'Your message'}</span>
			<textarea class="textarea text-lg" rows={to ? 2 : 4} bind:value={text}></textarea>
		</label>

		<!-- What's in it: shown the way it will arrive. -->
		{#if added.length || voice}
			<div class="flex flex-col gap-3" aria-label="In this message">
				{#if added.some((x) => x.a.kind === 'picture')}
					<ul class="grid grid-cols-3 sm:grid-cols-4 gap-2">
						{#each added.filter((x) => x.a.kind === 'picture') as x (x.id)}
							<li class="relative">
								<AttachmentView a={x.a} compact />
								<button type="button" class="btn-icon btn-icon-sm preset-filled-surface-950-50 absolute top-1 right-1 rounded-full" aria-label="Take out {x.a.name}" onclick={() => remove(x.id)}><Icon name="close" size={14} /></button>
							</li>
						{/each}
					</ul>
				{/if}
				{#each added.filter((x) => x.a.kind !== 'picture') as x (x.id)}
					<div class="flex items-start gap-2">
						<div class="flex-1 min-w-0"><AttachmentView a={x.a} compact /></div>
						<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Take it out" onclick={() => remove(x.id)}><Icon name="close" size={18} /></button>
					</div>
				{/each}
				{#if voice}
					<div class="flex items-center gap-2">
						<div class="card preset-tonal-primary flex-1 flex items-center gap-3 p-3">
							<Icon name="mic" size={20} />
							<span class="font-semibold">Voice note · {lengthOf(voice.seconds)}</span>
							<audio controls src={voice.audio} class="max-w-full h-9 flex-1"></audio>
						</div>
						<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Take the voice note out" onclick={() => (voice = null)}><Icon name="close" size={18} /></button>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Add to it: six big pictures, one word each. -->
		<fieldset class="flex flex-col gap-3">
			<legend class="font-semibold mb-2 {to ? 'sr-only' : ''}">Add to it</legend>
			<div class="grid {to ? 'grid-cols-6 gap-2' : 'grid-cols-3 sm:grid-cols-6 gap-3'}">
				{#each TOOLS as t (t.id)}
					{@const on = tool === t.id || (t.id === 'voice' && !!recorder)}
					<button
						type="button"
						class="card rounded-base {to ? 'min-h-14 py-2' : `${t.shape} aspect-square min-h-20`} flex flex-col items-center justify-center gap-1 border-2 transition-colors
							{on ? 'preset-filled-primary-500 border-primary-500' : 'preset-tonal border-transparent hover:preset-filled-secondary-50-950'}"
						aria-pressed={on}
						disabled={working || (t.id === 'voice' && (!canRecord() || !!voice))}
						onclick={() => choose(t.id)}
					>
						<Icon name={t.icon} class={to ? 'size-6' : 'size-8'} stroke={2.5} />
						<span class="font-bold leading-tight {to ? 'text-xs' : 'text-sm'}">{t.word}</span>
					</button>
				{/each}
			</div>
			<input bind:this={pictureInput} type="file" accept="image/*" multiple class="sr-only" tabindex="-1" aria-hidden="true" onchange={(e) => void addFiles(e.currentTarget.files, 'picture')} />
			<input bind:this={fileInput} type="file" multiple class="sr-only" tabindex="-1" aria-hidden="true" onchange={(e) => void addFiles(e.currentTarget.files, 'file')} />
			{#if working}<p class="text-sm" aria-live="polite">Getting it ready…</p>{/if}

			{#if tool === 'link'}
				<div class="card preset-tonal-surface p-4 flex flex-col gap-3">
					<label class="label"><span class="label-text">The address</span><input class="input" inputmode="url" autocomplete="off" bind:value={linkUrl} /></label>
					<label class="label"><span class="label-text">What it is (if you like)</span><input class="input" bind:value={linkTitle} /></label>
					{#if linkSays}<p class="text-sm text-error-600-400">{linkSays}</p>{/if}
					<p class="text-xs text-surface-700-300">Q never opens the link to make a preview, so the site doesn’t learn who’s looking.</p>
					<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!linkUrl.trim() || !!linkSays} onclick={addLink}><Icon name="plus" size={18} /> Add the link</button>
				</div>
			{:else if tool === 'place'}
				<div class="card preset-tonal-surface p-4 flex flex-col gap-3">
					<button type="button" class="btn preset-tonal-primary min-h-11 self-start" disabled={finding} onclick={findMe}><Icon name="map" size={18} />{finding ? 'Finding you…' : pin ? `Pinned: ${pin.lat}, ${pin.lng}` : 'Use where I am'}</button>
					<label class="label"><span class="label-text">Or say where, in words</span><input class="input" bind:value={placeWords} /></label>
					<p class="text-xs text-surface-700-300">Only what you add here is shared, and only with who you send it to.</p>
					<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!pin && !placeWords.trim()} onclick={addPlace}><Icon name="plus" size={18} /> Add the place</button>
				</div>
			{:else if tool === 'card'}
				<div class="card preset-tonal-surface p-4 flex flex-col gap-3">
					<button type="button" class="btn preset-tonal-primary min-h-11 self-start" onclick={() => void addMyCard()}><Icon name="card" size={18} /> My card</button>
					{#if reachable.length}
						<p class="text-sm">Or pass on someone’s card, so they can link up:</p>
						<ul class="flex flex-wrap gap-2">
							{#each reachable as p (p.did)}
								<li><button type="button" class="chip preset-tonal min-h-11 gap-2" onclick={() => addTheirCard(p)}>
									{#if p.picture}<img src={p.picture} alt="" class="size-6 rounded-full object-cover" />{/if}{p.name}
								</button></li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else if tool === 'voice'}
				<div class="card preset-tonal-surface p-4 flex flex-col gap-3 items-start">
					{#if recorder}
						<p class="text-lg font-semibold tabular-nums" aria-live="polite">Recording · {lengthOf(recSeconds)}</p>
						<button type="button" class="btn preset-filled-error-500 min-h-11" onclick={() => void stopRecording()}>Stop</button>
					{:else}
						<p class="text-sm">Up to {lengthOf(MOST_SECONDS)}.</p>
						<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => void record()}><Icon name="mic" size={18} /> Start recording</button>
					{/if}
				</div>
			{/if}
		</fieldset>

		{#if says}<p class="text-sm card preset-tonal-warning p-3" aria-live="polite">{says}</p>{/if}

		<footer class="flex flex-wrap items-center gap-3 pt-2 border-t border-surface-200-800">
			<p class="text-sm text-surface-700-300 flex-1">{weight ? `${sizeText(weight)} to send. Free: inside the daily allowance.` : 'Words only: free.'}</p>
			{#if to}
				<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!hasSomething || !to.inbox || !!recorder} onclick={() => void send()}><Icon name="send" size={18} /> Send</button>
			{:else}
				<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!hasSomething || !!recorder} onclick={() => (step = 'who')}>Who’s it for? <Icon name="arrowRight" size={18} /></button>
			{/if}
		</footer>
	{:else if step === 'who'}
		<header class="flex items-center gap-3">
			<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Back to the message" onclick={() => (step = 'write')}><Icon name="arrowLeft" size={18} /></button>
			<div>
				<h2 class="h4">Who’s it for?</h2>
				<p class="text-sm text-surface-700-300">Tap everyone it should go to. Each gets their own sealed copy.</p>
			</div>
		</header>
		{#if !reachable.length}
			<p class="card preset-tonal-surface p-4">Nobody to write to yet. Link up with someone by sharing your card, then they’ll be here.</p>
		{:else}
			<ul class="grid grid-cols-3 sm:grid-cols-5 gap-3">
				{#each reachable as p (p.did)}
					{@const on = chosen.includes(p.did)}
					<li>
						<button type="button" class="w-full flex flex-col items-center gap-2 p-2 rounded-base border-2 transition-colors {on ? 'border-primary-500 preset-tonal-primary' : 'border-transparent hover:preset-tonal'}" aria-pressed={on} onclick={() => toggle(p.did)}>
							<span class="relative size-16 rounded-full overflow-hidden bg-surface-100-900 flex items-center justify-center">
								{#if p.picture}<img src={p.picture} alt="" class="size-full object-cover" />{:else}<span class="h4 opacity-70">{p.name.slice(0, 1)}</span>{/if}
								{#if on}<span class="absolute inset-0 bg-primary-500/60 flex items-center justify-center text-white"><Icon name="check" size={28} stroke={3} /></span>{/if}
							</span>
							<span class="text-sm font-semibold text-center leading-tight">{p.name}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		<footer class="flex flex-wrap items-center gap-3 pt-2 border-t border-surface-200-800">
			<p class="text-sm text-surface-700-300 flex-1">{weight ? `${sizeText(weight * Math.max(1, recipients.length))} in all. Free: inside the daily allowance.` : 'Words only: free.'}</p>
			<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={!recipients.length} onclick={() => void send()}>
				<Icon name="send" size={18} />{recipients.length ? `Send to ${namesText(recipients.map(first))}` : 'Send'}
			</button>
		</footer>
	{:else if step === 'sending'}
		<div class="flex flex-col gap-3 py-6 items-center text-center" aria-live="polite">
			<Icon name="send" class="size-10 text-primary-500" stroke={2.5} />
			<p class="h5">Sealing and sending…</p>
			<progress class="progress w-full max-w-md" value={progress.done} max={progress.of}></progress>
			<p class="text-sm text-surface-700-300">{progress.of > recipients.length ? 'A big file goes in pieces. Keep this page open until it’s done.' : ''}</p>
		</div>
	{:else if step === 'sent' && result}
		<div class="flex flex-col gap-4 py-2">
			{#if result.reached.length}
				<p class="flex items-center gap-3 h5"><span class="rounded-full preset-filled-success-500 size-10 flex items-center justify-center"><Icon name="check" size={20} stroke={3} /></span> Sent to {namesText(result.reached)}</p>
			{/if}
			{#each result.missed as m (m.name)}
				<p class="card preset-tonal-error p-3 text-sm">Not sent to {m.name}: {m.says}</p>
			{/each}
			<div class="flex flex-wrap gap-2">
				<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={reset}><Icon name="plus" size={18} /> Write another</button>
				{#if recipients.length === 1}<a class="btn preset-tonal min-h-11" href="/messages/{encodeURIComponent(recipients[0].did)}">See the conversation</a>{/if}
			</div>
		</div>
	{/if}
</section>
