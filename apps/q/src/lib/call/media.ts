/*
 * Camera, microphone and speaker — chosen, checked and tuned before a call.
 * ADR-Q-004 §4, "the setup".
 *
 * Most bad calls are bad before they start: the wrong microphone, a laptop
 * speaker feeding back into it, a camera another app is holding. So the call
 * page opens on a check, not a button, and what you pick is remembered on this
 * device (localStorage — a convenience; nothing breaks without it).
 */

export type Quality = 'best' | 'saver' | 'voice';

export interface MediaChoice {
	camera?: string;
	mic?: string;
	speaker?: string;
	quality: Quality;
	/** Echo cancellation, noise suppression and level control. Off only for music. */
	cleanup: boolean;
}

const DEFAULT: MediaChoice = { quality: 'best', cleanup: true };

export function loadChoice(): MediaChoice {
	try {
		return { ...DEFAULT, ...(JSON.parse(localStorage.getItem('q.call.choice') ?? '{}') as Partial<MediaChoice>) };
	} catch {
		return { ...DEFAULT };
	}
}

export function saveChoice(c: MediaChoice) {
	try {
		localStorage.setItem('q.call.choice', JSON.stringify(c));
	} catch {
		/* private window, or storage refused — the choice lasts for this visit */
	}
}

export interface Devices {
	cameras: MediaDeviceInfo[];
	mics: MediaDeviceInfo[];
	speakers: MediaDeviceInfo[];
}

export async function listDevices(): Promise<Devices> {
	const all = await navigator.mediaDevices.enumerateDevices();
	/* Before permission, browsers return blank entries; those are not choices. */
	const real = (k: MediaDeviceKind) => all.filter((d) => d.kind === k && d.deviceId);
	return { cameras: real('videoinput'), mics: real('audioinput'), speakers: real('audiooutput') };
}

/** Whether this browser can send sound to a chosen speaker (Safari from 18.4). */
export const canPickSpeaker = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

export const VIDEO_SHAPE: Record<Exclude<Quality, 'voice'>, { width: number; height: number; fps: number; bitrate: number }> = {
	best: { width: 1280, height: 720, fps: 30, bitrate: 1_500_000 },
	saver: { width: 640, height: 360, fps: 20, bitrate: 400_000 }
};

/** Speech in Opus is clear at 32 kbps; headroom for a good microphone. */
export const AUDIO_BITRATE = 48_000;

function audioConstraints(c: MediaChoice): MediaTrackConstraints {
	return {
		...(c.mic ? { deviceId: { exact: c.mic } } : {}),
		echoCancellation: c.cleanup,
		noiseSuppression: c.cleanup,
		autoGainControl: c.cleanup,
		channelCount: { ideal: 1 },
		sampleRate: { ideal: 48000 }
	};
}

function videoConstraints(c: MediaChoice): MediaTrackConstraints | false {
	if (c.quality === 'voice') return false;
	const s = VIDEO_SHAPE[c.quality];
	return {
		...(c.camera ? { deviceId: { exact: c.camera } } : { facingMode: 'user' }),
		width: { ideal: s.width },
		height: { ideal: s.height },
		aspectRatio: { ideal: 16 / 9 },
		frameRate: { ideal: s.fps, max: 30 }
	};
}

/**
 * Open camera and microphone as chosen. If a remembered device has gone (the
 * headset is in a drawer), fall back to the default rather than fail.
 */
export async function openMedia(c: MediaChoice): Promise<MediaStream> {
	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(c), video: videoConstraints(c) });
	} catch (e) {
		if ((e as Error).name !== 'OverconstrainedError' && (e as Error).name !== 'NotFoundError') throw e;
		stream = await navigator.mediaDevices.getUserMedia({
			audio: audioConstraints({ ...c, mic: undefined }),
			video: videoConstraints({ ...c, camera: undefined })
		});
	}
	tune(stream);
	return stream;
}

/** Tell the encoder what it is carrying: a voice, and a moving face. */
export function tune(stream: MediaStream) {
	for (const t of stream.getAudioTracks()) if ('contentHint' in t) t.contentHint = 'speech';
	for (const t of stream.getVideoTracks()) if ('contentHint' in t) t.contentHint = 'motion';
}

export function stopAll(stream: MediaStream | null | undefined) {
	stream?.getTracks().forEach((t) => t.stop());
}

/** A live 0–1 level for a microphone. Returns a stop function. */
export function meter(stream: MediaStream, onLevel: (level: number) => void): () => void {
	const track = stream.getAudioTracks()[0];
	if (!track) return () => {};
	const ctx = new AudioContext();
	const src = ctx.createMediaStreamSource(new MediaStream([track]));
	const an = ctx.createAnalyser();
	an.fftSize = 512;
	src.connect(an);
	const buf = new Float32Array(an.fftSize);
	let raf = 0;
	const tick = () => {
		an.getFloatTimeDomainData(buf);
		let sum = 0;
		for (const v of buf) sum += v * v;
		/* RMS to a rough loudness: quiet speech ≈ 0.3, raised voice ≈ 0.8. */
		onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
		raf = requestAnimationFrame(tick);
	};
	tick();
	void ctx.resume().catch(() => {});
	return () => {
		cancelAnimationFrame(raf);
		src.disconnect();
		void ctx.close().catch(() => {});
	};
}

/** Send sound to a chosen speaker, where the browser allows it. */
export async function useSpeaker(el: HTMLMediaElement, speaker?: string) {
	if (!speaker || !canPickSpeaker()) return;
	try {
		await (el as HTMLMediaElement & { setSinkId(id: string): Promise<void> }).setSinkId(speaker);
	} catch {
		/* the device went away; the default speaker plays instead */
	}
}

/** A short two-note chime through the chosen speaker. */
export async function testSound(speaker?: string) {
	const ctx = new AudioContext();
	const out = ctx.createMediaStreamDestination();
	const el = new Audio();
	el.srcObject = out.stream;
	await useSpeaker(el, speaker);
	await el.play().catch(() => {});
	const t = ctx.currentTime + 0.05;
	for (const [i, f] of [660, 880].entries()) {
		const o = ctx.createOscillator();
		const g = ctx.createGain();
		o.frequency.value = f;
		g.gain.setValueAtTime(0, t + i * 0.25);
		g.gain.linearRampToValueAtTime(0.25, t + i * 0.25 + 0.02);
		g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.25 + 0.4);
		o.connect(g).connect(out);
		o.start(t + i * 0.25);
		o.stop(t + i * 0.25 + 0.45);
	}
	setTimeout(() => {
		el.srcObject = null;
		void ctx.close().catch(() => {});
	}, 1200);
}

/** What went wrong opening the camera or microphone, in words that say what to do. */
export function explainMediaError(e: unknown): string {
	switch ((e as Error)?.name) {
		case 'NotAllowedError':
			return 'Q was not allowed to use the camera or microphone. Allow it in the browser’s settings for this site, then try again.';
		case 'NotFoundError':
			return 'No camera or microphone was found. Plug one in, or choose Voice only.';
		case 'NotReadableError':
		case 'AbortError':
			return 'Another app is holding the camera or microphone — close Zoom, Teams or FaceTime and try again.';
		case 'SecurityError':
			return 'Calls need a secure page (https).';
		default:
			return `The camera or microphone could not be opened${(e as Error)?.message ? `: ${(e as Error).message}` : '.'}`;
	}
}
