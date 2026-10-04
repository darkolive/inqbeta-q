/*
 * The pass-through in the five-minute sync (ADR-Q-028 §3–4, 3 October 2026).
 *
 * Darren: "The only reason the file should be sat on the host's storage is
 * because something's gone offline with the Google Drive." And: "You cannot
 * settle, i.e. delete, until you have confirmation that it's held somewhere
 * else."
 *
 * After each sync:
 *   hand over   if a cloud you've connected couldn't take some files, they go
 *               to the host's relay (sealed; the relay signs "held"), so
 *               they're off this device at once;
 *   drain       once a cloud has a file, you sign "arrived" and the relay lets
 *               it go; a file the relay holds that this device doesn't have
 *               (you're on another device) is brought into the vault, so the
 *               next sync carries it on.
 *
 * Custody receipts are kept in this browser, not the vault: a receipt kept
 * in the vault would itself be a new file to pass through, and so on for ever.
 * They're short-lived — once a file has arrived, the relay's part is over —
 * and the relay keeps its own totals.
 */
import { sealWith } from '@inqbeta/q-core/seal';
import { current } from '@inqbeta/q-core/passkey';
import { CUSTODY_SCHEMA, CUSTODY_SOURCE, isCustody, relayOf, type CustodyReceipt } from '@inqbeta/q-core/custody';
import { matchesName } from '@inqbeta/q-core/vault';
import { readHome } from '$lib/home';
import type { StorageChannel } from '@inqbeta/q-core/storage-channels';
import { watchLedger, type Ledger } from '$lib/ledger';
import { agreementsFrom } from '$lib/agreements';

const KEY = 'q.relay.custody';
const MOST_PER_SYNC = 40;
const CONTENT = /^[0-9a-f]{64}\.dsv$/;

export interface RelayState {
	/** Files the relay is holding for you now. */
	holding: number;
	/** Handed over or let go in the last sync. */
	handed: number;
	released: number;
	at?: string;
	says?: string;
}
let state: RelayState = { holding: 0, handed: 0, released: 0 };
const listeners = new Set<(s: RelayState) => void>();
export function watchRelay(fn: (s: RelayState) => void): () => void {
	listeners.add(fn);
	fn(state);
	return () => listeners.delete(fn);
}
const tell = (s: RelayState) => {
	state = s;
	for (const fn of listeners) fn(state);
};

function kept(): CustodyReceipt[] {
	try {
		return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[]).filter(isCustody);
	} catch {
		return [];
	}
}
function keep(add: CustodyReceipt[]) {
	try {
		localStorage.setItem(KEY, JSON.stringify([...kept(), ...add].slice(-500)));
	} catch {
		/* no storage: the relay still holds and lets go by the same rules */
	}
}

async function relayPlace(): Promise<string | null> {
	const h = await readHome().catch(() => null);
	return h?.ok && h.services.storage ? h.services.storage.replace(/\/$/, '') : null;
}

interface Held {
	item: string;
	path: string;
	bytes: number;
	at: string;
	until: string;
}

/** A pass-through Q can use: your host's, or one you've hired (ADR-Q-028 §5). */
export interface Place {
	url: string;
	/** Hired: the agreement it was hired under. */
	hired?: string;
}

/** The pass-throughs you've hired: agreed shop purchases whose terms describe one. */
export function hiredPlaces(ledger: Ledger | null, me: string): Place[] {
	return agreementsFrom(ledger)
		.filter((a) => a.standing.phase === 'agreed' && a.standing.terms?.service?.kind === 'pass-through' && a.standing.terms.b === me)
		.map((a) => ({ url: a.standing.terms!.service!.relay.replace(/\/$/, ''), hired: a.id }))
		.filter((p, i, all) => all.findIndex((q) => q.url === p.url) === i);
}

/** Your custody receipts at one pass-through (by its relay name): the meter a hire is settled from. */
export function custodyAt(where: string): CustodyReceipt[] {
	return kept().filter((r) => (r.content.kind === 'held' ? r.content.where : r.content.releases) === where);
}

let ledgerNow: Ledger | null = null;
watchLedger((l) => (ledgerNow = l));

/**
 * After a sync: hand a pass-through what the clouds couldn't take, and let go
 * what a cloud now has. `clouds` are the connected clouds, each with whether
 * its sync went through. Your host's pass-through comes first (unless you've
 * turned it off), then any you've hired; new files go to the first that's
 * open now. Never throws; says what happened.
 */
export async function passThrough(vault: StorageChannel, clouds: { channel: StorageChannel; ok: boolean }[], opts: { handOver?: boolean; useHost?: boolean } = {}): Promise<RelayState> {
	const me = current();
	if (!me || !clouds.length) return state;
	const host = opts.useHost === false ? null : await relayPlace();
	const places: Place[] = [...(host ? [{ url: host }] : []), ...hiredPlaces(ledgerNow, me.did).filter((p) => p.url !== host)];
	if (!places.length) return state;
	try {
		const { id, key } = await relayOf(me);
		const headers = { 'x-relay-key': key };
		const inVault = new Set((await vault.list()).filter((p) => CONTENT.test(p)));
		const ok = clouds.filter((c) => c.ok);
		const inClouds = new Set<string>();
		for (const c of ok) for (const p of await c.channel.list().catch(() => [] as string[])) inClouds.add(p);

		let released = 0;
		let holding = 0;
		let handed = 0;
		const receipts: CustodyReceipt[] = [];
		const heldAnywhere = new Set<string>();
		const open: { url: string; where: string }[] = [];
		for (const place of places) {
			const terms = (await (await fetch(`${place.url}/relay`, { signal: AbortSignal.timeout(10_000) }).catch(() => null))?.json().catch(() => null)) as { where?: string; openNow?: boolean } | null;
			if (!terms?.where) continue;
			if (terms.openNow !== false) open.push({ url: place.url, where: terms.where });
			const listed = await fetch(`${place.url}/relay/${id}`, { headers, signal: AbortSignal.timeout(15_000) }).catch(() => null);
			const held = listed?.ok ? (((await listed.json()) as { files?: Held[] }).files ?? []) : [];
			/* Drain: a cloud holds it now — sign that it arrived, and the pass-through lets go. */
			for (const h of held) {
				const path = `${h.item}.dsv`;
				if (inClouds.has(path)) {
					const arrived = (await sealWith(me, { schema: CUSTODY_SCHEMA, source: CUSTODY_SOURCE, kind: 'arrived', item: h.item, bytes: h.bytes, where: ok[0].channel.kind, releases: terms.where, at: new Date().toISOString() })) as CustodyReceipt;
					const r = await fetch(`${place.url}/relay/${id}/${h.item}`, { method: 'DELETE', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(arrived) }).catch(() => null);
					if (r?.ok) {
						released++;
						receipts.push(arrived);
						continue;
					}
				} else if (!inVault.has(path)) {
					/* Held for you, but not on this device: bring it in, checked, so the next sync carries it on. */
					const r = await fetch(`${place.url}/relay/${id}/${h.item}`, { headers }).catch(() => null);
					const bytes = r?.ok ? new Uint8Array(await r.arrayBuffer()) : null;
					if (bytes && (await matchesName(path, bytes))) await vault.put(path, bytes);
				}
				holding++;
				heldAnywhere.add(h.item);
			}
		}

		/* Hand over what a cloud couldn't take, to the first pass-through open now (open hours, ADR-Q-028 §5). */
		const to = open[0];
		const missing = to && opts.handOver !== false && clouds.some((c) => !c.ok) ? [...inVault].filter((p) => !inClouds.has(p) && !heldAnywhere.has(p.slice(0, -4))).slice(0, MOST_PER_SYNC) : [];
		for (const path of missing) {
			const bytes = await vault.get(path);
			if (!bytes) continue;
			const item = path.slice(0, -4);
			const r = await fetch(`${to.url}/relay/${id}/${item}?path=${encodeURIComponent(path)}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream' }, body: bytes as Uint8Array<ArrayBuffer> }).catch(() => null);
			const out = r?.ok ? ((await r.json().catch(() => ({}))) as { held?: unknown }) : null;
			if (out && isCustody(out.held) && out.held.content.kind === 'held' && out.held.content.item === item) {
				handed++;
				holding++;
				receipts.push(out.held);
			} else if (r?.status === 507) break; /* the space is full: the rest wait */
		}
		keep(receipts);
		return tell({ holding, handed, released, at: new Date().toISOString() }), state;
	} catch (e) {
		return tell({ ...state, says: e instanceof Error ? e.message : String(e) }), state;
	}
}
