/* Testing Q on the node: claims and reports kept, only signed ones, read by anyone. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { identityFromSeed } from '../src/passkey';
import { claim, report, type Checklist } from '../src/checks';

const files = new Map<string, Buffer>();
const filer = http.createServer(async (req, res) => {
	const path = new URL(req.url!, 'http://f').pathname;
	if (req.method === 'POST') {
		const chunks: Buffer[] = [];
		for await (const c of req) chunks.push(c as Buffer);
		const form = await new Request('http://f', { method: 'POST', headers: { 'content-type': req.headers['content-type']! }, body: Buffer.concat(chunks) }).formData();
		files.set(path, Buffer.from(await (form.get('file') as Blob).arrayBuffer()));
		return res.end('{}');
	}
	if (path.endsWith('/')) {
		/* Files directly in this folder, and the folders under it (as SeaweedFS lists them). */
		const names = new Set<string>();
		for (const k of files.keys()) if (k.startsWith(path)) names.add(path + k.slice(path.length).split('/')[0] + (k.slice(path.length).includes('/') ? '/' : ''));
		res.setHeader('content-type', 'application/json');
		return res.end(JSON.stringify({ Entries: [...names].map((FullPath) => ({ FullPath: FullPath.replace(/\/$/, '') })) }));
	}
	const f = files.get(path);
	if (!f) { res.statusCode = 404; return res.end(); }
	res.end(f);
});
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 67 + n) % 251);
const list: Checklist = { id: 'keys', page: '/keys', title: 'Keys', group: 'you', needs: 'Signed in', checks: [{ id: 'link-site', says: 'Link a site.', how: 'human', area: 'works' }] };

test('claims and reports: signed ones kept, tampered or odd ones refused', async () => {
	const tess = await identityFromSeed(seed(1));
	await new Promise<void>((r) => filer.listen(0, r));
	process.env.GATE_FILER = `http://127.0.0.1:${(filer.address() as AddressInfo).port}`;
	const { server } = await import('../../../node/gate/server.mjs');
	await new Promise<void>((r) => server.listen(0, r));
	const gate = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const post = (x: unknown) => fetch(`${gate}/checks`, { method: 'POST', body: JSON.stringify(x) });
	try {
		const c = await claim(tess, list);
		const r = await report(tess, list, { site: 'https://inqbeta.com', results: [{ check: 'link-site', outcome: 'fail', note: 'Nothing happens.' }] });
		assert.equal((await post(c)).status, 200);
		assert.equal((await post(r)).status, 200);
		assert.equal((await post({ ...r, content: { ...r.content, list: 'devices' } })).status, 400, 'tampered');
		assert.equal((await post({ ...r, content: { ...r.content, list: '../etc' } })).status, 400, 'odd list name');
		const items = ((await (await fetch(`${gate}/checks`)).json()) as { items: { content: { schema: string } }[] }).items;
		assert.deepEqual(items.map((x) => x.content.schema).sort(), ['inqbeta.check-claim/1', 'inqbeta.check-report/1']);
	} finally {
		server.close();
		filer.close();
	}
});
