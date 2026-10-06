/* An office's records on the federation's storage (ADR-Q-038): filed by anyone who writes, read by whoever holds the office. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { identityFromSeed } from '../src/passkey';

import { archiveItem, newOfficeKeyring, officeIdentities, readArchive, turnOver } from '../src/offices';

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
		const Entries = [...files.keys()].filter((k) => k.startsWith(path) && !k.slice(path.length).includes('/')).map((FullPath) => ({ FullPath }));
		res.setHeader('content-type', 'application/json');
		return res.end(JSON.stringify({ Entries }));
	}
	const f = files.get(path);
	if (!f) { res.statusCode = 404; return res.end(); }
	res.end(f);
});
const seed = (n: number) => new Uint8Array(32).fill(n);

test('letters to the treasurer are kept by the federation; the next treasurer reads them all', async () => {
	const fed = await identityFromSeed(seed(81));
	const ana = await identityFromSeed(seed(82));
	let ring = await newOfficeKeyring(fed.did, 'treasurer');
	const k1 = ring.keys[0].did;

	await new Promise<void>((r) => filer.listen(0, r));
	process.env.GATE_FILER = `http://127.0.0.1:${(filer.address() as AddressInfo).port}`;
	process.env.GATE_FEDERATIONS = fed.did;
	const { server } = await import('../../../node/gate/server.mjs');
	await new Promise<void>((r) => server.listen(0, r));
	const gate = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const url = (key: string) => `${gate}/archive/${fed.did}/${key}`;
	try {
		const first = await archiveItem(ana, { federation: fed.did, office: 'treasurer', officeKey: k1, body: { text: 'Can I pay in halves?' }, also: [ana.did] }, new Date('2026-10-06T10:00:00Z'));
		assert.equal((await fetch(url(k1), { method: 'POST', body: JSON.stringify(first) })).status, 200);
		const notSealedToIt = await archiveItem(ana, { federation: fed.did, office: 'treasurer', officeKey: k1, body: {} }).then((x) => ({ ...x, content: { ...x.content, officeKey: ana.did } }));
		assert.equal((await fetch(url(k1), { method: 'POST', body: JSON.stringify(notSealedToIt) })).status, 403);
		const unsigned = { ...first, signature: 'nope' };
		assert.equal((await fetch(url(k1), { method: 'POST', body: JSON.stringify(unsigned) })).status, 403);

		ring = await turnOver(ring);
		const k2 = ring.keys[1].did;
		const later = await archiveItem(ana, { federation: fed.did, office: 'treasurer', officeKey: k2, body: { text: 'Paid the first half.' } }, new Date('2028-02-01T10:00:00Z'));
		assert.equal((await fetch(url(k2), { method: 'POST', body: JSON.stringify(later) })).status, 200);

		const items = [...((await (await fetch(url(k1))).json()) as { items: unknown[] }).items, ...((await (await fetch(url(k2))).json()) as { items: unknown[] }).items];
		const read = await readArchive(items, await officeIdentities(ring));
		assert.deepEqual(read.map((r) => (r.body as { text: string }).text), ['Can I pay in halves?', 'Paid the first half.']);
		assert.ok(read.every((r) => r.filedBy === ana.did));
		assert.deepEqual(await readArchive(items, [await identityFromSeed(seed(99))]), [], 'nobody else reads a word');
	} finally {
		server.close();
		filer.close();
	}
});
