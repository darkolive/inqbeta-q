/*
 * Your own bucket, kept (ADR-Q-028 §2). Its address and access key are locked
 * into your vault like a cloud's token: they travel with your backups and open
 * only with your passkey. Never in a host's settings, never sent anywhere but
 * the bucket itself.
 */
import { bucketChannel, type BucketChannel, type BucketConfig } from '@inqbeta/q-core/s3';
import { b64url, unb64url } from '@inqbeta/q-core/canonical';
import type { Identity } from '@inqbeta/q-core/passkey';
import { deleteItem, listItems, readItem, saveLocked, type FolderItem } from '@inqbeta/q-core/folder';

const WHERE = 'storage-channels';
const NAME = 'bucket.json';

interface Kept extends BucketConfig {
	kind: 'bucket';
	connectedAt: string;
}

async function keptItems(): Promise<{ item: FolderItem; kept: Kept }[]> {
	const out: { item: FolderItem; kept: Kept }[] = [];
	for (const item of await listItems()) {
		if (item.meta?.path !== WHERE || item.meta.name !== NAME) continue;
		try {
			const kept = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as Kept;
			if (kept.kind === 'bucket' && kept.bucket) out.push({ item, kept });
		} catch {
			/* not ours, or can't be opened by this passkey */
		}
	}
	return out.sort((a, b) => b.kept.connectedAt.localeCompare(a.kept.connectedAt));
}

/** What's kept about your bucket, without the secret: for showing in Settings. */
export async function bucketShown(): Promise<{ endpoint: string; region: string; bucket: string; mode: BucketConfig['mode']; connectedAt: string; keyEnds: string } | null> {
	const k = (await keptItems())[0]?.kept;
	return k ? { endpoint: k.endpoint, region: k.region, bucket: k.bucket, mode: k.mode, connectedAt: k.connectedAt, keyEnds: k.accessKeyId.slice(-4) } : null;
}

/** Keep a bucket (after checkBucket said it works). Replaces any before it. */
export async function keepBucket(cfg: BucketConfig): Promise<void> {
	const before = await keptItems();
	const clean: BucketConfig = { endpoint: cfg.endpoint.trim().replace(/\/$/, ''), region: cfg.region.trim(), bucket: cfg.bucket.trim(), accessKeyId: cfg.accessKeyId.trim(), secretAccessKey: cfg.secretAccessKey.trim(), mode: cfg.mode };
	await saveLocked(WHERE, NAME, JSON.stringify({ kind: 'bucket', ...clean, connectedAt: new Date().toISOString() } satisfies Kept), 'application/json');
	for (const { item } of before) await deleteItem(item);
}

/** Your bucket as a channel for this DID, or null when there isn't one. */
export async function bucketOf(did: string): Promise<BucketChannel | null> {
	const k = (await keptItems())[0]?.kept;
	return k ? bucketChannel(k, did) : null;
}

/** Forget the bucket here. What's in it stays there, locked. */
export async function forgetBucket(): Promise<void> {
	for (const { item } of await keptItems()) await deleteItem(item);
}

/*
 * The bucket note on your passkey (ADR-Q-012, ADR-Q-028 §2): where your bucket
 * is and its key, sealed with your vault key, so a new device signed in with
 * this passkey can open your vault from the bucket. Short field names: a
 * passkey holds only about half a kilobyte of notes.
 */
export async function bucketNote(identity: Pick<Identity, 'vault'>): Promise<string | undefined> {
	const k = (await keptItems())[0]?.kept;
	if (!k) return undefined;
	const plain = new TextEncoder().encode(JSON.stringify({ e: k.endpoint, r: k.region, b: k.bucket, k: k.accessKeyId, s: k.secretAccessKey, m: k.mode === 'copy' ? 'c' : 'p' }));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, identity.vault, plain));
	const both = new Uint8Array(iv.length + ct.length);
	both.set(iv);
	both.set(ct, iv.length);
	return b64url(both);
}

/** Open a bucket note from the passkey, or null if it isn't yours or doesn't hold up. */
export async function openBucketNote(identity: Pick<Identity, 'vault'>, note: string): Promise<BucketConfig | null> {
	try {
		const both = unb64url(note);
		const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: both.slice(0, 12) }, identity.vault, both.slice(12));
		const o = JSON.parse(new TextDecoder().decode(plain)) as Record<string, string>;
		if (!o.e || !o.b || !o.k || !o.s) return null;
		return { endpoint: o.e, region: o.r ?? '', bucket: o.b, accessKeyId: o.k, secretAccessKey: o.s, mode: o.m === 'c' ? 'copy' : 'pass' };
	} catch {
		return null;
	}
}
