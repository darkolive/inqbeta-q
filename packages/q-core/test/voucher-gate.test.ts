/* Vouchers on the node (ADR-Q-044 step 4): the master kept by its issuer's signature, read with its shop listing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { identityFromSeed } from '../src/passkey';
import { sealWith } from '../src/seal';
import { acceptRedeem, askRedeem, editionOf, issueCopy, makeVoucher, receive, type Redemption, type VoucherHeld } from '../src/vouchers';
import { signerFor } from '../src/passkey';
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

		/* A copy: signed by the issuer, then the holder's signature joins it; then redeemed by both. */
		const ana = await identityFromSeed(seed(3));
		const copy = await issueCopy(signerFor(shop), v, { number: 1, holder: ana.did, via: 'shop-1.ana' }, NOW);
		assert.equal((await put({ ...copy, signatures: [] }, `${at}/copy`)).status, 403, 'unsigned');
		assert.equal((await put({ ...copy, signatures: [{ ...copy.signatures[0], did: eve.did }] }, `${at}/copy`)).status, 403, 'signed by the wrong person');
		assert.equal((await put(copy, `${at}/copy`)).status, 200);
		const held = await receive(copy, signerFor(ana));
		assert.equal((await put({ ...held, signatures: held.signatures.filter((g) => g.by === 'holder') }, `${at}/copy`)).status, 403, 'the holder alone can’t start a copy');
		assert.equal((await put(held, `${at}/copy`)).status, 200);
		let all = (await (await fetch(at)).json()) as typeof got & { copies: VoucherHeld[]; redemptions: Redemption[] };
		assert.equal(all.copies.length, 1, 'the holder’s signature joins the copy, not a second one');
		assert.equal(all.copies[0].signatures.length, 2);
		const e = await editionOf(v, all.copies);
		assert.deepEqual(e.problems, []);
		assert.equal(e.holdings[0].holder, ana.did);
		const asked = await askRedeem(e.holdings[0], signerFor(ana), { redeemer: shop.did, forKind: 'itself' }, NOW);
		assert.equal((await put(asked, `${at}/redeemed`)).status, 200);
		assert.equal((await put(await acceptRedeem(asked, signerFor(shop)), `${at}/redeemed`)).status, 200);
		all = (await (await fetch(at)).json()) as typeof all;
		assert.equal(all.redemptions.length, 1);
		assert.equal((await editionOf(v, all.copies, all.redemptions)).holdings[0].redeemed, true);

		/* Pictures come with the voucher that names them by hash. */
		const bytes = new Uint8Array(300).map((_, i) => (i * 7) % 256);
		const hex = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
		const pv = await makeVoucher(shop, { title: 'Hill Farm at dusk', words: 'Oil on board.', pictures: [{ hash: hex, type: 'image/png', alt: 'A farm under an orange sky.' }], medium: 'physical', kind: 'original', of: 1, price: { paid: true, credits: 90, mint: 'did:key:zM', currency: 'GBP' }, moves: 'sellable', realm: { kinds: 'itself', accepted: [] } }, NOW);
		const pat = `${gate}/voucher/${pv.contentHash}`;
		const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
		assert.equal((await put({ voucher: pv, pictures: { [hex]: b64(bytes.map((x) => x ^ 1)) } }, pat)).status, 403, 'not the picture it signed');
		assert.equal((await put({ voucher: pv, pictures: { ['0'.repeat(64)]: b64(bytes) } }, pat)).status, 403, 'a picture it doesn’t name');
		assert.equal((await put({ voucher: pv, pictures: { [hex]: b64(bytes) } }, pat)).status, 200);
		const pic = await fetch(`${pat}/picture/${hex}`);
		assert.equal(pic.status, 200);
		assert.equal(pic.headers.get('content-type'), 'image/png');
		assert.deepEqual(new Uint8Array(await pic.arrayBuffer()), bytes);
		assert.equal((await fetch(`${pat}/picture/${'f'.repeat(64)}`)).status, 404);
	} finally {
		server.close();
		filer.close();
	}
});
