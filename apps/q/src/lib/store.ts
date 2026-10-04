/*
 * Kept storage (ADR-Q-030 §1 and §4, 4 October 2026): space taken by the month
 * at a node, holding a full copy of your sealed vault.
 *
 * Darren: "Use us as a storage source … click that. You get all the receipts
 * you need to then have your own vault automatically sync, create a copy, and
 * appear in your own dashboard of networks where you can see where your data
 * is."
 *
 * The purchase is the receipt that matters: an agreement taken from the node
 * operator's shop. Q binds it to your space at the node (a signed note naming
 * your space; the space is named by a key only your passkey makes, as with
 * the relay), and from then on each sync keeps the node level with your
 * vault, like a cloud. Everything sent is already sealed: the node holds boxes
 * it can't open.
 */
import { sealWith } from '@inqbeta/q-core/seal';
import { relayOf } from '@inqbeta/q-core/custody';
import { storeEnds, type AgreementReceipt, type StoreService } from '@inqbeta/q-core/agreements';
import type { Identity } from '@inqbeta/q-core/passkey';
import type { StorageChannel } from '@inqbeta/q-core/storage-channels';
import type { Ledger } from '$lib/ledger';
import { agreementsFrom } from '$lib/agreements';

export interface StoreHire {
	/** The agreement it was taken under. */
	agreement: string;
	taken: AgreementReceipt;
	service: StoreService;
	/** When its term ends. */
	ends: string;
}

/** Your kept storage: storage you've taken from a shop, still within its term. */
export function storeHires(ledger: Ledger | null, me: string, now = Date.now()): StoreHire[] {
	const out: StoreHire[] = [];
	for (const a of agreementsFrom(ledger)) {
		const t = a.standing.terms;
		if (t?.service?.kind !== 'store' || t.b !== me || (a.standing.phase !== 'agreed' && a.standing.phase !== 'complete')) continue;
		const taken = a.steps.find((r) => r.content.step === 'taken');
		if (!taken) continue;
		const ends = storeEnds(taken.content.at, t.service.months);
		if (Date.parse(ends) > now) out.push({ agreement: a.id, taken, service: t.service, ends });
	}
	return out;
}

const base = (url: string) => url.replace(/\/$/, '');
const pathUrl = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export interface StoreStatus {
	quota: number;
	used: number;
	files: number;
	/** Agreements this space is bound to at the node. */
	bound: string[];
	/** When the node clears the copy if nobody renews: the last term's end plus its grace. */
	clears?: string;
	graceDays?: number;
}

/** What the node holds for you, and how much space you have. */
export async function storeStatus(identity: Pick<Identity, 'vault'>, url: string): Promise<{ ok: true; status: StoreStatus } | { ok: false; says: string }> {
	try {
		const { id, key } = await relayOf(identity);
		const r = await fetch(`${base(url)}/store/${id}`, { headers: { 'x-relay-key': key }, signal: AbortSignal.timeout(15_000) });
		const j = (await r.json().catch(() => ({}))) as { quota?: number; used?: number; files?: unknown[]; hires?: { agreement: string }[]; clears?: string | null; graceDays?: number; says?: string };
		if (!r.ok) return { ok: false, says: j.says ?? `The node said ${r.status}.` };
		return { ok: true, status: { quota: j.quota ?? 0, used: j.used ?? 0, files: j.files?.length ?? 0, bound: (j.hires ?? []).map((h) => h.agreement), ...(j.clears ? { clears: j.clears } : {}), ...(typeof j.graceDays === 'number' ? { graceDays: j.graceDays } : {}) } };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The node didn’t answer.' };
	}
}

/** Bind a purchase to your space at the node, so the node sets the space aside. */
export async function bindStore(identity: Identity, hire: StoreHire): Promise<{ ok: true } | { ok: false; says: string }> {
	try {
		const { id, key } = await relayOf(identity);
		const bind = await sealWith(identity, { schema: 'inqbeta.store-bind/1', source: 'inqbeta:q/store', agreement: hire.agreement, id, at: new Date().toISOString() });
		const r = await fetch(`${base(hire.service.store)}/store/${id}/hire`, { method: 'POST', headers: { 'x-relay-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ taken: hire.taken, bind }), signal: AbortSignal.timeout(15_000) });
		const j = (await r.json().catch(() => ({}))) as { says?: string };
		return r.ok ? { ok: true } : { ok: false, says: j.says ?? `The node said ${r.status}.` };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The node didn’t answer.' };
	}
}

/** Your space at a node as a storage channel: synced like a cloud. */
export async function storeChannel(identity: Pick<Identity, 'vault'>, url: string, called: string): Promise<StorageChannel> {
	const { id, key } = await relayOf(identity);
	const at = `${base(url)}/store/${id}`;
	const headers = { 'x-relay-key': key };
	return {
		id: `store:${base(url)}`,
		kind: 'store',
		called,
		async list() {
			const r = await fetch(at, { headers, signal: AbortSignal.timeout(20_000) });
			if (!r.ok) throw new Error(`The kept storage wouldn’t list its files (${r.status}).`);
			return (((await r.json()) as { files?: { path: string }[] }).files ?? []).map((f) => f.path);
		},
		async get(path) {
			const r = await fetch(`${at}/f/${pathUrl(path)}`, { headers });
			if (r.status === 404) return null;
			if (!r.ok) throw new Error(`The kept storage wouldn’t give back a file (${r.status}).`);
			return new Uint8Array(await r.arrayBuffer());
		},
		async put(path, bytes) {
			const r = await fetch(`${at}/f/${pathUrl(path)}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream' }, body: bytes as Uint8Array<ArrayBuffer> });
			if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { says?: string }).says ?? `The kept storage wouldn’t take a file (${r.status}).`);
		}
	};
}
