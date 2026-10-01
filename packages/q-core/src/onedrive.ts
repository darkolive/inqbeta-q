/*
 * OneDrive as a storage channel (docs/q/storage-channels.md), the same shape
 * as Google Drive: list, get, put, and nothing else.
 *
 * App-folder access (Files.ReadWrite.AppFolder): Q sees only
 * OneDrive/Apps/<Q's app>/, never the rest of your OneDrive. Inside it, one
 * folder per world (cloud-names.ts). Microsoft sees hashes and ciphertext.
 */
import type { StorageChannel } from './storage-channels';
import { vaultFolder, flat, unflat, type CloudAccess } from './cloud-names';

const ROOT = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';
/* Graph's simple upload takes up to 4 MB; bigger files go in pieces. */
const SIMPLE_MAX = 4 * 1024 * 1024;
/* Pieces must be a multiple of 320 KiB. */
const PIECE = 320 * 1024 * 16;

export function oneDriveChannel(did: string, access: CloudAccess, called = 'OneDrive'): StorageChannel {
	const f = access.fetch ?? fetch.bind(globalThis);
	const dir = vaultFolder(did);
	const at = (name?: string) => `${ROOT}:/${encodeURIComponent(dir)}${name ? `/${encodeURIComponent(name)}` : ''}:`;
	let made = false;

	async function call(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
		const res = await f(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${await access.token(retried)}` } });
		if (res.status === 401 && !retried) return call(url, init, true);
		if (!res.ok && res.status !== 404 && res.status !== 409) {
			const why = await res.text().catch(() => '');
			throw new Error(`OneDrive said ${res.status}${why ? `: ${why.slice(0, 200)}` : ''}`);
		}
		return res;
	}

	async function ensureFolder() {
		if (made) return;
		/* 409 means it's already there, which is what we wanted. */
		await call(`${ROOT}/children`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: dir, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
		});
		made = true;
	}

	return {
		id: `onedrive:${did}`,
		kind: 'onedrive',
		called,
		async list() {
			const names: string[] = [];
			let url: string | undefined = `${at()}/children?$select=name,file&$top=999`;
			while (url) {
				const res = await call(url);
				if (res.status === 404) return []; /* no folder yet */
				const page = (await res.json()) as { value: { name: string; file?: unknown }[]; '@odata.nextLink'?: string };
				for (const x of page.value) if (x.file) names.push(unflat(x.name));
				url = page['@odata.nextLink'];
			}
			return names;
		},
		async get(path) {
			const res = await call(`${at(flat(path))}/content`);
			return res.status === 404 ? null : new Uint8Array(await res.arrayBuffer());
		},
		async put(path, bytes) {
			await ensureFolder();
			if (bytes.length <= SIMPLE_MAX) {
				await call(`${at(flat(path))}/content`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes as BodyInit });
				return;
			}
			const session = (await (
				await call(`${at(flat(path))}/createUploadSession`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } })
				})
			).json()) as { uploadUrl: string };
			for (let start = 0; start < bytes.length; start += PIECE) {
				const end = Math.min(start + PIECE, bytes.length);
				/* The upload address carries its own permission: no token on these. */
				const res = await f(session.uploadUrl, {
					method: 'PUT',
					headers: { 'content-range': `bytes ${start}-${end - 1}/${bytes.length}` },
					body: bytes.slice(start, end) as BodyInit
				});
				if (!res.ok) throw new Error(`OneDrive stopped taking ${path} at ${start} bytes (${res.status}).`);
			}
		}
	};
}
