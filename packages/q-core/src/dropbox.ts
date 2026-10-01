/*
 * Dropbox as a storage channel (docs/q/storage-channels.md), the same shape
 * as Google Drive: list, get, put, and nothing else.
 *
 * App-folder access: Q sees only Dropbox/Apps/<Q's app>/, never the rest of
 * your Dropbox. Inside it, one folder per world (cloud-names.ts). Dropbox
 * sees file names that are hashes, and ciphertext.
 */
import type { StorageChannel } from './storage-channels';
import { vaultFolder, flat, unflat, asciiJson, type CloudAccess } from './cloud-names';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

export function dropboxChannel(did: string, access: CloudAccess, called = 'Dropbox'): StorageChannel {
	const f = access.fetch ?? fetch.bind(globalThis);
	const dir = `/${vaultFolder(did)}`;

	async function call(url: string, init: RequestInit, retried = false): Promise<Response> {
		const res = await f(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${await access.token(retried)}` } });
		if (res.status === 401 && !retried) return call(url, init, true);
		/* 409 is how Dropbox says "not found" (and other path errors): the caller decides. */
		if (!res.ok && res.status !== 409) {
			const why = await res.text().catch(() => '');
			throw new Error(`Dropbox said ${res.status}${why ? `: ${why.slice(0, 200)}` : ''}`);
		}
		return res;
	}
	const rpc = (path: string, body: unknown) => call(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

	return {
		id: `dropbox:${did}`,
		kind: 'dropbox',
		called,
		async list() {
			const names: string[] = [];
			let res = await rpc('/files/list_folder', { path: dir, limit: 2000 });
			if (res.status === 409) return []; /* no folder yet: nothing held */
			let page = (await res.json()) as { entries: { '.tag': string; name: string }[]; cursor: string; has_more: boolean };
			for (;;) {
				for (const e of page.entries) if (e['.tag'] === 'file') names.push(unflat(e.name));
				if (!page.has_more) break;
				res = await rpc('/files/list_folder/continue', { cursor: page.cursor });
				page = await res.json();
			}
			return names;
		},
		async get(path) {
			const res = await call(`${CONTENT}/files/download`, { method: 'POST', headers: { 'Dropbox-API-Arg': asciiJson({ path: `${dir}/${flat(path)}` }) } });
			return res.status === 409 ? null : new Uint8Array(await res.arrayBuffer());
		},
		async put(path, bytes) {
			const res = await call(`${CONTENT}/files/upload`, {
				method: 'POST',
				headers: { 'content-type': 'application/octet-stream', 'Dropbox-API-Arg': asciiJson({ path: `${dir}/${flat(path)}`, mode: 'overwrite', mute: true }) },
				body: bytes as BodyInit
			});
			if (res.status === 409) throw new Error(`Dropbox would not take ${path}: ${(await res.text()).slice(0, 200)}`);
		}
	};
}
