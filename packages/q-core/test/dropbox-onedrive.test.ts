/*
 * Dropbox and OneDrive as storage channels, each against a fake that behaves
 * like the real API for the calls Q makes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropboxChannel } from '../src/dropbox';
import { oneDriveChannel } from '../src/onedrive';
import { memoryChannel, syncChannels } from '../src/storage-channels';
import { sha256Hex } from '../src/vault';

function access(f: typeof fetch) {
	let calls = 0;
	return { fetch: f, async token(fresh?: boolean) { calls++; return fresh || calls > 1 ? 'good' : 'stale'; } };
}

function fakeDropbox() {
	const files = new Map<string, Uint8Array>();
	const f = (async (input: string | URL, init: RequestInit = {}) => {
		const url = new URL(String(input));
		const h = new Headers(init.headers);
		if (h.get('authorization') !== 'Bearer good') return new Response('expired', { status: 401 });
		if (url.pathname === '/2/files/list_folder') {
			const { path } = JSON.parse(String(init.body));
			const inside = [...files.keys()].filter((k) => k.startsWith(`${path}/`));
			if (!inside.length) return new Response('{"error_summary":"path/not_found/"}', { status: 409 });
			return Response.json({ entries: inside.map((k) => ({ '.tag': 'file', name: k.slice(path.length + 1) })), cursor: 'c', has_more: false });
		}
		const arg = JSON.parse(h.get('Dropbox-API-Arg') ?? '{}');
		if (url.pathname === '/2/files/download') {
			const b = files.get(arg.path);
			return b ? new Response(b) : new Response('{}', { status: 409 });
		}
		if (url.pathname === '/2/files/upload') {
			files.set(arg.path, new Uint8Array(init.body as Uint8Array));
			return Response.json({ name: arg.path });
		}
		return new Response('unexpected', { status: 500 });
	}) as typeof fetch;
	return { files, access: access(f) };
}

function fakeOneDrive() {
	const files = new Map<string, Uint8Array>();
	const folders = new Set<string>();
	const sessions = new Map<string, { path: string; parts: Uint8Array[] }>();
	const f = (async (input: string | URL, init: RequestInit = {}) => {
		const u = String(input);
		const method = init.method ?? 'GET';
		const up = sessions.get(u);
		if (up) {
			up.parts.push(new Uint8Array(init.body as Uint8Array));
			const total = Number(/\/(\d+)$/.exec(new Headers(init.headers).get('content-range')!)![1]);
			const have = up.parts.reduce((n, p) => n + p.length, 0);
			if (have >= total) {
				const all = new Uint8Array(have);
				let o = 0;
				for (const p of up.parts) (all.set(p, o), (o += p.length));
				files.set(up.path, all);
			}
			return new Response('{}', { status: have >= total ? 201 : 202 });
		}
		if (new Headers(init.headers).get('authorization') !== 'Bearer good') return new Response('expired', { status: 401 });
		const root = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';
		if (u === `${root}/children` && method === 'POST') {
			const { name } = JSON.parse(String(init.body));
			if (folders.has(name)) return new Response('{}', { status: 409 });
			folders.add(name);
			return Response.json({ name });
		}
		const m = /^approot:\/([^/:]+)(?:\/([^:]+))?:(.*)$/.exec(u.slice(u.indexOf('approot')));
		if (!m) return new Response('unexpected', { status: 500 });
		const dir = decodeURIComponent(m[1]);
		const name = m[2] ? decodeURIComponent(m[2]) : '';
		const rest = m[3];
		if (rest.startsWith('/children')) {
			if (!folders.has(dir)) return new Response('', { status: 404 });
			return Response.json({ value: [...files.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => ({ name: k.slice(dir.length + 1), file: {} })) });
		}
		if (rest === '/content' && method === 'GET') {
			const b = files.get(`${dir}/${name}`);
			return b ? new Response(b) : new Response('', { status: 404 });
		}
		if (rest === '/content' && method === 'PUT') {
			if (!folders.has(dir)) return new Response('', { status: 404 });
			files.set(`${dir}/${name}`, new Uint8Array(init.body as Uint8Array));
			return Response.json({ name });
		}
		if (rest === '/createUploadSession') {
			const uploadUrl = `https://upload.example/${sessions.size}`;
			sessions.set(uploadUrl, { path: `${dir}/${name}`, parts: [] });
			return Response.json({ uploadUrl });
		}
		return new Response('unexpected', { status: 500 });
	}) as typeof fetch;
	return { files, access: access(f) };
}

for (const [label, make, fake] of [
	['Dropbox', dropboxChannel, fakeDropbox],
	['OneDrive', oneDriveChannel, fakeOneDrive]
] as const) {
	test(`${label}: a vault syncs into its own folder, paths kept, bytes exact, a stale token refreshed, and a new device pulls it back`, async () => {
		const cloud = fake();
		const did = 'did:key:z6MkCloudTest';
		const ch = make(did, cloud.access);
		const here = memoryChannel('vault');
		const bytes = crypto.getRandomValues(new Uint8Array(300));
		const path = `sites/${await sha256Hex(bytes)}.dsv`;
		here.files.set(path, bytes);
		here.files.set('dostudy.json', new TextEncoder().encode(JSON.stringify({ did })));

		const r = await syncChannels(here, ch, did);
		assert.equal(r.failed.length, 0, r.failed.join('; '));
		assert.equal(r.sent, 1);
		assert.ok((await ch.list()).includes(path), 'the path comes back as it went in');
		assert.deepEqual([...(await ch.get(path))!], [...bytes]);

		const other = memoryChannel('iPhone');
		const back = await syncChannels(other, make(did, cloud.access), did);
		assert.equal(back.received, 1);
		assert.deepEqual([...other.files.get(path)!], [...bytes]);
	});

	test(`${label}: two worlds get two folders and never see each other’s files`, async () => {
		const cloud = fake();
		const personal = make('did:key:z6MkPersonal', cloud.access);
		const business = make('did:key:z6MkBusiness', cloud.access);
		const bytes = crypto.getRandomValues(new Uint8Array(40));
		await personal.put(`${await sha256Hex(bytes)}.dsv`, bytes);
		assert.equal((await business.list()).length, 0);
		assert.equal((await personal.list()).length, 1);
	});
}

test('OneDrive: a big file goes up in pieces and comes back whole', async () => {
	const cloud = fakeOneDrive();
	const ch = oneDriveChannel('did:key:z6MkBig', cloud.access);
	const bytes = new Uint8Array(9 * 1024 * 1024).map((_, i) => i % 251);
	await ch.put('big.dsv', bytes);
	const back = await ch.get('big.dsv');
	assert.equal(back?.length, bytes.length);
	assert.equal(back?.[5_000_000], bytes[5_000_000]);
});
