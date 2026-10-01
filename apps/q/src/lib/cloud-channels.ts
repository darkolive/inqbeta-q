/*
 * Dropbox and OneDrive, connected — the browser side. The same journey as
 * Google Drive ($lib/google-channel.ts), for two more of the storage people
 * already have (Darren, 1 October: "what is it that's easy for people to do"
 * — a second place that's theirs, costing Incubator nothing).
 *
 *   connect      a small window to Dropbox or Microsoft, PKCE, app-folder
 *                access only (Q sees only the folder Q made)
 *   the token    the refresh token is LOCKED into your vault, travels with
 *                backups, opens only with your passkey; Q's server never keeps it
 *   in use       a short-lived access token in memory, refreshed through Q's
 *                server, the only place the app secret lives
 *   disconnect   the locked token is removed; what's in the cloud stays there
 */
import { dropboxChannel } from '@inqbeta/q-core/dropbox';
import { oneDriveChannel } from '@inqbeta/q-core/onedrive';
import type { StorageChannel } from '@inqbeta/q-core/storage-channels';
import { deleteItem, listItems, readItem, saveLocked, type FolderItem } from '@inqbeta/q-core/folder';
import { b64url } from '@inqbeta/q-core/canonical';

export type CloudId = 'dropbox' | 'onedrive';
export const CLOUDS: { id: CloudId; name: string }[] = [
	{ id: 'dropbox', name: 'Dropbox' },
	{ id: 'onedrive', name: 'OneDrive' }
];
const nameOf = (cid: CloudId) => CLOUDS.find((c) => c.id === cid)!.name;

const WHERE = 'storage-channels';
const MESSAGE = 'q-cloud-return';
const PENDING = (cid: CloudId) => `q-cloud-oauth-${cid}`;

interface Kept {
	kind: CloudId;
	refreshToken: string;
	connectedAt: string;
	savedAt?: string;
}

const redirectUri = (cid: CloudId) => `${location.origin}/channels/${cid}`;

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
	const text = await res.text();
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return { ok: false, says: `Q's server answered ${res.status} without JSON${text ? `: ${text.slice(0, 160)}` : ''}` };
	}
}

let pendingHere: Partial<Record<CloudId, { verifier: string; state: string }>> = {};
const access: Partial<Record<CloudId, { token: string; until: number }>> = {};
const unsaved: Partial<Record<CloudId, { refreshToken: string; connectedAt: string }>> = {};

/** Start. Call straight from a click, so the window is allowed to open. */
export async function connectCloud(cid: CloudId): Promise<{ ok: true } | { ok: false; says: string }> {
	const w = window.open('', `q-${cid}`, 'popup,width=520,height=680');
	try {
		const cfg = await jsonOf(await fetch(`/api/channels/${cid}/config`));
		if (!cfg.ok || !cfg.clientId) {
			w?.close();
			return { ok: false, says: String(cfg.says ?? `${nameOf(cid)} is not set up on this server yet.`) };
		}
		const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
		const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
		const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
		const url = new URL(String(cfg.authorize));
		url.search = new URLSearchParams({
			client_id: String(cfg.clientId),
			redirect_uri: redirectUri(cid),
			response_type: 'code',
			scope: String(cfg.scope),
			code_challenge: challenge,
			code_challenge_method: 'S256',
			state,
			...((cfg.extra as Record<string, string>) ?? {})
		}).toString();
		if (w) {
			pendingHere[cid] = { verifier, state };
			w.location.href = url.toString();
			return { ok: true };
		}
		sessionStorage.setItem(PENDING(cid), JSON.stringify({ verifier, state }));
		location.assign(url.toString());
		return new Promise(() => {});
	} catch (e) {
		w?.close();
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** In the signed-in tab: wait for the window to hand the code back, then exchange it and lock the token away. */
export function watchCloudReturn(done: (cid: CloudId, out: { ok: true } | { ok: false; says: string }) => void): () => void {
	async function onMessage(e: MessageEvent) {
		const d = e.data as { kind?: string; cid?: CloudId; search?: string };
		if (e.origin !== location.origin || d?.kind !== MESSAGE || !d.cid) return;
		const out = await exchangeCloudCode(d.cid, new URLSearchParams(String(d.search ?? '')));
		if (!out.ok) return done(d.cid, out);
		done(d.cid, await saveCloudToken(d.cid));
	}
	window.addEventListener('message', onMessage);
	return () => window.removeEventListener('message', onMessage);
}

/** In the small window: hand the code back to the tab that opened it, and close. */
export function handCloudBack(cid: CloudId): boolean {
	const opener = window.opener as Window | null;
	if (!opener || opener === window) return false;
	try {
		if (opener.location.origin !== location.origin) return false;
	} catch {
		return false;
	}
	opener.postMessage({ kind: MESSAGE, cid, search: location.search }, location.origin);
	setTimeout(() => window.close(), 150);
	return true;
}

export async function exchangeCloudCode(cid: CloudId, params: URLSearchParams): Promise<{ ok: true } | { ok: false; says: string }> {
	const name = nameOf(cid);
	try {
		const err = params.get('error');
		if (err) return { ok: false, says: err === 'access_denied' ? `${name} wasn’t connected — you said no, which is fine.` : `${name} said: ${params.get('error_description') ?? err}` };
		if (!params.get('code')) return { ok: false, says: `${name} didn’t send a sign-in code back. Try Connect again.` };
		let pending = pendingHere[cid] ?? null;
		delete pendingHere[cid];
		if (!pending) {
			try {
				pending = JSON.parse(sessionStorage.getItem(PENDING(cid)) ?? 'null');
			} catch {
				pending = null;
			}
		}
		sessionStorage.removeItem(PENDING(cid));
		if (!pending || params.get('state') !== pending.state) return { ok: false, says: 'That sign-in didn’t start in this tab (or was already used). Try Connect again.' };
		const out = await jsonOf(
			await fetch(`/api/channels/${cid}/token`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code: params.get('code'), verifier: pending.verifier, redirectUri: redirectUri(cid) })
			})
		);
		if (!out.ok || !out.accessToken) return { ok: false, says: String(out.says ?? `${name} didn’t give a token.`) };
		if (!out.refreshToken) return { ok: false, says: `${name} didn’t give a lasting token. Disconnect Q in your ${name} account settings, then Connect again.` };
		access[cid] = { token: String(out.accessToken), until: Date.now() + Number(out.expiresIn ?? 3600) * 1000 - 60_000 };
		unsaved[cid] = { refreshToken: String(out.refreshToken), connectedAt: new Date().toISOString() };
		return { ok: true };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

export async function saveCloudToken(cid: CloudId): Promise<{ ok: true } | { ok: false; says: string }> {
	const u = unsaved[cid];
	if (!u) return { ok: false, says: `There is no ${nameOf(cid)} connection waiting to be saved.` };
	try {
		await saveLocked(WHERE, `${cid}.json`, JSON.stringify({ kind: cid, ...u, savedAt: new Date().toISOString() } satisfies Kept), 'application/json');
		delete unsaved[cid];
		return { ok: true };
	} catch (e) {
		return { ok: false, says: `Connected, but the token couldn’t be locked into your vault: ${e instanceof Error ? e.message : String(e)}` };
	}
}

async function keptItems(cid: CloudId): Promise<{ item: FolderItem; kept: Kept }[]> {
	const out: { item: FolderItem; kept: Kept }[] = [];
	for (const item of await listItems()) {
		if (item.meta?.path !== WHERE || item.meta.name !== `${cid}.json`) continue;
		try {
			const kept = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as Kept;
			if (kept.kind === cid && kept.refreshToken) out.push({ item, kept });
		} catch {
			/* not ours, or can't be opened by this passkey */
		}
	}
	return out.sort((a, b) => (b.kept.savedAt ?? b.kept.connectedAt).localeCompare(a.kept.savedAt ?? a.kept.connectedAt));
}

/** Dropbox or OneDrive as a channel for this DID, or null when it hasn't been connected. */
export async function cloudChannel(cid: CloudId, did: string): Promise<(StorageChannel & { connectedAt: string }) | null> {
	const newest = (await keptItems(cid))[0];
	if (!newest) return null;
	let refreshToken = newest.kept.refreshToken;
	const savedAt = Date.parse(newest.kept.savedAt ?? newest.kept.connectedAt);
	const make = cid === 'dropbox' ? dropboxChannel : oneDriveChannel;
	const ch = make(did, {
		async token(fresh) {
			const a = access[cid];
			if (!fresh && a && a.until > Date.now()) return a.token;
			const out = await jsonOf(
				await fetch(`/api/channels/${cid}/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }) })
			);
			if (!out.ok || !out.accessToken) throw new Error(String(out.says ?? `${nameOf(cid)} needs connecting again.`));
			access[cid] = { token: String(out.accessToken), until: Date.now() + Number(out.expiresIn ?? 3600) * 1000 - 60_000 };
			/* Microsoft hands out a new refresh token as it goes: keep the newest, re-locked at most weekly. */
			if (out.refreshToken && out.refreshToken !== refreshToken) {
				refreshToken = String(out.refreshToken);
				if (Date.now() - savedAt > 7 * 86400000)
					void saveLocked(WHERE, `${cid}.json`, JSON.stringify({ kind: cid, refreshToken, connectedAt: newest.kept.connectedAt, savedAt: new Date().toISOString() } satisfies Kept), 'application/json').catch(() => {});
			}
			return access[cid]!.token;
		}
	});
	return Object.assign(ch, { connectedAt: newest.kept.connectedAt });
}

/** Remove the locked token. What's already in the cloud stays there, locked. */
export async function disconnectCloud(cid: CloudId): Promise<void> {
	for (const { item } of await keptItems(cid)) await deleteItem(item);
	delete access[cid];
}
