/* Vouchers on the node (ADR-Q-044 step 4): the master kept by its issuer's signature, read with its shop listing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { identityFromSeed } from '../src/passkey';
import { sealWith } from '../src/seal';
import { makeVoucher } from '../src/vouchers';
import { listingTerms } from '../src/voucher-sales';
import { AGREEMENT_SCHEMA, AGREEMENT_SOURCE } from '../src/agreements';

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
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 71 + n) % 251);
const NOW = new Date('2026-10-07T12:00:00Z');

test('a voucher kept by its issuer, read with what’s left in the shop; others’ or altered refused', async () => {
	const shop = await identityFromSeed(seed(1));
	const eve = await identityFromSeed(seed(2));
	await new Promise<void>((r) => filer.listen(0, r));
	process.env.GATE_FILER = `http://127.0.0.1:${(filer.address() as AddressInfo).port}`;
	const { server } = await import('../../../node/gate/server.mjs');
	await new Promise<void>((r) => server.listen(0, r));
	const gate = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	try {
		const v = await makeVoucher(shop, { title: 'Olive t-shirt', words: 'Organic cotton.', pictures: [], medium: 'physical', kind: 'edition', of: 50, price: { paid: true, credits: 10, mint: 'did:key:zM', currency: 'GBP' }, moves: 'sellable', realm: { kinds: 'itself', accepted: [] } }, NOW);
		const at = `${gate}/voucher/${v.contentHash}`;
		const put = (x: unknown, where = at) => fetch(where, { method: 'POST', body: JSON.stringify(x) });
		assert.equal((await fetch(at)).status, 404);
		assert.equal((await put({ ...v, content: { ...v.content, title: 'Gold t-shirt' } })).status, 403, 'altered');
		const byEve = await sealWith(eve, { ...v.content });
		assert.equal((await put(byEve, `${gate}/voucher/${byEve.contentHash}`)).status, 403, 'signed by someone other than its issuer');
		assert.equal((await put(v, `${gate}/voucher/${'x'.repeat(43)}`)).status, 403, 'under another name');
		assert.equal((await put(v)).status, 200);
		let got = (await (await fetch(at)).json()) as { voucher: { contentHash: string }; listing: { left: number } | null };
		assert.equal(got.voucher.contentHash, v.contentHash);
		assert.equal(got.listing, null, 'not in the shop yet');
		const listing = await sealWith(shop, { schema: AGREEMENT_SCHEMA, source: AGREEMENT_SOURCE, agreement: 'shop-1', step: 'proposed', parent: null, terms: listingTerms(v, 'test'), limit: 50, at: NOW.toISOString() });
		assert.equal((await fetch(`${gate}/shop/${shop.did}`, { method: 'POST', body: JSON.stringify({ receipt: listing, about: { name: 'Olive' } }) })).status, 200);
		got = (await (await fetch(at)).json()) as typeof got;
		assert.equal(got.listing?.left, 50);
	} finally {
		server.close();
		filer.close();
	}
});
