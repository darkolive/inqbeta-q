/*
 * Mandates ended early (ADR-Q-038 step 2): the list the federation's key
 * publishes on its storage node (the gate's /revoked/<federation>), read here
 * before trusting anyone acting in role. Cached for 30 seconds, like the door.
 *
 * If the node can't be asked, the last list read stands; with none read yet,
 * nothing is known to be revoked, and mandates still end with their terms.
 */
import { revokedSet } from '@inqbeta/q-core/offices';
import type { Host } from './mint';

let cache: { key: string; at: number; set: Set<string> } | null = null;

export async function revokedMandates(host: Host): Promise<Set<string>> {
	if (!host.storage) return new Set();
	const key = `${host.storage}|${host.federation}`;
	if (cache && cache.key === key && Date.now() - cache.at < 30_000) return cache.set;
	const r = await fetch(`${host.storage.replace(/\/$/, '')}/revoked/${host.federation}`, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
	if (!r?.ok) return cache?.key === key ? cache.set : new Set();
	const body = (await r.json().catch(() => null)) as { items?: unknown[] } | null;
	const set = await revokedSet(Array.isArray(body?.items) ? body.items : [], host.federation);
	cache = { key, at: Date.now(), set };
	return set;
}
