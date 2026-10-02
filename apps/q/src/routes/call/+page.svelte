<script lang="ts">
	/*
	 * Video call — Communication. ADR-Q-004.
	 *
	 * Opens on a check, not a button: camera, microphone and speaker chosen and
	 * heard before anyone is asked to join. Then a signed invitation link, a
	 * signed reply, and a direct, encrypted call keyed to the two people who
	 * signed. Every press is a receipt in one chain: Call (placed), Join
	 * (accepted), and End on each side (each person's own closing). Kept in the
	 * vault as it grows. Who, when, how long — never what was said.
	 */
	import { onMount } from 'svelte';
	import { Page, Section, Status, Empty, Text, Icon } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, openerFor, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder, saveLocked, type FolderState } from '@inqbeta/q-core/folder';
	import { checkCallChain, checkPlaced, unpackHandshake, type CallChain, type Handshake } from '@inqbeta/q-core/calls';
	import {
		canPickSpeaker, explainMediaError, listDevices, loadChoice, meter, openMedia, saveChoice, stopAll, testSound, tune, useSpeaker,
		type Devices, type MediaChoice, type Quality
	} from '$lib/call/media';
	import { Call, iceServers, type Far, type Health, type Phase } from '$lib/call/connection';
	import { page } from '$app/state';
	import { watchLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom, type Person } from '$lib/people';
	import { sendTo, watchArrivals } from '$lib/messages';


	let identity = $state<Identity | null>(null);
	let folder = $state<FolderState>({ kind: 'checking' });
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchFolder((s) => (folder = s)));

	/*
	 * Calling someone you're linked with (2 October 2026): from their card or
	 * your conversation, /call?with=<their DID>. The invitation goes to them
	 * through their inbox and rings on their Q with Answer; their reply comes
	 * back the same way and the call connects by itself. No links to pass by
	 * hand — those stay for calling someone who isn't in Q yet.
	 */
	let ledger = $state<Ledger | null>(null);
	$effect(() => watchLedger((l) => (ledger = l)));
	const withDid = $derived(page.url.searchParams.get('with') ?? '');
	const callee = $derived<Person | undefined>(withDid ? peopleFrom(ledger, identity?.did ?? '').find((p) => p.did === withDid) : undefined);
	let ringing = $state('');
	/* Answering a call that rang in Q: who to send the reply back to. */
	let answering = $state<{ did: string; inbox?: string; name?: string } | null>(null);
	$effect(() => {
		try {
			const raw = sessionStorage.getItem('q.call.with');
			if (raw) {
				answering = JSON.parse(raw);
				sessionStorage.removeItem('q.call.with');
			}
		} catch {
			answering = null;
		}
	});
	/* Their reply arrives through your inbox: connect at once. */
	$effect(() =>
		watchArrivals((m) => {
			if (m.content.kind === 'call-reply' && m.content.link && call && phase === 'waiting' && (!withDid || m.did === withDid)) {
				ringing = `${callee?.name ?? 'They'} answered. Connecting…`;
				void connectReply(m.content.link).then(() => (ringing = ''));
			}
			/* They pressed Not now: say so, and stop ringing. */
			if (m.content.kind === 'call-declined' && call && phase === 'waiting' && (!withDid || m.did === withDid)) {
				ringing = '';
				problem = `${callee?.name ?? 'They'} can’t answer right now. Try a message instead.`;
				void hangUp();
			}
		})
	);

	/* ---------- the check ---------- */
	let choice = $state<MediaChoice>({ quality: 'best', cleanup: true });
	let devices = $state<Devices>({ cameras: [], mics: [], speakers: [] });
	let local = $state<MediaStream | null>(null);
	let level = $state(0);
	let mediaError = $state('');
	let opening = $state(false);
	let stopMeter = () => {};

	async function open() {
		opening = true;
		mediaError = '';
		stopMeter();
		stopAll(local);
		local = null;
		try {
			local = await openMedia(choice);
			devices = await listDevices();
			/* Record what the browser actually gave, so the lists show it chosen. */
			choice.mic ??= local.getAudioTracks()[0]?.getSettings().deviceId;
			choice.camera ??= local.getVideoTracks()[0]?.getSettings().deviceId;
			stopMeter = meter(local, (l) => (level = l));
			saveChoice($state.snapshot(choice));
		} catch (e) {
			mediaError = explainMediaError(e);
		} finally {
			opening = false;
		}
	}

	function pick(patch: Partial<MediaChoice>) {
		choice = { ...choice, ...patch };
		saveChoice($state.snapshot(choice));
		if (call?.phase === 'live' || call?.phase === 'reconnecting') void swapMidCall(patch);
		else void open();
	}

	/* ---------- the call ---------- */
	let call = $state<Call | null>(null);
	let phase = $state<Phase>('new');
	let phaseSays = $state('');
	let relay = $state(false);
	let inviteLink = $state('');
	let replyLink = $state('');
	let pasted = $state('');
	let sealFor = $state('');
	let problem = $state('');
	let incoming = $state<{ h: Handshake; says: string } | null>(null);
	let remote = $state<MediaStream | null>(null);
	let health = $state<Health>({ grade: 'unknown' });
	let far = $state<Far>({ mic: true, cam: true });
	let micOn = $state(true);
	let camOn = $state(true);
	let showDevices = $state(false);
	let needsTap = $state(false);
	let record = $state<CallChain | null>(null);
	let recordSays = $state('');
	let saved = $state('');
	let wake: WakeLockSentinel | null = null;
	let chan: BroadcastChannel | null = null;

	const events = {
		phase: (p: Phase, says?: string) => {
			phase = p;
			phaseSays = says ?? '';
			if (p === 'live') void keepAwake();
		},
		remote: (s: MediaStream) => (remote = s),
		health: (h: Health) => (health = h),
		far: (f: Far) => (far = f),
		step: (c: CallChain) => void keep(c),
		ended: (c: CallChain) => void done(c)
	};

	async function begin(): Promise<Call | null> {
		if (!identity) return null;
		if (!local) await open();
		if (!local) return null;
		const ice = await iceServers(identity);
		relay = ice.relay;
		stopMeter();
		return new Call(identity, local, choice.quality, ice.servers, events);
	}

	async function startCall() {
		problem = '';
		const c = await begin();
		if (!c) return;
		call = c;
		try {
			inviteLink = await c.invite(location.origin, sealFor.trim() || callee?.did || undefined);
			/* Calling someone in Q: it rings on their Q. */
			if (callee?.inbox) {
				const out = await sendTo(callee, { kind: 'call', link: inviteLink });
				ringing = out.ok ? `Ringing ${callee.name} on their Q…` : `Couldn’t ring ${callee.name}: ${out.says} Send them the link instead.`;
			}
		} catch (e) {
			problem = e instanceof Error ? e.message : String(e);
		}
	}

	async function connectReply(text = pasted) {
		if (!call || !identity) return;
		problem = '';
		const u = await unpackHandshake(text, openerFor(identity));
		if (!u.ok) return void (problem = u.says);
		const r = await call.takeReply(u.handshake);
		if (!r.ok) problem = r.says;
	}

	async function join() {
		if (!incoming) return;
		problem = '';
		const c = await begin();
		if (!c) return;
		call = c;
		try {
			replyLink = await c.reply(location.origin, incoming.h);
			history.replaceState(null, '', '/call');
			/* Answered from Q's ring: the reply goes straight back to them. */
			if (answering?.inbox) {
				const out = await sendTo({ did: answering.did, inbox: answering.inbox }, { kind: 'call-reply', link: replyLink });
				problem = out.ok ? '' : `Couldn’t send your answer back: ${out.says} Send them the reply link instead.`;
			}
		} catch (e) {
			problem = e instanceof Error ? e.message : String(e);
		}
	}

	async function swapMidCall(patch: Partial<MediaChoice>) {
		if (!call) return;
		try {
			if (patch.mic !== undefined || patch.cleanup !== undefined) {
				const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: choice.mic ? { exact: choice.mic } : undefined, echoCancellation: choice.cleanup, noiseSuppression: choice.cleanup, autoGainControl: choice.cleanup } });
				tune(s);
				const t = s.getAudioTracks()[0];
				t.enabled = micOn;
				await call.replace('audio', t);
			}
			if (patch.camera !== undefined) {
				const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: choice.camera ? { exact: choice.camera } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
				tune(s);
				const t = s.getVideoTracks()[0];
				t.enabled = camOn;
				await call.replace('video', t);
			}
			local = new MediaStream(local?.getTracks() ?? []);
		} catch (e) {
			problem = explainMediaError(e);
		}
	}

	function toggleMic() {
		micOn = !micOn;
		call?.setMic(micOn);
	}
	function toggleCam() {
		camOn = !camOn;
		call?.setCam(camOn);
	}

	async function hangUp() {
		/* Every way out closes this side with its own receipt; call.hangUp()
		 * reports back through events.ended. */
		if (call) await call.hangUp();
	}

	/* The vault copy, rewritten as the chain grows: one file per call. */
	let keptAs = '';
	async function keep(c: CallChain) {
		const placed = c.steps[0]?.content;
		if (!placed || folder.kind !== 'ready') return false;
		keptAs ||= `call-${placed.at.slice(0, 16).replace(/[:T]/g, '-')}-${placed.call.slice(0, 6)}.json`;
		try {
			await saveLocked('calls', keptAs, JSON.stringify(c, null, 2), 'application/json');
			return true;
		} catch {
			return false;
		}
	}

	async function done(c: CallChain) {
		if (phase === 'ended' && record) return;
		void wake?.release().catch(() => {});
		wake = null;
		record = c;
		remote = null;
		local = null;
		phase = 'ended';
		const checked = await checkCallChain(c);
		recordSays = checked.says;
		if (folder.kind !== 'ready') saved = 'Your folder is not open, so the receipts are not in the vault yet — download them to keep them.';
		else if (await keep(c)) saved = `Kept in your vault as calls/${keptAs} — ${c.steps.length} receipt${c.steps.length === 1 ? '' : 's'} in the chain.`;
		else saved = 'Could not write to the vault. Download the receipts instead.';
	}

	function reset() {
		call = null;
		phase = 'new';
		inviteLink = replyLink = pasted = problem = '';
		incoming = null;
		remote = null;
		health = { grade: 'unknown' };
		record = null;
		recordSays = saved = keptAs = '';
		micOn = camOn = true;
		void open();
	}

	function download() {
		if (!record) return;
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
		a.download = `call-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}

	async function keepAwake() {
		try {
			wake = (await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinel> } }).wakeLock?.request('screen')) ?? null;
		} catch {
			wake = null;
		}
	}

	let copied = $state('');
	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			setTimeout(() => (copied = ''), 2000);
		} catch {
			copied = '';
		}
	}
	const canShare = () => typeof navigator !== 'undefined' && 'share' in navigator;
	async function share(url: string, text: string) {
		try {
			await navigator.share({ title: 'Q call', text, url });
		} catch {
			/* cancelled */
		}
	}

	/* ---------- media elements ---------- */
	let selfEl = $state<HTMLVideoElement | null>(null);
	let pipEl = $state<HTMLVideoElement | null>(null);
	let farEl = $state<HTMLVideoElement | null>(null);
	$effect(() => {
		for (const el of [selfEl, pipEl]) if (el && el.srcObject !== local) el.srcObject = local;
	});
	$effect(() => {
		if (!farEl) return;
		if (farEl.srcObject !== remote) farEl.srcObject = remote;
		void useSpeaker(farEl, choice.speaker);
		farEl.play().then(() => (needsTap = false)).catch(() => (needsTap = true));
	});

	/* ---------- arriving with a link ---------- */
	async function readHash() {
		const h = location.hash;
		if (!identity || !h) return;
		const u = await unpackHandshake(h, openerFor(identity));
		if (h.startsWith('#a=')) {
			/* A reply opened in a new tab: hand it to the tab that is waiting. */
			chan?.postMessage({ reply: h });
			problem = 'That was a reply to your call. If the call is open in another tab, it has been passed there.';
			history.replaceState(null, '', '/call');
			return;
		}
		if (!u.ok) return void (problem = u.says);
		const c = await checkPlaced(u.handshake, { me: identity.did });
		if (!c.ok) return void (problem = c.says);
		if (c.by === identity.did) return void (problem = 'That is your own call. Send the link to the person you are calling.');
		incoming = { h: { step: c.step, sdp: c.sdp }, says: c.says };
	}

	onMount(() => {
		choice = loadChoice();
		void open();
		const refresh = () => void listDevices().then((d) => (devices = d));
		navigator.mediaDevices?.addEventListener('devicechange', refresh);
		try {
			chan = new BroadcastChannel('q-call');
			chan.onmessage = (e) => {
				if (call && phase === 'waiting' && typeof e.data?.reply === 'string') void connectReply(e.data.reply);
			};
		} catch {
			chan = null;
		}
		const leave = () => void call?.hangUp();
		window.addEventListener('pagehide', leave);
		return () => {
			navigator.mediaDevices?.removeEventListener('devicechange', refresh);
			window.removeEventListener('pagehide', leave);
			chan?.close();
			stopMeter();
			call?.close();
			stopAll(local);
		};
	});

	/* Answered from Q's ring: no second button. Join as soon as the camera's ready. */
	let autoJoined = false;
	$effect(() => {
		if (answering && incoming && local && !call && !autoJoined) {
			autoJoined = true;
			void join();
		}
	});

	let hashRead = false;
	$effect(() => {
		if (identity && !hashRead) {
			hashRead = true;
			void readHash();
		}
	});

	const short = (did: string) => `${did.slice(8, 14)}…${did.slice(-6)}`;
	const gradeTone = (g: Health['grade']): 'good' | 'needs-you' | 'bad' | 'plain' => (g === 'good' ? 'good' : g === 'fair' ? 'needs-you' : g === 'poor' ? 'bad' : 'plain');
	const inCall = $derived(phase === 'live' || phase === 'reconnecting');
	const STEP = { 'call.placed': 'Placed', 'call.accepted': 'Accepted', 'call.ended': 'Closed' } as const;
	const HOW = { 'hung-up': 'hung up', 'they-left': 'the other side left', dropped: 'connection lost', cancelled: 'cancelled', 'no-answer': 'no answer' } as const;
	const QUALITIES: { id: Quality; label: string; hint: string }[] = [
		{ id: 'best', label: 'Best', hint: '720p, up to 1.5 Mbps' },
		{ id: 'saver', label: 'Data saver', hint: '360p, about 0.4 Mbps' },
		{ id: 'voice', label: 'Voice only', hint: 'no camera' }
	];
</script>

<svelte:head><title>Video call — Q</title></svelte:head>

{#snippet deviceChoices()}
	<div class="space-y-3">
		{#if choice.quality !== 'voice'}
			<label class="label"><span class="label-text">Camera</span>
				<select class="select" value={choice.camera ?? ''} onchange={(e) => pick({ camera: e.currentTarget.value || undefined })}>
					{#each devices.cameras as d (d.deviceId)}<option value={d.deviceId}>{d.label || 'Camera'}</option>{/each}
				</select>
			</label>
		{/if}
		<label class="label"><span class="label-text">Microphone</span>
			<select class="select" value={choice.mic ?? ''} onchange={(e) => pick({ mic: e.currentTarget.value || undefined })}>
				{#each devices.mics as d (d.deviceId)}<option value={d.deviceId}>{d.label || 'Microphone'}</option>{/each}
			</select>
		</label>
		<div class="h-2 w-full overflow-hidden rounded-full bg-surface-200-800" role="meter" aria-label="Microphone level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(level * 100)}>
			<div class="h-full rounded-full transition-[width] duration-75 {level > 0.85 ? 'bg-warning-500' : 'bg-success-500'}" style="width: {Math.round(level * 100)}%"></div>
		</div>
		{#if canPickSpeaker()}
			<label class="label"><span class="label-text">Speaker</span>
				<select class="select" value={choice.speaker ?? ''} onchange={(e) => pick({ speaker: e.currentTarget.value || undefined })}>
					<option value="">System default</option>
					{#each devices.speakers as d (d.deviceId)}<option value={d.deviceId}>{d.label || 'Speaker'}</option>{/each}
				</select>
			</label>
		{/if}
		<button class="btn btn-sm preset-tonal" onclick={() => void testSound(choice.speaker)}><Icon name="speaker" size={16} /> Play a test sound</button>
	</div>
{/snippet}

{#if inCall}
	<!-- In the call: the whole screen, nothing else. -->
	<div class="fixed inset-0 z-50 flex flex-col bg-surface-950 text-surface-50">
		<div class="flex items-center justify-between gap-2 p-3 text-sm">
			<span class="flex items-center gap-2">
				<Status tone={gradeTone(health.grade)}>{health.grade === 'unknown' ? 'Measuring' : health.grade}</Status>
				{#if health.rttMs != null}<span class="opacity-80">{health.route} · {health.rttMs} ms{health.lossPct ? ` · ${health.lossPct}% lost` : ''}</span>{/if}
			</span>
			{#if phase === 'reconnecting'}<span class="text-warning-300">{phaseSays}</span>{/if}
			{#if health.picture}<span class="hidden opacity-60 sm:inline">{health.picture}</span>{/if}
		</div>
		<div class="relative min-h-0 flex-1">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={farEl} autoplay playsinline class="h-full w-full object-contain {far.cam ? '' : 'invisible'}"></video>
			{#if !far.cam}
				<div class="absolute inset-0 flex items-center justify-center"><Icon name="video-off" size={48} class="opacity-40" /></div>
			{/if}
			{#if !far.mic}<span class="absolute left-3 top-3 flex items-center gap-1 rounded-base bg-surface-950/60 px-2 py-1 text-xs"><Icon name="mic-off" size={14} /> They are muted</span>{/if}
			{#if needsTap}
				<button class="btn preset-filled-primary-500 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" onclick={() => farEl?.play().then(() => (needsTap = false))}>Tap to hear them</button>
			{/if}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={pipEl} autoplay playsinline muted class="absolute bottom-3 right-3 w-28 rounded-container border border-surface-50/20 object-cover shadow-lg sm:w-48 {camOn && choice.quality !== 'voice' ? '' : 'hidden'}" style="transform: scaleX(-1)"></video>
			{#if showDevices}
				<div class="absolute bottom-3 left-3 w-72 max-w-[calc(100%-1.5rem)] rounded-container bg-surface-50-950 p-4 text-surface-950-50 shadow-xl">{@render deviceChoices()}</div>
			{/if}
		</div>
		<div class="flex items-center justify-center gap-3 p-4" style="padding-bottom: max(1rem, env(safe-area-inset-bottom))">
			<button class="btn-icon btn-icon-lg {micOn ? 'preset-tonal' : 'preset-filled-warning-500'}" aria-pressed={!micOn} aria-label={micOn ? 'Mute' : 'Unmute'} onclick={toggleMic}><Icon name={micOn ? 'mic' : 'mic-off'} /></button>
			{#if choice.quality !== 'voice'}
				<button class="btn-icon btn-icon-lg {camOn ? 'preset-tonal' : 'preset-filled-warning-500'}" aria-pressed={!camOn} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} onclick={toggleCam}><Icon name={camOn ? 'video' : 'video-off'} /></button>
			{/if}
			<button class="btn-icon btn-icon-lg preset-tonal" aria-expanded={showDevices} aria-label="Devices" onclick={() => (showDevices = !showDevices)}><Icon name="settings" /></button>
			<button class="btn-icon btn-icon-lg preset-filled-error-500" aria-label="Hang up" onclick={() => void hangUp()}><Icon name="phone-off" /></button>
		</div>
	</div>
{/if}

<Page title="Video call" lead="Straight from your device to theirs, encrypted to the two of you. Calling, joining and each of you leaving is a signed receipt, chained together: who, when and how long — never what was said.">
	{#if !identity}
		<SignIn />
	{:else if phase === 'ended'}
		<Section title="Call ended">
			{#if record}
				<p>{recordSays}</p>
				<ol class="mt-3 space-y-1 text-sm">
					{#each record.steps as st (st.contentHash)}
						<li class="flex flex-wrap items-center gap-2">
							<Status tone="good">{STEP[st.content.event]}</Status>
							<span>{st.did === identity?.did ? 'you' : 'them'}</span>
							<span class="text-surface-700-300">{st.content.at.slice(11, 19)}{st.content.how ? ` · ${HOW[st.content.how]}` : ''}</span>
							<Text role="token">{st.contentHash.slice(0, 12)}</Text>
							{#if st.content.parent}<span class="text-surface-700-300">follows {st.content.parent.slice(0, 8)}</span>{/if}
						</li>
					{/each}
				</ol>
				<p class="mt-2 text-sm">{saved}</p>
				<div class="mt-3 flex flex-wrap gap-2">
					<button class="btn preset-tonal" onclick={download}>Download the receipt</button>
					<a class="btn preset-tonal" href="/receipts">See it in Receipts</a>
					<button class="btn preset-filled-primary-500" onclick={reset}>Another call</button>
				</div>
			{:else}
				<Empty icon="video" title="No receipt" description={recordSays} />
				<button class="btn preset-filled-primary-500 mt-3" onclick={reset}>Start again</button>
			{/if}
		</Section>
	{:else}
		<Section title="Check how you look and sound" description="Choose here before anyone joins. What you pick is remembered on this device.">
			<div class="grid gap-4 md:grid-cols-2">
				<div class="relative aspect-video overflow-hidden rounded-container bg-surface-900">
					{#if !inCall}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video bind:this={selfEl} autoplay playsinline muted class="h-full w-full object-cover {choice.quality === 'voice' ? 'hidden' : ''}" style="transform: scaleX(-1)"></video>
					{/if}
					{#if choice.quality === 'voice' || !local}
						<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-surface-300">
							<Icon name={opening ? 'sync' : choice.quality === 'voice' ? 'mic' : 'video-off'} size={36} />
							<span class="text-sm">{opening ? 'Opening…' : choice.quality === 'voice' ? 'Voice only' : 'No picture yet'}</span>
						</div>
					{/if}
				</div>
				<div class="space-y-4">
					{@render deviceChoices()}
					<fieldset>
						<legend class="label-text mb-1">Quality</legend>
						<div class="flex flex-wrap gap-1" role="radiogroup">
							{#each QUALITIES as q (q.id)}
								<button role="radio" aria-checked={choice.quality === q.id} title={q.hint} class="btn btn-sm {choice.quality === q.id ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => pick({ quality: q.id })}>{q.label}</button>
							{/each}
						</div>
					</fieldset>
					<label class="flex items-start gap-2 text-sm">
						<input type="checkbox" class="checkbox mt-0.5" checked={choice.cleanup} onchange={(e) => pick({ cleanup: e.currentTarget.checked })} />
						<span>Voice clean-up — removes echo and background noise. Turn off only to play music.</span>
					</label>
				</div>
			</div>
			{#if mediaError}
				<p class="mt-3"><Status tone="bad">Camera / microphone</Status> {mediaError}</p>
				<button class="btn btn-sm preset-tonal mt-2" onclick={() => void open()}>Try again</button>
			{/if}
			<p class="mt-3 text-sm text-surface-700-300">For the clearest sound use headphones: then nothing you hear can reach your microphone.</p>
		</Section>

		{#if incoming && !replyLink}
			<Section title="You have been invited">
				<p><Status tone="good">Checked</Status> {incoming.says}</p>
				<p class="mt-1 text-sm">From <Text role="token">{short(incoming.h.step.did)}</Text>{incoming.h.step.content.to ? ' · made for you' : ''}</p>
				<button class="btn preset-filled-primary-500 mt-3" disabled={!local} onclick={() => void join()}><Icon name="video" size={18} /> Join</button>
			</Section>
		{:else if replyLink && answering?.inbox && !problem}
			<Section title="Connecting to {answering.name ?? 'them'}…" description="You answered. Your reply has gone back to them through Q, and the call starts the moment it reaches them.">
				<p class="text-sm"><Status tone="waiting">{phase === 'connecting' ? 'Connecting' : phase}</Status> {phaseSays}</p>
				<button class="btn btn-sm preset-tonal mt-3" onclick={() => void hangUp()}>Cancel</button>
			</Section>
		{:else if replyLink}
			<Section title="Send this reply back" description="You accepted: that is your receipt, following theirs. Send the link back the same way the call came. The call starts the moment they open it.">
				<div class="flex flex-wrap gap-2">
					<input class="input flex-1 font-mono text-xs" readonly value={replyLink} onfocus={(e) => e.currentTarget.select()} aria-label="Reply link" />
					<button class="btn preset-filled-primary-500" onclick={() => void copy(replyLink, 'reply')}>{copied === 'reply' ? 'Copied' : 'Copy'}</button>
					{#if canShare()}<button class="btn preset-tonal" onclick={() => void share(replyLink, 'My reply to your Q call')}>Share</button>{/if}
				</div>
				<p class="mt-3 text-sm"><Status tone="waiting">{phase === 'connecting' ? 'Waiting for them' : phase}</Status> {phaseSays}</p>
				<button class="btn btn-sm preset-tonal mt-3" onclick={() => void hangUp()}>Cancel</button>
			</Section>
		{:else if inviteLink}
			{#if ringing}
				<div class="card preset-tonal-primary p-4 mb-4 flex items-center gap-3" role="status"><Icon name="phone" class="motion-safe:animate-bounce" /> {ringing}</div>
			{/if}
			<Section title={callee?.inbox ? 'Or send the link' : 'Send this call'} description="Your first receipt is made: the call, placed and signed by you. Send the link by message, email, anything — it rings for an hour and carries no account and no password.">
				<div class="flex flex-wrap gap-2">
					<input class="input flex-1 font-mono text-xs" readonly value={inviteLink} onfocus={(e) => e.currentTarget.select()} aria-label="Invitation link" />
					<button class="btn preset-filled-primary-500" onclick={() => void copy(inviteLink, 'invite')}>{copied === 'invite' ? 'Copied' : 'Copy'}</button>
					{#if canShare()}<button class="btn preset-tonal" onclick={() => void share(inviteLink, 'Join my Q call')}>Share</button>{/if}
				</div>
				<label class="label mt-4"><span class="label-text">Their reply — paste the link they send back</span>
					<textarea class="textarea font-mono text-xs" rows="3" bind:value={pasted} placeholder="…/call#a=…"></textarea>
				</label>
				<div class="mt-2 flex gap-2">
					<button class="btn preset-filled-primary-500" disabled={!pasted.trim() || phase === 'connecting'} onclick={() => void connectReply()}>{phase === 'connecting' ? 'Connecting…' : 'Connect'}</button>
					<button class="btn preset-tonal" onclick={() => void hangUp()}>Cancel</button>
				</div>
			</Section>
		{:else}
			<Section title={callee ? `Call ${callee.name}` : 'Start a call'}>
				{#if callee}
					<p>It rings on {callee.name}’s Q. When they answer, the call starts by itself.</p>
				{:else}
					<label class="label"><span class="label-text">Their Q identity (optional) — seals the link so only they can open it</span>
						<input class="input font-mono text-xs" bind:value={sealFor} placeholder="did:key:z6Mk…" />
					</label>
				{/if}
				<button class="btn preset-filled-primary-500 mt-3" disabled={!local} onclick={() => void startCall()}><Icon name="video" size={18} /> Call</button>
			</Section>
		{/if}

		{#if phase === 'failed' || problem}
			<p class="mt-3"><Status tone="bad">Not connected</Status> {problem || phaseSays}</p>
		{/if}

		<Section title="Getting through" description="How the call travels.">
			<ul class="list-disc space-y-1 pl-5 text-sm">
				<li>Direct, device to device, whenever the two networks allow it — most home broadband does.</li>
				<li>{relay ? 'A relay is ready for networks that block direct calls (mobile data, offices, hotels). It carries encrypted packets it cannot open.' : 'No relay is set up on this server yet, so a call between two strict networks (some mobile carriers, offices) may not connect.'}</li>
				<li>The encryption keys are the ones you and they signed, so nobody in between can listen — not Q, not a relay.</li>
			</ul>
		</Section>
	{/if}
</Page>
