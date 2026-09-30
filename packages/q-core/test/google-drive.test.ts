/*
 * Google Drive as a storage channel, against a fake Drive that behaves like
 * the real API for the calls Q makes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleDriveChannel } from '../src/google-drive';
import { memoryChannel, syncChannels } from '../src/storage-channels';
import { sha256Hex } from '../src/vault';

function fakeDrive() {
	const files = new Map<string, { name: string; parents: string[]; appProperties?: Record<string, string>; mimeType?: string; bytes: Uint8Array }>();
	let n = 0;
	let tokenCalls = 0;
	const f = (async (input: string | URL, init: RequestInit = {}) => {
		const url = new URL(String(input));
		const auth = new Headers(init.headers).get('authorization');
		if (auth !== 'Bearer good') return new Response('expired', { status: 401 });
		const method = init.method ?? 'GET';
		if (url.pathname === '/drive/v3/files' && method === 'GET') {
			const q = url.searchParams.get('q') ?? '';
			const did = /value='([^']+)'/.exec(q)?.[1];
			const parent = /'([^']+)' in parents/.exec(q)?.[1];
			const list = [...files.entries()]
				.filter(([, x]) => (did ? x.appProperties?.qdid === did : parent ? x.parents.includes(parent) : false))
				.map(([id, x]) => ({ id, name: x.name, appProperties: x.appProperties }));
			return Response.json({ files: list });
		}
		if (url.pathname === '/drive/v3/files' && method === 'POST') {
			const meta = JSON.parse(String(init.body));
			const id = `f${++n}`;
			files.set(id, { ...meta, parents: [], bytes: new Uint8Array() });
			return Response.json({ id });
		}
		if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
			const body = init.body as Uint8Array;
			const raw = Array.from(body, (b) => String.fromCharCode(b)).join('');
			const boundary = /boundary=(.+)$/.exec(new Headers(init.headers).get('content-type')!)![1];
			const metaStart = raw.indexOf('\r\n\r\n') + 4;
			const metaEnd = raw.indexOf(`\r\n--${boundary}`, metaStart);
			const meta = JSON.parse(raw.slice(metaStart, metaEnd));
			const dataStart = raw.indexOf('\r\n\r\n', metaEnd) + 4;
			const tail = `\r\n--${boundary}--`.length;
			const data = body.slice(dataStart, body.length - tail);
			const id = `f${++n}`;
			files.set(id, { ...meta, bytes: data });
			return Response.json({ id });
		}
		const one = /^\/(upload\/)?drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
		if (one) {
			const x = files.get(one[2]);
			if (!x) return new Response('', { status: 404 });
			if (method === 'PATCH') {
				x.bytes = new Uint8Array(init.body as Uint8Array);
				return Response.json({ id: one[2] });
			}
			return new Response(x.bytes);
		}
		return new Response('unexpected', { status: 500 });
	}) as typeof fetch;
	return {
		files,
		fetch: f,
		access: {
			fetch: f,
			async token(fresh?: boolean) {
				tokenCalls++;
				return fresh || tokenCalls > 1 ? 'good' : 'stale';
			}
		}
	};
}

test('a vault syncs into its own Drive folder, paths kept, bytes exact, and a stale token is refreshed', async () => {
	const drive = fakeDrive();
	const did = 'did:key:z6MkDriveTest';
	const ch = googleDriveChannel(did, drive.access);
	const here = memoryChannel('vault');
	const bytes = crypto.getRandomValues(new Uint8Array(300));
	const path = `sites/${await sha256Hex(bytes)}.dsv`;
	here.files.set(path, bytes);
	here.files.set('dostudy.json', new TextEncoder().encode(JSON.stringify({ did })));

	const r = await syncChannels(here, ch, did);
	assert.equal(r.failed.length, 0, r.failed.join('; '));
	assert.equal(r.sent, 1);
	const folder = [...drive.files.values()].find((x) => x.appProperties?.qdid === did);
	assert.ok(folder, 'a folder of its own, tagged with the DID');
	assert.ok((await ch.list()).includes(path));
	assert.deepEqual([...(await ch.get(path))!], [...bytes]);

	/* A second device, empty, pulls it back down. */
	const other = memoryChannel('iPhone');
	const back = await syncChannels(other, googleDriveChannel(did, drive.access), did);
	assert.equal(back.received, 1);
	assert.deepEqual([...other.files.get(path)!], [...bytes]);
});

test('two worlds get two folders and never see each other’s files', async () => {
	const drive = fakeDrive();
	const personal = googleDriveChannel('did:key:z6MkPersonal', drive.access);
	const business = googleDriveChannel('did:key:z6MkBusiness', drive.access);
	const bytes = crypto.getRandomValues(new Uint8Array(40));
	await personal.put(`${await sha256Hex(bytes)}.dsv`, bytes);
	assert.equal((await business.list()).length, 0);
	assert.equal((await personal.list()).length, 1);
});
