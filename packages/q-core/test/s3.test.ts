/* Your own bucket (ADR-Q-028 §2): requests signed exactly as AWS signs them (checked against botocore). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signS3, bucketChannel, checkBucket, type BucketConfig } from '../src/s3';

const cfg = { endpoint: 'https://s3.eu-west-2.amazonaws.com', region: 'eu-west-2', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };
const when = new Date('2026-10-03T17:53:13Z');
const sigOf = (h: Record<string, string>) => h.authorization.split('Signature=')[1];

test('a PUT is signed as AWS signs it: path encoded, body hashed', async () => {
	const s = await signS3(cfg, { method: 'PUT', path: '/my-bucket/q/did_key_z6Mk/abc d.dsv', body: new TextEncoder().encode('hello') }, when);
	assert.equal(sigOf(s.headers), 'cd5d1a47bc98064cb533f2d26399fd5b8084302d95a492142f79ce0828b91d8e');
	assert.equal(s.url, 'https://s3.eu-west-2.amazonaws.com/my-bucket/q/did_key_z6Mk/abc%20d.dsv');
	assert.match(s.headers.authorization, /Credential=AKIDEXAMPLE\/20261003\/eu-west-2\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date/);
});

test('a listing is signed with its query sorted and encoded', async () => {
	const s = await signS3(cfg, { method: 'GET', path: '/my-bucket/', query: { prefix: 'q/did_key_z6Mk/', 'list-type': '2', 'continuation-token': 'a/b' } }, when);
	assert.equal(sigOf(s.headers), 'e043ef25ef4e85fb9ca47fa00cedaa9e570ed89ad50eaf366fcdf9c8ef2df3a9');
	assert.equal(s.url, 'https://s3.eu-west-2.amazonaws.com/my-bucket/?continuation-token=a%2Fb&list-type=2&prefix=q%2Fdid_key_z6Mk%2F');
});

test('the channel: put, list (in pages), get, remove, under q/<did>/ — and a check that says what is wrong', async () => {
	const store = new Map<string, Uint8Array>();
	const fake: typeof fetch = async (input, init) => {
		const u = new URL(String(input));
		const key = decodeURIComponent(u.pathname).replace(/^\/b-ucket\//, '');
		const m = init?.method ?? 'GET';
		if (!String((init?.headers as Record<string, string>)?.authorization ?? '').startsWith('AWS4-HMAC-SHA256')) return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 });
		if (m === 'PUT') return store.set(key, new Uint8Array(init!.body as ArrayBuffer)), new Response('');
		if (m === 'DELETE') return store.delete(key), new Response(null, { status: 204 });
		if (u.searchParams.get('list-type')) {
			const keys = [...store.keys()].filter((k) => k.startsWith(u.searchParams.get('prefix')!)).sort();
			const from = Number(u.searchParams.get('continuation-token') ?? 0);
			const page = keys.slice(from, from + 2);
			const more = from + 2 < keys.length;
			return new Response(`<ListBucketResult>${page.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${from + 2}</NextContinuationToken>` : ''}</ListBucketResult>`);
		}
		const b = store.get(key);
		return b ? new Response(b as Uint8Array<ArrayBuffer>) : new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
	};
	const c: BucketConfig = { ...cfg, bucket: 'b-ucket', mode: 'pass' };
	const ch = bucketChannel(c, 'did:key:z6Mk', fake);
	for (const n of ['a.dsv', 'b.dsv', 'c.dsv']) await ch.put(n, new TextEncoder().encode(n));
	assert.deepEqual((await ch.list()).sort(), ['a.dsv', 'b.dsv', 'c.dsv'], 'three files across two pages');
	assert.deepEqual([...store.keys()].every((k) => k.startsWith('q/did_key_z6Mk/')), true);
	assert.equal(new TextDecoder().decode((await ch.get('b.dsv'))!), 'b.dsv');
	assert.equal(await ch.get('nope.dsv'), null);
	await ch.remove('b.dsv');
	assert.deepEqual((await ch.list()).sort(), ['a.dsv', 'c.dsv']);
	assert.equal(ch.mode, 'pass');

	assert.deepEqual(await checkBucket(c, 'did:key:z6Mk', fake), { ok: true });
	const wrong = await checkBucket({ ...c, bucket: 'Bad_Name', region: '' }, 'did:key:z6Mk', fake);
	assert.ok(!wrong.ok && /region/.test(wrong.says) && /lower-case/.test(wrong.says));
	const blocked = await checkBucket(c, 'did:key:z6Mk', async () => { throw new TypeError('Failed to fetch'); });
	assert.ok(!blocked.ok && /CORS/.test(blocked.says));
});
