/*
 * Google Drive, connected — the browser side (docs/q/storage-channels.md).
 *
 * Signing in to Google opens a storage channel. It never signs you in to Q
 * and never unlocks an identity (ADR-Q-005, "forbidden assumptions").
 *
 *   connect      PKCE sign-in, scope drive.file (Q sees only what Q made)
 *   the token    Google's refresh token is LOCKED into your vault like any
 *                other file — so it travels with backups, opens only with your
 *                passkey, and Q's server never keeps it
 *   in use       a short-lived access token held in memory; refreshed through
 *                Q's server, which is the only place the client secret lives
 *   disconnect   revoked at Google, and the locked token removed
 */
import { googleDriveChannel } from '@inqbeta/q-core/google-drive';
import type { StorageChannel } from '@inqbeta/q-core/storage-channels';
import { deleteItem, listItems, readItem, saveLocked, type FolderItem } from '@inqbeta/q-core/folder';
import { b64url } from '@inqbeta/q-core/canonical';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const PENDING = 'q-google-oauth';
const WHERE = 'storage-channels';
const NAME = 'google-drive.json';

interface Kept {
	kind: 'google-drive';
	refreshToken: string;
	connectedAt: string;
}

function redirectUri(): string {
	return `${location.origin}/channels/google`;
}

/*
 * Connecting opens Google in a SMALL WINDOW, not this tab (Darren, 25 Sep:
 * "being sent back, I'm signed out"). Your keys live only in this tab's
 * memory, so a full-page trip to Google and back threw them away. The window
 * comes back to /channels/google, hands the code to this tab, and closes —
 * this tab never reloads and you stay signed in.
 *
 * If the window cannot open (blocked), it falls back to the whole-page trip,
 * which still works: that page asks for one passkey touch.
 */
let pendingHere: { verifier: string; state: string } | null = null;

export const GOOGLE_MESSAGE = 'q-google-return';

/** Start. Call straight from a click, so the window is allowed to open. */
export async function connectGoogle(): Promise<{ ok: true; via: 'window' } | { ok: false; says: string } | never> {
	const w = window.open('', 'q-google', 'popup,width=520,height=680');
	try {
		const cfg = await jsonOf(await fetch('/api/channels/google/config'));
		if (!cfg.ok || !cfg.clientId) {
			w?.close();
			return { ok: false, says: String(cfg.says ?? 'Google Drive is not set up on this server. Restart pnpm dev:q after adding GOOGLE_CLIENT_ID to apps/q/.env.') };
		}
		const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
		const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
		const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
		const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
		url.search = new URLSearchParams({
			client_id: String(cfg.clientId),
			redirect_uri: redirectUri(),
			response_type: 'code',
			scope: SCOPE,
			access_type: 'offline',
			prompt: 'consent',
			include_granted_scopes: 'false',
			code_challenge: challenge,
			code_challenge_method: 'S256',
			state
		}).toString();
		if (w) {
			pendingHere = { verifier, state };
			w.location.href = url.toString();
			return { ok: true, via: 'window' };
		}
		/* No window: the whole-page trip. */
		sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state }));
		location.assign(url.toString());
		return new Promise(() => {});
	} catch (e) {
		w?.close();
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * In the signed-in tab: wait for the window to hand the code back, then
 * exchange it and lock the token into the vault, without leaving the page.
 */
export function watchGoogleReturn(done: (out: { ok: true } | { ok: false; says: string }) => void): () => void {
	async function onMessage(e: MessageEvent) {
		if (e.origin !== location.origin || (e.data as { kind?: string })?.kind !== GOOGLE_MESSAGE) return;
		const params = new URLSearchParams(String((e.data as { search?: string }).search ?? ''));
		const out = await exchangeGoogleCode(params);
		if (!out.ok) return done(out);
		done(await saveGoogleToken());
	}
	window.addEventListener('message', onMessage);
	return () => window.removeEventListener('message', onMessage);
}

/** In the small window: is this the window Q opened? Then hand the code back and close. */
export function handBackToOpener(): boolean {
	const opener = window.opener as Window | null;
	if (!opener || opener === window) return false;
	try {
		if (opener.location.origin !== location.origin) return false;
	} catch {
		return false;
	}
	opener.postMessage({ kind: GOOGLE_MESSAGE, search: location.search }, location.origin);
	setTimeout(() => window.close(), 150);
	return true;
}

let access: { token: string; until: number } | null = null;

/* Tokens that have come back from Google but are not yet locked into a vault —
 * the code must be exchanged within minutes, possibly before the passkey is
 * touched again after the redirect, so the two steps are apart. Memory only. */
let unsaved: { refreshToken: string; connectedAt: string } | null = null;

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
	const text = await res.text();
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return { ok: false, says: `Q's server answered ${res.status} without JSON${text ? `: ${text.slice(0, 160)}` : ''}` };
	}
}

/**
 * Step 1, straight away on return from Google (no passkey needed): exchange
 * the code. Never throws — every failure comes back as words.
 */
export async function exchangeGoogleCode(params: URLSearchParams): Promise<{ ok: true } | { ok: false; says: string }> {
	try {
		const err = params.get('error');
		if (err) return { ok: false, says: err === 'access_denied' ? 'Google Drive was not connected — you said no, which is fine.' : `Google said: ${err}` };
		if (!params.get('code')) return { ok: false, says: 'Google did not send a sign-in code back. Try Connect again from Copy locations.' };
		let pending: { verifier: string; state: string } | null = pendingHere;
		pendingHere = null;
		if (!pending) {
			try {
				pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null');
			} catch {
				pending = null;
			}
		}
		sessionStorage.removeItem(PENDING);
		if (!pending || params.get('state') !== pending.state)
			return { ok: false, says: 'That sign-in did not start in this tab (or was already used). Try Connect again from Copy locations.' };
		const res = await fetch('/api/channels/google/token', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ code: params.get('code'), verifier: pending.verifier, redirectUri: redirectUri() })
		});
		const out = await jsonOf(res);
		if (!out.ok || !out.accessToken) return { ok: false, says: String(out.says ?? 'Google did not give a token.') };
		if (!out.refreshToken)
			return {
				ok: false,
				says: 'Google did not give a lasting token. Go to myaccount.google.com → Security → Third-party access, remove Q, then Connect again.'
			};
		access = { token: String(out.accessToken), until: Date.now() + Number(out.expiresIn ?? 3600) * 1000 - 60_000 };
		unsaved = { refreshToken: String(out.refreshToken), connectedAt: new Date().toISOString() };
		return { ok: true };
	} catch (e) {
		console.error('[Q] Google Drive connect', e);
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** Step 2, once signed in with the vault open: lock the token into the vault. */
export async function saveGoogleToken(): Promise<{ ok: true } | { ok: false; says: string }> {
	if (!unsaved) return { ok: false, says: 'There is no Google Drive connection waiting to be saved.' };
	try {
		await saveLocked(WHERE, NAME, JSON.stringify({ kind: 'google-drive', ...unsaved } satisfies Kept), 'application/json');
		unsaved = null;
		return { ok: true };
	} catch (e) {
		console.error('[Q] Google Drive save', e);
		return { ok: false, says: `Connected, but the token could not be locked into your vault: ${e instanceof Error ? e.message : String(e)}` };
	}
}

async function keptItems(): Promise<{ item: FolderItem; kept: Kept }[]> {
	const out: { item: FolderItem; kept: Kept }[] = [];
	for (const item of await listItems()) {
		if (item.meta?.path !== WHERE || item.meta.name !== NAME) continue;
		try {
			const kept = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as Kept;
			if (kept.kind === 'google-drive' && kept.refreshToken) out.push({ item, kept });
		} catch {
			/* not ours, or cannot be opened by this passkey */
		}
	}
	return out.sort((a, b) => b.kept.connectedAt.localeCompare(a.kept.connectedAt));
}

/** Google Drive as a channel for this DID, or null when it has not been connected. */
export async function googleChannel(did: string): Promise<(StorageChannel & { connectedAt: string }) | null> {
	const newest = (await keptItems())[0];
	if (!newest) return null;
	const refreshToken = newest.kept.refreshToken;
	const ch = googleDriveChannel(did, {
		async token(fresh) {
			if (!fresh && access && access.until > Date.now()) return access.token;
			const res = await fetch('/api/channels/google/refresh', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ refreshToken })
			});
			const out = await jsonOf(res);
			if (!out.ok || !out.accessToken) throw new Error(String(out.says ?? 'Google Drive needs connecting again.'));
			access = { token: String(out.accessToken), until: Date.now() + Number(out.expiresIn ?? 3600) * 1000 - 60_000 };
			return access.token;
		}
	});
	return Object.assign(ch, { connectedAt: newest.kept.connectedAt });
}

/** Revoke at Google and remove the locked token. What is already in Drive stays there. */
export async function disconnectGoogle(): Promise<void> {
	const kept = await keptItems();
	/* Once, with the newest: Google revokes the whole grant for this account and
	 * Q, so every older token goes with it. Asking again per copy only drew 400s. */
	if (kept[0]) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(kept[0].kept.refreshToken)}`, { method: 'POST' }).catch(() => {});
	for (const { item } of kept) await deleteItem(item);
	access = null;
}
