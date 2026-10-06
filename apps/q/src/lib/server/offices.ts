/*
 * Who holds each office now, for the host's own federation (ADR-Q-037 §2–3,
 * ADR-Q-038 §5): the holders' signed notices on its storage node, each
 * checked here (appointment, term, the revoked list). Cached for 30 seconds.
 */
import { officeAddresses, type OfficeAddress } from '@inqbeta/q-core/offices';
import { revokedMandates } from './revoked';
import type { Host } from './mint';

let cache: { key: string; at: number; list: OfficeAddress[] } | null = null;

export async function officeAddressesFor(host: Host): Promise<OfficeAddress[]> {
	if (!host.storage) return [];
	const key = `${host.storage}|${host.federation}`;
	if (cache && cache.key === key && Date.now() - cache.at < 30_000) return cache.list;
	const r = await fetch(`${host.storage.replace(/\/$/, '')}/offices/${host.federation}`, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
	if (!r?.ok) return cache?.key === key ? cache.list : [];
	const body = (await r.json().catch(() => null)) as { items?: unknown[] } | null;
	const list = await officeAddresses(Array.isArray(body?.items) ? body.items : [], host.federation, { revoked: await revokedMandates(host) });
	cache = { key, at: Date.now(), list };
	return list;
}
