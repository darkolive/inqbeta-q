/*
 * Google Drive as a storage channel (docs/q/storage-channels.md).
 *
 * Only list, get and put — the rules of what moves live in
 * storage-channels.ts, the same for every channel. Drive sees locked files
 * named by their hash, and ciphertext; nothing else leaves the vault.
 *
 * Scope `drive.file`: Q can see only the files Q made, never the rest of
 * your Drive. Each world (DID) has its own folder, "Q vault …<last 8 of DID>",
 * so a personal and a business vault never meet in one place — and
 * syncChannels refuses a folder owned by another DID anyway.
 *
 * Drive has no paths, only folders of files, so each file carries its vault
 * path in `appProperties.qpath` and sits flat in the one folder.
 */
import type { StorageChannel } from './storage-channels';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';

export interface DriveAccess {
	/** A current access token. `fresh` asks for a new one after a 401. */
	token(fresh?: boolean): Promise<string>;
	/** For tests. */
	fetch?: typeof fetch;
}

export function googleDriveChannel(did: string, access: DriveAccess, called = 'Google Drive'): StorageChannel {
	const f = access.fetch ?? fetch.bind(globalThis);
	let folderId: string | null = null;
	let ids: Map<string, string> | null = null;

	async function call(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
		const res = await f(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${await access.token(retried)}` } });
		if (res.status === 401 && !retried) return call(url, init, true);
		if (!res.ok && res.status !== 404) {
			const why = await res.text().catch(() => '');
			throw new Error(`Google Drive said ${res.status}${why ? `: ${why.slice(0, 200)}` : ''}`);
		}
		return res;
	}

	async function folder(): Promise<string> {
		if (folderId) return folderId;
		const q = `mimeType='${FOLDER}' and trashed=false and appProperties has { key='qdid' and value='${did}' }`;
		const found = (await (await call(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`)).json()) as { files?: { id: string }[] };
		if (found.files?.[0]) return (folderId = found.files[0].id);
		const made = (await (
			await call(`${API}/files?fields=id`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: `Q vault …${did.slice(-8)}`, mimeType: FOLDER, appProperties: { qdid: did } })
			})
		).json()) as { id: string };
		return (folderId = made.id);
	}

	async function index(): Promise<Map<string, string>> {
		const parent = await folder();
		const map = new Map<string, string>();
		let page = '';
		do {
			const q = `'${parent}' in parents and trashed=false`;
			const url = `${API}/files?q=${encodeURIComponent(q)}&pageSize=1000&fields=nextPageToken,files(id,name,appProperties)${page ? `&pageToken=${page}` : ''}`;
			const body = (await (await call(url)).json()) as {
				nextPageToken?: string;
				files?: { id: string; name: string; appProperties?: { qpath?: string } }[];
			};
			for (const x of body.files ?? []) map.set(x.appProperties?.qpath ?? x.name, x.id);
			page = body.nextPageToken ?? '';
		} while (page);
		return (ids = map);
	}

	return {
		id: `google-drive:${did}`,
		kind: 'google-drive',
		called,
		async list() {
			return [...(await index()).keys()];
		},
		async get(path) {
			const id = (ids ?? (await index())).get(path);
			if (!id) return null;
			const res = await call(`${API}/files/${id}?alt=media`);
			return res.status === 404 ? null : new Uint8Array(await res.arrayBuffer());
		},
		async put(path, bytes) {
			const known = (ids ?? (await index())).get(path);
			if (known) {
				await call(`${UPLOAD}/files/${known}?uploadType=media`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/octet-stream' },
					body: bytes as BodyInit
				});
				return;
			}
			const meta = { name: path.split('/').pop(), parents: [await folder()], appProperties: { qpath: path } };
			const boundary = `q${crypto.randomUUID()}`;
			const head = new TextEncoder().encode(
				`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`
			);
			const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
			const body = new Uint8Array(head.length + bytes.length + tail.length);
			body.set(head);
			body.set(bytes, head.length);
			body.set(tail, head.length + bytes.length);
			const made = (await (
				await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
					method: 'POST',
					headers: { 'content-type': `multipart/related; boundary=${boundary}` },
					body: body as BodyInit
				})
			).json()) as { id: string };
			ids?.set(path, made.id);
		}
	};
}
