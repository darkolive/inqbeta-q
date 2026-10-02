/*
 * One direct call, from the browser's side. ADR-Q-004.
 *
 * A call is a chain of receipts (q-core/calls.ts), and each press of a button
 * adds one:
 *
 *   caller                                      the person called
 *   ──────                                      ─────────────────
 *   Call      → call.placed ── link (#o=…) ──▶  checked: signature, SDP, key
 *                                               Join → call.accepted (follows placed)
 *   checked   ◀── link (#a=…) ────────────────  
 *   ═════════ DTLS-SRTP, keyed to the two signed fingerprints ═════════
 *                  data channel "q": mute state, endings
 *   End       → call.ended (mine) ── ended ──▶  call.ended (theirs, "they left")
 *   keep both ◀────────────────────── ended ──  keep both
 *
 * The chain is handed to the page after every step, so a call that crashes
 * half-way still leaves the receipts it got to.
 *
 * ICE is gathered in full before signing (no trickle), because the link is
 * the carrier and it goes once each way.
 */
import { signerFor, type Identity } from '@inqbeta/q-core/passkey';
import { checkReceipt } from '@inqbeta/q-core/seal';
import {
	acceptCall, callChain, checkAccepted, endCall, packHandshake, placeCall,
	type CallChain, type CallMedia, type CallReceipt, type CallRoute, type Handshake, type Leaving
} from '@inqbeta/q-core/calls';
import { AUDIO_BITRATE, VIDEO_SHAPE, type Quality } from './media';

export type Phase = 'new' | 'waiting' | 'connecting' | 'live' | 'reconnecting' | 'ended' | 'failed';

export interface Health {
	grade: 'good' | 'fair' | 'poor' | 'unknown';
	rttMs?: number;
	lossPct?: number;
	inKbps?: number;
	outKbps?: number;
	route?: CallRoute;
	/** e.g. "1280×720 · 30fps" — what is arriving. */
	picture?: string;
}

export interface Far {
	mic: boolean;
	cam: boolean;
}

type Wire =
	| { t: 'state'; mic: boolean; cam: boolean }
	| { t: 'ended'; receipt: CallReceipt };

export interface Events {
	phase(p: Phase, says?: string): void;
	remote(stream: MediaStream): void;
	health(h: Health): void;
	far(f: Far): void;
	/** The chain grew: keep it. Called after every receipt. */
	step(chain: CallChain): void;
	/** The call is over, from either end; here is the chain as it finished. */
	ended(chain: CallChain): void;
}

/** Ask Q's server for a way through (STUN, and TURN when configured). Works without it. */
export async function iceServers(identity: Identity): Promise<{ servers: RTCIceServer[]; relay: boolean }> {
	const fallback = { servers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }], relay: false };
	try {
		const at = new Date().toISOString();
		const signature = await signerFor(identity).signCanonical({ act: 'call.ice', did: identity.did, at });
		const res = await fetch('/api/calls/ice', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ did: identity.did, at, signature })
		});
		const out = await res.json();
		return out.ok ? { servers: out.iceServers, relay: !!out.relay } : fallback;
	} catch {
		return fallback;
	}
}

export class Call {
	readonly pc: RTCPeerConnection;
	readonly remote = new MediaStream();
	private dc: RTCDataChannel;
	private placed?: CallReceipt;
	private accepted?: CallReceipt;
	private mine?: CallReceipt;
	private theirs?: CallReceipt;
	private began?: number;
	private sawVideo = false;
	private route: CallRoute = 'direct';
	private statsTimer?: ReturnType<typeof setInterval>;
	private dropTimer?: ReturnType<typeof setTimeout>;
	private giveUpTimer?: ReturnType<typeof setTimeout>;
	private last?: { at: number; inBytes: number; outBytes: number; lost: number; got: number };
	private finished = false;
	private heardTheirs?: () => void;
	phase: Phase = 'new';

	constructor(
		private identity: Identity,
		private local: MediaStream,
		private quality: Quality,
		servers: RTCIceServer[],
		private on: Events
	) {
		this.pc = new RTCPeerConnection({ iceServers: servers, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
		/* Both ends make the same channel by id, so neither waits for the other to announce it. */
		this.dc = this.pc.createDataChannel('q', { negotiated: true, id: 0, ordered: true });
		this.dc.onmessage = (e) => this.heard(e.data);
		this.dc.onopen = () => this.tellState();

		this.pc.ontrack = (e) => {
			if (!this.remote.getTracks().includes(e.track)) this.remote.addTrack(e.track);
			if (e.track.kind === 'video') this.sawVideo = true;
			this.on.remote(this.remote);
		};
		this.pc.onconnectionstatechange = () => this.watchConnection();
	}

	private set(p: Phase, says?: string) {
		this.phase = p;
		this.on.phase(p, says);
	}

	/** The call's name, once placed: random, the same on every receipt in its chain. */
	get name(): string | undefined {
		return this.placed?.content.call;
	}

	/* ---------------- handshake ---------------- */

	/** Caller presses Call: the first receipt, and the link that carries it. `to` seals it for them. */
	async invite(origin: string, to?: string): Promise<string> {
		this.addTransceivers();
		await this.pc.setLocalDescription(await this.pc.createOffer());
		await this.gathered();
		const h = await placeCall(this.identity, { sdp: this.pc.localDescription!.sdp, ...(to ? { to } : {}) });
		this.placed = h.step;
		this.grew();
		this.set('waiting');
		return `${origin}/call#o=${await packHandshake(h, to ? [to] : undefined)}`;
	}

	/** Caller: their acceptance arrived. */
	async takeReply(h: unknown): Promise<{ ok: true } | { ok: false; says: string }> {
		const c = await checkAccepted(h, { placed: this.placed });
		if (!c.ok) return c;
		this.accepted = c.step;
		this.grew();
		this.set('connecting');
		await this.pc.setRemoteDescription({ type: 'answer', sdp: c.sdp });
		await this.applySenderSettings();
		return { ok: true };
	}

	/** The person called presses Join: their receipt follows the caller's. Returns the reply link. */
	async reply(origin: string, placed: Handshake): Promise<string> {
		this.placed = placed.step;
		await this.pc.setRemoteDescription({ type: 'offer', sdp: placed.sdp });
		for (const t of this.pc.getTransceivers()) {
			const kind = t.receiver.track.kind;
			const track = (kind === 'audio' ? this.local.getAudioTracks()[0] : this.local.getVideoTracks()[0]) ?? null;
			t.direction = 'sendrecv';
			await t.sender.replaceTrack(track);
			t.sender.setStreams?.(this.local);
		}
		await this.pc.setLocalDescription(await this.pc.createAnswer());
		await this.gathered();
		const h = await acceptCall(this.identity, placed.step, this.pc.localDescription!.sdp);
		this.accepted = h.step;
		this.grew();
		this.set('connecting');
		await this.applySenderSettings();
		return `${origin}/call#a=${await packHandshake(h, [placed.step.did])}`;
	}

	/** The chain so far, endings in a fixed order so both sides hold the same record. */
	chain(): CallChain {
		const endings = [this.mine, this.theirs].filter((e): e is CallReceipt => !!e).sort((x, y) => (x.did < y.did ? -1 : 1));
		return callChain([this.placed, this.accepted, ...endings]);
	}

	private grew() {
		this.on.step(this.chain());
	}

	/**
	 * Always offer to send and receive both, even with no camera: then a
	 * camera turned on mid-call is a replaceTrack, not a new handshake — which
	 * matters when the handshake travels by link.
	 */
	private addTransceivers() {
		this.pc.addTransceiver(this.local.getAudioTracks()[0] ?? 'audio', { direction: 'sendrecv', streams: [this.local] });
		this.pc.addTransceiver(this.local.getVideoTracks()[0] ?? 'video', { direction: 'sendrecv', streams: [this.local] });
	}

	/** Wait for every candidate, or 4 s — whichever first. A slow STUN server should not hold the call. */
	private gathered(): Promise<void> {
		if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
		return new Promise((done) => {
			const t = setTimeout(finish, 4000);
			const pc = this.pc;
			function finish() {
				clearTimeout(t);
				pc.removeEventListener('icegatheringstatechange', check);
				done();
			}
			function check() {
				if (pc.iceGatheringState === 'complete') finish();
			}
			pc.addEventListener('icegatheringstatechange', check);
		});
	}

	/** Bitrate caps and priorities: the voice matters more than the picture, always. */
	private async applySenderSettings() {
		for (const s of this.pc.getSenders()) {
			const kind = s.track?.kind ?? this.pc.getTransceivers().find((t) => t.sender === s)?.receiver.track.kind;
			const p = s.getParameters();
			if (!p.encodings?.length) p.encodings = [{}];
			const e = p.encodings[0] as RTCRtpEncodingParameters & { priority?: string; networkPriority?: string };
			if (kind === 'audio') {
				e.maxBitrate = AUDIO_BITRATE;
				e.priority = 'high';
				e.networkPriority = 'high';
			} else if (kind === 'video') {
				const shape = VIDEO_SHAPE[this.quality === 'voice' ? 'saver' : this.quality];
				e.maxBitrate = shape.bitrate;
				e.maxFramerate = shape.fps;
				(p as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = 'balanced';
			}
			try {
				await s.setParameters(p);
			} catch {
				/* a browser that will not take a hint still makes a call */
			}
		}
	}

	/* ---------------- during ---------------- */

	private watchConnection() {
		const s = this.pc.connectionState;
		clearTimeout(this.dropTimer);
		clearTimeout(this.giveUpTimer);
		if (s === 'connected') {
			this.began ??= Date.now();
			this.set('live');
			this.startStats();
			this.tellState();
		} else if (s === 'disconnected') {
			this.set('reconnecting', 'The connection wobbled — holding on…');
			/* Most drops heal on their own within seconds (a wifi blip). */
			this.dropTimer = setTimeout(() => {
				if (this.pc.connectionState !== 'connected') this.pc.restartIce?.();
			}, 4000);
			this.giveUpTimer = setTimeout(() => {
				if (this.pc.connectionState !== 'connected' && !this.finished) void this.lost();
			}, 20000);
		} else if (s === 'failed') {
			if (this.began) void this.lost();
			else this.set('failed', 'The two devices could not reach each other directly — one of the networks blocks it. A relay gets through; see “Getting through” below.');
		}
	}

	private async lost() {
		await this.finish('dropped');
	}

	/** Swap a device mid-call without a new handshake. */
	async replace(kind: 'audio' | 'video', track: MediaStreamTrack | null) {
		const t = this.pc.getTransceivers().find((x) => x.receiver.track.kind === kind);
		if (!t) return;
		await t.sender.replaceTrack(track);
		for (const old of kind === 'audio' ? this.local.getAudioTracks() : this.local.getVideoTracks()) {
			if (old !== track) {
				this.local.removeTrack(old);
				old.stop();
			}
		}
		if (track && !this.local.getTracks().includes(track)) this.local.addTrack(track);
		this.tellState();
	}

	setMic(on: boolean) {
		this.local.getAudioTracks().forEach((t) => (t.enabled = on));
		this.tellState();
	}

	setCam(on: boolean) {
		this.local.getVideoTracks().forEach((t) => (t.enabled = on));
		this.tellState();
	}

	private tellState() {
		const mic = this.local.getAudioTracks().some((t) => t.enabled);
		const cam = this.local.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');
		this.send({ t: 'state', mic, cam });
	}

	private send(w: Wire) {
		if (this.dc.readyState === 'open') this.dc.send(JSON.stringify(w));
	}

	private async heard(raw: unknown) {
		let w: Wire;
		try {
			w = JSON.parse(String(raw));
		} catch {
			return;
		}
		if (w.t === 'state') return this.on.far({ mic: !!w.mic, cam: !!w.cam });
		if (w.t !== 'ended' || this.theirs) return;
		/* Their closing receipt: it must be theirs, and follow the acceptance. */
		const r = w.receipt;
		const other = this.placed?.did === this.identity.did ? this.accepted?.did : this.placed?.did;
		if (!(await checkReceipt(r)).ok || r.did !== other || r.content?.event !== 'call.ended' || r.content.parent !== this.accepted?.contentHash) return;
		this.theirs = r;
		this.heardTheirs?.();
		/* They left first: close our own side too, and send it back. */
		if (!this.mine) await this.finish('they-left');
	}

	private media(): CallMedia[] {
		const m: CallMedia[] = [];
		if (this.began) m.push('audio');
		if (this.began && (this.sawVideo || this.local.getVideoTracks().length)) m.push('video');
		return m;
	}

	/* ---------------- health ---------------- */

	private startStats() {
		if (this.statsTimer) return;
		this.statsTimer = setInterval(() => void this.measure(), 2000);
	}

	private async measure() {
		const stats = await this.pc.getStats();
		let pairId: string | undefined;
		let inBytes = 0, outBytes = 0, lost = 0, got = 0, picture: string | undefined;
		stats.forEach((r) => {
			if (r.type === 'transport' && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId;
			if (r.type === 'inbound-rtp') {
				inBytes += r.bytesReceived ?? 0;
				lost += r.packetsLost ?? 0;
				got += r.packetsReceived ?? 0;
				if (r.kind === 'video' && r.frameWidth) picture = `${r.frameWidth}×${r.frameHeight} · ${Math.round(r.framesPerSecond ?? 0)}fps`;
			}
			if (r.type === 'outbound-rtp') outBytes += r.bytesSent ?? 0;
		});
		/* Firefox has no transport stats: find the nominated pair instead. */
		let pair: RTCIceCandidatePairStats | undefined;
		stats.forEach((r) => {
			if (r.type === 'candidate-pair' && (r.id === pairId || (!pairId && r.nominated && r.state === 'succeeded'))) pair = r;
		});
		const h: Health = { grade: 'unknown', picture };
		if (pair) {
			if (pair.currentRoundTripTime != null) h.rttMs = Math.round(pair.currentRoundTripTime * 1000);
			const l = stats.get(pair.localCandidateId) as { candidateType?: string } | undefined;
			const r = stats.get(pair.remoteCandidateId) as { candidateType?: string } | undefined;
			this.route = l?.candidateType === 'relay' || r?.candidateType === 'relay' ? 'relayed' : 'direct';
			h.route = this.route;
		}
		const now = Date.now();
		if (this.last) {
			const secs = (now - this.last.at) / 1000;
			h.inKbps = Math.round(((inBytes - this.last.inBytes) * 8) / 1000 / secs);
			h.outKbps = Math.round(((outBytes - this.last.outBytes) * 8) / 1000 / secs);
			const dl = lost - this.last.lost, dg = got - this.last.got;
			h.lossPct = dl + dg > 0 ? Math.round((1000 * Math.max(0, dl)) / (dl + dg)) / 10 : 0;
		}
		this.last = { at: now, inBytes, outBytes, lost, got };
		const rtt = h.rttMs ?? 0, loss = h.lossPct ?? 0;
		h.grade = h.rttMs == null ? 'unknown' : rtt < 200 && loss < 2 ? 'good' : rtt < 400 && loss < 6 ? 'fair' : 'poor';
		this.on.health(h);
	}

	/* ---------------- ending ---------------- */

	/** End, leave: this side's closing receipt. Waits up to 3 s for theirs. */
	async hangUp(): Promise<CallChain> {
		return this.finish(this.accepted ? 'hung-up' : 'cancelled');
	}

	private async finish(how: Leaving): Promise<CallChain> {
		if (this.finished) return this.chain();
		this.finished = true;
		const from = this.accepted ?? (this.placed?.did === this.identity.did ? this.placed : undefined);
		if (from && !this.mine) {
			if (!this.accepted && how === 'cancelled' && this.phase === 'waiting') how = 'no-answer';
			this.mine = await endCall(this.identity, from, { began: this.began, ended: Date.now(), media: this.media(), route: this.began ? this.route : undefined, how });
			this.grew();
			if (this.accepted && this.dc.readyState === 'open') {
				this.send({ t: 'ended', receipt: this.mine });
				if (!this.theirs && how !== 'they-left')
					await new Promise<void>((done) => {
						const t = setTimeout(done, 3000);
						this.heardTheirs = () => {
							clearTimeout(t);
							done();
						};
					});
				if (this.theirs) this.grew();
			}
		}
		this.close();
		this.set('ended');
		const chain = this.chain();
		this.on.ended(chain);
		return chain;
	}

	/** Leave without a call having started (cancel an invitation). */
	close() {
		clearInterval(this.statsTimer);
		clearTimeout(this.dropTimer);
		clearTimeout(this.giveUpTimer);
		try {
			this.dc.close();
		} catch {
			/* already */
		}
		this.pc.getSenders().forEach((s) => s.track?.stop());
		this.pc.close();
	}
}
