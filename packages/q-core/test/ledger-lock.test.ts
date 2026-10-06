/* The cash-out lock (audit A4): two asks decided on the same books can't both be filed; the second is told to decide again. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { identityFromSeed } from '../src/passkey';
import { sealWith } from '../src/seal';
import { MINT_SCHEMA, MINT_SOURCE } from '../src/mint';

const files = new Map<string, Buffer>();
const filer = http.createServer(async (req, res) => {
	const path = new URL(req.url!, 'http://f').pathname;
	if (req.method === 'POST') {
		const chunks: Buffer[] = [];
		for await (const c of req) chunks.push(c as Buffer);
		const form = await new Request('http://f', { method: 'POST', headers: { 'content-type': req.headers['content-type']! }, body: Buffer.concat(chunks) }).formData();
		/* A slow disk, so two writes really do overlap. */
		await new Promise((r) => setTimeout(r, 30));
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

test('two cash-outs decided on the same books: one is filed, the other must decide again', async () => {
	const mint = await identityFromSeed(seed(61));
	const ana = await identityFromSeed(seed(62));
	const bo = await identityFromSeed(seed(63));
	await new Promise<void>((r) => filer.listen(0, r));
	process.env.GATE_FILER = `http://127.0.0.1:${(filer.address() as AddressInfo).port}`;
	process.env.GATE_MINTS = mint.did;
	const { server } = await import('../../../node/gate/server.mjs');
	await new Promise<void>((r) => server.listen(0, r));
	const gate = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const url = `${gate}/mint/${mint.did}/test`;
	const ask = (who: typeof ana) => sealWith(who, { schema: MINT_SCHEMA, source: MINT_SOURCE, mint: mint.did, kind: 'cashout', credits: 10, mode: 'test', from: who.did, at: new Date().toISOString() });
	try {
		const first = await (await fetch(url)).json();
		assert.equal(first.tip, 0);
		const [a, b] = await Promise.all([ask(ana), ask(bo)]);
		const post = (x: unknown, tip?: number) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(tip === undefined ? {} : { 'x-ledger-tip': String(tip) }) }, body: JSON.stringify(x) });
		const [ra, rb] = await Promise.all([post(a, 0), post(b, 0)]);
		assert.deepEqual([ra.status, rb.status].sort(), [200, 409], 'one in, one told to try again');
		const after = await (await fetch(url)).json();
		assert.equal(after.tip, 1);
		const loser = ra.status === 409 ? a : b;
		assert.equal((await post(loser, after.tip)).status, 200, 'decided again on the new books, it goes in');
		assert.equal((await post(loser, 0)).status, 200, 'sending the same receipt again changes nothing');
		assert.equal((await (await fetch(url)).json()).tip, 2);
	} finally {
		server.close();
		filer.close();
	}
});
