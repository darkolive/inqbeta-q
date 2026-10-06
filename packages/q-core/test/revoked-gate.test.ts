/* Ending a mandate early, end to end (ADR-Q-038 step 2): the federation's key publishes it to its storage node; the check then refuses it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { identityFromSeed, signerFor } from '../src/passkey';
import { b64url } from '../src/canonical';
import { foundFederation, newDraft } from '../src/federations';
import { appoint, recall, revocationNotice, revokedSet } from '../src/offices';
import { actingCovers, takeUp, type InRoleReceipt } from '../src/inrole';

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
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 37 + n) % 251);

test('a recall, published by the federation’s key, ends the treasurer’s mandate at once; nobody else can publish one', async () => {
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
	try {
		const list = async () => ((await (await fetch(`${gate}/revoked/${id}`)).json()) as { items: unknown[] }).items;
		assert.deepEqual(await list(), []);

		const t = (await takeUp(sam, { federation: id, name: 'Green Space', office: 'treasurer', declaration: { kind: 'none' } })) as InRoleReceipt;
		const acting = { federation: id, office: 'treasurer', mandates: a.tokens, takenUp: t };
		const check = async () => actingCovers(sam.did, acting, { federation: id, cmd: '/fed/money/reconcile', revoked: await revokedSet(await list(), id) });
		assert.equal((await check()).ok, true, 'before the recall');

		const e = await recall(signerFor(f.key), a, 'Members’ petition.');
		const notice = await revocationNotice(f.key, a, e);
		const forged = await revocationNotice(f.key, a, e).then((n) => ({ ...n, did: mallory.did }));
		assert.equal((await fetch(`${gate}/revoked/${id}`, { method: 'POST', body: JSON.stringify(forged) })).status, 403);
		await assert.rejects(revocationNotice(mallory, a, e), /Only the federation’s own key/);
		assert.equal((await fetch(`${gate}/revoked/${id}`, { method: 'POST', body: JSON.stringify(notice) })).status, 200);
		assert.equal((await fetch(`${gate}/revoked/did:key:z6MkNotServedHere`, { method: 'POST', body: JSON.stringify(notice) })).status, 404);

		const after = await check();
		assert.equal(after.ok, false, 'refused at once, not at the end of the term');
		assert.match((after as { says: string }).says, /ended early/);
	} finally {
		server.close();
		filer.close();
	}
});
