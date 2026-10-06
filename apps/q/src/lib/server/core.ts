/*
 * Checking a site's core as served (ADR-Q-019 addendum, 6 October 2026).
 *
 * Incubator's own core is the master's word: each time Incubator runs a new
 * release, its registrar signs that release's fingerprint and files it on its
 * node (/core-releases). A site registering is then judged against that list:
 * Incubator fetches the site's /_q/core.json and the chunk it names, and
 * fingerprints the bytes itself.
 */
import { CORE_SERVED_PATH, coreReleases, judgeCore, readCoreServed, signCoreRelease, type CoreFinding, type CoreRelease, type CoreServed, type SourceOf } from '@inqbeta/q-core/core-served';
import type { Identity } from '@inqbeta/q-core/passkey';

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const MOST = 2_000_000;

/** A site's core as it serves it: its own word, and the fingerprint of the chunk Incubator fetched. */
export async function servedCore(site: string): Promise<{ served: CoreServed | null; fetched: string | null }> {
	const base = site.replace(/\/$/, '');
	const r = await fetch(`${base}${CORE_SERVED_PATH}`, { signal: AbortSignal.timeout(8_000), headers: { accept: 'application/json' } }).catch(() => null);
	const served = r?.ok ? readCoreServed(await r.json().catch(() => null)) : null;
	if (!served) return { served: null, fetched: null };
	const k = await fetch(`${base}${served.kernel}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
	if (!k?.ok) return { served, fetched: null };
	const bytes = await k.arrayBuffer();
	if (bytes.byteLength > MOST) return { served, fetched: null };
	return { served, fetched: hex(await crypto.subtle.digest('SHA-256', bytes)) };
}

/** The releases Incubator has signed, adding its own running one if it's new. */
export async function knownReleases(node: string, registrar: Identity, origin: string): Promise<CoreRelease[]> {
	const r = await fetch(`${node}/core-releases`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
	const list = r?.ok ? (((await r.json().catch(() => null)) as { items?: unknown[] } | null)?.items ?? []) : [];
	const releases = await coreReleases(list, registrar.did);
	const own = await servedCore(origin);
	if (own.served && own.fetched && own.served.sha256 === own.fetched && !releases.some((x) => x.sha256 === own.fetched)) {
		const signed = await signCoreRelease(registrar, own.served);
		const kept = await fetch(`${node}/core-releases`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signed), signal: AbortSignal.timeout(10_000) }).catch(() => null);
		if (kept?.ok) releases.push(signed.content);
	}
	return releases;
}

export async function checkCore(site: string, releases: CoreRelease[], source?: SourceOf | null): Promise<CoreFinding> {
	const { served, fetched } = await servedCore(site);
	return judgeCore({ served, fetched, releases, source });
}
