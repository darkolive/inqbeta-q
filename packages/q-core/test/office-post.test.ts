/* The office's post (ADR-Q-038 §5): the holder says where post for the office goes; senders check it themselves. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { identityFromSeed, signerFor } from '../src/passkey';
import { b64url } from '../src/canonical';
import { foundFederation, newDraft } from '../src/federations';
import { appoint, officeAddresses, officePost, revokedSet, recall, revocationNotice } from '../src/offices';
import { sealWith } from '../src/seal';

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
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 43 + n) % 251);
const INBOX = 'abcdefghijklmnopqrstuv';

test('the treasurer’s post reaches Sam while he holds it; not a forger; not after a recall', async () => {
	const darren = await identityFromSeed(seed(1));
	const sam = await identityFromSeed(seed(2));
	const mallory = await identityFromSeed(seed(3));
	const f = await foundFederation(signerFor(darren), { ...newDraft(), name: 'Green Space', purpose: 'Gardening.' });
	const id = f.founding.federation;
	const a = await appoint(signerFor(f.key), signerFor(darren), { federation: id, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen.', grant: b64url(f.grant.bytes) });

	await new Promise<void>((r) => filer.listen(0, r));
	process.env.GATE_FILER = `http://127.0.0.1:${(filer.address() as AddressInfo).port}`;
	process.env.GATE_FEDERATIONS = id;
	const { server } = await import('../../../node/gate/server.mjs');
	await new Promise<void>((r) => server.listen(0, r));
	const gate = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const post = (x: unknown) => fetch(`${gate}/offices/${id}`, { method: 'POST', body: JSON.stringify(x) });
	const items = async () => ((await (await fetch(`${gate}/offices/${id}`)).json()) as { items: unknown[] }).items;
	try {
		await assert.rejects(officePost(mallory, a, INBOX), /Only the office’s holder/);
		const forged = await sealWith(mallory, { schema: 'inqbeta.office-post/1', source: 'inqbeta:q/offices', federation: id, office: 'treasurer', inbox: 'zzzzzzzzzzzzzzzzzzzzzz', appointment: a, at: new Date().toISOString() });
		assert.equal((await post(forged)).status, 403, 'the gate takes only the holder’s own notice');

		assert.equal((await post(await officePost(sam, a, INBOX))).status, 200);
		assert.equal((await post(await officePost(sam, a, INBOX))).status, 200, 'again: still one entry');
		assert.equal((await items()).length, 1);
		assert.deepEqual((await officeAddresses(await items(), id)).map((x) => [x.office, x.holder, x.inbox]), [['treasurer', sam.did, INBOX]]);

		const e = await recall(signerFor(f.key), a, 'Petition.');
		const revoked = await revokedSet([await revocationNotice(f.key, a, e)], id);
		assert.deepEqual(await officeAddresses(await items(), id, { revoked }), [], 'recalled: post no longer goes to him');
		assert.deepEqual(await officeAddresses(await items(), id, { now: new Date(a.until * 1000 + 1000) }), [], 'term over');
	} finally {
		server.close();
		filer.close();
	}
});
