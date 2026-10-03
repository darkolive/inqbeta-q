/* The gate's relay (ADR-Q-028), end to end over HTTP against a stand-in filer. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { identityFromSeed } from '../src/passkey';
import { sealWith, checkReceipt } from '../src/seal';
import { CUSTODY_SCHEMA, CUSTODY_SOURCE, isCustody, relayOf } from '../src/custody';

/* A stand-in for the SeaweedFS filer: multipart POST, GET a file or a folder listing, DELETE. */
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
	if (req.method === 'DELETE') { files.delete(path); return res.end('{}'); }
	if (path.endsWith('/')) {
		const Entries = [...files.keys()].filter((k) => k.startsWith(path) && !k.slice(path.length).includes('/')).map((FullPath) => ({ FullPath }));
		res.setHeader('content-type', 'application/json');
		return res.end(JSON.stringify({ Entries }));
	}
	const f = files.get(path);
	if (!f) { res.statusCode = 404; return res.end(); }
	res.end(f);
});

test('the relay: holds a file and signs for it, won’t let go without an arrival elsewhere, counts totals only', async () => {
	await new Promise<void>((r) => filer.listen(0, r));
	process.env.GATE_FILER = `http://127.0.0.1:${(filer.address() as AddressInfo).port}`;
	process.env.GATE_SEED = 'ab'.repeat(32);
	const { server, nodeIdentity } = await import('../../../node/gate/server.mjs');
	await new Promise<void>((r) => server.listen(0, r));
	const gate = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	try {
		const me = await nodeIdentity();
		const terms = await (await fetch(`${gate}/relay`)).json();
		assert.equal(terms.where, `relay:${me.did}`);

		const ana = await identityFromSeed(new Uint8Array(32).fill(81));
		const { id, key } = await relayOf(ana);
		const bytes = new TextEncoder().encode('sealed vault file, pretend');
		const item = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');

		assert.equal((await fetch(`${gate}/relay/${id}`, { headers: { 'x-relay-key': 'not-the-key-at-all-nope' } })).status, 403);
		const wrongName = await fetch(`${gate}/relay/${id}/${'0'.repeat(64)}`, { method: 'POST', headers: { 'x-relay-key': key }, body: bytes });
		assert.equal(wrongName.status, 400, JSON.stringify(await wrongName.json()));

		const put = await fetch(`${gate}/relay/${id}/${item}?path=agreements/${item}.dsv`, { method: 'POST', headers: { 'x-relay-key': key }, body: bytes });
		const { held } = await put.json();
		assert.equal(put.status, 200);
		assert.ok(isCustody(held) && held.content.kind === 'held' && held.content.item === item && held.content.bytes === bytes.length);
		assert.equal((await checkReceipt(held)).ok, true, 'Q can check the node’s signature');
		assert.equal(held.did, me.did);

		const list = await (await fetch(`${gate}/relay/${id}`, { headers: { 'x-relay-key': key } })).json();
		assert.deepEqual(list.files.map((f: { item: string; path: string }) => [f.item, f.path]), [[item, `agreements/${item}.dsv`]]);
		const back = new Uint8Array(await (await fetch(`${gate}/relay/${id}/${item}`, { headers: { 'x-relay-key': key } })).arrayBuffer());
		assert.deepEqual([...back], [...bytes]);

		/* No arrival, no letting go; an arrival at the relay itself isn't elsewhere. */
		assert.equal((await fetch(`${gate}/relay/${id}/${item}`, { method: 'DELETE', headers: { 'x-relay-key': key } })).status, 403);
		const here = await sealWith(ana, { schema: CUSTODY_SCHEMA, source: CUSTODY_SOURCE, kind: 'arrived', item, bytes: bytes.length, where: terms.where, releases: terms.where, at: new Date().toISOString() });
		assert.equal((await fetch(`${gate}/relay/${id}/${item}`, { method: 'DELETE', headers: { 'x-relay-key': key }, body: JSON.stringify(here) })).status, 403);

		const arrived = await sealWith(ana, { schema: CUSTODY_SCHEMA, source: CUSTODY_SOURCE, kind: 'arrived', item, bytes: bytes.length, where: 'google-drive', releases: terms.where, at: new Date().toISOString() });
		assert.equal((await fetch(`${gate}/relay/${id}/${item}`, { method: 'DELETE', headers: { 'x-relay-key': key }, body: JSON.stringify(arrived) })).status, 200);
		assert.deepEqual((await (await fetch(`${gate}/relay/${id}`, { headers: { 'x-relay-key': key } })).json()).files, []);

		await new Promise((r) => setTimeout(r, 50));
		const stats = await (await fetch(`${gate}/relay/stats`)).json();
		assert.equal(stats.days[0].in.items, 1);
		assert.equal(stats.days[0].arrived.items, 1);
		assert.ok(!JSON.stringify(stats).includes(id), 'totals only: nothing about whose');
	} finally {
		server.close();
		filer.close();
	}
});
