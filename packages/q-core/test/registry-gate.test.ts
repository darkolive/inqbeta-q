/* The registry on Incubator's node: only the registrar adds; histories are readable; the list shows only public, running ones. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { identityFromSeed, signerFor } from '../src/passkey';
import { foundFederation, newDraft } from '../src/federations';
import { hashCard, makeCard, register } from '../src/registration';
import { signCoreRelease } from '../src/core-served';

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
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 59 + n) % 251);

test('register, update to public, list; a stranger can’t add; core releases', async () => {
	const incubator = await identityFromSeed(seed(1));
	const ana = await identityFromSeed(seed(2));
	const bo = await identityFromSeed(seed(3));
	const mallory = await identityFromSeed(seed(4));
	const a = await foundFederation(signerFor(ana), { ...newDraft(), name: 'Hill Farm', purpose: 'Growing.' });
	const b = await foundFederation(signerFor(bo), { ...newDraft(), name: 'Quiet Club', purpose: 'Unlisted.' });

	await new Promise<void>((r) => filer.listen(0, r));
	process.env.GATE_FILER = `http://127.0.0.1:${(filer.address() as AddressInfo).port}`;
	process.env.GATE_REGISTRAR = incubator.did;
	const { server } = await import('../../../node/gate/server.mjs');
	await new Promise<void>((r) => server.listen(0, r));
	const gate = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const entry = async (f: typeof a, founder: typeof ana, visibility: 'public' | 'unlisted', previous: string | null, by = incubator) => {
		const card = await makeCard(signerFor(f.key), signerFor(founder), { name: f.founding.name, purpose: 'x', site: 'https://example.org', visibility, runs: { q: '0.1.0' }, previous });
		return { card, registered: await register(by, card, ['checked']) };
	};
	const post = (fed: string, x: unknown) => fetch(`${gate}/registry/${fed}`, { method: 'POST', body: JSON.stringify(x) });
	try {
		const first = await entry(a, ana, 'unlisted', null);
		assert.equal((await post(a.founding.federation, first)).status, 200);
		assert.equal((await post(a.founding.federation, await entry(a, ana, 'public', null, mallory))).status, 403, 'only the registrar');
		assert.deepEqual(((await (await fetch(`${gate}/registry`)).json()) as { items: unknown[] }).items, [], 'unlisted: not in the list');

		await new Promise((r) => setTimeout(r, 5));
		assert.equal((await post(a.founding.federation, await entry(a, ana, 'public', await hashCard(first.card)))).status, 200);
		assert.equal((await post(b.founding.federation, await entry(b, bo, 'unlisted', null))).status, 200);
		const list = ((await (await fetch(`${gate}/registry`)).json()) as { items: { card: { name: string } }[] }).items;
		assert.deepEqual(list.map((x) => x.card.name), ['Hill Farm'], 'only the public one, newest version');
		const history = ((await (await fetch(`${gate}/registry/${a.founding.federation}`)).json()) as { items: unknown[] }).items;
		assert.equal(history.length, 2, 'its whole history');

		/* Core releases: only the registrar adds; anyone reads. */
		const core = { schema: 'inqbeta.core-served/1' as const, release: '0.1.0', commit: '99fa804', kernel: '/_app/immutable/chunks/K.js', sha256: 'c'.repeat(64) };
		const cr = (x: unknown) => fetch(`${gate}/core-releases`, { method: 'POST', body: JSON.stringify(x) });
		assert.equal((await cr(await signCoreRelease(mallory, core))).status, 403, 'only the registrar adds a release');
		assert.equal((await cr(await signCoreRelease(incubator, core))).status, 200);
		const releases = ((await (await fetch(`${gate}/core-releases`)).json()) as { items: { content: { sha256: string } }[] }).items;
		assert.deepEqual(releases.map((r) => r.content.sha256), ['c'.repeat(64)]);
		assert.equal(((await (await fetch(`${gate}/registry`)).json()) as { items: unknown[] }).items.length, 1, 'core releases aren’t federations');
	} finally {
		server.close();
		filer.close();
	}
});
