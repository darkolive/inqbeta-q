/*
 * The door's test rig (ADR-Q-034 step 6, job B1): the real gate over HTTP,
 * a stand-in filer, the door on for a host in test. Darren (the root) is let
 * in; Tess is refused, given a pass, let in, the pass taken back, refused.
 * Only the root can put things on the door; the list is public.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { identityFromSeed } from '../src/passkey';
import { givePass, takePass, OPENING_SOON } from '../src/door';

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
	const f = files.get(path);
	if (!f) { res.statusCode = 404; return res.end(); }
	res.end(f);
});

const HOST = 'did:key:z6MkRigHost';
const seed = (n: number) => new Uint8Array(32).fill(n);

test('the door, end to end: Darren in; Tess refused, passed, in, pass taken back, refused', async () => {
	const darren = await identityFromSeed(seed(91));
	const tess = await identityFromSeed(seed(92));
	const mallory = await identityFromSeed(seed(93));
	await new Promise<void>((r) => filer.listen(0, r));
	process.env.GATE_FILER = `http://127.0.0.1:${(filer.address() as AddressInfo).port}`;
	process.env.GATE_DOOR_ROOT = darren.did;
	process.env.GATE_DOOR_HOST = HOST;
	delete process.env.GATE_DOOR;
	const { server } = await import('../../../node/gate/server.mjs');
	await new Promise<void>((r) => server.listen(0, r));
	const gate = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

	/* Acting, for the door's purposes: putting something in a shop. Anything past the door is the shop's business. */
	const act = async (did: string) => {
		const r = await fetch(`${gate}/shop/${tess.did}`, { method: 'POST', body: JSON.stringify({ did, schema: 'rig/1' }) });
		const body = await r.json();
		return { status: r.status, closed: body.door === 'closed', says: body.says as string };
	};
	const put = (item: unknown) => fetch(`${gate}/door`, { method: 'POST', body: JSON.stringify(item) });

	try {
		const shown = await (await fetch(`${gate}/door`)).json();
		assert.deepEqual([shown.on, shown.open, shown.root, shown.host, shown.items], [true, false, darren.did, HOST, []]);

		assert.equal((await act(darren.did)).closed, false, 'Darren, the root, is let in');
		const first = await act(tess.did);
		assert.deepEqual([first.status, first.closed, first.says], [403, true, OPENING_SOON], 'Tess is refused, in one sentence');

		/* Only the root's signature goes on the door. */
		assert.equal((await put(await givePass(mallory, { host: HOST, holder: tess.did }))).status, 403, 'a pass from someone else');
		assert.equal((await put(await givePass(darren, { host: 'did:key:z6MkOtherHost', holder: tess.did }))).status, 403, 'a pass for another host');
		const forged = { ...(await givePass(darren, { host: HOST, holder: mallory.did })) } as { content: { holder: string } };
		forged.content = { ...forged.content, holder: tess.did };
		assert.equal((await put(forged)).status, 403, 'a pass altered after signing');
		assert.equal((await act(tess.did)).closed, true, 'still refused');

		const t0 = Date.now() - 60_000;
		assert.equal((await put(await givePass(darren, { host: HOST, holder: tess.did, now: t0 }))).status, 200);
		assert.equal((await act(tess.did)).closed, false, 'Tess, with a pass, is let in');
		assert.equal((await act(mallory.did)).closed, true, 'a pass is for its holder only');

		assert.equal((await put(await takePass(darren, { host: HOST, holder: tess.did, now: t0 + 1000 }))).status, 200);
		assert.equal((await act(tess.did)).closed, true, 'the pass taken back: refused again');
		assert.equal((await act(darren.did)).closed, false, 'Darren still in');

		const list = await (await fetch(`${gate}/door`)).json();
		assert.equal(list.items.length, 2, 'the list holds the pass and its taking back, nothing refused');
	} finally {
		server.close();
		filer.close();
	}
});
