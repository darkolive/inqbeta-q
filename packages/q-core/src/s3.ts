/*
 * Your own bucket (ADR-Q-028 §2, 3 October 2026): any S3-compatible bucket —
 * Amazon S3, Backblaze B2, Wasabi, Hetzner, Cloudflare R2, MinIO at home — as
 * a storage channel, written straight from your browser. Nothing passes
 * through the host or Q's servers.
 *
 * Darren: "Another backup sync option is obviously an S3 bucket … That's where
 * complete sovereignty, not relying on the host or anybody comes in." And:
 * "You should be able to select whether it's a pass through or an archive
 * source … then Amazon don't have anything of yours at all."
 *
 * Requests are signed here with AWS Signature Version 4 (WebCrypto only, no
 * SDK), path-style (`<endpoint>/<bucket>/<key>`), which every S3-compatible
 * service accepts. Files go under `q/<your did>/`, already sealed: the
 * bucket's provider holds boxes it can't open. The bucket must allow Q's
 * address in its CORS rules; Settings says how.
 */
import type { StorageChannel } from './storage-channels';

export interface BucketConfig {
	/** e.g. https://s3.eu-west-2.amazonaws.com, https://<account>.r2.cloudflarestorage.com, https://fsn1.your-objectstorage.com */
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	/** Keep a full copy, or only hold things until your cloud has them. */
	mode: 'copy' | 'pass';
}

export type BucketChannel = StorageChannel & {
	/** Let a file go (pass-through mode, once your cloud has it). */
	remove(path: string): Promise<void>;
	mode: BucketConfig['mode'];
};

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (data: Uint8Array | string) => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : (data as Uint8Array<ArrayBuffer>)));
async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
	const k = await crypto.subtle.importKey('raw', key as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return crypto.subtle.sign('HMAC', k, enc.encode(data));
}
/* RFC 3986: everything but unreserved characters is %-encoded; '/' kept in paths. */
const encode = (s: string, keepSlash: boolean) =>
	[...enc.encode(s)].map((b) => {
		const c = String.fromCharCode(b);
		return /[A-Za-z0-9\-._~]/.test(c) || (keepSlash && c === '/') ? c : `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
	}).join('');

export interface Signed {
	url: string;
	headers: Record<string, string>;
}

/**
 * Sign one request with AWS Signature Version 4. `now` is for tests; the
 * signature binds the method, the path, the query, the host, the body's hash
 * and the time.
 */
export async function signS3(
	cfg: Pick<BucketConfig, 'endpoint' | 'region' | 'accessKeyId' | 'secretAccessKey'>,
	req: { method: string; path: string; query?: Record<string, string>; body?: Uint8Array },
	now = new Date()
): Promise<Signed> {
	const base = new URL(cfg.endpoint);
	const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
	const day = amzDate.slice(0, 8);
	const uri = encode(req.path.startsWith('/') ? req.path : `/${req.path}`, true);
	const query = Object.entries(req.query ?? {})
		.map(([k, v]) => [encode(k, false), encode(v, false)])
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([k, v]) => `${k}=${v}`)
		.join('&');
	const payload = await sha256Hex(req.body ?? new Uint8Array());
	const headers: Record<string, string> = { host: base.host, 'x-amz-content-sha256': payload, 'x-amz-date': amzDate };
	const names = Object.keys(headers).sort();
	const canonical = [req.method, uri, query, names.map((n) => `${n}:${headers[n]}\n`).join(''), names.join(';'), payload].join('\n');
	const scope = `${day}/${cfg.region}/s3/aws4_request`;
	const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonical)].join('\n');
	let key = await hmac(enc.encode(`AWS4${cfg.secretAccessKey}`), day);
	for (const part of [cfg.region, 's3', 'aws4_request']) key = await hmac(key, part);
	const signature = hex(await hmac(key, toSign));
	const { host: _host, ...sent } = headers;
	return {
		url: `${base.origin}${uri}${query ? `?${query}` : ''}`,
		headers: { ...sent, authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` }
	};
}

/** The plain words inside an S3 error, if it gave any. */
const s3Says = (xml: string) => xml.match(/<Message>([^<]*)<\/Message>/)?.[1] ?? xml.match(/<Code>([^<]*)<\/Code>/)?.[1] ?? '';
const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Your bucket as a storage channel, under q/<did>/. */
export function bucketChannel(cfg: BucketConfig, did: string, f: typeof fetch = fetch): BucketChannel {
	const prefix = `q/${did.replace(/[^A-Za-z0-9_-]/g, '_')}/`;
	const at = (key: string) => `/${cfg.bucket}/${key}`;
	async function send(method: string, key: string, query?: Record<string, string>, body?: Uint8Array) {
		const s = await signS3(cfg, { method, path: at(key), query, body });
		return f(s.url, { method, headers: s.headers, ...(body ? { body: body as Uint8Array<ArrayBuffer> } : {}) });
	}
	const fail = async (r: Response, what: string) => new Error(`Your bucket wouldn’t ${what}: ${s3Says(await r.text().catch(() => '')) || r.status}.`);
	return {
		id: `bucket:${cfg.endpoint}/${cfg.bucket}`,
		kind: 'bucket',
		called: `your bucket (${cfg.bucket})`,
		mode: cfg.mode,
		async list() {
			const out: string[] = [];
			let token = '';
			for (let page = 0; page < 200; page++) {
				const r = await send('GET', '', { 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) });
				if (!r.ok) throw await fail(r, 'list its files');
				const xml = await r.text();
				for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) out.push(unxml(m[1]).slice(prefix.length));
				token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? unxml(xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1] ?? '') : '';
				if (!token) break;
			}
			return out;
		},
		async get(path) {
			const r = await send('GET', prefix + path);
			if (r.status === 404) return null;
			if (!r.ok) throw await fail(r, 'give back a file');
			return new Uint8Array(await r.arrayBuffer());
		},
		async put(path, bytes) {
			const r = await send('PUT', prefix + path, undefined, bytes);
			if (!r.ok) throw await fail(r, 'take a file');
		},
		async remove(path) {
			const r = await send('DELETE', prefix + path);
			if (!r.ok && r.status !== 404) throw await fail(r, 'let a file go');
		}
	};
}

/** Check a bucket works before keeping it: write a small file, read it back, let it go. */
export async function checkBucket(cfg: BucketConfig, did: string, f: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; says: string }> {
	const problems: string[] = [];
	if (!/^https?:\/\/[^/]+/.test(cfg.endpoint)) problems.push('The address should start with https://.');
	if (!cfg.region.trim()) problems.push('Say the region (for Cloudflare R2 it’s “auto”).');
	if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(cfg.bucket)) problems.push('A bucket’s name is lower-case letters, numbers, dots and dashes.');
	if (!cfg.accessKeyId.trim() || !cfg.secretAccessKey.trim()) problems.push('Both parts of the access key are needed.');
	if (problems.length) return { ok: false, says: problems.join(' ') };
	const ch = bucketChannel(cfg, did, f);
	const probe = `check-${crypto.randomUUID()}.txt`;
	const words = enc.encode('Q checking it can write here. This file goes straight away.');
	try {
		await ch.put(probe, words);
		const back = await ch.get(probe);
		await ch.remove(probe);
		if (!back || back.length !== words.length) return { ok: false, says: 'Your bucket took the file but didn’t give the same one back.' };
		return { ok: true };
	} catch (e) {
		const why = e instanceof Error ? e.message : String(e);
		/* A browser that can't reach it at all is almost always CORS. */
		return { ok: false, says: /Failed to fetch|NetworkError|Load failed/i.test(why) ? 'Your browser couldn’t reach the bucket. Its CORS rules need to allow this address (see below).' : why };
	}
}
