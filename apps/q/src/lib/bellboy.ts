/*
 * The bell (ADR-Q-014 §4). Q listens to your inbox on the bellboy; a notice
 * says who something is from, its title, and where to collect it. Clicking it
 * collects the sealed receipt from the storage unit, checks its hash, opens
 * it, keeps it in your vault — Captured — and releases custody.
 *
 * DEV STAND-INS, to be replaced (ADR-Q-014 build order):
 *   - Signing in to the bellboy uses an inbox name and password from
 *     apps/q/.env.local (node/bin/bell-setup.sh writes it), not your DID
 *     (ADR-Q-010 §5).
 *   - Sealing is AES-GCM with a test key from the same file, shared with
 *     node/bin/ring.mjs, not seal.ts sealed to your key.
 */
import { env } from '$env/dynamic/public';
import { dev } from '$app/environment';
import { seal } from '@inqbeta/q-core/seal';
import { saveLocked } from '@inqbeta/q-core/folder';
import { connectMqtt, type MqttLine } from '$lib/mqtt-ws';

export const NOTICE_SCHEMA = 'inqbeta.notice/1';
export interface Notice {
	schema: typeof NOTICE_SCHEMA;
	/** sha256 of the sealed receipt, hex. */
	receipt: string;
	from: string;
	title: string;
	kind: 'message' | 'invitation' | 'call' | 'decision';
	/** Where the sealed receipt waits: storage unit URLs. */
	collect: string[];
}
function isNotice(x: unknown): x is Notice {
	const n = x as Notice;
	return !!n && n.schema === NOTICE_SCHEMA && /^[0-9a-f]{64}$/.test(n.receipt) && typeof n.from === 'string' && typeof n.title === 'string' && Array.isArray(n.collect);
}

export interface BellConfig {
	url: string;
	inbox: string;
	password: string;
	key: string;
}
/** The bell is on only when .env.local says where the bellboy is. */
export function bellConfig(): BellConfig | null {
	const url = env.PUBLIC_BELLBOY_URL, inbox = env.PUBLIC_BELLBOY_INBOX;
	const password = env.PUBLIC_BELLBOY_PASSWORD, key = env.PUBLIC_BELLBOY_KEY;
	return url && inbox && password && key && /^[0-9a-f]{64}$/.test(key) ? { url, inbox, password, key } : null;
}

/* ---- The stand-in seal: AES-GCM, 12-byte IV first, then the ciphertext. ---- */

const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));
async function keyFrom(k: string) {
	return crypto.subtle.importKey('raw', hex(k), 'AES-GCM', false, ['decrypt', 'encrypt']);
}
/** Seal with the stand-in key: 12-byte IV, then the ciphertext. */
async function close(key: string, plain: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(key), plain));
	const out = new Uint8Array(12 + ct.length);
	out.set(iv);
	out.set(ct, 12);
	return out;
}
const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
async function open(key: string, sealed: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(0, 12) }, await keyFrom(key), sealed.slice(12));
	return new Uint8Array(plain);
}
async function sha256(b: Uint8Array<ArrayBuffer>): Promise<string> {
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* ---- Listening ---- */

/** One id per browser, so the bellboy keeps this browser's session while it's closed. */
function clientId(inbox: string): string {
	const k = 'q.bellboy.client';
	try {
		const have = localStorage.getItem(k);
		if (have) return have;
		const made = `q-${inbox}-${crypto.randomUUID().slice(0, 8)}`;
		localStorage.setItem(k, made);
		return made;
	} catch {
		return `q-${inbox}-${crypto.randomUUID().slice(0, 8)}`;
	}
}

/**
 * Listen for notices. Calls back with each one opened; anything that isn't a
 * notice sealed with our key is ignored. Returns a function that hangs up.
 */
export async function listen(c: BellConfig, onNotice: (n: Notice) => void, onTrouble?: (says: string) => void): Promise<() => void> {
	let line: MqttLine | null = null;
	let stopped = false;
	const td = new TextDecoder();
	const go = async (wait = 0): Promise<void> => {
		if (stopped) return;
		if (wait) await new Promise((r) => setTimeout(r, wait));
		try {
			line = await connectMqtt(
				{
					url: c.url,
					clientId: clientId(c.inbox),
					username: c.inbox,
					password: c.password,
					clean: false,
					onMessage: async (_topic, payload) => {
						try {
							const n = JSON.parse(td.decode(await open(c.key, fromBase64(td.decode(payload)))));
							if (isNotice(n)) onNotice(n);
						} catch {
							/* Not for us, or not sealed with our key: a bellboy never shows what it can't open. */
						}
					},
					/* Lost the line: try again, more slowly each time, up to a minute. */
					onClose: (why) => {
						onTrouble?.(why);
						void go(Math.min(60_000, (wait || 2_000) * 2));
					}
				},
				[`q/in/${c.inbox}`]
			);
		} catch (e) {
			onTrouble?.(e instanceof Error ? e.message : String(e));
			void go(Math.min(60_000, (wait || 2_000) * 2));
		}
	};
	await go();
	return () => {
		stopped = true;
		line?.close();
	};
}

/* ---- Collecting ---- */

/** Reach the storage unit; in development, through Q's own server if the browser is refused (CORS). */
async function storage(url: string, method: 'GET' | 'DELETE' | 'PUT', bytes?: Uint8Array<ArrayBuffer>): Promise<Response> {
	try {
		if (method === 'PUT') {
			const form = new FormData();
			form.append('file', new Blob([bytes!]), url.split('/').pop()!);
			return await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) });
		}
		return await fetch(url, { method, signal: AbortSignal.timeout(10_000) });
	} catch (e) {
		if (!dev) throw e;
		return fetch('/api/node-collect', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ url, method, body: bytes ? toBase64(bytes) : undefined })
		});
	}
}

/* ---- Ringing someone else's bell (linking up, ADR-Q-015) ---- */

/** Where this node's storage unit is: the same host as the bellboy, port 8888. */
function storageBase(c: BellConfig): string {
	return `http://${new URL(c.url).hostname}:8888`;
}

/**
 * Send something to another inbox the ADR-Q-014 way: the sealed receipt into
 * the storage unit, then a sealed notice to their bellboy saying who and what.
 */
export async function ring(c: BellConfig, to: string, n: { from: string; title: string; kind: Notice['kind'] }, receipt: unknown): Promise<{ ok: true } | { ok: false; says: string }> {
	try {
		const sealed = await close(c.key, new TextEncoder().encode(JSON.stringify(receipt)));
		const hash = await sha256(sealed);
		const url = `${storageBase(c)}/holding/${hash}`;
		const put = await storage(url, 'PUT', sealed);
		if (!put.ok) return { ok: false, says: `The storage unit didn’t take it (${put.status}).` };
		const notice: Notice = { schema: NOTICE_SCHEMA, receipt: hash, from: n.from, title: n.title, kind: n.kind, collect: [url] };
		const payload = toBase64(await close(c.key, new TextEncoder().encode(JSON.stringify(notice))));
		const line = await connectMqtt({ url: c.url, clientId: `q-ring-${crypto.randomUUID().slice(0, 8)}`, username: c.inbox, password: c.password, onMessage: () => {} }, []);
		await line.publish(`q/in/${to}`, payload);
		line.close();
		return { ok: true };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

export type Collected = { ok: true; says: string; receipt: unknown } | { ok: false; says: string };

/** Collect, check, open, keep, release. Each step says what it found. */
export async function collect(c: BellConfig, n: Notice): Promise<Collected> {
	for (const url of n.collect) {
		try {
			const r = await storage(url, 'GET');
			if (r.status === 404) continue;
			if (!r.ok) continue;
			const sealed = new Uint8Array(await r.arrayBuffer());
			if ((await sha256(sealed)) !== n.receipt) return { ok: false, says: 'What the storage unit gave back doesn’t match the notice. It wasn’t kept.' };
			const receipt = JSON.parse(new TextDecoder().decode(await open(c.key, sealed)));
			const kept = {
				schema: 'inqbeta.received/1',
				source: 'inqbeta:q/bell',
				from: n.from,
				title: n.title,
				kind: n.kind,
				hash: n.receipt,
				receipt,
				collectedAt: new Date().toISOString()
			};
			await saveLocked('received', `${n.receipt.slice(0, 16)}.json`, JSON.stringify(await seal(kept), null, 2), 'application/json');
			/* Custody passes: the holding bay may let its copy go. A failure here costs nothing — it's sealed, and has a lifetime. */
			await storage(url, 'DELETE').catch(() => {});
			return { ok: true, says: 'Captured. It’s in your vault.', receipt };
		} catch {
			/* Try the next place it waits. */
		}
	}
	return { ok: false, says: 'It’s no longer waiting anywhere this device can reach. Is this device on the mesh?' };
}
